// ═══════════════════════════════════════════════════════════════
// WTD — Arena War Types
// ═══════════════════════════════════════════════════════════════
//
// GameRecord, ReasonTags, Delta, OrpoPair — 통합 설계서 기반
// 핵심 전제: 같은 데이터, 다른 해석
//   AI와 인간은 동일한 48팩터 + C02 결과를 본다.
//   인간이 다르게 해석 → 시장이 판정 → ORPO pair 생성

import type {
  Direction,
  MarketRegime,
  BinanceKline,
  FactorResult,
  FBScore,
  C02Result,
} from './types';

import type {
  MarketState,
  SetupType,
  FailureTag,
  ExitType,
  ClassifyOutput,
  BattleAction as V4BattleAction,
} from './v4/types';

// ─── ReasonTags ─────────────────────────────────────────────

/** "같은 데이터를 보고 왜 다르게 판단했는가"를 구조화 */
export const REASON_TAGS = {
  technical: [
    'trend_continuation',    // 추세가 계속된다고 봄
    'trend_reversal',        // 추세가 반전된다고 봄
    'support_bounce',        // 지지선에서 반등할 것
    'resistance_rejection',  // 저항선에서 거부될 것
    'breakout',              // 돌파할 것
    'false_breakout',        // 거짓 돌파다
    'divergence',            // 다이버전스가 핵심
    'volume_confirmation',   // 거래량이 방향을 확인
  ],
  ai_reinterpretation: [
    'ai_overconfident',      // AI가 과신 — 팩터 충돌을 과소평가
    'ai_factor_conflict',    // AI 팩터 간 충돌이 심각 — AI가 무시함
    'ai_wrong_weight',       // AI의 팩터 가중치가 이 상황에서 부적절
    'guardian_underweight',   // Guardian 경고를 AI가 가볍게 처리
    'ctx_overridden',        // CTX 신호가 ORPO에 묻힘 — 나는 CTX를 신뢰
    'commander_wrong',       // Commander의 중재 결과가 틀렸다고 판단
  ],
  sentiment: [
    'panic_selling',         // 패닉 매도 과잉 → 반등
    'fomo_buying',           // FOMO 매수 과잉 → 하락
    'mean_reversion',        // 평균 회귀 예상
    'squeeze_play',          // 스퀴즈 발생 예상
    'contrarian',            // 대중 심리 역행
  ],
  intuition: [
    'gut_feeling',           // 직감
    'pattern_familiar',      // 이 패턴 전에 본 적 있음
    'something_off',         // 데이터와 별개로 뭔가 이상
  ],
} as const;

export type ReasonTagCategory = keyof typeof REASON_TAGS;
export type ReasonTag = (typeof REASON_TAGS)[ReasonTagCategory][number];

/** All reason tags as a flat array for UI rendering */
export const ALL_REASON_TAGS: { tag: ReasonTag; category: ReasonTagCategory }[] =
  (Object.entries(REASON_TAGS) as [ReasonTagCategory, readonly ReasonTag[]][]).flatMap(
    ([category, tags]) => tags.map(tag => ({ tag, category }))
  );

// ─── Arena War Phase ────────────────────────────────────────

export type ArenaWarPhase =
  | 'SETUP'         // Phase 1: Pair/TF/Wager 선택 (10s)
  | 'DRAFT'         // Phase 1.5: 밴/픽 에이전트 드래프트 (draft 모드)
  | 'AI_ANALYZE'    // Phase 2: C02 파이프라인 실행 (8s)
  | 'HUMAN_CALL'    // Phase 3: 인간의 결정 (45s) — 핵심 데이터 생산
  | 'REVEAL'        // Phase 4: 최종 확인 (3s)
  | 'BATTLE'        // Phase 5: 실시간 캔들 전투 (2min, 24캔들)
  | 'JUDGE'         // Phase 6: FBS 점수 연출 (3s)
  | 'RESULT';       // Phase 7: 피드백 + 리매치

export type ArenaWarMode = 'pvai' | 'spectator' | 'draft';

// ─── Consensus Types ────────────────────────────────────────

export type ConsensusType = 'consensus' | 'partial' | 'dissent' | 'override';

// ─── ORPO Pair Quality ──────────────────────────────────────

export type PairQuality = 'strong' | 'medium' | 'weak' | 'boundary' | 'noise';

// ─── Human Delta (AI 해석과의 차이) ─────────────────────────

export interface HumanDelta {
  sameDirection: boolean;        // AI와 같은 방향인가
  confidenceDiff: number;        // 인간 확신도 - AI 확신도
  tpDiff: number;                // TP 차이 (%)
  slDiff: number;                // SL 차이 (%)
  /** AI가 bullish/bearish로 본 팩터 중 인간이 반대 판단한 것 */
  disagreedFactors: string[];
  /** 인간이 특히 중시한 팩터 (reasonTags에서 추론) */
  emphasizedFactors: string[];
}

// ─── Battle Action ──────────────────────────────────────────

export type BattleActionType = 'HOLD' | 'ADJUST_TP' | 'ADJUST_SL' | 'CUT';

export interface BattleAction {
  checkpoint: number;           // 캔들 번호
  action: BattleActionType;
  newValue?: number;
  priceAtAction: number;
  unrealizedPnl: number;
}

// ─── Decision Snapshot (ORPO pair용) ────────────────────────

export interface DecisionSnapshot {
  direction: Direction;
  confidence: number;
  entryPrice: number;
  tp: number;
  sl: number;
  reasonTags: string[];
  topFactors: { factorId: string; value: number }[];
}

// ─── Context Snapshot (ORPO pair용) ─────────────────────────

export interface ContextSnapshot {
  pair: string;
  timeframe: string;
  regime: MarketRegime;
  factorSignature: number[];
  detectedPatterns: string[];
  dataCompleteness: number;
}

// ─── ORPO Pair ──────────────────────────────────────────────

export interface OrpoPair {
  chosen: DecisionSnapshot;      // 승자의 결정
  rejected: DecisionSnapshot;    // 패자의 결정
  context: ContextSnapshot;
  margin: number;                // FBS 차이 (pair 강도)
  quality: PairQuality;
  consensusType: ConsensusType;
}

// ─── RAG Entry ──────────────────────────────────────────────

export interface RAGEntry {
  patternSignature: string;
  embedding: number[];           // 256d 벡터
  regime: MarketRegime;
  pair: string;
  timeframe: string;

  humanDecision: {
    direction: Direction;
    confidence: number;
    reasonTags: string[];
    tp: number;
    sl: number;
  };
  aiDecision: {
    direction: Direction;
    confidence: number;
    topFactors: string[];
  };
  outcome: {
    winner: 'human' | 'ai' | 'draw';
    humanFBS: number;
    aiFBS: number;
    priceChange: number;
  };
  lesson: string;

  quality: PairQuality;
  timestamp: number;
  gameRecordId: string;
}

// ─── RAG Recall (AI가 참고한 과거 데이터) ───────────────────

export interface RAGRecall {
  queriedPatterns: string[];
  similarGamesFound: number;
  historicalWinRate: number;
  suggestedDirection: Direction;
  confidenceAdjustment: number;
}

// ─── Decision Memory Types (Paper 1 + Paper 2 기반) ────────

/** 모든 RAG 소스 유형 */
export type DecisionMemorySource =
  | 'arena_war'
  | 'terminal_scan'
  | 'opportunity_scan'
  | 'quick_trade_open'
  | 'quick_trade_close'
  | 'signal_action';

/** 에이전트별 세분화 시그널 (Paper 2: fine-grained) */
export interface AgentSignal {
  vote: string;           // 'long' | 'short' | 'neutral'
  confidence: number;     // 0-100
  note?: string;
}

/** Decision Chain maturation 결과 */
export interface ChainMatureResult {
  updatedCount: number;
  chainId: string;
  outcomeType: string;
  outcomeValue: number;
}

/** QuickTrade RAG 저장 입력 */
export interface QuickTradeRAGInput {
  tradeId: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  currentPrice: number;
  tp: number | null;
  sl: number | null;
  source: string;
  note?: string;
}

/** Signal Action RAG 저장 입력 */
export interface SignalActionRAGInput {
  actionId: string;
  pair: string;
  dir: string;
  actionType: string;
  source: string;
  confidence: number | null;
}

// ─── Factor Conflict ────────────────────────────────────────

export interface FactorConflict {
  orpoSays: Direction;
  ctxSays: Direction;
  conflictAgents: string[];
  resolution: string;
}

// ─── GameRecord — 매 판의 완전한 기록 ───────────────────────

export interface GameRecord {
  id: string;
  version: number;               // 스키마 버전 (데이터 관리)
  createdAt: number;

  // ═══ CONTEXT — 양쪽 모두에게 동일한 환경 ═══
  context: {
    pair: string;
    timeframe: string;
    regime: MarketRegime;
    klines: BinanceKline[];
    factors: FactorResult[];      // 48개 팩터 전체 스냅샷
    factorSignature: number[];    // top 10 팩터값 벡터 (RAG 검색키)
    detectedPatterns: string[];
    dataCompleteness: number;     // 0-1
  };

  // ═══ HUMAN — 플레이어의 모든 행동 ═══
  human: {
    direction: Direction;
    confidence: number;           // 0-100
    entryPrice: number;
    tp: number;
    sl: number;

    reasonTags: string[];
    reasonText?: string;

    delta: HumanDelta;

    thinkingTimeMs: number;
    directionChanges: number;
    firstDirection: Direction;

    battleActions: BattleAction[];
  };

  // ═══ AI — C02 파이프라인의 완전한 출력 ═══
  ai: {
    c02Result: C02Result;
    direction: Direction;
    confidence: number;
    entryPrice: number;
    tp: number;
    sl: number;

    ragRecall: RAGRecall | null;
    factorConflicts: FactorConflict | null;
  };

  // ═══ OUTCOME — 시장이 결정한 결과 ═══
  outcome: {
    exitPrice: number;
    priceChange: number;
    actualDirection: Direction;
    resolution: 'TP_HIT' | 'SL_HIT' | 'TIME_EXPIRY';

    humanPnl: number;
    aiPnl: number;
    humanFBS: FBScore;
    aiFBS: FBScore;
    winner: 'human' | 'ai' | 'draw';
    fbsMargin: number;
    consensusType: ConsensusType;
  };

  // ═══ DERIVED — 자동 생성되는 학습 데이터 ═══
  derived: {
    orpoPair: OrpoPair;
    ragEntry: RAGEntry;
    feedback: {
      immediate: string;
      calibrationDelta: number;
      newPatternDiscovered: boolean;
    };
  };
}

// ─── Wager ──────────────────────────────────────────────────

export type WagerAmount = 0 | 5 | 10 | 20;

// ─── Setup Config ───────────────────────────────────────────

export interface ArenaWarSetup {
  pair: string;
  timeframe: string;
  wager: WagerAmount;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * AI가 bullish/bearish로 본 팩터 중 인간이 반대 판단한 것을 계산.
 *
 * 핵심 논리:
 *   AI가 LONG인데 인간이 SHORT → AI의 bullish 팩터(value > 20) 중 top 5 = disagreed
 *   AI가 SHORT인데 인간이 LONG → AI의 bearish 팩터(value < -20) 중 top 5 = disagreed
 */
export function computeDisagreedFactors(
  aiFactors: FactorResult[],
  humanDir: Direction,
  aiDir: Direction
): string[] {
  if (humanDir === aiDir) return [];
  if (humanDir === 'NEUTRAL' || aiDir === 'NEUTRAL') return [];

  const threshold = 20;
  const aiPolarityFactors = aiFactors
    .filter(f => {
      if (aiDir === 'LONG') return f.value > threshold;
      if (aiDir === 'SHORT') return f.value < -threshold;
      return false;
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5);

  return aiPolarityFactors.map(f => f.factorId);
}

/**
 * reasonTags에서 인간이 중시한 팩터를 추론.
 *
 * 예: 'divergence' 태그 → RSI_DIVERGENCE, VOL_DIVERGENCE, OI_DIVERGENCE 팩터
 */
const TAG_TO_FACTORS: Record<string, string[]> = {
  trend_continuation: ['EMA_TREND', 'MTF_ALIGNMENT'],
  trend_reversal: ['EMA_TREND', 'RSI_TREND', 'BOS_CHOCH'],
  support_bounce: ['PRICE_STRUCTURE', 'ORDER_BLOCK', 'LIQUIDITY_POOL'],
  resistance_rejection: ['PRICE_STRUCTURE', 'ORDER_BLOCK', 'LIQUIDITY_POOL'],
  breakout: ['PRICE_STRUCTURE', 'VOL_TREND', 'DISPLACEMENT'],
  false_breakout: ['PRICE_STRUCTURE', 'LIQUIDITY_POOL', 'VOL_DIVERGENCE'],
  divergence: ['RSI_DIVERGENCE', 'VOL_DIVERGENCE', 'OI_DIVERGENCE'],
  volume_confirmation: ['CVD_TREND', 'BUY_SELL_RATIO', 'VOL_TREND'],
  ai_overconfident: [],
  ai_factor_conflict: [],
  ai_wrong_weight: [],
  guardian_underweight: [],
  ctx_overridden: ['EXCHANGE_FLOW', 'WHALE_ACTIVITY', 'FR_TREND', 'FG_TREND'],
  commander_wrong: [],
  panic_selling: ['FG_TREND', 'SOCIAL_SENTIMENT', 'LIQUIDATION_TREND'],
  fomo_buying: ['FG_TREND', 'SOCIAL_VOLUME', 'FR_TREND'],
  mean_reversion: ['RSI_TREND', 'MVRV_ZONE', 'NUPL_TREND'],
  squeeze_play: ['SQUEEZE_SIGNAL', 'FR_TREND', 'OI_PRICE_CONV'],
  contrarian: ['CONTRARIAN_SIGNAL', 'FG_TREND', 'SOCIAL_SENTIMENT'],
  gut_feeling: [],
  pattern_familiar: [],
  something_off: [],
};

export function computeEmphasizedFactors(reasonTags: string[]): string[] {
  const factorSet = new Set<string>();
  for (const tag of reasonTags) {
    const factors = TAG_TO_FACTORS[tag];
    if (factors) {
      factors.forEach(f => factorSet.add(f));
    }
  }
  return Array.from(factorSet);
}

/**
 * ORPO pair 품질 분류
 *
 * strong:   margin > 15 AND reasonTags >= 3 AND thinkingTime > 10s
 * medium:   margin > 8  AND reasonTags >= 1
 * boundary: margin <= 5  AND reasonTags differ
 * weak:     margin > 3
 * noise:    margin <= 3
 */
export function classifyPairQuality(
  margin: number,
  humanTags: string[],
  thinkingTimeMs: number,
  aiTags?: string[]
): PairQuality {
  if (margin > 15 && humanTags.length >= 3 && thinkingTimeMs > 10_000) return 'strong';
  if (margin > 8 && humanTags.length >= 1) return 'medium';
  if (margin <= 5 && humanTags.length > 0) return 'boundary';
  if (margin > 3) return 'weak';
  return 'noise';
}

/**
 * HumanDelta 자동 계산
 */
export function computeHumanDelta(
  humanDir: Direction,
  humanConf: number,
  humanTp: number,
  humanSl: number,
  humanEntry: number,
  humanReasonTags: string[],
  aiDir: Direction,
  aiConf: number,
  aiTp: number,
  aiSl: number,
  aiFactors: FactorResult[]
): HumanDelta {
  const tpDiff = humanEntry > 0
    ? ((humanTp - aiTp) / humanEntry) * 100
    : 0;
  const slDiff = humanEntry > 0
    ? ((humanSl - aiSl) / humanEntry) * 100
    : 0;

  return {
    sameDirection: humanDir === aiDir,
    confidenceDiff: humanConf - aiConf,
    tpDiff,
    slDiff,
    disagreedFactors: computeDisagreedFactors(aiFactors, humanDir, aiDir),
    emphasizedFactors: computeEmphasizedFactors(humanReasonTags),
  };
}

// ─── GameRecord V2 (Agent Forge Phase 6) ────────────────────
// Extended record with classify, MFE/MAE, failure analysis,
// and structured agent outputs for learning pipelines.

export interface GameRecordV2 {
  id: string;
  version: 2;
  createdAt: number;
  scenarioId: string;

  // Market context (auto-generated from OBSERVE + CLASSIFY)
  context: {
    pair: string;
    timeframe: string;
    marketState: MarketState;
    setupType: SetupType;
    regimeConfidence: number;
    factorSignature: number[];
  };

  // Agent consensus decision
  decision: {
    action: V4BattleAction;
    confidence: number;
    entryPrice?: number;
    stopLoss?: number;
    abstainReason?: string;
  };

  // Trade outcome (auto-computed from resolve)
  outcome: {
    pnl: number;
    rMultiple: number;
    mfe: number;
    mae: number;
    holdTicks: number;
    exitType: ExitType;
  };

  // Post-trade review (auto + semi-auto)
  review: {
    quality: PairQuality;
    failureTags: FailureTag[];
    shouldHaveBeenNoTrade: boolean;
    lesson: string;
  };
}
