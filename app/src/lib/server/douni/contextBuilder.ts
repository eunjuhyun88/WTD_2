// ═══════════════════════════════════════════════════════════════
// contextBuilder — Cursor-style token-budget context assembly
// ═══════════════════════════════════════════════════════════════
//
// Responsibilities:
//   1. Compress assistant history turns to semantic summaries
//      (200 tok analysis response → ~15 tok summary)
//   2. Gate snapshot injection based on intent + staleness
//   3. Select tool subset based on IntentBudget
//   4. Auto-compact history when it exceeds COMPACT_THRESHOLD
//   5. Inject TradeMemory + sessionSummary into system prompt
//   6. Return final messages array ready for LLM call
//
// Static / Dynamic boundary (Claude Code SYSTEM_PROMPT_DYNAMIC_BOUNDARY 패턴):
//   - Static prefix (identity, constraints, Evidence Chain, tone) → Anthropic cache
//   - Dynamic suffix (locale, snapshot, memory, sessionSummary) → per-turn rebuild

import type { ToolDefinition, LLMMessageWithTools } from './types';
import type { DouniSnapshot } from './types';
import type { IntentBudget } from './intentClassifier';
import { SNAPSHOT_MAX_AGE_MS } from './intentClassifier';
import type { AgentContextPack } from '$lib/contracts/agent/agentContext';
import {
  buildDouniSystemPrompt,
  buildAnalysisContext,
  type BuildDouniPromptOptions,
  type DouniProfile,
} from '$lib/server/douni/personality';
import type { ServerSignalSnapshot as SignalSnapshot } from '$lib/server/cogochi/signalSnapshot';
import {
  TOOL_ANALYZE_MARKET,
  TOOL_CHECK_SOCIAL,
  TOOL_SCAN_MARKET,
  TOOL_CHECK_PATTERN_STATUS,
  TOOL_FIND_SIMILAR_PATTERNS,
  TOOL_CHART_CONTROL,
  TOOL_SAVE_PATTERN,
  TOOL_SUBMIT_FEEDBACK,
  TOOL_QUERY_MEMORY,
  TOOL_GET_ALPHA_WORLD_MODEL,
  TOOL_GET_ALPHA_TOKEN_DETAIL,
  TOOL_FIND_TOKENS,
  TOOL_SET_ALPHA_WATCH,
} from './tools';
import {
  maybeCompactHistory,
  clearStaleMarketData,
  shouldCompactByTokens,
} from './contextCompact';
import { formatMemoryForPrompt } from './tradeMemory';
import type { TradeMemory } from './tradeMemory';

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
  /** true if history was auto-compacted this turn — client should reset chatHistory to recentHistory */
  compacted: boolean;
  /** Surviving history after compact (client should replace its chatHistory with this) */
  recentHistory: CompressedHistoryEntry[];
}

// ─── Tool map ────────────────────────────────────────────────

const ALL_TOOLS: Record<string, ToolDefinition> = {
  analyze_market: TOOL_ANALYZE_MARKET,
  check_social: TOOL_CHECK_SOCIAL,
  scan_market: TOOL_SCAN_MARKET,
  check_pattern_status: TOOL_CHECK_PATTERN_STATUS,
  find_similar_patterns: TOOL_FIND_SIMILAR_PATTERNS,
  chart_control: TOOL_CHART_CONTROL,
  save_pattern: TOOL_SAVE_PATTERN,
  submit_feedback: TOOL_SUBMIT_FEEDBACK,
  query_memory: TOOL_QUERY_MEMORY,
  // Alpha Universe tools (W-0116)
  get_alpha_world_model: TOOL_GET_ALPHA_WORLD_MODEL,
  get_alpha_token_detail: TOOL_GET_ALPHA_TOKEN_DETAIL,
  find_tokens: TOOL_FIND_TOKENS,
  set_alpha_watch: TOOL_SET_ALPHA_WATCH,
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
  snapshot: DouniSnapshot | undefined,
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

function isFullSignalSnapshot(snapshot: DouniSnapshot | undefined): snapshot is SignalSnapshot {
  return Boolean(snapshot && typeof snapshot === 'object' && 'l1' in snapshot && 'alphaScore' in snapshot);
}

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(2) : 'n/a';
}

function formatSearchCandidates(candidates: NonNullable<AgentContextPack['scan']>['candidates']): string {
  if (candidates.length === 0) return 'none';
  return candidates
    .slice(0, 3)
    .map((candidate) => {
      const symbol = candidate.symbol ? ` ${candidate.symbol}` : '';
      const timeframe = candidate.timeframe ? ` ${candidate.timeframe}` : '';
      return `${candidate.candidate_id}${symbol}${timeframe} score=${formatScore(candidate.score)}`;
    })
    .join('; ');
}

export function formatAgentContextPackForPrompt(pack: AgentContextPack): string {
  const lines = [`symbol=${pack.symbol} timeframe=${pack.timeframe}`];

  if (pack.facts) {
    const confluence = pack.facts.confluence;
    lines.push(
      [
        `facts=${pack.facts.status}`,
        pack.facts.fact_id ? `fact_id=${pack.facts.fact_id}` : null,
        confluence?.verdict ? `confluence=${confluence.verdict}` : null,
        confluence?.score != null ? `confluence_score=${confluence.score}` : null,
      ].filter(Boolean).join(' '),
    );

    const providerState = pack.facts.provider_state ?? pack.facts.sources ?? {};
    const providerLines = Object.entries(providerState)
      .slice(0, 5)
      .map(([name, state]) => `${name}:${state.status}`)
      .join(', ');
    if (providerLines) {
      lines.push(`providers=${providerLines}`);
    }
  } else {
    lines.push('facts=unavailable');
  }

  if (pack.scan) {
    lines.push(
      `scan=${pack.scan.status} candidates=${pack.scan.candidates.length} top=${formatSearchCandidates(pack.scan.candidates)}`,
    );
  }
  if (pack.seed_search) {
    lines.push(
      `seed_search=${pack.seed_search.status} candidates=${pack.seed_search.candidates.length} top=${formatSearchCandidates(pack.seed_search.candidates)}`,
    );
  }

  if (pack.runtime) {
    lines.push(`runtime=${pack.runtime.status} captures=${pack.runtime.captures.length}`);
    for (const capture of pack.runtime.captures.slice(0, 3)) {
      const note = capture.user_note ? ` note="${capture.user_note.slice(0, 80)}"` : '';
      lines.push(
        `capture=${capture.id} kind=${capture.kind} status=${capture.status} phase=${capture.phase ?? 'n/a'}${note}`,
      );
    }
  }

  const evidence = pack.evidence?.slice(0, 6)
    .map((item) => `${item.metric}=${item.value}${item.state ? `(${item.state})` : ''}`)
    .join(', ');
  if (evidence) {
    lines.push(`evidence=${evidence}`);
  }

  return lines.join('\n');
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
  snapshot?: DouniSnapshot;
  /** Unix ms when snapshot was computed */
  snapshotTs?: number;
  /** Symbol detected from classifier (for snapshot gating) */
  detectedSymbol?: string;

  // ── New: Claude Code pattern integrations ─────────────────
  /**
   * User's locale (e.g. 'ko-KR', 'en-US', 'ja-JP').
   * Passed to _getLanguageSection() in douniPersonality.
   * Defaults to 'en' if omitted.
   */
  locale?: string;
  /**
   * Serialized TradeMemory object.
   * If provided, injected into the dynamic prompt section.
   */
  memory?: TradeMemory;
  /**
   * Intent string detected by classifier (for _getQuestionFocusSection).
   * e.g. 'analysis', 'scan', 'social', 'greeting', 'question'
   */
  intent?: string;
  /**
   * Alpha Universe world-model snapshot (JSON string from GET /alpha/world-model).
   * When provided in alpha profile mode, injected into system prompt so the LLM
   * can reason about token phases without an extra tool call.
   */
  alphaWorldModel?: string;
  /** Canonical bounded context assembled from fact/search/runtime planes. */
  agentContextPack?: AgentContextPack;
}

export function buildContext(opts: BuildContextOptions): BuildContextResult {
  const {
    profile,
    budget,
    message,
    snapshot,
    snapshotTs,
    detectedSymbol,
    locale,
    memory,
    intent,
    alphaWorldModel,
    agentContextPack,
  } = opts;

  // ── Step 1: Auto-compact history ──────────────────────────
  // Claude Code autoCompact.ts 패턴:
  //   turn 수 초과 OR 토큰 초과 시 오래된 턴을 deterministic summary로 압축
  const rawHistory = opts.history;
  const byTokens = shouldCompactByTokens(rawHistory);

  const compactResult = byTokens
    ? { compacted: true, summary: 'Earlier conversation compressed (token budget).', recentHistory: rawHistory.slice(-8) }
    : maybeCompactHistory(rawHistory);

  const { compacted, summary: sessionSummary, recentHistory } = compactResult;

  // ── Step 2: System prompt (Static + Dynamic sections) ─────
  // Static prefix: identity, constraints, Evidence Chain, tone
  //   → Anthropic prefix cache applies to everything before DOUNI_DYNAMIC_BOUNDARY
  // Dynamic suffix: locale, memory, sessionSummary, snapshot hint
  //   → rebuilt every turn, not cached
  const memorySection = memory ? formatMemoryForPrompt(memory) : undefined;

  const promptOpts: BuildDouniPromptOptions = {
    locale,
    intent,
    state: opts.profile.archetype as never, // DouniState is same shape as archetype
    memory: memorySection,
    sessionSummary: sessionSummary ?? undefined,
  };

  let systemPrompt = buildDouniSystemPrompt(profile, promptOpts);

  // ── Step 3a: Snapshot injection ───────────────────────────
  const injectSnap = shouldInjectSnapshot(budget, snapshot, snapshotTs, detectedSymbol);
  if (injectSnap && isFullSignalSnapshot(snapshot)) {
    try {
      const ctx = buildAnalysisContext(snapshot, profile.archetype);
      systemPrompt += `\n\n[Current Analysis]\n${ctx}`;
    } catch { /* skip partial snapshot */ }
  } else if (
    budget.tools.includes('analyze_market') ||
    budget.tools.includes('scan_market') ||
    budget.tools.includes('find_similar_patterns')
  ) {
    // Only add this hint when the LLM has tools to fetch data
    const hints: string[] = [];
    if (budget.tools.includes('analyze_market')) hints.push('analyze_market for fresh market data');
    if (budget.tools.includes('scan_market')) hints.push('scan_market for ranked market scans');
    if (budget.tools.includes('find_similar_patterns')) {
      hints.push('find_similar_patterns for thesis-style pattern retrieval');
    }
    systemPrompt += `\n\n[NO DATA YET]\nUse ${hints.join(', ')}.`;
  }

  // ── Step 3b-alpha: Alpha World Model injection ────────────
  // When alphaWorldModel is provided (pre-fetched by the server at 4h cadence),
  // inject the current phase table so the LLM can reason without a tool call.
  if (alphaWorldModel) {
    systemPrompt += `\n\n[Alpha Universe — Current State]\n${alphaWorldModel}\nUse get_alpha_token_detail or find_tokens for deeper investigation.`;
  }

  if (agentContextPack) {
    systemPrompt += `\n\n[Agent Context Pack]\n${formatAgentContextPackForPrompt(agentContextPack)}\nUse this as the bounded canonical fact/search/runtime context. Do not ask for raw provider payloads or full OHLCV unless a tool explicitly returns them.`;
  }

  // ── Step 3b: Pattern Memory → Evidence Chain Layer C ──────
  // 백테스트 기반 패턴 통계를 Evidence Chain의 BASE RATE 섹션 직전에 주입.
  // LLM이 "이 조합 내 히스토리에서 67% 맞았어" 같은 근거 있는 발언 가능.
  // signal_stats.py가 연결되면 여기에 실시간 조회 결과가 들어옴.
  if (memory?.patterns && memory.patterns.length > 0) {
    const patternLines = memory.patterns
      .slice(0, 4)  // 최대 4개 (토큰 절약)
      .map(p => `  • ${p}`)
      .join('\n');
    systemPrompt += `\n\n[Historical Pattern Match]\n${patternLines}\nUse these as BASE RATE when relevant. Do NOT cite if current symbol/blocks differ.`;
  }

  // ── Step 4: Build messages array ──────────────────────────
  // clearStaleMarketData: Claude Code clear_tool_uses 패턴
  //   — stale [Current Analysis] 섹션이 system message에 누적되면 제거
  const rawMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  const depth = budget.historyDepth;
  if (depth > 0 && recentHistory.length > 0) {
    for (const h of recentHistory.slice(-depth)) {
      rawMessages.push({ role: h.role, content: h.content });
    }
  }

  rawMessages.push({ role: 'user', content: message });

  // Remove stale market data from earlier system messages
  const cleanMessages = clearStaleMarketData(rawMessages, detectedSymbol);

  const messages: LLMMessageWithTools[] = cleanMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // ── Step 5: Tool subset ───────────────────────────────────
  const tools: ToolDefinition[] = budget.tools
    .map(name => ALL_TOOLS[name])
    .filter((t): t is ToolDefinition => t != null);

  return {
    systemPrompt,
    messages,
    tools,
    compacted,
    recentHistory,
  };
}
