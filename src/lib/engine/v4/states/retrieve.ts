// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: RETRIEVE
// Fetches relevant memories per agent from PostgreSQL
// Design: BattleStateMachine_20260322 § STATE 2
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  MemoryRecord,
  OwnedAgent,
  SignalSnapshot,
  MarketFrame,
  RetrievalMeta,
  RetrievalQuery,
} from '../types.js';
import { V4_CONFIG } from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export async function retrieve(state: BattleTickState): Promise<BattleTickState> {
  const { squad, signal, market, scenario } = state;

  if (!signal || !market) {
    return {
      ...state,
      state: 'REASON',
      memoriesByAgent: {},
      retrievalMeta: {},
    };
  }

  // Run retrieval for each agent in parallel with timeout
  const results = await Promise.allSettled(
    squad.map(agent =>
      withTimeout(
        retrieveForAgent(agent, signal, market, scenario.startTimestamp),
        V4_CONFIG.RETRIEVE_TIMEOUT_MS,
      )
    )
  );

  const memoriesByAgent: Record<string, MemoryRecord[]> = {};
  const retrievalMeta: Record<string, RetrievalMeta> = {};

  for (let i = 0; i < squad.length; i++) {
    const agent = squad[i];
    const result = results[i];

    if (result.status === 'fulfilled' && result.value) {
      memoriesByAgent[agent.id] = result.value.memories;
      retrievalMeta[agent.id] = result.value.meta;
    } else {
      // Timeout or error → empty memories
      memoriesByAgent[agent.id] = [];
      retrievalMeta[agent.id] = { hitCount: 0, topScore: 0, doctrineFound: false };
    }
  }

  return {
    ...state,
    state: 'REASON',
    memoriesByAgent,
    retrievalMeta,
  };
}

// ─── Per-agent retrieval ───────────────────────────────────────

async function retrieveForAgent(
  agent: OwnedAgent,
  signal: SignalSnapshot,
  market: MarketFrame,
  scenarioStartAt: number,
): Promise<{ memories: MemoryRecord[]; meta: RetrievalMeta }> {
  const query = buildRetrievalQuery(agent, signal, market);

  // MVP: In-memory mock search (will be replaced with PostgreSQL query)
  // For now, return empty memories until Memory System (Step 2) is implemented
  const memories: MemoryRecord[] = [];

  // Apply quota policy
  const finalMemories = applyRetrievalPolicy(memories, agent);

  const doctrineFound = finalMemories.some(m => m.kind === 'DOCTRINE');
  const topScore = finalMemories.length > 0
    ? Math.max(...finalMemories.map(m => m.score ?? 0))
    : 0;

  return {
    memories: finalMemories,
    meta: {
      hitCount: finalMemories.length,
      topScore,
      doctrineFound,
    },
  };
}

// ─── Retrieval query builder ───────────────────────────────────

function buildRetrievalQuery(
  agent: OwnedAgent,
  signal: SignalSnapshot,
  market: MarketFrame,
): RetrievalQuery {
  return {
    regime: market.regime,
    cvdSign: signal.cvdDivergence ? 'DIVERGE' : 'ALIGN',
    fundingZone: signal.fundingRate > 0.08
      ? 'OVERHEAT'
      : signal.fundingRate < -0.08
        ? 'UNDERHEAT'
        : 'NEUTRAL',
    primaryZone: signal.primaryZone,
    agentRole: agent.archetypeId,
  };
}

// ─── Retrieval scoring (for future use with DB results) ────────

export function scoreMemory(
  memory: MemoryRecord,
  query: RetrievalQuery,
  nowMs: number,
): number {
  let score = 0;

  // Semantic similarity placeholder (0.30 weight)
  score += 0.30 * 0.5; // default mid-score until real embeddings

  // Lexical similarity placeholder (0.15 weight)
  score += 0.15 * 0.5;

  // Recency (0.12 weight)
  const ageMs = nowMs - memory.createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - ageDays / 30); // decay over 30 days
  score += 0.12 * recency;

  // Success weight (0.12)
  const successWeight = memory.kind === 'SUCCESS_CASE' ? 1.0
    : memory.kind === 'FAILURE_CASE' ? -0.5
    : 0;
  score += 0.12 * Math.max(0, (successWeight + 1) / 2); // normalize to 0-1

  // Importance (0.10)
  score += 0.10 * memory.importance;

  // Role match (0.08)
  // Would need agent role info in memory — skip for now
  score += 0.08 * 0.5;

  // Regime match (0.08)
  score += 0.08 * (memory.regime === query.regime ? 1 : 0);

  // Symbol match (0.05)
  score += 0.05 * 1; // always BTCUSDT for now

  return score;
}

// ─── Quota policy ──────────────────────────────────────────────

function applyRetrievalPolicy(
  memories: MemoryRecord[],
  agent: OwnedAgent,
): MemoryRecord[] {
  const policy = agent.loadout.retrievalPolicy;
  const maxTotal = policy.maxTotalCards;

  if (memories.length === 0) return [];

  // Sort by score descending
  const sorted = [...memories].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const result: MemoryRecord[] = [];
  const usedIds = new Set<string>();

  // 1. DOCTRINE card (mandatory, at least 1)
  const doctrines = sorted.filter(m => m.kind === 'DOCTRINE');
  for (const doc of doctrines.slice(0, policy.minDoctrineCards)) {
    result.push(doc);
    usedIds.add(doc.id);
  }

  // 2. FAILURE/RISK card (mandatory for RISK role)
  if (agent.squadRole === 'RISK') {
    const failures = sorted.filter(m =>
      m.kind === 'FAILURE_CASE' && !usedIds.has(m.id)
    );
    for (const fail of failures.slice(0, policy.minFailureCards)) {
      result.push(fail);
      usedIds.add(fail.id);
    }
  }

  // 3. Fill remaining with top-scored
  for (const mem of sorted) {
    if (result.length >= maxTotal) break;
    if (usedIds.has(mem.id)) continue;
    result.push(mem);
    usedIds.add(mem.id);
  }

  return result;
}

// ─── Timeout helper ────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}
