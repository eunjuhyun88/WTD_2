// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: REFLECT
// Creates memory cards, generates reflection text,
// queues ORPO learning pairs, updates XP/Bond.
// Design: BattleStateMachine_20260322 § STATE 7
//         Cogochi_ORPOPipeline_20260322 § 2
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  MemoryRecord,
  MemoryKind,
  BattleOutcome,
  GameActionPlan,
  AgentDecisionTrace,
  SignalSnapshot,
  MarketFrame,
  OrpoPairSource,
  BattleAction,
  ClassifyOutput,
} from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function reflect(state: BattleTickState): BattleTickState {
  const {
    outcome,
    plan,
    traces,
    signal,
    market,
    squad,
    events,
    matchResult,
    scenario,
    tick,
  } = state;

  if (!outcome || !plan || !traces || !signal || !market) {
    return { ...state, state: 'OBSERVE', completedAt: Date.now() };
  }

  const classify = state.classify;

  // 1. Generate memory cards
  const memoryCards = generateMemoryCards(
    outcome,
    plan,
    traces,
    signal,
    squad[0]?.id ?? 'unknown',
    tick,
    events.some(e => e.type === 'TRAP_CAUGHT'),
    classify,
  );

  // 2. Generate 2-line reflection
  const reflection = generateReflection(outcome, signal, traces, plan, classify);

  // 3. Calculate bond delta
  const bondDelta = calculateBondDelta(outcome, plan.trainerLabel);

  // 4. Queue ORPO pair if match ended
  let orpoQueued = false;
  if (matchResult) {
    // ORPO pairs will be collected by the ORPO pipeline
    // We just mark that this tick should be collected
    orpoQueued = shouldQueueOrpo(outcome, plan);
  }

  // 5. Update squad bond
  const updatedSquad = squad.map(a => ({
    ...a,
    bond: Math.max(0, Math.min(100, a.bond + bondDelta)),
  }));

  return {
    ...state,
    state: 'OBSERVE', // Loop back for next tick (or end if matchResult)
    memoryCards,
    reflection,
    bondDelta,
    orpoQueued,
    squad: updatedSquad,
    completedAt: Date.now(),
  };
}

// ─── Memory card generation ────────────────────────────────────

function generateMemoryCards(
  outcome: BattleOutcome,
  plan: GameActionPlan,
  traces: Record<string, AgentDecisionTrace>,
  signal: SignalSnapshot,
  agentId: string,
  tick: number,
  trapCaught: boolean,
  classify?: ClassifyOutput,
): MemoryRecord[] {
  const cards: MemoryRecord[] = [];
  const now = Date.now();
  const executorTrace = Object.values(traces)[0]; // first agent as representative

  // Phase 2: NO_TRADE memory cards
  const isNoTrade = plan.primary === 'DEFEND' || actionFromPlan(plan) === 'FLAT';
  const noTradeVotes = Object.values(traces).filter(t => t.action === 'NO_TRADE').length;
  if (noTradeVotes > 0 && classify) {
    // NO_TRADE was the consensus (or at least proposed)
    // NEUTRAL outcome after NO_TRADE = correctly_abstained
    // We can't know "missed_opportunity" until we see what happened next,
    // but we record the abstain decision for later evaluation
    cards.push(buildCard({
      agentId,
      kind: outcome === 'NEUTRAL' ? 'SUCCESS_CASE' : 'PLAYBOOK',
      signal,
      action: 'NO_TRADE',
      outcome: outcome === 'NEUTRAL' ? 'correctly_abstained' : 'abstained',
      title: truncate(`SKIP: ${classify.marketState}/${classify.setupType}`, 30),
      lesson: truncate(
        outcome === 'NEUTRAL'
          ? `Correct NO_TRADE in ${classify.marketState}, setup: ${classify.setupType}`
          : `NO_TRADE in ${classify.marketState}, market moved ${outcome}`,
        50
      ),
      importance: outcome === 'NEUTRAL' ? 0.8 : 0.6,
      successScore: outcome === 'NEUTRAL' ? 0.5 : 0.0,
      tick,
      now,
    }));
  }

  // Case: WIN + not overridden
  if (outcome === 'WIN' && plan.trainerLabel !== 'OVERRIDDEN') {
    cards.push(buildCard({
      agentId,
      kind: 'SUCCESS_CASE',
      signal,
      action: actionFromPlan(plan),
      outcome: 'WIN',
      title: truncate(`WIN: ${executorTrace?.thesis ?? 'correct call'}`, 30),
      lesson: truncate(`${signal.primaryZone} + ${signal.fundingLabel} → ${actionFromPlan(plan)} worked`, 50),
      importance: plan.trainerLabel === 'APPROVED' ? 0.9 : 0.7,
      successScore: 1.0,
      tick,
      now,
    }));
  }

  // Case: WIN + APPROVED (strongest learning signal)
  if (outcome === 'WIN' && plan.trainerLabel === 'APPROVED') {
    // Already created above with importance 0.9
  }

  // Case: LOSS
  if (outcome === 'LOSS') {
    const failureLesson = classifyFailureLesson(signal, traces);
    cards.push(buildCard({
      agentId,
      kind: 'FAILURE_CASE',
      signal,
      action: actionFromPlan(plan),
      outcome: 'LOSS',
      title: truncate(`LOSS: ${failureLesson.short}`, 30),
      lesson: truncate(failureLesson.detail, 50),
      importance: 0.9,
      successScore: -1.0,
      tick,
      now,
    }));
  }

  // Case: TRAP_CAUGHT (special high-importance failure)
  if (trapCaught) {
    cards.push(buildCard({
      agentId,
      kind: 'FAILURE_CASE',
      signal,
      action: actionFromPlan(plan),
      outcome: 'LOSS',
      title: truncate('TRAP: Predator zone activated', 30),
      lesson: truncate(`Entered ${signal.primaryZone} near liquidation cluster`, 50),
      importance: 1.0,
      successScore: -1.0,
      tick,
      now,
    }));
  }

  return cards;
}

// ─── Reflection generator ──────────────────────────────────────

function generateReflection(
  outcome: BattleOutcome,
  signal: SignalSnapshot,
  traces: Record<string, AgentDecisionTrace>,
  plan: GameActionPlan,
  classify?: ClassifyOutput,
): string {
  const failure = classifyFailureLesson(signal, traces);

  // Phase 2: NO_TRADE reflection
  const noTradeVotes = Object.values(traces).filter(t => t.action === 'NO_TRADE').length;
  if (noTradeVotes > 0 && classify) {
    const regime = classify.marketState;
    const setup = classify.setupType;
    if (outcome === 'NEUTRAL') {
      return `Correctly abstained in ${regime}/${setup}\nNO_TRADE precision: market stayed flat`;
    }
    return `NO_TRADE in ${regime}/${setup}, market moved ${outcome}\n${outcome === 'WIN' ? 'Missed opportunity — consider loosening abstain gate' : 'Good skip — avoided loss'}`;
  }

  if (outcome === 'WIN') {
    const line1 = `Correct ${actionFromPlan(plan)} in ${signal.primaryZone}`;
    const line2 = signal.cvdDivergence
      ? 'CVD divergence signal was key factor'
      : `${signal.fundingLabel} funding aligned with direction`;
    return `${line1}\n${line2}`;
  }

  if (outcome === 'LOSS') {
    const line1 = failure.short;
    const line2 = failure.suggestion;
    return `${line1}\n${line2}`;
  }

  return `FLAT position in ${signal.primaryZone}\nNo strong signal to act on`;
}

// ─── Failure classification ────────────────────────────────────

interface FailureLesson {
  short: string;
  detail: string;
  suggestion: string;
}

function classifyFailureLesson(
  signal: SignalSnapshot,
  traces: Record<string, AgentDecisionTrace>,
): FailureLesson {
  const traceArr = Object.values(traces);
  const majorityAction = getMajorityAction(traceArr);

  // CVD divergence ignored
  if (signal.cvdDivergence && majorityAction !== 'FLAT') {
    return {
      short: 'CVD divergence ignored',
      detail: `Entered ${majorityAction} despite ${signal.cvdDivergenceType ?? ''} CVD divergence`,
      suggestion: 'Next: Increase CVD weight or add divergence check',
    };
  }

  // Funding overheat ignored
  if (signal.fundingLabel !== 'NEUTRAL' && majorityAction !== 'FLAT') {
    return {
      short: 'Funding overheat ignored',
      detail: `Entered ${majorityAction} during ${signal.fundingLabel}`,
      suggestion: 'Next: Respect extreme funding as caution signal',
    };
  }

  // OI shock
  if (signal.modifiers.includes('OI_SHOCK')) {
    return {
      short: 'OI shock missed',
      detail: `OI change ${(signal.oiChange1h * 100).toFixed(1)}% signaled instability`,
      suggestion: 'Next: Add OI shock as a risk flag',
    };
  }

  // Default
  return {
    short: 'Incorrect direction',
    detail: `${majorityAction} in ${signal.primaryZone} was wrong`,
    suggestion: 'Next: Review zone classification logic',
  };
}

// ─── Bond delta calculation ────────────────────────────────────

function calculateBondDelta(outcome: BattleOutcome, trainerLabel: string | null): number {
  if (outcome === 'WIN' && trainerLabel === 'APPROVED') return 3;
  if (outcome === 'WIN') return 2;
  if (outcome === 'LOSS' && trainerLabel === 'OVERRIDDEN') return 1; // trainer tried to help
  if (outcome === 'LOSS') return -1;
  return 0;
}

// ─── ORPO queue check ──────────────────────────────────────────

function shouldQueueOrpo(outcome: BattleOutcome, plan: GameActionPlan): boolean {
  // ORPO Pipeline spec § 2.2:
  // APPROVE+WIN → yes (0.9)
  // OVERRIDE+WIN → yes (0.95)
  // APPROVE+LOSS → no
  // OVERRIDE+LOSS → yes (0.5)
  // None+WIN (conf>0.65) → yes (0.6)
  // None+LOSS → no

  if (plan.trainerLabel === 'APPROVED' && outcome === 'WIN') return true;
  if (plan.trainerLabel === 'OVERRIDDEN' && outcome === 'WIN') return true;
  if (plan.trainerLabel === 'OVERRIDDEN' && outcome === 'LOSS') return true;
  if (plan.trainerLabel === null && outcome === 'WIN') return true; // conf check done later
  return false;
}

// ─── Helpers ───────────────────────────────────────────────────

function buildCard(opts: {
  agentId: string;
  kind: MemoryKind;
  signal: SignalSnapshot;
  action: string;
  outcome: string;
  title: string;
  lesson: string;
  importance: number;
  successScore: number;
  tick: number;
  now: number;
}): MemoryRecord {
  return {
    id: `mem-${opts.agentId}-${opts.tick}-${Date.now()}`,
    agentId: opts.agentId,
    kind: opts.kind,
    symbol: opts.signal.symbol,
    regime: opts.signal.htfStructure === 'UPTREND' ? 'bull'
      : opts.signal.htfStructure === 'DOWNTREND' ? 'bear'
      : 'sideways',
    primaryZone: opts.signal.primaryZone,
    action: opts.action,
    outcome: opts.outcome,
    title: opts.title,
    lesson: opts.lesson,
    importance: opts.importance,
    successScore: opts.successScore,
    retrievalCount: 0,
    compactionLevel: 0,
    isDoctrineCard: false,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

function actionFromPlan(plan: GameActionPlan): string {
  if (['LONG_PUSH', 'BREAK_WALL'].includes(plan.primary)) return 'LONG';
  if (['SHORT_SLAM', 'CRUSH_SUPPORT', 'LAY_TRAP'].includes(plan.primary)) return 'SHORT';
  return 'FLAT';
}

function getMajorityAction(traces: AgentDecisionTrace[]): BattleAction {
  const counts: Record<string, number> = { LONG: 0, SHORT: 0, FLAT: 0, NO_TRADE: 0 };
  for (const t of traces) counts[t.action] = (counts[t.action] ?? 0) + 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'FLAT') as BattleAction;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
