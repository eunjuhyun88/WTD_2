// ═══════════════════════════════════════════════════════════════
// contextBuilder — Cursor-style token-budget context assembly
// ═══════════════════════════════════════════════════════════════
//
// Responsibilities:
//   1. Compress assistant history turns to semantic summaries
//      (200 tok analysis response → ~15 tok summary)
//   2. Gate snapshot injection based on intent + staleness
//   3. Select tool subset based on IntentBudget
//   4. Return final messages array ready for LLM call

import type { ToolDefinition, LLMMessageWithTools } from './types';
import type { IntentBudget } from './intentClassifier';
import { SNAPSHOT_MAX_AGE_MS } from './intentClassifier';
import { buildDouniSystemPrompt, buildAnalysisContext } from '$lib/engine/cogochi/douni/douniPersonality';
import type { DouniProfile } from '$lib/engine/cogochi/douni/douniPersonality';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import {
  TOOL_ANALYZE_MARKET,
  TOOL_CHECK_SOCIAL,
  TOOL_SCAN_MARKET,
  TOOL_CHART_CONTROL,
  TOOL_SAVE_PATTERN,
  TOOL_SUBMIT_FEEDBACK,
  TOOL_QUERY_MEMORY,
} from './tools';

// ─── Types ───────────────────────────────────────────────────

/**
 * Compressed history entry sent from client.
 * assistant turns are pre-compressed on the client side;
 * user turns are kept verbatim (already short).
 */
export interface CompressedHistoryEntry {
  role: 'user' | 'assistant';
  /** Verbatim for user turns. Compressed summary for assistant turns. */
  content: string;
  /** Present on assistant analysis turns for snapshot-aware gating */
  meta?: {
    symbol?: string;
    tf?: string;
    alphaScore?: number;
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
    kind?: 'analysis' | 'scan' | 'social' | 'convo';
  };
}

export interface BuildContextResult {
  systemPrompt: string;
  messages: LLMMessageWithTools[];
  tools: ToolDefinition[];
}

// ─── Tool map ────────────────────────────────────────────────

const ALL_TOOLS: Record<string, ToolDefinition> = {
  analyze_market: TOOL_ANALYZE_MARKET,
  check_social: TOOL_CHECK_SOCIAL,
  scan_market: TOOL_SCAN_MARKET,
  chart_control: TOOL_CHART_CONTROL,
  save_pattern: TOOL_SAVE_PATTERN,
  submit_feedback: TOOL_SUBMIT_FEEDBACK,
  query_memory: TOOL_QUERY_MEMORY,
};

// ─── History compression (client-side format) ────────────────

/**
 * Compress a long assistant analysis response into a compact summary.
 * Called on the CLIENT before storing to chatHistory.
 *
 * Full response: "와이코프 MARKUP에 MTF 다 정렬됐어. 알파 46이면 꽤 불리시한..."
 * Compressed:    "[BTC 4H LONG+46: MARKUP, MTF정렬]"
 *
 * This function is exported so the client can call it.
 */
export function compressAssistantTurn(
  text: string,
  meta?: CompressedHistoryEntry['meta'],
): string {
  if (!meta) return text.slice(0, 120); // safety trim if no meta

  const { symbol, tf, alphaScore, direction, kind } = meta;

  switch (kind) {
    case 'analysis': {
      const dir = direction ?? (alphaScore != null && alphaScore >= 10 ? 'LONG' : alphaScore != null && alphaScore <= -10 ? 'SHORT' : 'NEUTRAL');
      const score = alphaScore != null ? (alphaScore > 0 ? `+${alphaScore}` : `${alphaScore}`) : '';
      return `[${symbol ?? '?'} ${tf ?? '?'} ${dir}${score}: ${text.slice(0, 60).replace(/\n/g, ' ')}]`;
    }
    case 'scan': {
      // Extract coin mentions from text (first 100 chars)
      return `[SCAN: ${text.slice(0, 80).replace(/\n/g, ' ')}]`;
    }
    case 'social': {
      return `[SOCIAL ${symbol ?? ''}: ${text.slice(0, 60).replace(/\n/g, ' ')}]`;
    }
    default:
      return text.slice(0, 100);
  }
}

// ─── Snapshot injection gating ───────────────────────────────

function shouldInjectSnapshot(
  budget: IntentBudget,
  snapshot: SignalSnapshot | undefined,
  snapshotTs: number | undefined,
  detectedSymbol?: string,
): boolean {
  if (!snapshot || budget.includeSnapshot === 'never') return false;
  if (budget.includeSnapshot === 'always') return true;

  // 'if_same_symbol': snapshot must match the detected symbol and be fresh
  if (budget.includeSnapshot === 'if_same_symbol') {
    const isFresh = snapshotTs != null && Date.now() - snapshotTs < SNAPSHOT_MAX_AGE_MS;
    if (!isFresh) return false;
    if (!detectedSymbol) return false;
    const snapSym = snapshot.symbol?.replace('USDT', '').toUpperCase();
    const reqSym = detectedSymbol.replace('USDT', '').toUpperCase();
    return snapSym === reqSym;
  }

  return false;
}

// ─── Main builder ────────────────────────────────────────────

export interface BuildContextOptions {
  profile: DouniProfile;
  budget: IntentBudget;
  /** Compressed or verbatim history from client */
  history: CompressedHistoryEntry[];
  /** Current message (may be synthesized for greeting mode) */
  message: string;
  /** Current snapshot (may be undefined if no analysis yet) */
  snapshot?: SignalSnapshot;
  /** Unix ms when snapshot was computed */
  snapshotTs?: number;
  /** Symbol detected from classifier (for snapshot gating) */
  detectedSymbol?: string;
}

export function buildContext(opts: BuildContextOptions): BuildContextResult {
  const { profile, budget, history, message, snapshot, snapshotTs, detectedSymbol } = opts;

  // 1. System prompt (static personality — Anthropic will auto-cache the prefix)
  let systemPrompt = buildDouniSystemPrompt(profile);

  // 2. Conditionally inject snapshot context
  const injectSnap = shouldInjectSnapshot(budget, snapshot, snapshotTs, detectedSymbol);
  if (injectSnap && snapshot) {
    try {
      const ctx = buildAnalysisContext(snapshot, profile.archetype);
      systemPrompt += `\n\n[Current Analysis]\n${ctx}`;
    } catch { /* skip partial snapshot */ }
  } else if (budget.tools.includes('analyze_market') || budget.tools.includes('scan_market')) {
    // Only add this hint when the LLM has tools to fetch data
    systemPrompt += `\n\n[NO DATA YET]\nUse analyze_market or scan_market to get fresh data.`;
  }

  // 3. Build messages array
  const messages: LLMMessageWithTools[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 4. Compressed history (most recent N turns)
  const depth = budget.historyDepth;
  if (depth > 0 && history.length > 0) {
    for (const h of history.slice(-depth)) {
      messages.push({ role: h.role, content: h.content });
    }
  }

  // 5. Current user message
  messages.push({ role: 'user', content: message });

  // 6. Tool subset
  const tools: ToolDefinition[] = budget.tools
    .map(name => ALL_TOOLS[name])
    .filter((t): t is ToolDefinition => t != null);

  return { systemPrompt, messages, tools };
}
