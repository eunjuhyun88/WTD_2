// ═══════════════════════════════════════════════════════════════
// WTD — Agent Engine v3: 8 Agent Pool Definitions
// ═══════════════════════════════════════════════════════════════
//
// 8개 에이전트 풀. 유저는 매 매치에서 3개를 드래프트한다.
// ─ OFFENSE (3): 방향 판단 특화
// ─ DEFENSE (3): 리스크 감지 특화
// ─ CONTEXT (2): 환경/매크로 분석
//
// 각 에이전트는 6개 Factor를 갖고, 4개 Spec(가중치 프리셋)을 제공.
// Spec 정의는 specs.ts에 분리.

import type { AgentDefinition, AgentId, FactorDefinition } from './types';

// ─── Factor Libraries ──────────────────────────────────────

const STRUCTURE_FACTORS: FactorDefinition[] = [
  { id: 'EMA_TREND',       name: 'EMA Trend',         description: 'EMA7-25 갭의 추세 — 기울기, 가속도, 크로스 감지' },
  { id: 'RSI_TREND',       name: 'RSI Trend',         description: 'RSI14 추세 방향 + 현재 구간(과매수/과매도/중립)' },
  { id: 'RSI_DIVERGENCE',  name: 'RSI Divergence',    description: '가격 vs RSI 다이버전스 (정규/히든)' },
  { id: 'MTF_ALIGNMENT',   name: 'MTF Alignment',     description: '1H/4H/1D 추세 정렬 여부' },
  { id: 'PRICE_STRUCTURE', name: 'Price Structure',   description: 'HH/HL vs LH/LL 구조 패턴' },
  { id: 'VOL_TREND',       name: 'Volume Trend',      description: '거래량 추세와 가격 방향 일치 여부' },
];

const VPA_FACTORS: FactorDefinition[] = [
  { id: 'CVD_TREND',       name: 'CVD Trend',         description: 'Cumulative Volume Delta 추세 — 매수/매도 우위' },
  { id: 'BUY_SELL_RATIO',  name: 'Buy/Sell Ratio',    description: '매수/매도 볼륨 비율의 추세 변화' },
  { id: 'VOL_PROFILE',     name: 'Volume Profile',    description: '볼륨 프로파일 POC, Value Area 위치' },
  { id: 'ABSORPTION',      name: 'Absorption',        description: '매수/매도 흡수 패턴 — 가격 정체 + 볼륨 급증' },
  { id: 'VOL_DIVERGENCE',  name: 'Volume Divergence', description: '가격 vs 거래량 다이버전스' },
  { id: 'CLIMAX_SIGNAL',   name: 'Climax Signal',     description: '볼륨 클라이맥스 감지 — 소진 신호' },
];

const ICT_FACTORS: FactorDefinition[] = [
  { id: 'LIQUIDITY_POOL',    name: 'Liquidity Pool',    description: '유동성 풀 위치 + 가격 접근도 (스탑헌팅 타겟)' },
  { id: 'FVG',               name: 'Fair Value Gap',    description: 'FVG 존재 여부 + 방향 + 채워짐 상태' },
  { id: 'ORDER_BLOCK',       name: 'Order Block',       description: '오더블록 위치 + 현재 가격과의 관계' },
  { id: 'BOS_CHOCH',         name: 'BOS / CHoCH',       description: 'Break of Structure / Change of Character 감지' },
  { id: 'DISPLACEMENT',      name: 'Displacement',      description: '변위 캔들 — 강한 모멘텀 발생' },
  { id: 'PREMIUM_DISCOUNT',  name: 'Premium/Discount',  description: '프리미엄/디스카운트 존 판별' },
];

const DERIV_FACTORS: FactorDefinition[] = [
  { id: 'OI_PRICE_CONV',     name: 'OI-Price Conv.',    description: 'OI 추세 + 가격 추세의 수렴/발산' },
  { id: 'FR_TREND',          name: 'Funding Rate Trend', description: '펀딩비 추세 — 과열 방향, 전환점' },
  { id: 'LIQUIDATION_TREND', name: 'Liquidation Trend', description: '청산 추세 — 롱/숏 청산 비율' },
  { id: 'LS_RATIO_TREND',    name: 'L/S Ratio Trend',   description: '롱숏비율 추세 변화' },
  { id: 'OI_DIVERGENCE',     name: 'OI Divergence',     description: 'OI vs 가격 다이버전스' },
  { id: 'SQUEEZE_SIGNAL',    name: 'Squeeze Signal',    description: '스퀴즈 가능성 — FR 극단 + OI 집중' },
];

const VALUATION_FACTORS: FactorDefinition[] = [
  { id: 'MVRV_ZONE',           name: 'MVRV Zone',         description: 'Market Value to Realized Value 구간' },
  { id: 'NUPL_TREND',          name: 'NUPL Trend',        description: 'Net Unrealized Profit/Loss 추세' },
  { id: 'SOPR_SIGNAL',         name: 'SOPR Signal',       description: 'Spent Output Profit Ratio 신호' },
  { id: 'CYCLE_POSITION',      name: 'Cycle Position',    description: '현재 비트코인 사이클 위치 추정' },
  { id: 'REALIZED_CAP_TREND',  name: 'Realized Cap Trend', description: 'Realized Cap 변화 추세' },
  { id: 'SUPPLY_PROFIT',       name: 'Supply in Profit',  description: '수익권 공급량 비율 추세' },
];

const FLOW_FACTORS: FactorDefinition[] = [
  { id: 'EXCHANGE_FLOW',     name: 'Exchange Flow',     description: '거래소 순유출입 추세' },
  { id: 'WHALE_ACTIVITY',    name: 'Whale Activity',    description: '대형 트랜잭션(10M+) 빈도와 방향' },
  { id: 'MINER_FLOW',        name: 'Miner Flow',        description: '채굴자 유출입 추세' },
  { id: 'STABLECOIN_FLOW',   name: 'Stablecoin Flow',   description: '스테이블코인 공급량 변화 추세' },
  { id: 'ACTIVE_ADDRESSES',  name: 'Active Addresses',  description: '활성 주소 수 추세' },
  { id: 'ETF_FLOW',          name: 'ETF Flow',          description: 'BTC ETF 자금 유출입' },
];

const SENTI_FACTORS: FactorDefinition[] = [
  { id: 'FG_TREND',           name: 'F&G Trend',          description: 'Fear & Greed 추세 — 방향 + 절대값' },
  { id: 'SOCIAL_VOLUME',      name: 'Social Volume',      description: '소셜 미디어 언급량 추세' },
  { id: 'SOCIAL_SENTIMENT',   name: 'Social Sentiment',   description: '소셜 긍정/부정 비율 추세' },
  { id: 'NEWS_IMPACT',        name: 'News Impact',        description: '최근 뉴스 임팩트 및 방향' },
  { id: 'SEARCH_TREND',       name: 'Search Trend',       description: '구글 트렌드 / 검색량 추세' },
  { id: 'CONTRARIAN_SIGNAL',  name: 'Contrarian Signal',  description: '극단 센티먼트 역발상 신호' },
];

const MACRO_FACTORS: FactorDefinition[] = [
  { id: 'DXY_TREND',         name: 'DXY Trend',         description: '달러 인덱스 추세 (BTC와 역상관)' },
  { id: 'EQUITY_TREND',      name: 'Equity Trend',      description: 'S&P500/Nasdaq 추세 (BTC와 상관)' },
  { id: 'YIELD_TREND',       name: 'Yield Trend',       description: 'US10Y 금리 추세 — 유동성 영향' },
  { id: 'BTC_DOMINANCE',     name: 'BTC Dominance',     description: 'BTC 도미넌스 추세' },
  { id: 'STABLECOIN_MCAP',   name: 'Stablecoin MCap',   description: '스테이블코인 시총 추세 — 유동성 프록시' },
  { id: 'EVENT_PROXIMITY',   name: 'Event Proximity',   description: 'FOMC/CPI 등 매크로 이벤트 임박도' },
];

// ─── 8 Agent Definitions ───────────────────────────────────

export const AGENT_POOL: Record<AgentId, AgentDefinition> = {
  // ═══ OFFENSE — 방향 판단 특화 ═══

  STRUCTURE: {
    id: 'STRUCTURE',
    name: 'STRUCTURE',
    nameKR: '차트구조',
    icon: '📊',
    color: '#3b9eff',
    role: 'OFFENSE',
    description: 'Chart structure analysis — EMA trends, RSI divergences, multi-timeframe alignment, price structure patterns',
    descriptionKR: '차트 구조 분석 — EMA 추세, RSI 다이버전스, 멀티타임프레임 정렬, 가격 구조 패턴',
    factors: STRUCTURE_FACTORS,
    specs: [],  // specs.ts에서 연결
  },

  VPA: {
    id: 'VPA',
    name: 'VPA',
    nameKR: '볼륨분석',
    icon: '📈',
    color: '#22d3ee',
    role: 'OFFENSE',
    description: 'Volume Price Analysis — CVD trends, buy/sell ratios, volume profile, absorption patterns, climax signals',
    descriptionKR: '볼륨 가격 분석 — CVD 추세, 매수매도 비율, 볼륨 프로파일, 흡수 패턴, 클라이맥스 신호',
    factors: VPA_FACTORS,
    specs: [],
  },

  ICT: {
    id: 'ICT',
    name: 'ICT',
    nameKR: '스마트머니',
    icon: '⚡',
    color: '#f59e0b',
    role: 'OFFENSE',
    description: 'ICT Smart Money Concepts — liquidity pools, FVG, order blocks, BOS/CHoCH, displacement candles',
    descriptionKR: 'ICT 스마트머니 컨셉 — 유동성풀, FVG, 오더블록, BOS/CHoCH, 변위 캔들',
    factors: ICT_FACTORS,
    specs: [],
  },

  // ═══ DEFENSE — 리스크 감지 특화 ═══

  DERIV: {
    id: 'DERIV',
    name: 'DERIV',
    nameKR: '파생상품',
    icon: '💰',
    color: '#ff8c3b',
    role: 'DEFENSE',
    description: 'Derivatives analysis — OI trends, funding rate, liquidation cascades, long/short ratios, squeeze detection',
    descriptionKR: '파생상품 분석 — OI 추세, 펀딩비, 청산 캐스케이드, 롱숏 비율, 스퀴즈 감지',
    factors: DERIV_FACTORS,
    specs: [],
  },

  VALUATION: {
    id: 'VALUATION',
    name: 'VALUATION',
    nameKR: '밸류에이션',
    icon: '💎',
    color: '#a78bfa',
    role: 'DEFENSE',
    description: 'On-chain valuation — MVRV, NUPL, SOPR, cycle position, realized cap trends',
    descriptionKR: '온체인 밸류에이션 — MVRV, NUPL, SOPR, 사이클 위치, 실현시총 추세',
    factors: VALUATION_FACTORS,
    specs: [],
  },

  FLOW: {
    id: 'FLOW',
    name: 'FLOW',
    nameKR: '자금흐름',
    icon: '🐋',
    color: '#00e68a',
    role: 'DEFENSE',
    description: 'On-chain fund flows — exchange flows, whale activity, miner flows, stablecoin supply, ETF flows',
    descriptionKR: '온체인 자금 흐름 — 거래소 유출입, 고래 활동, 채굴자 흐름, 스테이블코인, ETF 흐름',
    factors: FLOW_FACTORS,
    specs: [],
  },

  // ═══ CONTEXT — 환경/매크로 ═══

  SENTI: {
    id: 'SENTI',
    name: 'SENTI',
    nameKR: '센티먼트',
    icon: '🧠',
    color: '#8b5cf6',
    role: 'CONTEXT',
    description: 'Sentiment analysis — Fear & Greed trends, social volume, social sentiment, news impact, contrarian signals',
    descriptionKR: '센티먼트 분석 — 공포탐욕 추세, 소셜 볼륨, 소셜 감성, 뉴스 임팩트, 역발상 신호',
    factors: SENTI_FACTORS,
    specs: [],
  },

  MACRO: {
    id: 'MACRO',
    name: 'MACRO',
    nameKR: '매크로',
    icon: '🌍',
    color: '#f43f5e',
    role: 'CONTEXT',
    description: 'Macro analysis — DXY, equity markets, yields, BTC dominance, stablecoin market cap, event proximity',
    descriptionKR: '매크로 분석 — DXY, 주식시장, 금리, BTC 도미넌스, 스테이블코인 시총, 이벤트 임박도',
    factors: MACRO_FACTORS,
    specs: [],
  },
};

// ─── Helpers ────────────────────────────────────────────────

/** FE 소문자 ID → 엔진 대문자 ID 정규화 (F-01) */
export function normalizeAgentId(id: string): AgentId {
  const upper = id.toUpperCase() as AgentId;
  if (!(upper in AGENT_POOL)) {
    throw new Error(`[agents] Unknown agent ID: ${id}`);
  }
  return upper;
}

/** 에이전트 ID로 정의 조회 (대소문자 무관) */
export function getAgent(id: string): AgentDefinition {
  return AGENT_POOL[normalizeAgentId(id)];
}

/** 역할별 에이전트 목록 */
export function getAgentsByRole(role: AgentDefinition['role']): AgentDefinition[] {
  return Object.values(AGENT_POOL).filter(a => a.role === role);
}

/** 전체 에이전트 배열 (UI 렌더링용) */
export function getAllAgents(): AgentDefinition[] {
  return Object.values(AGENT_POOL);
}

/** 에이전트의 팩터 ID 목록 (대소문자 무관) */
export function getFactorIds(agentId: string): string[] {
  return AGENT_POOL[normalizeAgentId(agentId)].factors.map(f => f.id);
}
