/**
 * scanCardMapper.ts
 *
 * Maps current 8-agent scan signals to C02 architecture card structure.
 * When ORPO real-time integration is complete, ONLY this file needs to change.
 *
 * C02 Architecture (Agent Architecture C02 v1.0):
 *   Layer 0 — ORPO Model: sole analysis engine (direction, confidence, pattern, levels)
 *   Layer 1 — 4 CTX Agents: DERIV, FLOW, MACRO, SENTI
 *   COMMANDER: conflict synthesis (LLM call only when ORPO vs CTX disagree)
 *
 * Current Mapping:
 *   ORPO Card    ← OFFENSE agents avg (STRUCTURE + VPA + ICT)
 *   DERIV Card   ← DERIV agent signal
 *   FLOW Card    ← FLOW + VALUATION agents merged
 *   MACRO Card   ← MACRO agent signal
 *   SENTI Card   ← SENTI agent signal
 *   COMMANDER    ← Full 8-agent consensus + avg confidence
 */

import type { AgentSignal } from '$lib/data/warroom';

// ── C02 Card Types ──

export type CtxFlag = 'RED' | 'GREEN' | 'NEUTRAL';

export type OrpoCardData = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  patternName: string;
  keyLevels: { entry: number; tp: number; sl: number } | null;
  sourceAgents: string[];
};

export type CtxCardData = {
  agentId: string;
  label: string;
  flag: CtxFlag;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  keyEvidence: string;
  metrics: Record<string, string | number | null>;
};

export type CommanderScoreData = {
  entryScore: number;
  finalDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  riskAssessment: string;
  conflictType: string | null;
  agentCount: number;
};

export type DerivativesData = {
  oi: number | null;
  funding: number | null;
  predFunding: number | null;
  lsRatio: number | null;
  liqLong: number;
  liqShort: number;
};

export type C02Cards = {
  orpo: OrpoCardData;
  deriv: CtxCardData;
  flow: CtxCardData;
  macro: CtxCardData;
  senti: CtxCardData;
  commander: CommanderScoreData;
};

// ── Constants ──

const OFFENSE_AGENTS = ['STRUCTURE', 'VPA', 'ICT'];
const DIRECTION_MAP: Record<string, 'LONG' | 'SHORT' | 'NEUTRAL'> = {
  long: 'LONG',
  short: 'SHORT',
  neutral: 'NEUTRAL',
};

// ── Helpers ──

function voteToDirection(vote: string): 'LONG' | 'SHORT' | 'NEUTRAL' {
  return DIRECTION_MAP[vote.toLowerCase()] ?? 'NEUTRAL';
}

function voteToFlag(vote: string): CtxFlag {
  const v = vote.toLowerCase();
  if (v === 'long') return 'GREEN';
  if (v === 'short') return 'RED';
  return 'NEUTRAL';
}

function avgConfidence(signals: AgentSignal[]): number {
  if (signals.length === 0) return 0;
  return Math.round(signals.reduce((sum, s) => sum + s.conf, 0) / signals.length);
}

function majorityVote(signals: AgentSignal[]): 'LONG' | 'SHORT' | 'NEUTRAL' {
  let long = 0;
  let short = 0;
  for (const s of signals) {
    if (s.vote === 'long') long++;
    else if (s.vote === 'short') short++;
  }
  if (long > short) return 'LONG';
  if (short > long) return 'SHORT';
  return 'NEUTRAL';
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

function findSignal(signals: AgentSignal[], agentId: string): AgentSignal | undefined {
  return signals.find((s) => s.agentId === agentId || s.name === agentId);
}

// ── Main Mapper ──

export function mapSignalsToC02Cards(
  signals: AgentSignal[],
  derivatives: DerivativesData | null,
  consensus: 'long' | 'short' | 'neutral',
  avgConf: number,
): C02Cards {
  // 1. ORPO Card ← OFFENSE agents (STRUCTURE + VPA + ICT)
  const offenseSignals = signals.filter(
    (s) => OFFENSE_AGENTS.includes(s.agentId) || OFFENSE_AGENTS.includes(s.name),
  );
  const bestOffense = offenseSignals.reduce<AgentSignal | null>(
    (best, s) => (!best || s.conf > best.conf ? s : best),
    null,
  );

  const orpo: OrpoCardData = {
    direction: offenseSignals.length > 0 ? majorityVote(offenseSignals) : 'NEUTRAL',
    confidence: avgConfidence(offenseSignals),
    patternName: bestOffense?.text ? extractPattern(bestOffense.text) : 'No Pattern',
    keyLevels:
      bestOffense && bestOffense.entry > 0
        ? { entry: bestOffense.entry, tp: bestOffense.tp, sl: bestOffense.sl }
        : null,
    sourceAgents: offenseSignals.map((s) => s.name || s.agentId),
  };

  // 2. DERIV Card
  const derivSignal = findSignal(signals, 'DERIV');
  const deriv: CtxCardData = {
    agentId: 'DERIV',
    label: 'Derivatives',
    flag: derivSignal ? voteToFlag(derivSignal.vote) : 'NEUTRAL',
    direction: derivSignal ? voteToDirection(derivSignal.vote) : 'NEUTRAL',
    confidence: derivSignal?.conf ?? 0,
    keyEvidence: derivSignal ? truncateText(derivSignal.text, 80) : 'No data',
    metrics: {
      OI: derivatives?.oi != null ? formatCompact(derivatives.oi) : '—',
      Funding: derivatives?.funding != null ? `${(derivatives.funding * 100).toFixed(4)}%` : '—',
      'L/S': derivatives?.lsRatio != null ? derivatives.lsRatio.toFixed(2) : '—',
      'Liq L': derivatives?.liqLong ? formatCompact(derivatives.liqLong) : '—',
      'Liq S': derivatives?.liqShort ? formatCompact(derivatives.liqShort) : '—',
    },
  };

  // 3. FLOW Card ← FLOW + VALUATION merged
  const flowSignal = findSignal(signals, 'FLOW');
  const valSignal = findSignal(signals, 'VALUATION');
  const flowSignals = [flowSignal, valSignal].filter(Boolean) as AgentSignal[];

  const flow: CtxCardData = {
    agentId: 'FLOW',
    label: 'Fund Flow',
    flag: flowSignal ? voteToFlag(flowSignal.vote) : 'NEUTRAL',
    direction: flowSignals.length > 0 ? majorityVote(flowSignals) : 'NEUTRAL',
    confidence: avgConfidence(flowSignals),
    keyEvidence: flowSignal ? truncateText(flowSignal.text, 80) : 'No data',
    metrics: {
      Flow: flowSignal ? truncateText(flowSignal.text, 30) : '—',
      Valuation: valSignal ? truncateText(valSignal.text, 30) : '—',
    },
  };

  // 4. MACRO Card
  const macroSignal = findSignal(signals, 'MACRO');
  const macro: CtxCardData = {
    agentId: 'MACRO',
    label: 'Macro',
    flag: macroSignal ? voteToFlag(macroSignal.vote) : 'NEUTRAL',
    direction: macroSignal ? voteToDirection(macroSignal.vote) : 'NEUTRAL',
    confidence: macroSignal?.conf ?? 0,
    keyEvidence: macroSignal ? truncateText(macroSignal.text, 80) : 'No data',
    metrics: {},
  };

  // 5. SENTI Card
  const sentiSignal = findSignal(signals, 'SENTI');
  const senti: CtxCardData = {
    agentId: 'SENTI',
    label: 'Sentiment',
    flag: sentiSignal ? voteToFlag(sentiSignal.vote) : 'NEUTRAL',
    direction: sentiSignal ? voteToDirection(sentiSignal.vote) : 'NEUTRAL',
    confidence: sentiSignal?.conf ?? 0,
    keyEvidence: sentiSignal ? truncateText(sentiSignal.text, 80) : 'No data',
    metrics: {},
  };

  // 6. COMMANDER Score ← Full 8-agent consensus
  const orpoDir = orpo.direction;
  const ctxDirs = [deriv, flow, macro, senti].map((c) => c.direction);
  const hasConflict = ctxDirs.some((d) => d !== 'NEUTRAL' && d !== orpoDir && orpoDir !== 'NEUTRAL');
  const conflictAgents = hasConflict
    ? [deriv, flow, macro, senti]
        .filter((c) => c.direction !== 'NEUTRAL' && c.direction !== orpoDir)
        .map((c) => c.agentId)
    : null;

  const commander: CommanderScoreData = {
    entryScore: avgConf,
    finalDirection: voteToDirection(consensus),
    riskAssessment: hasConflict ? 'Conflict detected' : avgConf >= 70 ? 'High confidence' : avgConf >= 50 ? 'Moderate' : 'Low confidence',
    conflictType: conflictAgents ? `ORPO_${orpoDir}_vs_${conflictAgents.join('+')}` : null,
    agentCount: signals.length,
  };

  return { orpo, deriv, flow, macro, senti, commander };
}

// ── Format Helpers ──

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function extractPattern(text: string): string {
  // Try to extract pattern name from agent analysis text
  const patterns = [
    /(?:패턴|pattern)[:\s]*([^\n.;,]+)/i,
    /(?:CHoCH|BOS|FVG|OB|liquidity|wedge|triangle|channel|flag|pennant|head.?shoulder|double.?(?:top|bottom))/i,
    /(?:상승|하락|레인지|bullish|bearish|ranging|consolidation|breakout|breakdown)/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return truncateText(match[0], 30);
  }
  return 'Chart Analysis';
}
