// =================================================================
// STOCKCLAW — Agent Character System
// =================================================================
// 포켓몬 스타일 에이전트 캐릭터: 4타입 상성, 티어 진화, 시그니처 무브
// v2BattleEngine 위에 올라가는 캐릭터 레이어
// =================================================================

import type { AgentId } from './types';

// ── 4-Type System ─────────────────────────────────────────────

/**
 * 4타입 상성 (순환 구조):
 *   TECH → FLOW → SENTI → MACRO → TECH
 *
 * TECH(기술분석)가 FLOW(자금흐름)에 강함:
 *   구조적 패턴이 자금 흐름 방향을 예측
 * FLOW가 SENTI(심리)에 강함:
 *   실제 자금 움직임이 센티먼트를 무력화
 * SENTI가 MACRO(매크로)에 강함:
 *   시장 심리가 매크로 이벤트 해석을 좌우
 * MACRO가 TECH(기술분석)에 강함:
 *   매크로 이벤트가 기술적 패턴을 파괴
 */
export type AgentType = 'TECH' | 'FLOW' | 'SENTI' | 'MACRO';

/** 상성 배율표: attackerType → defenderType → multiplier */
export const TYPE_EFFECTIVENESS: Record<AgentType, Record<AgentType, number>> = {
  TECH:  { TECH: 1.0, FLOW: 1.5, SENTI: 1.0, MACRO: 0.7 },
  FLOW:  { TECH: 0.7, FLOW: 1.0, SENTI: 1.5, MACRO: 1.0 },
  SENTI: { TECH: 1.0, SENTI: 1.0, MACRO: 1.5, FLOW: 0.7 },
  MACRO: { TECH: 1.5, FLOW: 1.0, SENTI: 0.7, MACRO: 1.0 },
};

/**
 * 팀 타입 구성에 따른 보너스 계산.
 * 3에이전트의 타입 조합 → 상대 팀의 타입 구성 대비 평균 상성 배율.
 */
export function calcTeamTypeAdvantage(
  myTeam: AgentType[],
  enemyTeam: AgentType[]
): number {
  if (myTeam.length === 0 || enemyTeam.length === 0) return 1.0;

  let totalMult = 0;
  let count = 0;
  for (const atk of myTeam) {
    for (const def of enemyTeam) {
      totalMult += TYPE_EFFECTIVENESS[atk][def];
      count++;
    }
  }
  return count > 0 ? totalMult / count : 1.0;
}

/** 상성 텍스트 (UI 표시용) */
export function getTypeEffectivenessLabel(mult: number): string {
  if (mult >= 1.4) return '효과적!';
  if (mult >= 1.2) return '유리';
  if (mult <= 0.6) return '별로...';
  if (mult <= 0.8) return '불리';
  return '보통';
}

export function getTypeEffectivenessColor(mult: number): string {
  if (mult >= 1.4) return '#48d868';
  if (mult >= 1.2) return '#a0e8a0';
  if (mult <= 0.6) return '#f85858';
  if (mult <= 0.8) return '#f8a0a0';
  return '#888888';
}

// ── Agent Tier (Evolution) ────────────────────────────────────

export type AgentTier = 1 | 2 | 3;

export interface TierInfo {
  tier: AgentTier;
  name: string;
  nameKR: string;
  minLevel: number;
  spriteVariant: string;    // CSS class suffix
  glowColor: string;        // tier glow effect
  statBonus: number;        // additive % to all stats
}

export const TIER_DEFINITIONS: Record<AgentTier, Omit<TierInfo, 'tier'>> = {
  1: { name: 'Basic',   nameKR: '기본',   minLevel: 1,  spriteVariant: 'basic',   glowColor: 'transparent',  statBonus: 0 },
  2: { name: 'Evolved', nameKR: '진화',   minLevel: 16, spriteVariant: 'evolved', glowColor: '#4FC3F7',       statBonus: 8 },
  3: { name: 'Master',  nameKR: '마스터', minLevel: 31, spriteVariant: 'master',  glowColor: '#FFD54F',       statBonus: 15 },
};

export function getTierForLevel(level: number): AgentTier {
  if (level >= 31) return 3;
  if (level >= 16) return 2;
  return 1;
}

export function getTierInfo(tier: AgentTier): TierInfo {
  return { tier, ...TIER_DEFINITIONS[tier] };
}

// ── Signature Move ────────────────────────────────────────────

export interface SignatureMove {
  name: string;
  nameKR: string;
  description: string;
  descriptionKR: string;
  trigger: string;             // 조건 설명
  effect: string;              // 효과 설명
  minTier: AgentTier;          // 해금 티어
  cooldownTicks: number;       // 발동 후 대기
  visualEffect: string;        // CSS animation class
}

// ── Agent Character (Full Definition) ─────────────────────────

export interface AgentCharacter {
  id: AgentId;
  name: string;
  nameKR: string;
  title: string;               // 칭호 (e.g., "구조 분석가")
  titleKR: string;

  // Type system
  type: AgentType;
  typeIcon: string;            // 타입 아이콘

  // Visual
  color: string;               // 메인 컬러
  colorSecondary: string;      // 보조 컬러
  gradientCSS: string;         // 배경 그래디언트
  spriteClass: string;         // CSS sprite 클래스

  // Battle stats (base, before tier bonus)
  baseStats: {
    analysis: number;
    accuracy: number;
    speed: number;
    instinct: number;
    synergy: number;           // 팀플 기여도 (NEW)
    resilience: number;        // 불리한 틱 버팀 (NEW)
  };

  // Signature move
  signature: SignatureMove;

  // Speech (battle 중 대사)
  battleCry: string;           // 배틀 시작
  attackLine: string;          // 공격 시
  defendLine: string;          // 방어 시
  criticalLine: string;        // 크리티컬 시
  victoryLine: string;         // 승리 시
  defeatLine: string;          // 패배 시
}

// ── 8 Agent Character Definitions ─────────────────────────────

export const AGENT_CHARACTERS: Record<AgentId, AgentCharacter> = {
  STRUCTURE: {
    id: 'STRUCTURE',
    name: 'STRUCTURE',
    nameKR: '차트구조',
    title: 'Chart Architect',
    titleKR: '구조 분석가',
    type: 'TECH',
    typeIcon: '⚙',
    color: '#4FC3F7',
    colorSecondary: '#0288D1',
    gradientCSS: 'linear-gradient(135deg, #4FC3F7, #0288D1)',
    spriteClass: 'sprite-structure',
    baseStats: { analysis: 82, accuracy: 71, speed: 65, instinct: 55, synergy: 60, resilience: 68 },
    signature: {
      name: 'Structural Collapse',
      nameKR: '구조 붕괴',
      description: 'Identifies the exact break-of-structure point',
      descriptionKR: '정확한 구조 이탈 지점을 감지',
      trigger: 'BOS/CHoCH 감지 + 3연속 유리한 틱',
      effect: 'FINISHER 에너지 비용 40% 감소, 다음 3틱 analysis +20%',
      minTier: 2,
      cooldownTicks: 8,
      visualEffect: 'sig-structure-collapse',
    },
    battleCry: 'such chart. much structure!',
    attackLine: 'BOS confirmed!',
    defendLine: 'holding support...',
    criticalLine: 'CHoCH DETECTED!!',
    victoryLine: 'structure always wins!',
    defeatLine: 'pattern broke...',
  },

  VPA: {
    id: 'VPA',
    name: 'VPA',
    nameKR: '볼륨분석',
    title: 'Volume Prophet',
    titleKR: '볼륨 예언자',
    type: 'TECH',
    typeIcon: '⚙',
    color: '#7986CB',
    colorSecondary: '#3F51B5',
    gradientCSS: 'linear-gradient(135deg, #7986CB, #3F51B5)',
    spriteClass: 'sprite-vpa',
    baseStats: { analysis: 78, accuracy: 72, speed: 68, instinct: 60, synergy: 65, resilience: 62 },
    signature: {
      name: 'Volume Climax',
      nameKR: '볼륨 클라이맥스',
      description: 'Detects exhaustion through volume climax patterns',
      descriptionKR: '볼륨 클라이맥스로 소진 패턴 감지',
      trigger: 'CVD 다이버전스 + 볼륨 급증',
      effect: '팀 전체 BURST 효과 +30%, 2틱간 SHIELD 자동 발동',
      minTier: 2,
      cooldownTicks: 10,
      visualEffect: 'sig-volume-climax',
    },
    battleCry: 'reading the volume...',
    attackLine: 'CVD confirms!',
    defendLine: 'absorption detected!',
    criticalLine: 'CLIMAX SIGNAL!!',
    victoryLine: 'volume never lies!',
    defeatLine: 'volume faked out...',
  },

  ICT: {
    id: 'ICT',
    name: 'ICT',
    nameKR: '스마트머니',
    title: 'Liquidity Hunter',
    titleKR: '유동성 사냥꾼',
    type: 'TECH',
    typeIcon: '⚙',
    color: '#FFB74D',
    colorSecondary: '#F57C00',
    gradientCSS: 'linear-gradient(135deg, #FFB74D, #F57C00)',
    spriteClass: 'sprite-ict',
    baseStats: { analysis: 80, accuracy: 75, speed: 62, instinct: 72, synergy: 58, resilience: 65 },
    signature: {
      name: 'Liquidity Sweep',
      nameKR: '유동성 스윕',
      description: 'Triggers when smart money sweeps a liquidity pool',
      descriptionKR: '스마트머니가 유동성풀을 스윕할 때 발동',
      trigger: '유동성풀 접근 + FVG 컨플루언스',
      effect: 'FINISHER 무조건 크리티컬, VS미터 +8 즉시',
      minTier: 2,
      cooldownTicks: 12,
      visualEffect: 'sig-liquidity-sweep',
    },
    battleCry: 'hunting liquidity...',
    attackLine: 'FVG filled!',
    defendLine: 'order block holds!',
    criticalLine: 'DISPLACEMENT!!',
    victoryLine: 'smart money wins!',
    defeatLine: 'swept out...',
  },

  DERIV: {
    id: 'DERIV',
    name: 'DERIV',
    nameKR: '파생상품',
    title: 'Derivatives Oracle',
    titleKR: '파생상품 오라클',
    type: 'FLOW',
    typeIcon: '💧',
    color: '#FF8A65',
    colorSecondary: '#E64A19',
    gradientCSS: 'linear-gradient(135deg, #FF8A65, #E64A19)',
    spriteClass: 'sprite-deriv',
    baseStats: { analysis: 76, accuracy: 74, speed: 70, instinct: 62, synergy: 68, resilience: 72 },
    signature: {
      name: 'Squeeze Detonator',
      nameKR: '스퀴즈 폭발',
      description: 'Forces a liquidation cascade for massive VS shift',
      descriptionKR: '청산 캐스케이드로 VS 대폭 이동',
      trigger: 'FR 극단 + OI 집중 + 스퀴즈 신호',
      effect: 'VS미터 +15, 상대 팀 에너지 30% 감소',
      minTier: 2,
      cooldownTicks: 15,
      visualEffect: 'sig-squeeze-detonate',
    },
    battleCry: 'checking derivatives...',
    attackLine: 'OI confirms bias!',
    defendLine: 'funding rate stable...',
    criticalLine: 'SQUEEZE INCOMING!!',
    victoryLine: 'derivatives called it!',
    defeatLine: 'OI diverged...',
  },

  VALUATION: {
    id: 'VALUATION',
    name: 'VALUATION',
    nameKR: '밸류에이션',
    title: 'Chain Sage',
    titleKR: '온체인 현자',
    type: 'MACRO',
    typeIcon: '🌐',
    color: '#CE93D8',
    colorSecondary: '#7B1FA2',
    gradientCSS: 'linear-gradient(135deg, #CE93D8, #7B1FA2)',
    spriteClass: 'sprite-valuation',
    baseStats: { analysis: 74, accuracy: 80, speed: 45, instinct: 68, synergy: 72, resilience: 78 },
    signature: {
      name: 'Cycle Anchor',
      nameKR: '사이클 앵커',
      description: 'Locks in the cycle position for stable assessment',
      descriptionKR: '사이클 위치를 고정하여 안정적 평가',
      trigger: 'MVRV + NUPL + SOPR 삼중 컨펌',
      effect: '팀 전체 accuracy +15%, SHIELD 흡수율 +20% (5틱)',
      minTier: 2,
      cooldownTicks: 10,
      visualEffect: 'sig-cycle-anchor',
    },
    battleCry: 'checking on-chain...',
    attackLine: 'MVRV confirms!',
    defendLine: 'cycle holds...',
    criticalLine: 'CYCLE PIVOT!!',
    victoryLine: 'value always wins!',
    defeatLine: 'overvalued...',
  },

  FLOW: {
    id: 'FLOW',
    name: 'FLOW',
    nameKR: '자금흐름',
    title: 'Whale Tracker',
    titleKR: '고래 추적자',
    type: 'FLOW',
    typeIcon: '💧',
    color: '#4DB6AC',
    colorSecondary: '#00695C',
    gradientCSS: 'linear-gradient(135deg, #4DB6AC, #00695C)',
    spriteClass: 'sprite-flow',
    baseStats: { analysis: 70, accuracy: 78, speed: 60, instinct: 68, synergy: 75, resilience: 70 },
    signature: {
      name: 'Whale Alert',
      nameKR: '고래 경보',
      description: 'Detects massive whale movement for preemptive action',
      descriptionKR: '대형 고래 이동 감지로 선제 대응',
      trigger: '고래 트랜잭션 3건+ 동일 방향',
      effect: '다음 5틱 팀 speed +25%, DASH 에너지 비용 0',
      minTier: 2,
      cooldownTicks: 10,
      visualEffect: 'sig-whale-alert',
    },
    battleCry: 'tracking whale flow...',
    attackLine: 'outflow detected!',
    defendLine: 'watching flows...',
    criticalLine: 'WHALE SPOTTED!!',
    victoryLine: 'follow the whales!',
    defeatLine: 'whale faked us...',
  },

  SENTI: {
    id: 'SENTI',
    name: 'SENTI',
    nameKR: '센티먼트',
    title: 'Mood Reader',
    titleKR: '감성 리더',
    type: 'SENTI',
    typeIcon: '💜',
    color: '#F06292',
    colorSecondary: '#C2185B',
    gradientCSS: 'linear-gradient(135deg, #F06292, #C2185B)',
    spriteClass: 'sprite-senti',
    baseStats: { analysis: 65, accuracy: 62, speed: 80, instinct: 75, synergy: 70, resilience: 55 },
    signature: {
      name: 'Contrarian Flip',
      nameKR: '역발상 뒤집기',
      description: 'Uses extreme sentiment to flip the narrative',
      descriptionKR: '극단 센티먼트로 내러티브 역전',
      trigger: 'Fear & Greed 극단(10이하 또는 90이상) + 소셜 볼륨 급증',
      effect: '불리한 틱을 유리하게 전환 (3틱), combo 리셋 방지',
      minTier: 2,
      cooldownTicks: 12,
      visualEffect: 'sig-contrarian-flip',
    },
    battleCry: 'reading the mood...',
    attackLine: 'sentiment confirms!',
    defendLine: 'crowd is wrong...',
    criticalLine: 'FOMO OVERLOAD!!',
    victoryLine: 'feelings matter!',
    defeatLine: 'sentiment lied...',
  },

  MACRO: {
    id: 'MACRO',
    name: 'MACRO',
    nameKR: '매크로',
    title: 'Global Watcher',
    titleKR: '글로벌 감시자',
    type: 'MACRO',
    typeIcon: '🌐',
    color: '#FFD54F',
    colorSecondary: '#F57F17',
    gradientCSS: 'linear-gradient(135deg, #FFD54F, #F57F17)',
    spriteClass: 'sprite-macro',
    baseStats: { analysis: 72, accuracy: 70, speed: 50, instinct: 78, synergy: 65, resilience: 80 },
    signature: {
      name: 'Macro Shockwave',
      nameKR: '매크로 충격파',
      description: 'Unleashes the force of a major macro event',
      descriptionKR: '주요 매크로 이벤트의 힘을 해방',
      trigger: 'FOMC/CPI 이벤트 근접 + DXY 추세 전환',
      effect: '모든 에이전트 BURST 2회 무료, 스크린 셰이크 최대',
      minTier: 2,
      cooldownTicks: 15,
      visualEffect: 'sig-macro-shockwave',
    },
    battleCry: 'scanning macro...',
    attackLine: 'DXY breaks!',
    defendLine: 'macro holds firm...',
    criticalLine: 'MACRO SHIFT!!',
    victoryLine: 'macro wins!',
    defeatLine: 'macro shifted...',
  },
};

// ── Helpers ───────────────────────────────────────────────────

export function getAgentCharacter(id: AgentId): AgentCharacter {
  return AGENT_CHARACTERS[id];
}

export function getAgentsByType(type: AgentType): AgentCharacter[] {
  return Object.values(AGENT_CHARACTERS).filter(a => a.type === type);
}

export function getAllCharacters(): AgentCharacter[] {
  return Object.values(AGENT_CHARACTERS);
}

/** 타입 아이콘 + 이름 반환 */
export function getTypeBadge(type: AgentType): { icon: string; name: string; color: string } {
  const map: Record<AgentType, { icon: string; name: string; color: string }> = {
    TECH:  { icon: '⚙', name: 'TECH',  color: '#4FC3F7' },
    FLOW:  { icon: '💧', name: 'FLOW',  color: '#4DB6AC' },
    SENTI: { icon: '💜', name: 'SENTI', color: '#F06292' },
    MACRO: { icon: '🌐', name: 'MACRO', color: '#FFD54F' },
  };
  return map[type];
}

/** 상성 관계 요약 (UI에서 드래프트 시 표시) */
export function getMatchupSummary(myType: AgentType): { strong: AgentType; weak: AgentType } {
  const cycle: AgentType[] = ['TECH', 'FLOW', 'SENTI', 'MACRO'];
  const idx = cycle.indexOf(myType);
  return {
    strong: cycle[(idx + 1) % 4],
    weak: cycle[(idx + 3) % 4],
  };
}

// ── XP & Progression Constants ────────────────────────────────

export const BATTLE_XP_REWARDS = {
  WIN: 30,
  LOSS: 10,
  MVP: 20,            // 추가 보너스
  COMBO_5: 5,
  COMBO_8: 10,
  CRITICAL_HIT: 3,
  FINISHER_SUCCESS: 10,
  SIGNATURE_PROC: 15,
  DISSENT_WIN: 25,    // AI와 반대 방향 + 승리
  PERFECT_READ: 15,   // FBS 90+
  GREAT_MATCH: 10,    // fbsMargin > 15 (접전)
} as const;

/** 레벨업에 필요한 누적 XP */
export function getXPForLevel(level: number): number {
  // 1→2: 100, 2→3: 150, ... 점진 증가
  return Math.floor(100 * Math.pow(1.12, level - 1));
}

/** 현재 레벨에서 다음 레벨까지 필요 XP */
export function getXPToNextLevel(level: number, currentXP: number): {
  required: number;
  progress: number;   // 0-1
} {
  const required = getXPForLevel(level);
  return {
    required,
    progress: Math.min(1, currentXP / required),
  };
}

/** XP로부터 레벨 계산 (누적 XP 기준) */
export function getLevelFromTotalXP(totalXP: number): { level: number; xpInLevel: number; xpForNext: number } {
  let level = 1;
  let remaining = totalXP;

  while (level < 50) {
    const needed = getXPForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }

  return {
    level,
    xpInLevel: remaining,
    xpForNext: getXPForLevel(level),
  };
}
