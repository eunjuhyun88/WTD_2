// ═══════════════════════════════════════════════════════════════
// WTD — Agent Persistent Data Store
// ═══════════════════════════════════════════════════════════════

import { writable } from 'svelte/store';
import { AGDEFS } from '$lib/data/agents';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import { fetchAgentStatsApi, updateAgentStatApi } from '$lib/api/agentStatsApi';
import { resolveAgentLevelFromMatches } from './progressionRules';

export type AgentMood = 'focused' | 'hungry' | 'tired' | 'sharp';

export interface AgentStats {
  level: number;
  xp: number;
  xpMax: number;
  wins: number;
  losses: number;
  bestStreak: number;
  curStreak: number;
  avgConf: number;
  bestConf: number;
  matches: MatchRecord[];
  stamps: { win: number; lose: number; streak: number; diamond: number; crown: number };
  learning: AgentLearning;
  // Sprint 3: Ownership loop fields
  mood: AgentMood;
  bond: number;
  createdAt: number;
  stage: 1 | 2 | 3;
  stageProgress: number;
}

export interface MatchRecord {
  matchN: number;
  dir: string;
  conf: number;
  win: boolean;
  lp: number;
  hypothesis?: string;
}

// ─── AI Learning System (v3) ─────────────────────────────────

export interface PatternMemory {
  patternId: string;        // 'BOS', 'FVG', 'VOLUME_CLIMAX' etc
  encounters: number;       // how many times seen
  successRate: number;      // win rate on this pattern (0-1)
}

export interface RegimeAdaptation {
  regime: string;           // 'bullish' | 'bearish' | 'ranging' | 'volatile'
  battles: number;
  winRate: number;          // 0-1
  avgAccuracy: number;      // avg FBS score
}

export interface MatchupExperience {
  opposingType: string;     // 'TECH' | 'FLOW' | 'SENTI' | 'MACRO'
  battles: number;
  winRate: number;          // 0-1
}

export interface AgentLearning {
  patternMemory: PatternMemory[];
  regimeAdaptation: RegimeAdaptation[];
  matchupExperience: MatchupExperience[];
  learningLevel: number;    // min(50, floor(totalRAGEntries / 10))
  totalRAGEntries: number;
  challengeStats: {
    totalChallenges: number;
    correctAnswers: number;
    accuracy: number;       // 0-1
  };
}

export function createDefaultLearning(): AgentLearning {
  return {
    patternMemory: [],
    regimeAdaptation: [],
    matchupExperience: [],
    learningLevel: 0,
    totalRAGEntries: 0,
    challengeStats: { totalChallenges: 0, correctAnswers: 0, accuracy: 0 },
  };
}

function createDefaultStats(): Record<string, AgentStats> {
  const stats: Record<string, AgentStats> = {};
  for (const ag of AGDEFS) {
    stats[ag.id] = {
      level: 1, xp: 0, xpMax: 100,
      wins: 0, losses: 0,
      bestStreak: 0, curStreak: 0,
      avgConf: ag.conf, bestConf: ag.conf,
      matches: [],
      stamps: { win: 0, lose: 0, streak: 0, diamond: 0, crown: 0 },
      learning: createDefaultLearning(),
      mood: 'focused',
      bond: 0,
      createdAt: Date.now(),
      stage: 1,
      stageProgress: 0,
    };
  }
  return stats;
}

function loadAgentData(): Record<string, AgentStats> {
  const saved = loadFromStorage<Record<string, AgentStats> | null>(STORAGE_KEYS.agents, null);
  if (saved) return { ...createDefaultStats(), ...saved };
  return createDefaultStats();
}

export const agentStats = writable<Record<string, AgentStats>>(loadAgentData());

// localStorage persistence via shared utility
autoSave(agentStats, STORAGE_KEYS.agents, undefined, 500);

// Server sync (separate from localStorage persistence)
let _agentSyncTimer: ReturnType<typeof setTimeout> | null = null;
let _lastServerHash = '';

function buildServerPayload(data: Record<string, AgentStats>) {
  return Object.entries(data).map(([agentId, s]) => ({
    agentId,
    level: s.level,
    xp: s.xp,
    xpMax: s.xpMax,
    wins: s.wins,
    losses: s.losses,
    bestStreak: s.bestStreak,
    curStreak: s.curStreak,
    avgConf: s.avgConf,
    bestConf: s.bestConf,
    stamps: s.stamps
  }));
}

async function syncAgentStatsToServer(data: Record<string, AgentStats>) {
  const payload = buildServerPayload(data);
  const hash = JSON.stringify(payload);
  if (hash === _lastServerHash) return;
  _lastServerHash = hash;

  await Promise.all(
    payload.map((item) =>
      updateAgentStatApi(item.agentId, {
        level: item.level,
        xp: item.xp,
        xpMax: item.xpMax,
        wins: item.wins,
        losses: item.losses,
        bestStreak: item.bestStreak,
        curStreak: item.curStreak,
        avgConf: item.avgConf,
        bestConf: item.bestConf,
        stamps: item.stamps,
      })
    )
  );
}

let _agentHydrated = false;
let _agentHydratePromise: Promise<void> | null = null;
export async function hydrateAgentStats(force = false) {
  if (typeof window === 'undefined') return;
  if (_agentHydrated && !force) return;
  if (_agentHydratePromise) return _agentHydratePromise;

  _agentHydratePromise = (async () => {
    const rows = await fetchAgentStatsApi();
    if (!rows) return;
    if (rows.length === 0) {
      _agentHydrated = true;
      return;
    }

    const next = createDefaultStats();
    for (const row of rows) {
      if (!next[row.agentId]) continue;
      next[row.agentId] = {
        ...next[row.agentId],
        level: Number(row.level ?? next[row.agentId].level),
        xp: Number(row.xp ?? next[row.agentId].xp),
        xpMax: Number(row.xpMax ?? next[row.agentId].xpMax),
        wins: Number(row.wins ?? next[row.agentId].wins),
        losses: Number(row.losses ?? next[row.agentId].losses),
        bestStreak: Number(row.bestStreak ?? next[row.agentId].bestStreak),
        curStreak: Number(row.curStreak ?? next[row.agentId].curStreak),
        avgConf: Number(row.avgConf ?? next[row.agentId].avgConf),
        bestConf: Number(row.bestConf ?? next[row.agentId].bestConf),
        stamps: {
          ...next[row.agentId].stamps,
          ...(row.stamps || {}),
        },
      };
    }

    _agentHydrated = true;
    agentStats.set(next);
  })();

  try {
    await _agentHydratePromise;
  } finally {
    _agentHydratePromise = null;
  }
}

// 자동 hydration은 hydrateDomainStores() 단일 진입점에서 수행한다.

// Debounced server sync (localStorage already handled by autoSave above)
agentStats.subscribe(data => {
  if (typeof window === 'undefined') return;
  if (_agentSyncTimer) clearTimeout(_agentSyncTimer);
  _agentSyncTimer = setTimeout(() => {
    void syncAgentStatsToServer(data);
  }, 900);
});

function recalcFromMatches(ag: AgentStats) {
  const count = Math.max(ag.matches.length, ag.wins + ag.losses);
  const levelState = resolveAgentLevelFromMatches(count);
  ag.level = levelState.level;
  ag.xp = levelState.xp;
  ag.xpMax = levelState.xpMax;

  if (ag.matches.length > 0) {
    const confSum = ag.matches.reduce((sum, m) => sum + Number(m.conf || 0), 0);
    ag.avgConf = Math.round(confSum / ag.matches.length);
    ag.bestConf = Math.max(ag.bestConf, ...ag.matches.map((m) => Number(m.conf || 0)));
  }
}

// ─── Sprint 3: Mood / Stage helpers ──────────────────────────

/** Derive mood from recent match results. */
function deriveMood(ag: AgentStats): AgentMood {
  const recent = ag.matches.slice(-5);
  if (recent.length === 0) return 'focused';
  const recentWins = recent.filter(m => m.win).length;
  const recentRate = recentWins / recent.length;
  if (ag.curStreak >= 3 && recentRate >= 0.8) return 'sharp';
  if (recentRate >= 0.6) return 'focused';
  if (recentRate <= 0.2) return 'tired';
  return 'hungry';
}

/** Update evolution stage based on total matches and win rate. */
function updateStage(ag: AgentStats): void {
  const total = ag.wins + ag.losses;
  const wr = total > 0 ? ag.wins / total : 0;
  if (total >= 50 && wr >= 0.55) {
    ag.stage = 3;
    ag.stageProgress = 100;
  } else if (total >= 20 && wr >= 0.45) {
    ag.stage = 2;
    ag.stageProgress = Math.min(100, Math.round(((total - 20) / 30) * 100));
  } else {
    ag.stage = 1;
    ag.stageProgress = Math.min(100, Math.round((total / 20) * 100));
  }
}

/** Get agent age in days from createdAt timestamp. */
export function getAgentAge(createdAt: number): number {
  return Math.max(1, Math.floor((Date.now() - createdAt) / 86_400_000));
}

// ─── Sprint A1: Onboard → Agent Binding ─────────────────────

/**
 * Initialize agent stats from onboarding archetype selection.
 * Saves primary agent ID and onboard-complete flag to localStorage.
 */
export function initFromOnboard(archetype: string, agentId: string): void {
  agentStats.update((stats) => {
    const ag = stats[agentId];
    if (!ag) return stats;
    ag.mood = 'focused';
    ag.bond = 1;
    ag.stage = 1;
    ag.createdAt = Date.now();
    ag.stageProgress = 0;
    return { ...stats };
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem('cogochi_primary_agent', agentId);
    localStorage.setItem('cogochi_onboard_complete', 'true');
    localStorage.setItem('cogochi_archetype', archetype);
  }
}

// ─── Sprint A5: Memory Cards ────────────────────────────────

export interface MemoryCard {
  id: string;
  agentId: string;
  title: string;
  lesson: string;
  regime: string;
  era: string;
  result: 'win' | 'loss';
  createdAt: number;
}

const MEMORY_CARDS_KEY = 'cogochi_memory_cards';

function loadMemoryCards(): MemoryCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MEMORY_CARDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const memoryCards = writable<MemoryCard[]>(loadMemoryCards());

// Persist memory cards to localStorage
memoryCards.subscribe((cards) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_CARDS_KEY, JSON.stringify(cards));
  } catch { /* ignore quota errors */ }
});

export function addMemoryCard(card: MemoryCard): void {
  memoryCards.update((cards) => [card, ...cards].slice(0, 200));
}

// ─── Match Recording ────────────────────────────────────────

export function recordAgentMatch(agentId: string, match: MatchRecord) {
  agentStats.update((stats) => {
    const ag = stats[agentId];
    if (!ag) return stats;

    if (match.win) {
      ag.wins += 1;
      ag.curStreak += 1;
      ag.stamps.win += 1;
      if (ag.curStreak > ag.bestStreak) {
        ag.bestStreak = ag.curStreak;
        ag.stamps.streak += 1;
      }
    } else {
      ag.losses += 1;
      ag.curStreak = 0;
      ag.stamps.lose += 1;
    }

    ag.matches.push(match);
    if (ag.matches.length > 60) ag.matches.shift();
    recalcFromMatches(ag);

    // Sprint 3: Update mood, bond, stage
    ag.bond += 1;
    ag.mood = deriveMood(ag);
    updateStage(ag);

    return { ...stats };
  });
}

// Helpers
export function addXP(agentId: string, amount: number) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    ag.xp += amount;
    while (ag.xp >= ag.xpMax && ag.level < 50) {
      ag.xp -= ag.xpMax;
      ag.level++;
      ag.xpMax = Math.floor(ag.xpMax * 1.12);
    }
    // Keep legacy helper compatible, but normalize to shared progression model when possible.
    recalcFromMatches(ag);
    return { ...stats };
  });
}

export function getWinRate(stats: AgentStats): number {
  const total = stats.wins + stats.losses;
  return total > 0 ? Math.round((stats.wins / total) * 100) : 0;
}

// ─── Battle XP Rewards (Arena War 개선) ──────────────────────

import { BATTLE_XP_REWARDS, type V2BattleResult } from '$lib/contracts/agentBattle';

/**
 * 배틀 결과에 따른 XP 보상 적용.
 * 승리/패배 + MVP + 콤보 + 크리티컬 + 시그니처 + DISSENT 등
 */
export function applyBattleXP(
  agentIds: string[],
  result: V2BattleResult,
  isWinner: boolean,
  isDissent: boolean,
  humanFBS?: number
) {
  for (const agentId of agentIds) {
    let totalXP = isWinner ? BATTLE_XP_REWARDS.WIN : BATTLE_XP_REWARDS.LOSS;

    // MVP bonus
    if (result.agentMVP === agentId) {
      totalXP += BATTLE_XP_REWARDS.MVP;
    }

    // Combo bonuses
    if (result.maxCombo >= 8) totalXP += BATTLE_XP_REWARDS.COMBO_8;
    else if (result.maxCombo >= 5) totalXP += BATTLE_XP_REWARDS.COMBO_5;

    // Critical hits
    const agentReport = result.agentReports.find(r => r.agentId === agentId);
    if (agentReport && agentReport.criticalHits > 0) {
      totalXP += BATTLE_XP_REWARDS.CRITICAL_HIT * agentReport.criticalHits;
    }

    // DISSENT win (AI와 반대 방향 + 승리)
    if (isDissent && isWinner) {
      totalXP += BATTLE_XP_REWARDS.DISSENT_WIN;
    }

    // Perfect read (FBS 90+)
    if (humanFBS && humanFBS >= 90) {
      totalXP += BATTLE_XP_REWARDS.PERFECT_READ;
    }

    addXP(agentId, totalXP);
  }
}

/**
 * 모든 에이전트의 현재 레벨을 Record로 반환 (UI 렌더링용)
 */
export function getAgentLevels(stats: Record<string, AgentStats>): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const [id, s] of Object.entries(stats)) {
    levels[id] = s.level;
  }
  return levels;
}

// ─── Learning System Updates (v3 AI 학습) ────────────────────

/**
 * Update pattern memory for an agent after a battle.
 */
export function updatePatternMemory(
  agentId: string,
  patternId: string,
  wasSuccessful: boolean,
) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    if (!ag.learning) ag.learning = createDefaultLearning();

    const existing = ag.learning.patternMemory.find(p => p.patternId === patternId);
    if (existing) {
      existing.encounters += 1;
      // Rolling average success rate
      existing.successRate =
        (existing.successRate * (existing.encounters - 1) + (wasSuccessful ? 1 : 0)) / existing.encounters;
    } else {
      ag.learning.patternMemory.push({
        patternId,
        encounters: 1,
        successRate: wasSuccessful ? 1 : 0,
      });
    }

    return { ...stats };
  });
}

/**
 * Update regime adaptation for an agent after a battle.
 */
export function updateRegimeAdaptation(
  agentId: string,
  regime: string,
  wasWin: boolean,
  fbsScore: number,
) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    if (!ag.learning) ag.learning = createDefaultLearning();

    const existing = ag.learning.regimeAdaptation.find(r => r.regime === regime);
    if (existing) {
      existing.battles += 1;
      existing.winRate =
        (existing.winRate * (existing.battles - 1) + (wasWin ? 1 : 0)) / existing.battles;
      existing.avgAccuracy =
        (existing.avgAccuracy * (existing.battles - 1) + fbsScore) / existing.battles;
    } else {
      ag.learning.regimeAdaptation.push({
        regime,
        battles: 1,
        winRate: wasWin ? 1 : 0,
        avgAccuracy: fbsScore,
      });
    }

    return { ...stats };
  });
}

/**
 * Update matchup experience against a type.
 */
export function updateMatchupExperience(
  agentId: string,
  opposingType: string,
  wasWin: boolean,
) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    if (!ag.learning) ag.learning = createDefaultLearning();

    const existing = ag.learning.matchupExperience.find(m => m.opposingType === opposingType);
    if (existing) {
      existing.battles += 1;
      existing.winRate =
        (existing.winRate * (existing.battles - 1) + (wasWin ? 1 : 0)) / existing.battles;
    } else {
      ag.learning.matchupExperience.push({
        opposingType,
        battles: 1,
        winRate: wasWin ? 1 : 0,
      });
    }

    return { ...stats };
  });
}

/**
 * Increment RAG entry count and recalculate learning level.
 */
export function incrementRAGEntries(agentId: string, count: number = 1) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    if (!ag.learning) ag.learning = createDefaultLearning();

    ag.learning.totalRAGEntries += count;
    ag.learning.learningLevel = Math.min(50, Math.floor(ag.learning.totalRAGEntries / 10));

    return { ...stats };
  });
}

/**
 * Update challenge stats for an agent.
 */
export function updateChallengeStats(
  agentId: string,
  totalChallenges: number,
  correctAnswers: number,
) {
  agentStats.update(stats => {
    const ag = stats[agentId];
    if (!ag) return stats;
    if (!ag.learning) ag.learning = createDefaultLearning();

    ag.learning.challengeStats.totalChallenges += totalChallenges;
    ag.learning.challengeStats.correctAnswers += correctAnswers;
    ag.learning.challengeStats.accuracy =
      ag.learning.challengeStats.totalChallenges > 0
        ? ag.learning.challengeStats.correctAnswers / ag.learning.challengeStats.totalChallenges
        : 0;

    return { ...stats };
  });
}

/**
 * Get the effective learning level for an agent (convenience).
 */
export function getAgentLearningLevel(stats: Record<string, AgentStats>, agentId: string): number {
  const ag = stats[agentId];
  if (!ag?.learning) return 0;
  return ag.learning.learningLevel;
}
