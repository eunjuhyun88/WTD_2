// =================================================================
// STOCKCLAW — Arena v2 ↔ RAG Bridge
// =================================================================
// Converts Arena v2 game data to/from RAG format.
// Reuses computeTerminalScanEmbedding() for 256d vector compatibility.
// All operations are fire-and-forget safe (graceful degradation).
// =================================================================

import { computeTerminalScanEmbedding } from './ragEmbedding';
import { searchRAG, saveRAGEntry as saveRAGEntryAPI } from './gameRecordStore';
import type { Finding } from '$lib/stores/arenaV2State';
import type { V2BattleResult } from './v2BattleTypes';
import type { RAGEntry, RAGRecall, PairQuality } from './arenaWarTypes';
import type { Direction } from './types';

// ── Input types ──────────────────────────────────────────────

export interface V2RAGInput {
  selectedAgents: string[];
  findings: Finding[];
  hypothesis: { dir: Direction; conf: number };
  btcPrice: number;
  tier: string;
  timeframe: string;
  consensusType: 'unanimous' | 'majority' | 'split';
}

export interface V2RAGHint {
  similarCount: number;
  winRate: number;
  suggestedDir: Direction;
  avgRR: number;
  confidenceAdj: number;
}

// ── Quality classification for v2 games ──────────────────────

function classifyV2Quality(result: V2BattleResult): string {
  const margin = Math.abs(result.finalVS - 50);
  if (margin > 25 && result.maxCombo >= 3) return 'strong';
  if (margin > 15) return 'medium';
  if (margin <= 5) return 'boundary'; // Close games = decision boundary learning
  return 'weak';
}

// ── All 8 agent IDs ──────────────────────────────────────────

const ALL_AGENTS = [
  'STRUCTURE', 'VPA', 'ICT', 'DERIV', 'VALUATION', 'FLOW', 'SENTI', 'MACRO',
] as const;

// ── Build embedding from v2 context ──────────────────────────

/**
 * Convert Arena v2 findings into a 256d embedding.
 * Non-selected agents get neutral/50 signals → compatible with
 * Arena War and Terminal Scan embeddings.
 */
export function buildV2Embedding(input: V2RAGInput): number[] {
  const signals = ALL_AGENTS.map(agentId => {
    const finding = input.findings.find(
      f => f.agentId.toUpperCase() === agentId
    );
    if (finding) {
      return {
        agentId,
        vote: finding.direction.toLowerCase() as 'long' | 'short' | 'neutral',
        confidence: finding.confidence,
      };
    }
    // Non-selected agent → neutral signal
    return {
      agentId,
      vote: 'neutral' as const,
      confidence: 50,
    };
  });

  return computeTerminalScanEmbedding(signals, input.timeframe);
}

// ── Build RAGEntry from v2 result ────────────────────────────

/**
 * Create a RAGEntry from Arena v2 game data for persistence.
 * Maps v2-specific fields into the shared RAGEntry schema.
 */
export function buildV2RAGEntry(
  input: V2RAGInput,
  result: V2BattleResult,
): RAGEntry {
  const embedding = buildV2Embedding(input);

  // Pattern signature from selected agents + tier
  const agentSig = input.selectedAgents
    .map(a => a.toUpperCase().slice(0, 3))
    .sort()
    .join('-');
  const patternSignature = `v2:${agentSig}:${input.tier}`;

  // Determine winner: human always plays (no AI opponent in v2)
  // Use outcome to determine "win"
  const isWin = result.outcome === 'tp_hit' || result.outcome === 'timeout_win';
  const winner: 'human' | 'ai' | 'draw' = isWin ? 'human' : 'ai';

  // Agent-level top findings as "aiDecision" equivalent
  const topFactors = input.findings
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map(f => `${f.agentId}:${f.direction}:${f.confidence}`);

  // Estimate FBS from final VS (simplified)
  const humanFBS = Math.round(result.finalVS);
  const aiFBS = Math.round(100 - result.finalVS);

  return {
    patternSignature,
    embedding,
    regime: 'ranging' as import('./types').MarketRegime, // v2 doesn't track regime
    pair: 'BTCUSDT',
    timeframe: input.timeframe,
    humanDecision: {
      direction: input.hypothesis.dir,
      confidence: input.hypothesis.conf,
      reasonTags: [], // v2 doesn't have reason tags
      tp: 0, // stored in hypothesis, not needed for RAG
      sl: 0,
    },
    aiDecision: {
      direction: input.consensusType === 'unanimous'
        ? input.hypothesis.dir
        : ('NEUTRAL' as Direction),
      confidence: input.hypothesis.conf * 0.8,
      topFactors,
    },
    outcome: {
      winner,
      humanFBS,
      aiFBS,
      priceChange: result.finalPnL,
    },
    lesson: `v2 ${result.outcome} | VS ${result.finalVS.toFixed(0)} | combo ${result.maxCombo} | ${input.selectedAgents.join(',')}`,
    quality: classifyV2Quality(result) as PairQuality,
    timestamp: Date.now(),
    gameRecordId: '', // Set by caller (matchId)
  };
}

// ── Search similar games ─────────────────────────────────────

/**
 * Search RAG for similar past v2 games.
 * Returns null if no games found or search fails (graceful).
 */
export async function searchV2SimilarGames(
  input: V2RAGInput,
): Promise<RAGRecall | null> {
  try {
    const embedding = buildV2Embedding(input);
    const result = await searchRAG(
      embedding,
      input.hypothesis.dir,
      input.hypothesis.conf,
      { limit: 5 },
    );
    return result.recall;
  } catch (e) {
    console.warn('[v2RagBridge] RAG search failed (graceful):', e);
    return null;
  }
}

// ── Save v2 game to RAG ──────────────────────────────────────

/**
 * Fire-and-forget save of a v2 game result to RAG.
 * Never throws — failure is logged but doesn't affect game.
 */
export async function saveV2ToRAG(
  input: V2RAGInput,
  result: V2BattleResult,
  matchId: string,
): Promise<void> {
  try {
    const entry = buildV2RAGEntry(input, result);
    entry.gameRecordId = matchId;
    const saveResult = await saveRAGEntryAPI(matchId, entry);
    if (saveResult.warning) {
      console.warn('[v2RagBridge] RAG save warning:', saveResult.warning);
    }
  } catch (e) {
    console.warn('[v2RagBridge] RAG save failed (graceful):', e);
  }
}

// ── Convert RAGRecall → v2 hint ──────────────────────────────

/**
 * Convert RAGRecall stats into a simple hint for v2 UI.
 */
export function recallToHint(recall: RAGRecall | null): V2RAGHint | null {
  if (!recall || recall.similarGamesFound === 0) return null;

  return {
    similarCount: recall.similarGamesFound,
    winRate: recall.historicalWinRate,
    suggestedDir: recall.suggestedDirection,
    avgRR: 0, // not tracked in current RAGRecall
    confidenceAdj: recall.confidenceAdjustment,
  };
}
