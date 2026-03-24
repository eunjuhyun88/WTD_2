// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: REASON
// Each agent calls LLM independently to generate a decision trace
// Design: BattleStateMachine_20260322 § STATE 3
//         AgentDecisionPipeline_20260322 § 1-5
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  OwnedAgent,
  SignalSnapshot,
  MarketFrame,
  StageFrame,
  ScenarioFrame,
  MemoryRecord,
  AgentDecisionTrace,
  ContextAssemblyInput,
  CallMeta,
} from '../types.js';
import { FLAT_FALLBACK, V4_CONFIG } from '../types.js';

// ─── Role-specific instructions ────────────────────────────────

const ROLE_INSTRUCTIONS: Record<string, string> = {
  CRUSHER: 'Prioritize CVD divergence and funding overheat. Short-bias unless strong long evidence.',
  RIDER: 'Follow momentum. Enter only after structure confirms direction.',
  ORACLE: 'Detect hidden traps and divergences. Flag when price action contradicts order flow.',
  GUARDIAN: 'Protect the squad. Veto entries near liquidation clusters or with adverse funding.',
};

// ─── Main entry ────────────────────────────────────────────────

export async function reason(state: BattleTickState): Promise<BattleTickState> {
  const { squad, signal, market, stage, scenario, memoriesByAgent } = state;

  if (!signal || !market) {
    // No signal data → all agents get FLAT fallback
    const traces: Record<string, string> = {};
    const callMeta: Record<string, CallMeta> = {};
    for (const agent of squad) {
      traces[agent.id] = JSON.stringify(FLAT_FALLBACK);
      callMeta[agent.id] = { durationMs: 0, tokenCount: 0, fallbackUsed: true };
    }
    return { ...state, state: 'DEBATE', rawTraces: traces, callMeta };
  }

  // Run all agents in parallel
  const startAt = Date.now();
  const results = await Promise.allSettled(
    squad.map(agent => {
      const input: ContextAssemblyInput = {
        agent,
        signal,
        market,
        stage,
        scenario,
        memories: memoriesByAgent?.[agent.id] ?? [],
        squadNotes: [], // First tick = empty, subsequent ticks use previous results
      };
      return runAgentReason(input);
    })
  );

  const rawTraces: Record<string, string> = {};
  const callMeta: Record<string, CallMeta> = {};

  for (let i = 0; i < squad.length; i++) {
    const agent = squad[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      rawTraces[agent.id] = result.value.rawResponse;
      callMeta[agent.id] = result.value.meta;
    } else {
      rawTraces[agent.id] = JSON.stringify({
        ...FLAT_FALLBACK,
        fallbackReason: 'promise_rejected',
      });
      callMeta[agent.id] = {
        durationMs: Date.now() - startAt,
        tokenCount: 0,
        fallbackUsed: true,
      };
    }
  }

  return {
    ...state,
    state: 'DEBATE',
    rawTraces,
    callMeta,
  };
}

// ─── Per-agent reasoning ───────────────────────────────────────

async function runAgentReason(
  input: ContextAssemblyInput,
): Promise<{ rawResponse: string; meta: CallMeta }> {
  const startAt = Date.now();

  try {
    // 1. Assemble context
    const context = assembleContext(input);

    // 2. Call LLM with timeout
    const rawResponse = await callLLMWithTimeout(context, V4_CONFIG.REASON_TIMEOUT_MS);

    return {
      rawResponse,
      meta: {
        durationMs: Date.now() - startAt,
        tokenCount: context.length / 4, // rough estimate
        fallbackUsed: false,
      },
    };
  } catch (e: any) {
    // Timeout or LLM error → heuristic fallback
    const fallback = heuristicDecide(input.signal, input.agent);

    return {
      rawResponse: JSON.stringify(fallback),
      meta: {
        durationMs: Date.now() - startAt,
        tokenCount: 0,
        fallbackUsed: true,
      },
    };
  }
}

// ─── Context assembler (9 blocks, order is immutable) ──────────

export function assembleContext(input: ContextAssemblyInput): string {
  // Ultra-compact for small local models (Qwen3 1.7B)
  const { agent, signal, market, stage } = input;
  const s = signal;
  const m = market;
  const bias = stage.verticalBias;

  // Determine what the archetype should lean toward
  const leanHint = bias < -0.2 ? 'SHORT' : bias > 0.2 ? 'LONG' : 'either direction';

  return `/no_think
Crypto trading decision. Pick ONE action.

Market: BTC $${m.price.toFixed(0)}, ${(m.priceDelta * 100).toFixed(1)}% move, ${m.regime} regime
Signals: CVD ${s.cvd1h > 0 ? 'bullish' : 'bearish'}, funding ${s.fundingRate.toFixed(4)}, bias ${bias.toFixed(2)}
Archetype ${agent.archetypeId} leans ${leanHint}.

Reply with EXACTLY this JSON (fill in values):
{"action":"SHORT","confidence":0.7,"thesis":"bearish CVD + high funding","invalidation":"price breaks above resistance","evidenceTitles":[],"riskFlags":[],"memoryIdsUsed":[]}`;
}

function blockSystem(agent: OwnedAgent): string {
  return `You are ${agent.name}, a crypto market battle agent.
Archetype: ${agent.archetypeId}
Stage: ${agent.stage}/3
Bond level: ${agent.bond}/100

Your doctrine:
${agent.loadout.systemPrompt}`;
}

function blockRole(agent: OwnedAgent): string {
  const instructions = ROLE_INSTRUCTIONS[agent.archetypeId] ?? '';
  return `Your role in this squad: ${agent.archetypeId}
Risk tolerance: ${agent.loadout.riskStyle}
Trading horizon: ${agent.loadout.horizon}
${instructions}`;
}

function blockObjective(scenario: ScenarioFrame): string {
  return `Current scenario: ${scenario.objectiveLabel}
Round: ${scenario.round}/${scenario.totalRounds}
Ticks remaining: ${scenario.tickLimit - scenario.tick}
Objective progress: ${scenario.objectiveProgress.toFixed(2)}`;
}

function blockSignals(agent: OwnedAgent, signal: SignalSnapshot): string {
  const w = agent.loadout.signalWeights;
  return `ENABLED signals: ${agent.loadout.enabledDataSources.join(', ') || 'all'}
Signal weights:
  CVD: ${w.cvdDivergence}
  Funding: ${w.fundingRate}
  OI: ${w.openInterest}
  HTF: ${w.htfStructure}`;
}

function blockMarket(market: MarketFrame): string {
  return `Market state:
  Price: ${market.price}
  Delta: ${(market.priceDelta * 100).toFixed(3)}%
  Regime: ${market.regime}
  Funding bias: ${market.fundingBias.toFixed(4)}
  Volume impulse: ${market.volumeImpulse.toFixed(2)}
  Volatility: ${market.volatility.toFixed(4)}`;
}

function blockStage(stage: StageFrame): string {
  const biasLabel = stage.verticalBias > 0.3 ? 'BULLISH'
    : stage.verticalBias < -0.3 ? 'BEARISH'
    : 'NEUTRAL';
  return `Stage:
  Vertical bias: ${stage.verticalBias.toFixed(2)} (${biasLabel})
  Captured zones: ${stage.capturedZones.length}
  Predator active: ${stage.predatorZones.length > 0 ? 'YES — DANGER' : 'no'}
  Support integrity: ${(stage.supportIntegrity * 100).toFixed(0)}%
  Zone control: ${stage.zoneControlScore.toFixed(2)}`;
}

function blockMemories(memories: MemoryRecord[]): string {
  if (memories.length === 0) return 'No relevant memories available.';
  return `Relevant memories (${memories.length}):\n` +
    memories.map((m, i) =>
      `[${i + 1}] ${m.kind} | score ${(m.score ?? 0).toFixed(2)}\n${m.title}\n${m.lesson}`
    ).join('\n\n');
}

function blockSquad(squadNotes: string[]): string {
  if (squadNotes.length === 0) return '';
  return `Squad intelligence:\n${squadNotes.join('\n')}`;
}

function blockSchema(): string {
  return `Respond ONLY with valid JSON. No markdown, no explanation, no extra text.
{
  "action":        "LONG" | "SHORT" | "FLAT",
  "confidence":    0.0 to 1.0,
  "thesis":        "one sentence max 50 chars",
  "invalidation":  "one sentence: condition that would make this wrong",
  "evidenceTitles": ["memory card titles used"],
  "riskFlags":     ["max 2 risk keywords"],
  "memoryIdsUsed": ["memory-uuid-list"]
}`;
}

// ─── Token budget trimming ─────────────────────────────────────

function trimToTokenBudget(blocks: string[], budget: number): string {
  let combined = blocks.join('\n\n');
  const estimatedTokens = combined.length / 4;

  if (estimatedTokens <= budget) return combined;

  // Trim order: squad notes → low-score memories → non-critical signal fields
  // 1. Remove squad notes (block index 7)
  blocks[7] = '';
  combined = blocks.join('\n\n');
  if (combined.length / 4 <= budget) return combined;

  // 2. Trim memories to 2
  const memBlock = blocks[6];
  if (memBlock.includes('Relevant memories')) {
    const lines = memBlock.split('\n\n');
    blocks[6] = lines.slice(0, 3).join('\n\n'); // header + 2 memories
  }
  combined = blocks.join('\n\n');
  if (combined.length / 4 <= budget) return combined;

  // 3. Truncate market block
  blocks[4] = blocks[4].split('\n').slice(0, 4).join('\n');
  return blocks.join('\n\n');
}

// ─── LLM call with timeout ─────────────────────────────────────

async function callLLMWithTimeout(prompt: string, timeoutMs: number): Promise<string> {
  // MVP: Use dynamic import to avoid hard dependency on server module
  // callLLM expects { messages, maxTokens, temperature, timeoutMs } and returns LLMResult
  try {
    const mod = await import(/* @vite-ignore */ '$lib/server/llmService.js').catch(() => null);
    if (!mod?.callLLM) throw new Error('LLM module not available');

    const result = await mod.callLLM({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: V4_CONFIG.REASON_MAX_PREDICT,
      temperature: V4_CONFIG.REASON_TEMPERATURE,
      timeoutMs,
    });
    return result.text ?? '';
  } catch {
    throw new Error('LLM unavailable');
  }
}

// ─── Heuristic fallback (when LLM completely unavailable) ──────

export function heuristicDecide(
  signal: SignalSnapshot,
  agent: OwnedAgent,
): AgentDecisionTrace {
  const cvdBullish = signal.cvd1h > 0;
  const cvdBearish = signal.cvd1h < 0;
  const fundingLongHeat = signal.fundingRate > 0.03;
  const fundingShortHeat = signal.fundingRate < -0.03;
  const trendUp = signal.htfStructure === 'UPTREND';
  const trendDown = signal.htfStructure === 'DOWNTREND';
  const oiRising = signal.oiTrend === 'RISING';

  let action: 'LONG' | 'SHORT' | 'FLAT' = 'FLAT';
  let confidence = 0.5;
  let thesis = '';

  if (agent.archetypeId === 'CRUSHER') {
    // CRUSHER: aggressive short-bias, acts on funding + CVD
    if (fundingLongHeat || (cvdBearish && trendDown)) {
      action = 'SHORT';
      confidence = 0.6 + (Math.abs(signal.fundingRate) * 2);
      thesis = `SHORT: funding ${signal.fundingRate.toFixed(4)} + CVD bearish`;
    } else if (cvdBullish && trendUp) {
      action = 'LONG';
      confidence = 0.55;
      thesis = 'LONG: CVD + trend aligned bullish';
    } else if (trendDown) {
      action = 'SHORT';
      confidence = 0.52;
      thesis = 'SHORT: downtrend default bias';
    }
  } else if (agent.archetypeId === 'RIDER') {
    // RIDER: momentum follower, always picks a direction
    if (trendUp) {
      action = 'LONG';
      confidence = 0.55 + (cvdBullish ? 0.1 : 0);
      thesis = 'LONG: riding uptrend momentum';
    } else if (trendDown) {
      action = 'SHORT';
      confidence = 0.55 + (cvdBearish ? 0.1 : 0);
      thesis = 'SHORT: riding downtrend momentum';
    } else {
      // Range: pick direction from CVD
      action = cvdBullish ? 'LONG' : 'SHORT';
      confidence = 0.5;
      thesis = `${action}: CVD-guided in range`;
    }
  } else if (agent.archetypeId === 'ORACLE') {
    // ORACLE: contrarian, looks for divergences and traps
    if (signal.cvdDivergence) {
      action = signal.cvdDivergenceType === 'bearish' ? 'SHORT' : 'LONG';
      confidence = 0.65;
      thesis = `${action}: CVD divergence detected`;
    } else if (fundingLongHeat && trendUp) {
      action = 'SHORT'; // Contrarian: too much long leverage in uptrend
      confidence = 0.55;
      thesis = 'SHORT: contrarian — overleveraged longs in uptrend';
    } else if (fundingShortHeat && trendDown) {
      action = 'LONG'; // Contrarian: too much short leverage in downtrend
      confidence = 0.55;
      thesis = 'LONG: contrarian — overleveraged shorts in downtrend';
    } else {
      action = cvdBullish ? 'LONG' : 'SHORT';
      confidence = 0.5;
      thesis = `${action}: no divergence, following CVD`;
    }
  } else if (agent.archetypeId === 'GUARDIAN') {
    // GUARDIAN: cautious but not paralyzed — acts when signals align
    const signalsAligned = (cvdBullish && trendUp) || (cvdBearish && trendDown);
    if (signalsAligned && !fundingLongHeat && !fundingShortHeat) {
      action = trendUp ? 'LONG' : 'SHORT';
      confidence = 0.5;
      thesis = `${action}: signals aligned, risk acceptable`;
    } else if (oiRising && trendDown) {
      action = 'SHORT';
      confidence = 0.5;
      thesis = 'SHORT: OI rising in downtrend = bear fuel';
    } else {
      // Even GUARDIAN picks a lean instead of pure FLAT
      action = trendUp ? 'LONG' : trendDown ? 'SHORT' : 'FLAT';
      confidence = 0.45;
      thesis = action === 'FLAT' ? 'FLAT: no clear signal' : `${action}: weak lean from HTF`;
    }
  }

  return {
    action,
    confidence: Math.min(0.85, confidence),
    thesis: thesis || `HEURISTIC: ${action}`,
    invalidation: '',
    evidenceTitles: [],
    riskFlags: signal.modifiers.slice(0, 2),
    memoryIdsUsed: [],
    fallbackUsed: true,
    fallbackReason: 'llm_unavailable',
    providerLabel: 'fallback:heuristic',
  };
}
