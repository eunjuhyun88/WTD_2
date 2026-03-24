// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: DEBATE (v2 — Multi-round adversarial)
// Patterns applied:
//   TradingAgents: Bull vs Bear researcher debate + Research Manager judge
//   Paper 2602.23330: Fine-grained task decomposition
//   Paper 2412.20138: Multi-perspective adversarial consensus
//   awesome-codex-subagents: Orchestrator + error coordinator
//   everything-claude-code: Verification loops
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  AgentDecisionTrace,
  OwnedAgent,
  StageFrame,
  MarketFrame,
  SignalSnapshot,
  VetoDecision,
  SquadConsensus,
  BattleAction,
  BattleEvent,
  ClassifyOutput,
} from '../types.js';
import { FLAT_FALLBACK, V4_CONFIG } from '../types.js';

// ─── Debate Config ─────────────────────────────────────────────

const DEBATE_CONFIG = {
  MAX_ROUNDS: 2,              // TradingAgents default: 1, we do 2 for depth
  MAX_RISK_ROUNDS: 1,         // Risk team discussion rounds
  ENABLE_ADVERSARIAL: true,   // Bull vs Bear debate
  ENABLE_RISK_TRIBUNAL: true, // 3-perspective risk discussion
  CONFIDENCE_FLIP_THRESHOLD: 0.15, // Min confidence gap to flip consensus
} as const;

// ─── Debate transcript types ───────────────────────────────────

interface DebateRound {
  round: number;
  bullArgument: string;
  bearArgument: string;
  bullAction: BattleAction;
  bearAction: BattleAction;
  bullConfidence: number;
  bearConfidence: number;
}

interface RiskAssessment {
  perspective: 'aggressive' | 'neutral' | 'conservative';
  recommendation: BattleAction;
  reasoning: string;
  riskScore: number; // 0=safe, 1=dangerous
}

interface DebateResult {
  traces: Record<string, AgentDecisionTrace>;
  debateTranscript: DebateRound[];
  riskAssessments: RiskAssessment[];
  judgeVerdict: string;
  vetoDecision: VetoDecision;
  consensus: SquadConsensus;
  events: BattleEvent[];
}

// ─── Main entry (now async for LLM judge calls) ───────────────

export async function debate(state: BattleTickState): Promise<BattleTickState> {
  const { squad, rawTraces, stage, market, signal } = state;

  if (!rawTraces || !market || !signal) {
    return {
      ...state,
      state: 'DECIDE',
      traces: {},
      vetoDecision: { veto: false },
      consensus: { finalAction: 'FLAT', finalConfidence: 0.5, vetoApplied: false, agentAgreement: 0 },
    };
  }

  // 1. Parse all raw traces
  const traces: Record<string, AgentDecisionTrace> = {};
  for (const agent of squad) {
    traces[agent.id] = parseAndValidate(rawTraces[agent.id] ?? '');
  }

  // 2. Classify agents into Bull/Bear camps
  const { bullTeam, bearTeam, flatTeam } = classifyTeams(traces, squad);

  // 3. Run adversarial debate (Bull vs Bear)
  const debateTranscript = runAdversarialDebate(
    traces, squad, bullTeam, bearTeam, signal, market,
  );

  // 4. Run risk tribunal (Aggressive/Neutral/Conservative)
  const riskAssessments = runRiskTribunal(traces, squad, stage, market, signal);

  // 5. Judge verdict (Research Manager pattern)
  const judgeVerdict = produceJudgeVerdict(
    debateTranscript, riskAssessments, traces, squad, signal, market,
  );

  // 6. RISK agent veto check (hard rules)
  const riskAgent = squad.find(a => a.squadRole === 'RISK');
  const vetoDecision = checkRiskVeto(traces, riskAgent, stage, market, judgeVerdict);

  // 7. Build final consensus from all inputs
  let consensus = buildEnhancedConsensus(
    traces, squad, debateTranscript, riskAssessments, judgeVerdict, vetoDecision,
  );

  // 7.5 ABSTAIN GATE — force NO_TRADE when conditions are met (Phase 2)
  const abstainResult = checkAbstainGate(consensus, state.classify, riskAssessments, signal);
  if (abstainResult.abstain) {
    consensus = {
      finalAction: 'NO_TRADE',
      finalConfidence: consensus.finalConfidence,
      vetoApplied: consensus.vetoApplied,
      vetoReason: consensus.vetoReason,
      agentAgreement: consensus.agentAgreement,
    };
  }

  // 8. Collect events
  const events: BattleEvent[] = [...state.events];
  if (abstainResult.abstain) {
    events.push({
      type: 'VETO_FIRED',
      detail: `ABSTAIN_GATE: ${abstainResult.reason}`,
      tick: state.tick,
    });
  }
  if (vetoDecision.veto) {
    events.push({ type: 'VETO_FIRED', agentId: riskAgent?.id, detail: vetoDecision.reason, tick: state.tick });
  }
  if (debateTranscript.length > 0) {
    const flipHappened = debateTranscript.some((r, i) =>
      i > 0 && debateTranscript[i - 1].bullAction !== r.bullAction
    );
    if (flipHappened) {
      events.push({ type: 'ZONE_CAPTURED', detail: 'DEBATE_FLIP: Agent changed position during debate', tick: state.tick });
    }
  }

  return {
    ...state,
    state: 'DECIDE',
    traces,
    vetoDecision,
    consensus,
    events,
  };
}

// ─── Team classification ───────────────────────────────────────

function classifyTeams(
  traces: Record<string, AgentDecisionTrace>,
  squad: OwnedAgent[],
): { bullTeam: string[]; bearTeam: string[]; flatTeam: string[] } {
  const bullTeam: string[] = [];
  const bearTeam: string[] = [];
  const flatTeam: string[] = [];

  for (const agent of squad) {
    const trace = traces[agent.id];
    if (!trace) continue;
    if (trace.action === 'LONG') bullTeam.push(agent.id);
    else if (trace.action === 'SHORT') bearTeam.push(agent.id);
    else flatTeam.push(agent.id); // FLAT and NO_TRADE both go to flat team
  }

  return { bullTeam, bearTeam, flatTeam };
}

// ─── Adversarial Debate (TradingAgents pattern) ────────────────
// Bull researcher vs Bear researcher argue for MAX_ROUNDS
// Each round: Bull makes case → Bear counters → positions may shift

function runAdversarialDebate(
  traces: Record<string, AgentDecisionTrace>,
  squad: OwnedAgent[],
  bullTeam: string[],
  bearTeam: string[],
  signal: SignalSnapshot,
  market: MarketFrame,
): DebateRound[] {
  if (!DEBATE_CONFIG.ENABLE_ADVERSARIAL) return [];
  if (bullTeam.length === 0 || bearTeam.length === 0) return [];

  const rounds: DebateRound[] = [];

  // Get lead debaters
  const bullLeadId = bullTeam[0];
  const bearLeadId = bearTeam[0];
  const bullTrace = traces[bullLeadId];
  const bearTrace = traces[bearLeadId];

  let currentBullConf = bullTrace.confidence;
  let currentBearConf = bearTrace.confidence;
  let currentBullAction = bullTrace.action;
  let currentBearAction = bearTrace.action;

  for (let round = 0; round < DEBATE_CONFIG.MAX_ROUNDS; round++) {
    // Bull argues: why LONG is correct
    const bullArg = buildBullArgument(bullTrace, bearTrace, signal, market, round);

    // Bear counters: why SHORT is correct
    const bearArg = buildBearArgument(bearTrace, bullTrace, signal, market, round);

    // Evidence-based confidence adjustment
    const { bullAdj, bearAdj } = evaluateArguments(
      bullArg, bearArg, signal, market,
    );

    currentBullConf = Math.max(0, Math.min(1, currentBullConf + bullAdj));
    currentBearConf = Math.max(0, Math.min(1, currentBearConf + bearAdj));

    // Check for position flip (if one side loses enough confidence)
    if (currentBullConf < 0.3 && currentBearConf > 0.6) {
      currentBullAction = 'FLAT'; // Bull concedes
    }
    if (currentBearConf < 0.3 && currentBullConf > 0.6) {
      currentBearAction = 'FLAT'; // Bear concedes
    }

    rounds.push({
      round: round + 1,
      bullArgument: bullArg,
      bearArgument: bearArg,
      bullAction: currentBullAction,
      bearAction: currentBearAction,
      bullConfidence: currentBullConf,
      bearConfidence: currentBearConf,
    });

    // Update traces with debated values
    traces[bullLeadId] = { ...traces[bullLeadId], confidence: currentBullConf, action: currentBullAction };
    traces[bearLeadId] = { ...traces[bearLeadId], confidence: currentBearConf, action: currentBearAction };
  }

  return rounds;
}

// ─── Risk Tribunal (3 perspectives) ────────────────────────────
// TradingAgents: aggressive_debator + neutral_debator + conservative_debator

function runRiskTribunal(
  traces: Record<string, AgentDecisionTrace>,
  squad: OwnedAgent[],
  stage: StageFrame,
  market: MarketFrame,
  signal: SignalSnapshot,
): RiskAssessment[] {
  if (!DEBATE_CONFIG.ENABLE_RISK_TRIBUNAL) return [];

  const allActions = Object.values(traces);
  const dominantAction = getMajorityAction(allActions);
  const avgConfidence = allActions.reduce((s, t) => s + t.confidence, 0) / allActions.length;

  // Aggressive perspective: focus on upside potential
  const aggressive = assessRisk('aggressive', dominantAction, avgConfidence, stage, market, signal);

  // Neutral perspective: balanced risk/reward
  const neutral = assessRisk('neutral', dominantAction, avgConfidence, stage, market, signal);

  // Conservative perspective: focus on downside protection
  const conservative = assessRisk('conservative', dominantAction, avgConfidence, stage, market, signal);

  return [aggressive, neutral, conservative];
}

function assessRisk(
  perspective: 'aggressive' | 'neutral' | 'conservative',
  dominantAction: BattleAction,
  avgConfidence: number,
  stage: StageFrame,
  market: MarketFrame,
  signal: SignalSnapshot,
): RiskAssessment {
  let riskScore = 0;
  let recommendation = dominantAction;
  const reasons: string[] = [];

  // Common risk factors
  if (stage.predatorZones.length > 0) {
    riskScore += 0.3;
    reasons.push('Predator zones active');
  }
  if (Math.abs(market.fundingBias) > 0.08) {
    riskScore += 0.2;
    reasons.push(`Extreme funding: ${market.fundingBias.toFixed(4)}`);
  }
  if (market.volatility > 0.02) {
    riskScore += 0.15;
    reasons.push('High volatility');
  }
  if (stage.capturedZones.length === 0 && dominantAction !== 'FLAT') {
    riskScore += 0.1;
    reasons.push('No zone control');
  }

  // Perspective-specific adjustments
  if (perspective === 'aggressive') {
    riskScore *= 0.5; // Halve risk score — aggressive tolerates more
    if (market.volumeImpulse > 0.5) {
      reasons.push('OPPORTUNITY: Volume impulse supports entry');
      riskScore -= 0.1;
    }
    if (signal.cvdDivergence) {
      reasons.push('OPPORTUNITY: CVD divergence = high conviction signal');
      riskScore -= 0.15;
    }
  } else if (perspective === 'conservative') {
    riskScore *= 1.5; // 1.5x risk score — conservative is cautious
    if (avgConfidence < 0.6) {
      recommendation = 'FLAT';
      reasons.push('Low confidence → FLAT recommended');
    }
    if (stage.supportIntegrity < 0.5) {
      reasons.push('WARNING: Support degraded');
      riskScore += 0.2;
    }
  } else {
    // Neutral: balanced
    if (riskScore > 0.6) {
      recommendation = 'FLAT';
      reasons.push('Risk too high for neutral stance');
    }
  }

  return {
    perspective,
    recommendation,
    reasoning: reasons.join('; ') || 'No significant risk factors',
    riskScore: Math.max(0, Math.min(1, riskScore)),
  };
}

// ─── Judge Verdict (Research Manager pattern) ──────────────────
// TradingAgents: Portfolio Manager evaluates debate + makes decisive call

function produceJudgeVerdict(
  debateRounds: DebateRound[],
  riskAssessments: RiskAssessment[],
  traces: Record<string, AgentDecisionTrace>,
  squad: OwnedAgent[],
  signal: SignalSnapshot,
  market: MarketFrame,
): string {
  const allActions = Object.values(traces);
  const lastRound = debateRounds[debateRounds.length - 1];

  // Weighted scoring
  let longScore = 0;
  let shortScore = 0;
  let flatScore = 0;

  // 1. Agent votes (weight: 0.3)
  for (const trace of allActions) {
    const weight = 0.3 * trace.confidence;
    if (trace.action === 'LONG') longScore += weight;
    else if (trace.action === 'SHORT') shortScore += weight;
    else flatScore += weight;
  }

  // 2. Debate outcome (weight: 0.3)
  if (lastRound) {
    if (lastRound.bullConfidence > lastRound.bearConfidence + DEBATE_CONFIG.CONFIDENCE_FLIP_THRESHOLD) {
      longScore += 0.3 * lastRound.bullConfidence;
    } else if (lastRound.bearConfidence > lastRound.bullConfidence + DEBATE_CONFIG.CONFIDENCE_FLIP_THRESHOLD) {
      shortScore += 0.3 * lastRound.bearConfidence;
    } else {
      flatScore += 0.15; // Inconclusive debate → slight FLAT bias
    }
  }

  // 3. Risk tribunal (weight: 0.2)
  for (const assessment of riskAssessments) {
    const w = 0.2 / riskAssessments.length;
    if (assessment.recommendation === 'LONG') longScore += w * (1 - assessment.riskScore);
    else if (assessment.recommendation === 'SHORT') shortScore += w * (1 - assessment.riskScore);
    else flatScore += w;
  }

  // 4. Signal alignment (weight: 0.2) — Paper 2602.00196 ensemble
  const signalBias = computeSignalBias(signal, market);
  if (signalBias > 0.2) longScore += 0.2;
  else if (signalBias < -0.2) shortScore += 0.2;
  else flatScore += 0.1;

  // Determine winner
  const maxScore = Math.max(longScore, shortScore, flatScore);
  let verdict: string;
  if (maxScore === longScore && longScore > shortScore + 0.05) {
    verdict = `LONG (score: ${longScore.toFixed(2)} vs SHORT: ${shortScore.toFixed(2)})`;
  } else if (maxScore === shortScore && shortScore > longScore + 0.05) {
    verdict = `SHORT (score: ${shortScore.toFixed(2)} vs LONG: ${longScore.toFixed(2)})`;
  } else {
    verdict = `FLAT (inconclusive: L=${longScore.toFixed(2)} S=${shortScore.toFixed(2)} F=${flatScore.toFixed(2)})`;
  }

  return verdict;
}

// ─── Enhanced Consensus Builder ────────────────────────────────

function buildEnhancedConsensus(
  traces: Record<string, AgentDecisionTrace>,
  squad: OwnedAgent[],
  debateRounds: DebateRound[],
  riskAssessments: RiskAssessment[],
  judgeVerdict: string,
  vetoDecision: VetoDecision,
): SquadConsensus {
  // Veto overrides everything
  if (vetoDecision.veto) {
    return {
      finalAction: 'FLAT',
      finalConfidence: 0.3,
      vetoApplied: true,
      vetoReason: vetoDecision.reason,
      agentAgreement: 0,
    };
  }

  // Extract action from judge verdict
  let finalAction: BattleAction = 'FLAT';
  if (judgeVerdict.startsWith('LONG')) finalAction = 'LONG';
  else if (judgeVerdict.startsWith('SHORT')) finalAction = 'SHORT';

  // Confidence from multiple signals
  const allActions = Object.values(traces);
  const agreeCount = allActions.filter(t => t.action === finalAction).length;
  const agentAgreement = agreeCount / allActions.length;

  // Base confidence from agent average
  const agreeingTraces = allActions.filter(t => t.action === finalAction);
  const avgConf = agreeingTraces.length > 0
    ? agreeingTraces.reduce((s, t) => s + t.confidence, 0) / agreeingTraces.length
    : 0.5;

  // Boost/penalize based on debate outcome
  let confidenceAdj = 0;
  const lastRound = debateRounds[debateRounds.length - 1];
  if (lastRound) {
    if (finalAction === 'LONG' && lastRound.bullConfidence > lastRound.bearConfidence) {
      confidenceAdj += 0.05; // Debate supports direction
    } else if (finalAction === 'SHORT' && lastRound.bearConfidence > lastRound.bullConfidence) {
      confidenceAdj += 0.05;
    } else if (finalAction !== 'FLAT') {
      confidenceAdj -= 0.1; // Debate contradicts direction
    }
  }

  // Risk tribunal adjustment
  const avgRisk = riskAssessments.length > 0
    ? riskAssessments.reduce((s, r) => s + r.riskScore, 0) / riskAssessments.length
    : 0;
  confidenceAdj -= avgRisk * 0.15; // Higher risk → lower confidence

  // Agreement boost
  confidenceAdj += (agentAgreement - 0.5) * 0.2; // More agreement → higher confidence

  const finalConfidence = Math.max(0.1, Math.min(0.95,
    avgConf + confidenceAdj
  ));

  return {
    finalAction,
    finalConfidence,
    vetoApplied: false,
    agentAgreement,
  };
}

// ─── Argument builders ─────────────────────────────────────────

function buildBullArgument(
  bullTrace: AgentDecisionTrace,
  bearTrace: AgentDecisionTrace,
  signal: SignalSnapshot,
  market: MarketFrame,
  round: number,
): string {
  const points: string[] = [];

  // Round 0: Present initial case
  if (round === 0) {
    points.push(`BULL CASE: ${bullTrace.thesis}`);
    if (signal.htfStructure === 'UPTREND') points.push('HTF structure supports upside');
    if (signal.cvd1h > 0) points.push('CVD positive — buying pressure');
    if (market.volumeImpulse > 0.5) points.push('Volume impulse confirms momentum');
    if (signal.fundingLabel === 'OVERHEAT_SHORT') points.push('Shorts overleveraged — squeeze potential');
  }

  // Round 1+: Counter bear arguments
  if (round > 0) {
    points.push(`REBUTTAL to Bear: "${bearTrace.thesis}"`);
    if (bearTrace.riskFlags.length > 0) {
      points.push(`Bear risk flags (${bearTrace.riskFlags.join(', ')}) are overstated`);
    }
    if (signal.oiTrend === 'RISING' && market.priceDelta > 0) {
      points.push('New money entering + price up = genuine demand, not trap');
    }
  }

  return points.join('. ');
}

function buildBearArgument(
  bearTrace: AgentDecisionTrace,
  bullTrace: AgentDecisionTrace,
  signal: SignalSnapshot,
  market: MarketFrame,
  round: number,
): string {
  const points: string[] = [];

  if (round === 0) {
    points.push(`BEAR CASE: ${bearTrace.thesis}`);
    if (signal.htfStructure === 'DOWNTREND') points.push('HTF structure confirms downside');
    if (signal.cvdDivergence) points.push('CVD divergence — hidden selling');
    if (signal.fundingLabel === 'OVERHEAT_LONG') points.push('Longs overleveraged — liquidation cascade risk');
    if (signal.primaryZone === 'DISTRIBUTION') points.push('Distribution zone — smart money exiting');
  }

  if (round > 0) {
    points.push(`REBUTTAL to Bull: "${bullTrace.thesis}"`);
    if (bullTrace.confidence > 0.7) {
      points.push('Overconfidence is itself a risk signal');
    }
    if (market.volatility > 0.02) {
      points.push('High volatility makes any directional bet dangerous');
    }
  }

  return points.join('. ');
}

// ─── Argument evaluation ───────────────────────────────────────
// Evidence-based: check which arguments align with actual signal data

function evaluateArguments(
  bullArg: string,
  bearArg: string,
  signal: SignalSnapshot,
  market: MarketFrame,
): { bullAdj: number; bearAdj: number } {
  let bullAdj = 0;
  let bearAdj = 0;

  // CVD supports which side?
  if (signal.cvd1h > 0 && !signal.cvdDivergence) {
    bullAdj += 0.05;
    bearAdj -= 0.03;
  } else if (signal.cvd1h < 0 || signal.cvdDivergence) {
    bearAdj += 0.05;
    bullAdj -= 0.03;
  }

  // Funding supports which side?
  if (signal.fundingLabel === 'OVERHEAT_LONG') {
    bearAdj += 0.05; // Longs overleveraged → bear advantage
    bullAdj -= 0.05;
  } else if (signal.fundingLabel === 'OVERHEAT_SHORT') {
    bullAdj += 0.05; // Shorts overleveraged → bull advantage
    bearAdj -= 0.05;
  }

  // HTF structure
  if (signal.htfStructure === 'UPTREND') {
    bullAdj += 0.03;
  } else if (signal.htfStructure === 'DOWNTREND') {
    bearAdj += 0.03;
  }

  // Volume impulse (high = supports momentum direction)
  if (market.volumeImpulse > 0.6) {
    if (market.priceDelta > 0) bullAdj += 0.03;
    else bearAdj += 0.03;
  }

  return { bullAdj, bearAdj };
}

// ─── Signal bias (Paper 2602.00196 ensemble) ───────────────────

function computeSignalBias(signal: SignalSnapshot, market: MarketFrame): number {
  let bias = 0;

  // Traditional indicators
  if (signal.cvd1h > 0) bias += 0.15;
  else bias -= 0.15;

  if (signal.fundingLabel === 'OVERHEAT_LONG') bias -= 0.2;
  if (signal.fundingLabel === 'OVERHEAT_SHORT') bias += 0.2;

  if (signal.oiTrend === 'RISING' && market.priceDelta > 0) bias += 0.1;
  if (signal.oiTrend === 'FALLING' && market.priceDelta < 0) bias -= 0.1;

  // AI-discovered pattern (zone classification)
  if (signal.primaryZone === 'ACCUMULATION') bias += 0.15;
  if (signal.primaryZone === 'DISTRIBUTION') bias -= 0.15;
  if (signal.primaryZone === 'CAPITULATION') bias -= 0.2;
  if (signal.primaryZone === 'EUPHORIA') bias += 0.1; // Often reversal zone

  return Math.max(-1, Math.min(1, bias));
}

// ─── RISK Veto (hard rules — enhanced) ─────────────────────────

function checkRiskVeto(
  traces: Record<string, AgentDecisionTrace>,
  riskAgent: OwnedAgent | undefined,
  stage: StageFrame,
  market: MarketFrame,
  judgeVerdict: string,
): VetoDecision {
  if (!riskAgent) return { veto: false };

  const executorTrace = Object.values(traces).find(t => t.action !== 'FLAT');
  if (!executorTrace) return { veto: false };

  const reasons: string[] = [];

  // P0: Predator proximity
  const nearPredator = stage.predatorZones.some(z =>
    z.active && Math.abs(z.priceLevel - market.price) / market.price < 0.05
  );
  if (nearPredator) reasons.push('PREDATOR_PROXIMITY');

  // P0: Critical health
  if (riskAgent.record.currentHealth < 0.20) reasons.push('CRITICAL_HEALTH');

  // P1: Contra-funding
  const dirSign = executorTrace.action === 'LONG' ? 1 : -1;
  if (Math.sign(market.fundingBias) === dirSign && Math.abs(market.fundingBias) > 0.10) {
    reasons.push('CONTRA_FUNDING');
  }

  // P1: No zone control + high confidence (overconfident)
  if (stage.capturedZones.length === 0 && executorTrace.confidence > 0.80) {
    reasons.push('OVERCONFIDENT_NO_CONTROL');
  }

  // P2: Debate inconclusive but action is aggressive
  if (judgeVerdict.startsWith('FLAT') && executorTrace.action !== 'FLAT') {
    reasons.push('DEBATE_INCONCLUSIVE');
  }

  // Only veto on P0 reasons (critical), P1/P2 reduce confidence only
  const p0Reasons = reasons.filter(r => ['PREDATOR_PROXIMITY', 'CRITICAL_HEALTH'].includes(r));
  if (p0Reasons.length > 0) {
    return { veto: true, reason: reasons.join('|') };
  }

  return { veto: false, reason: reasons.length > 0 ? reasons.join('|') : undefined };
}

// ─── Parse + validate raw LLM response ─────────────────────────

function parseAndValidate(raw: string): AgentDecisionTrace {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return { ...FLAT_FALLBACK, fallbackReason: 'no_json_block' };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { ...FLAT_FALLBACK, fallbackReason: 'not_object' };
    }

    const p = parsed as Record<string, unknown>;

    if (!['LONG', 'SHORT', 'FLAT', 'NO_TRADE'].includes(p.action as string)) {
      return { ...FLAT_FALLBACK, fallbackReason: 'invalid_action' };
    }

    const conf = Number(p.confidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return { ...FLAT_FALLBACK, action: p.action as BattleAction, fallbackReason: 'invalid_confidence' };
    }

    const thesis = typeof p.thesis === 'string' ? p.thesis.slice(0, 100) : 'No thesis';

    return {
      action: p.action as BattleAction,
      confidence: conf,
      thesis,
      invalidation: typeof p.invalidation === 'string' ? p.invalidation : '',
      evidenceTitles: Array.isArray(p.evidenceTitles) ? (p.evidenceTitles as string[]) : [],
      riskFlags: Array.isArray(p.riskFlags) ? (p.riskFlags as string[]).slice(0, 2) : [],
      memoryIdsUsed: Array.isArray(p.memoryIdsUsed) ? (p.memoryIdsUsed as string[]) : [],
      fallbackUsed: false,
      providerLabel: (p as any).providerLabel ?? 'unknown',
    };
  } catch {
    return { ...FLAT_FALLBACK, fallbackReason: 'parse_exception' };
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function getMajorityAction(traces: AgentDecisionTrace[]): BattleAction {
  const counts: Record<string, number> = { LONG: 0, SHORT: 0, FLAT: 0, NO_TRADE: 0 };
  for (const t of traces) counts[t.action] = (counts[t.action] ?? 0) + 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'FLAT') as BattleAction;
}

// ─── Abstain Gate (Phase 2) ───────────────────────────────────
// Forces NO_TRADE when classify/risk conditions indicate no valid setup
// Ref: TradingAgents risk veto + Agent Forge architecture §2

function checkAbstainGate(
  consensus: SquadConsensus,
  classify: ClassifyOutput | undefined,
  riskAssessments: RiskAssessment[],
  signal: SignalSnapshot,
): { abstain: boolean; reason: string } {
  // Already NO_TRADE or FLAT → no need to gate
  if (consensus.finalAction === 'NO_TRADE' || consensus.finalAction === 'FLAT') {
    return { abstain: false, reason: '' };
  }

  // Rule 1: No setup detected → NO_TRADE
  if (classify?.setupType === 'no_setup') {
    return { abstain: true, reason: 'no_setup detected' };
  }

  // Rule 2: Compressed market with no divergence → NO_TRADE
  if (classify?.marketState === 'compressed' && !signal.cvdDivergence) {
    return { abstain: true, reason: 'compressed market, no divergence' };
  }

  // Rule 3: Consensus confidence too low → NO_TRADE
  if (consensus.finalConfidence < V4_CONFIG.ABSTAIN_CONFIDENCE_THRESHOLD) {
    return { abstain: true, reason: `low confidence: ${consensus.finalConfidence.toFixed(2)}` };
  }

  // Rule 4: Average risk score too high → NO_TRADE
  if (riskAssessments.length > 0) {
    const avgRisk = riskAssessments.reduce((s, r) => s + r.riskScore, 0) / riskAssessments.length;
    if (avgRisk > V4_CONFIG.ABSTAIN_RISK_THRESHOLD) {
      return { abstain: true, reason: `high risk: ${avgRisk.toFixed(2)}` };
    }
  }

  return { abstain: false, reason: '' };
}
