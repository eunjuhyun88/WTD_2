// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Arena State Logic
//  Pure business logic extracted from arena/+page.svelte
// ═══════════════════════════════════════════════════════════════

import type { Direction } from '$lib/stores/gameState';
import type { AnalyzeResponse } from '$lib/api/arenaApi';
import type {
  OrpoOutput,
  CtxBelief,
  CtxAgentId,
  CtxFlag,
  GuardianCheck,
  CommanderVerdict,
} from '$lib/engine/types';

// ─── C02 Mapping Types ───────────────────────────────────────

export interface C02MappingResult {
  orpo: OrpoOutput;
  ctx: CtxBelief[];
  guardian: GuardianCheck;
  commander: CommanderVerdict | null;
}

// ─── C02 Constants ────────────────────────────────────────────

const OFFENSE_IDS = ['STRUCTURE', 'VPA', 'ICT'];
const CTX_MAP: Record<string, CtxAgentId> = {
  DERIV: 'DERIV',
  FLOW: 'FLOW',
  SENTI: 'SENTI',
  MACRO: 'MACRO',
};
const OFFENSE_WEIGHTS: Record<string, number> = {
  STRUCTURE: 0.40,
  VPA: 0.35,
  ICT: 0.25,
};

// ─── C02 Mapping ──────────────────────────────────────────────

/**
 * Maps AnalyzeResponse to C02 architecture fields:
 * ORPO (offense aggregation), CTX beliefs, Guardian check, Commander verdict.
 */
export function mapAnalysisToC02(res: AnalyzeResponse): C02MappingResult {
  const offenseAgents = res.agentOutputs.filter(a => OFFENSE_IDS.includes(a.agentId));
  const ctxAgents = res.agentOutputs.filter(a => a.agentId in CTX_MAP);

  // ORPO: combine offense agents
  let longScore = 0, shortScore = 0, totalConf = 0, totalW = 0;
  for (const a of offenseAgents) {
    const w = OFFENSE_WEIGHTS[a.agentId] ?? 0.33;
    totalW += w;
    totalConf += a.confidence * w;
    if (a.direction === 'LONG') longScore += w * a.confidence;
    else if (a.direction === 'SHORT') shortScore += w * a.confidence;
  }
  const spread = Math.abs(longScore - shortScore);
  const orpoDir: Direction = spread < 5 ? 'NEUTRAL' : longScore > shortScore ? 'LONG' : 'SHORT';

  const orpo: OrpoOutput = {
    direction: orpoDir,
    confidence: totalW > 0 ? Math.round(totalConf / totalW) : 50,
    pattern: res.prediction.reasonTags?.[0] ?? 'NO_DOMINANT',
    keyLevels: { support: res.entryPrice * 0.985, resistance: res.entryPrice * 1.015 },
    factors: [],
    thesis: `ORPO: ${orpoDir} ${totalW > 0 ? Math.round(totalConf / totalW) : 50}% [${offenseAgents.map(a => `${a.agentId}:${a.direction}`).join('|')}]`,
  };

  // CTX: map each defense/context agent
  const ctx: CtxBelief[] = ctxAgents.map(a => {
    const ctxId = CTX_MAP[a.agentId];
    let flag: CtxFlag;
    if (a.confidence < 55 || a.direction === 'NEUTRAL') flag = 'NEUTRAL';
    else if (a.direction === 'LONG') flag = 'GREEN';
    else flag = 'RED';
    return { agentId: ctxId, flag, confidence: a.confidence, headline: a.thesis, factors: [] };
  });

  // Guardian: simplified (no raw factors from API)
  const guardian: GuardianCheck = {
    passed: res.meta.dataCompleteness >= 0.3,
    violations: res.meta.dataCompleteness < 0.3
      ? [{ rule: 'DATA_DOWN', detail: `Data completeness ${(res.meta.dataCompleteness * 100).toFixed(0)}%`, severity: 'BLOCK' as const }]
      : [],
    halt: res.meta.dataCompleteness < 0.3,
  };

  // Commander: check for ORPO vs CTX conflict
  const greenCount = ctx.filter(c => c.flag === 'GREEN').length;
  const redCount = ctx.filter(c => c.flag === 'RED').length;
  const ctxConsensus: Direction = greenCount > redCount ? 'LONG' : redCount > greenCount ? 'SHORT' : 'NEUTRAL';
  const hasConflict = orpoDir !== 'NEUTRAL' && ctxConsensus !== 'NEUTRAL' && orpoDir !== ctxConsensus;

  let commander: CommanderVerdict | null = null;
  if (guardian.halt) {
    commander = { finalDirection: 'NEUTRAL', entryScore: 0, reasoning: 'Guardian HALT — blocking entry.', conflictResolved: false, cost: 0 };
  } else if (hasConflict) {
    const strongDissenters = ctx.filter(c => c.confidence >= 70 && ((c.flag === 'RED' && orpoDir === 'LONG') || (c.flag === 'GREEN' && orpoDir === 'SHORT')));
    if (strongDissenters.length >= 3) {
      commander = { finalDirection: ctxConsensus, entryScore: Math.max(0, orpo.confidence - strongDissenters.length * 10), reasoning: `CTX override: ${strongDissenters.length}/4 disagree.`, conflictResolved: true, cost: 0 };
    } else {
      commander = { finalDirection: orpoDir, entryScore: Math.max(0, orpo.confidence - strongDissenters.length * 10), reasoning: `ORPO maintained with conflict penalty.`, conflictResolved: true, cost: 0 };
    }
  }

  return { orpo, ctx, guardian, commander };
}

// ─── Chart Annotation Types ───────────────────────────────────

export interface ChartAnnotation {
  id: string;
  icon: string;
  name: string;
  color: string;
  label: string;
  detail: string;
  yPercent: number;
  xPercent: number;
  type: 'ob' | 'funding' | 'whale' | 'signal';
}

export interface ChartAgentMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
}

interface AgentLike {
  id: string;
  icon: string;
  name: string;
  color: string;
  dir: string;
  finding: { title: string; detail: string };
}

// ─── Chart Annotation Generators ──────────────────────────────

const ANNOTATION_CONFIG: Array<{
  agentId: string;
  annId: string;
  icon: string;
  name: string;
  type: ChartAnnotation['type'];
  yRange: [number, number];
  xRange: [number, number];
}> = [
  { agentId: 'structure', annId: 'ob-zone',      icon: '⚡', name: 'STRUCTURE', type: 'ob',      yRange: [25, 40], xRange: [60, 80] },
  { agentId: 'deriv',     annId: 'funding-zone',  icon: '📊', name: 'DERIV',     type: 'funding', yRange: [15, 25], xRange: [75, 90] },
  { agentId: 'flow',      annId: 'whale-zone',    icon: '💰', name: 'FLOW',      type: 'whale',   yRange: [40, 55], xRange: [45, 65] },
  { agentId: 'senti',     annId: 'senti-zone',    icon: '💜', name: 'SENTI',     type: 'signal',  yRange: [55, 70], xRange: [55, 80] },
  { agentId: 'macro',     annId: 'macro-zone',    icon: '🌍', name: 'MACRO',     type: 'signal',  yRange: [70, 80], xRange: [30, 45] },
];

/**
 * Generate chart annotations from active agents.
 * Pure function — takes agents array, returns annotations.
 */
export function buildChartAnnotations(agents: AgentLike[]): ChartAnnotation[] {
  return ANNOTATION_CONFIG.flatMap(cfg => {
    const ag = agents.find(a => a.id === cfg.agentId);
    if (!ag) return [];
    return [{
      id: cfg.annId,
      icon: cfg.icon,
      name: cfg.name,
      color: ag.color,
      label: ag.finding.title,
      detail: ag.finding.detail,
      yPercent: cfg.yRange[0] + Math.random() * (cfg.yRange[1] - cfg.yRange[0]),
      xPercent: cfg.xRange[0] + Math.random() * (cfg.xRange[1] - cfg.xRange[0]),
      type: cfg.type,
    }];
  });
}

/**
 * Generate LWC markers from active agents' signals.
 * Pure function — takes agents array, returns sorted markers.
 */
export function buildAgentMarkers(agents: AgentLike[]): ChartAgentMarker[] {
  const now = Math.floor(Date.now() / 1000);
  return agents
    .map((ag, i) => {
      const isLong = ag.dir === 'LONG';
      return {
        time: now - (agents.length - i) * 3600,
        position: (isLong ? 'belowBar' : 'aboveBar') as ChartAgentMarker['position'],
        color: ag.color,
        shape: (isLong ? 'arrowUp' : 'arrowDown') as ChartAgentMarker['shape'],
        text: `${ag.icon} ${ag.name}`,
      };
    })
    .sort((a, b) => a.time - b.time);
}
