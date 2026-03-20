// =================================================================
// STOCKCLAW Arena v2 — Team Synergy System
// =================================================================
// 5 defined synergies out of 56 possible 3-agent teams.
// Synergies provide concrete battle bonuses when specific
// agent combinations are drafted together.
// =================================================================

import type { AgentId } from './types';
import type { ActionType } from './v2BattleTypes';

// ── Synergy Definition ──────────────────────────────────────────

export interface TeamSynergy {
  id: string;
  name: string;
  nameKR: string;
  description: string;
  descriptionKR: string;

  /** Required agent IDs (all must be present) */
  requiredAgents: AgentId[];

  /** Battle bonuses */
  bonuses: SynergyBonuses;

  /** Visual description for UI */
  visualDesc: string;

  /** Icon/emoji */
  icon: string;
}

export interface SynergyBonuses {
  /** Flat % bonus to all actions */
  allActionBonus: number;

  /** Bonus to specific action types */
  actionBonuses: Partial<Record<ActionType, number>>;

  /** Combo build rate bonus (additive %) */
  comboBuildBonus: number;

  /** Critical hit rate bonus (additive %) */
  critBonus: number;

  /** SL cushion bonus (additive %) */
  slCushionBonus: number;

  /** Shield absorption bonus (additive, e.g. 0.10 = 60% -> 70%) */
  shieldAbsorptionBonus: number;

  /** Energy regen bonus per tick */
  energyRegenBonus: number;

  /** Instinct bonus for all agents */
  instinctBonus: number;

  /** FINISHER energy cost reduction */
  finisherCostReduction: number;

  /** HOOK base effect increase */
  hookEffectBonus: number;
}

const DEFAULT_BONUSES: SynergyBonuses = {
  allActionBonus: 0,
  actionBonuses: {},
  comboBuildBonus: 0,
  critBonus: 0,
  slCushionBonus: 0,
  shieldAbsorptionBonus: 0,
  energyRegenBonus: 0,
  instinctBonus: 0,
  finisherCostReduction: 0,
  hookEffectBonus: 0,
};

// ── Synergy Definitions ─────────────────────────────────────────

export const TEAM_SYNERGIES: TeamSynergy[] = [
  {
    id: 'trend_trinity',
    name: 'Trend Trinity',
    nameKR: '트렌드 삼위일체',
    description: 'STRUCTURE + VPA + ICT: Full offense stack. Combo builds faster, BURST cooldown reduced.',
    descriptionKR: '풀 공격 스택. 콤보 빌드 +8%, BURST 효과 +15%',
    requiredAgents: ['STRUCTURE', 'VPA', 'ICT'],
    bonuses: {
      ...DEFAULT_BONUSES,
      comboBuildBonus: 0.08,
      actionBonuses: { BURST: 0.15 },
    },
    visualDesc: 'High-five chain during SCOUT, synchronized BURST attacks',
    icon: '🔺',
  },
  {
    id: 'risk_shield',
    name: 'Risk Shield',
    nameKR: '리스크 실드',
    description: 'DERIV + VALUATION + FLOW: Full defense stack. Extra SL cushion, SHIELD absorbs more.',
    descriptionKR: '풀 방어 스택. SL 쿠션 +0.3%, SHIELD 흡수 60→70%',
    requiredAgents: ['DERIV', 'VALUATION', 'FLOW'],
    bonuses: {
      ...DEFAULT_BONUSES,
      slCushionBonus: 0.003,          // +0.3%
      shieldAbsorptionBonus: 0.10,    // 60% → 70%
    },
    visualDesc: 'Back-to-back defensive stance, golden barrier on SHIELD',
    icon: '🛡',
  },
  {
    id: 'smart_money',
    name: 'Smart Money Trail',
    nameKR: '스마트 머니 추적',
    description: 'ICT + FLOW + MACRO: Institutional tracking. HOOK stronger, instinct boosted.',
    descriptionKR: '기관 추적 강화. HOOK 2.0→3.0, Instinct +5',
    requiredAgents: ['ICT', 'FLOW', 'MACRO'],
    bonuses: {
      ...DEFAULT_BONUSES,
      hookEffectBonus: 1.0,           // HOOK base 2.0 → 3.0
      instinctBonus: 5,               // +5 to all agents' instinct
    },
    visualDesc: 'Synchronized movement during SCOUT, ghost trail effect',
    icon: '🕵',
  },
  {
    id: 'divergence_hunter',
    name: 'Divergence Hunter',
    nameKR: '다이버전스 헌터',
    description: 'STRUCTURE + VALUATION + MACRO: Cross-timeframe analysis. Crit bonus, cheaper FINISHER.',
    descriptionKR: '크로스 타임프레임 분석. 크릿 +5%, FINISHER 비용 60→50',
    requiredAgents: ['STRUCTURE', 'VALUATION', 'MACRO'],
    bonuses: {
      ...DEFAULT_BONUSES,
      critBonus: 0.05,                // +5% crit rate
      finisherCostReduction: 10,      // 60 → 50 energy
    },
    visualDesc: 'Divergence detection animation, zoom lens effect on charts',
    icon: '🔍',
  },
  {
    id: 'vibe_check',
    name: 'Vibe Check',
    nameKR: '바이브 체크',
    description: 'SENTI + MACRO + VPA: Broad context awareness. Energy regen boosted, all actions +5%.',
    descriptionKR: '넓은 컨텍스트. 에너지 리젠 +2/틱, 전 액션 +5%',
    requiredAgents: ['SENTI', 'MACRO', 'VPA'],
    bonuses: {
      ...DEFAULT_BONUSES,
      allActionBonus: 0.05,           // +5% all actions
      energyRegenBonus: 2,            // +2 energy per tick
    },
    visualDesc: 'Floating together during COUNCIL, shared aura glow',
    icon: '🌊',
  },
];

// ── Tension Pairs (narrative conflicts, not mechanical) ─────────

export interface TensionPair {
  agents: [AgentId, AgentId];
  name: string;
  description: string;
}

export const TENSION_PAIRS: TensionPair[] = [
  {
    agents: ['STRUCTURE', 'SENTI'],
    name: 'Logic vs Emotion',
    description: 'STRUCTURE dismisses SENTI\'s vibes; SENTI\'s gut feelings sometimes prove right.',
  },
  {
    agents: ['ICT', 'DERIV'],
    name: 'Offense vs Defense',
    description: 'ICT wants aggressive entries; DERIV urges caution.',
  },
  {
    agents: ['VPA', 'MACRO'],
    name: 'Micro vs Macro',
    description: 'VPA focuses on tick-level volume; MACRO sees the big picture.',
  },
];

// ── Lookup Functions ────────────────────────────────────────────

/**
 * Find all active synergies for a given team of 3 agents.
 * Returns matching synergies (usually 0 or 1, rarely 2).
 */
export function findTeamSynergies(teamAgentIds: AgentId[]): TeamSynergy[] {
  const teamSet = new Set(teamAgentIds);
  return TEAM_SYNERGIES.filter(synergy =>
    synergy.requiredAgents.every(req => teamSet.has(req))
  );
}

/**
 * Get combined synergy bonuses for a team.
 * If multiple synergies match, bonuses stack additively.
 */
export function getCombinedSynergyBonuses(teamAgentIds: AgentId[]): SynergyBonuses {
  const synergies = findTeamSynergies(teamAgentIds);
  if (synergies.length === 0) return { ...DEFAULT_BONUSES };

  const combined: SynergyBonuses = { ...DEFAULT_BONUSES, actionBonuses: {} };

  for (const syn of synergies) {
    combined.allActionBonus += syn.bonuses.allActionBonus;
    combined.comboBuildBonus += syn.bonuses.comboBuildBonus;
    combined.critBonus += syn.bonuses.critBonus;
    combined.slCushionBonus += syn.bonuses.slCushionBonus;
    combined.shieldAbsorptionBonus += syn.bonuses.shieldAbsorptionBonus;
    combined.energyRegenBonus += syn.bonuses.energyRegenBonus;
    combined.instinctBonus += syn.bonuses.instinctBonus;
    combined.finisherCostReduction += syn.bonuses.finisherCostReduction;
    combined.hookEffectBonus += syn.bonuses.hookEffectBonus;

    // Merge action-specific bonuses
    for (const [action, bonus] of Object.entries(syn.bonuses.actionBonuses)) {
      const key = action as ActionType;
      combined.actionBonuses[key] = (combined.actionBonuses[key] ?? 0) + (bonus ?? 0);
    }
  }

  return combined;
}

/**
 * Find tension pairs present in a team (for narrative/speech purposes).
 */
export function findTensionPairs(teamAgentIds: AgentId[]): TensionPair[] {
  const teamSet = new Set(teamAgentIds);
  return TENSION_PAIRS.filter(tp =>
    tp.agents.every(a => teamSet.has(a))
  );
}

/**
 * Get synergy display info for the draft screen.
 */
export function getSynergyPreview(teamAgentIds: AgentId[]): Array<{
  synergy: TeamSynergy;
  isActive: boolean;
  missingAgents: AgentId[];
}> {
  return TEAM_SYNERGIES.map(synergy => {
    const teamSet = new Set(teamAgentIds);
    const missingAgents = synergy.requiredAgents.filter(a => !teamSet.has(a));
    return {
      synergy,
      isActive: missingAgents.length === 0,
      missingAgents: missingAgents as AgentId[],
    };
  });
}
