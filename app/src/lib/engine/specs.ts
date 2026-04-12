// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Agent Engine v3: 32 Spec Definitions
// ═══════════════════════════════════════════════════════════════
//
// 8 에이전트 × 4 Spec = 32개 Spec.
// Spec은 "강해지는 것"이 아니라 "달라지는 것" (사이드그레이드).
//
// 해금 조건:
//   base — 처음부터 사용 가능
//   a    — 해당 에이전트 10전 후 (b와 동시 해금)
//   b    — 해당 에이전트 10전 후 (a와 동시 해금)
//   c    — 해당 에이전트 30전 후
//
// weights: factorId → 가중치 (합계 = 1.0)
// weakness: 이 Spec이 약한 시장 상황 설명

import type { SpecDefinition, AgentId } from './types';

// ─── STRUCTURE Specs (차트 구조) ────────────────────────────

const STRUCTURE_SPECS: SpecDefinition[] = [
  {
    id: 'structure_base',
    name: 'Balanced',
    nameKR: '균형 차트분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced chart analysis across all structural factors',
    descriptionKR: '모든 구조 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      EMA_TREND: 0.20, RSI_TREND: 0.15, RSI_DIVERGENCE: 0.15,
      MTF_ALIGNMENT: 0.20, PRICE_STRUCTURE: 0.15, VOL_TREND: 0.15,
    },
  },
  {
    id: 'structure_trend_rider',
    name: 'Trend Rider',
    nameKR: '추세 라이더',
    tier: 'a',
    unlockMatches: 10,
    description: 'Slope + MTF focused — fast trend capture, weak in ranging markets',
    descriptionKR: '기울기와 멀티TF 집중 — 빠른 추세 포착, 횡보장에 약함',
    weakness: '횡보장에서 거짓 신호 많음. 추세 없으면 혼란',
    weights: {
      EMA_TREND: 0.35, RSI_TREND: 0.10, RSI_DIVERGENCE: 0.05,
      MTF_ALIGNMENT: 0.30, PRICE_STRUCTURE: 0.10, VOL_TREND: 0.10,
    },
  },
  {
    id: 'structure_mapper',
    name: 'Structure Mapper',
    nameKR: '구조 매퍼',
    tier: 'b',
    unlockMatches: 10,
    description: 'HH/HL structure focused — detects structural shifts, slow but accurate',
    descriptionKR: 'HH/HL 구조 집중 — 구조 전환 감지, 느리지만 정확',
    weakness: '빠른 모멘텀 장에서 느린 반응. 구조 형성 전에는 신호 없음',
    weights: {
      EMA_TREND: 0.10, RSI_TREND: 0.10, RSI_DIVERGENCE: 0.15,
      MTF_ALIGNMENT: 0.15, PRICE_STRUCTURE: 0.35, VOL_TREND: 0.15,
    },
  },
  {
    id: 'structure_reversal_catcher',
    name: 'Reversal Catcher',
    nameKR: '반전 캐처',
    tier: 'c',
    unlockMatches: 30,
    description: 'Divergence + structure reversal focused — catches reversals, weak in strong trends',
    descriptionKR: '다이버전스 + 구조 반전 집중 — 반전 포착, 강한 추세장에 약함',
    weakness: '강한 추세에서 역행 포지션 → 대형 손실 가능. 인내 필요',
    weights: {
      EMA_TREND: 0.10, RSI_TREND: 0.15, RSI_DIVERGENCE: 0.35,
      MTF_ALIGNMENT: 0.10, PRICE_STRUCTURE: 0.20, VOL_TREND: 0.10,
    },
  },
];

// ─── VPA Specs (볼륨 가격 분석) ─────────────────────────────

const VPA_SPECS: SpecDefinition[] = [
  {
    id: 'vpa_base',
    name: 'Balanced',
    nameKR: '균형 볼륨분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced volume-price analysis across all VPA factors',
    descriptionKR: '모든 볼륨 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      CVD_TREND: 0.20, BUY_SELL_RATIO: 0.15, VOL_PROFILE: 0.15,
      ABSORPTION: 0.20, VOL_DIVERGENCE: 0.15, CLIMAX_SIGNAL: 0.15,
    },
  },
  {
    id: 'vpa_volume_surge',
    name: 'Volume Surge',
    nameKR: '볼륨 서지',
    tier: 'a',
    unlockMatches: 10,
    description: 'CVD + Climax focused — detects abnormal volume events, misses quiet accumulation',
    descriptionKR: 'CVD + 클라이맥스 집중 — 이상 거래량 감지, 조용한 축적 놓침',
    weakness: '저볼륨 축적/분배 구간에서 신호 없음. 노이즈에 민감',
    weights: {
      CVD_TREND: 0.30, BUY_SELL_RATIO: 0.10, VOL_PROFILE: 0.10,
      ABSORPTION: 0.10, VOL_DIVERGENCE: 0.10, CLIMAX_SIGNAL: 0.30,
    },
  },
  {
    id: 'vpa_absorption_reader',
    name: 'Absorption Reader',
    nameKR: '흡수 리더',
    tier: 'b',
    unlockMatches: 10,
    description: 'Absorption + Volume Profile focused — reads institutional accumulation/distribution',
    descriptionKR: '흡수 + 볼륨 프로파일 집중 — 기관 축적/분배 판독',
    weakness: '급등/급락 시 흡수 패턴이 무의미. 이벤트 드리븐 장에 약함',
    weights: {
      CVD_TREND: 0.10, BUY_SELL_RATIO: 0.10, VOL_PROFILE: 0.30,
      ABSORPTION: 0.30, VOL_DIVERGENCE: 0.10, CLIMAX_SIGNAL: 0.10,
    },
  },
  {
    id: 'vpa_climax_detector',
    name: 'Climax Detector',
    nameKR: '클라이맥스 디텍터',
    tier: 'c',
    unlockMatches: 30,
    description: 'Climax + Volume Divergence focused — exhaustion signals, false positives in momentum',
    descriptionKR: '클라이맥스 + 볼륨 다이버전스 집중 — 소진 신호 감지, 모멘텀장에서 오신호',
    weakness: '강한 모멘텀에서 계속 "소진" 신호 → 역행 포지션 위험',
    weights: {
      CVD_TREND: 0.10, BUY_SELL_RATIO: 0.10, VOL_PROFILE: 0.10,
      ABSORPTION: 0.10, VOL_DIVERGENCE: 0.30, CLIMAX_SIGNAL: 0.30,
    },
  },
];

// ─── ICT Specs (스마트머니) ─────────────────────────────────

const ICT_SPECS: SpecDefinition[] = [
  {
    id: 'ict_base',
    name: 'Balanced',
    nameKR: '균형 ICT분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced ICT Smart Money analysis across all concepts',
    descriptionKR: '모든 ICT 컨셉을 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      LIQUIDITY_POOL: 0.20, FVG: 0.15, ORDER_BLOCK: 0.20,
      BOS_CHOCH: 0.15, DISPLACEMENT: 0.15, PREMIUM_DISCOUNT: 0.15,
    },
  },
  {
    id: 'ict_liquidity_raider',
    name: 'Liquidity Raider',
    nameKR: '유동성 레이더',
    tier: 'a',
    unlockMatches: 10,
    description: 'Liquidity pool + Displacement focused — stop hunt detection, slow in trending',
    descriptionKR: '유동성풀 + 변위 캔들 집중 — 스탑헌팅 감지, 추세장에서 느림',
    weakness: '깨끗한 추세장에서 스탑헌팅이 없으면 신호 부족',
    weights: {
      LIQUIDITY_POOL: 0.35, FVG: 0.05, ORDER_BLOCK: 0.10,
      BOS_CHOCH: 0.10, DISPLACEMENT: 0.30, PREMIUM_DISCOUNT: 0.10,
    },
  },
  {
    id: 'ict_fair_value_sniper',
    name: 'Fair Value Sniper',
    nameKR: '페어밸류 스나이퍼',
    tier: 'b',
    unlockMatches: 10,
    description: 'FVG + Premium/Discount zone focused — precise entries, misses breakouts',
    descriptionKR: 'FVG + 프리미엄/디스카운트 존 집중 — 정밀 진입, 돌파 놓침',
    weakness: '강한 돌파장에서 되돌림을 기다리다 진입 기회 놓침',
    weights: {
      LIQUIDITY_POOL: 0.10, FVG: 0.30, ORDER_BLOCK: 0.10,
      BOS_CHOCH: 0.10, DISPLACEMENT: 0.10, PREMIUM_DISCOUNT: 0.30,
    },
  },
  {
    id: 'ict_market_maker_model',
    name: 'Market Maker Model',
    nameKR: '마켓메이커 모델',
    tier: 'c',
    unlockMatches: 30,
    description: 'Order Block + BOS/CHoCH focused — accumulation/distribution phases, complex signals',
    descriptionKR: '오더블록 + BOS/CHoCH 집중 — 축적/분배 단계 감지, 복잡한 신호',
    weakness: '빠른 변동성 장에서 구조 형성이 불분명. 해석 어려움',
    weights: {
      LIQUIDITY_POOL: 0.10, FVG: 0.05, ORDER_BLOCK: 0.30,
      BOS_CHOCH: 0.30, DISPLACEMENT: 0.15, PREMIUM_DISCOUNT: 0.10,
    },
  },
];

// ─── DERIV Specs (파생상품) ─────────────────────────────────

const DERIV_SPECS: SpecDefinition[] = [
  {
    id: 'deriv_base',
    name: 'Balanced',
    nameKR: '균형 파생분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced derivatives analysis across OI, funding, liquidations',
    descriptionKR: '모든 파생상품 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      OI_PRICE_CONV: 0.20, FR_TREND: 0.15, LIQUIDATION_TREND: 0.15,
      LS_RATIO_TREND: 0.15, OI_DIVERGENCE: 0.15, SQUEEZE_SIGNAL: 0.20,
    },
  },
  {
    id: 'deriv_squeeze_hunter',
    name: 'Squeeze Hunter',
    nameKR: '스퀴즈 헌터',
    tier: 'a',
    unlockMatches: 10,
    description: 'Squeeze + Liquidation focused — cascade detection, false positives in calm markets',
    descriptionKR: '스퀴즈 + 청산 집중 — 청산 캐스케이드 감지, 조용한 장에서 오신호',
    weakness: '안정적인 시장에서 스퀴즈 신호 과다 → 잦은 거짓 경보',
    weights: {
      OI_PRICE_CONV: 0.10, FR_TREND: 0.10, LIQUIDATION_TREND: 0.25,
      LS_RATIO_TREND: 0.10, OI_DIVERGENCE: 0.10, SQUEEZE_SIGNAL: 0.35,
    },
  },
  {
    id: 'deriv_position_reader',
    name: 'Position Reader',
    nameKR: '포지션 리더',
    tier: 'b',
    unlockMatches: 10,
    description: 'OI structure + OI divergence focused — institutional positioning, late signals',
    descriptionKR: 'OI 구조 + OI 다이버전스 집중 — 기관 포지셔닝 읽기, 늦은 신호',
    weakness: '빠른 가격 변동 시 OI 데이터 지연. 단기 트레이딩에 부적합',
    weights: {
      OI_PRICE_CONV: 0.30, FR_TREND: 0.10, LIQUIDATION_TREND: 0.10,
      LS_RATIO_TREND: 0.10, OI_DIVERGENCE: 0.30, SQUEEZE_SIGNAL: 0.10,
    },
  },
  {
    id: 'deriv_contrarian',
    name: 'Contrarian',
    nameKR: '역발상',
    tier: 'c',
    unlockMatches: 30,
    description: 'Funding rate + L/S ratio focused — crowd fading, dangerous in strong consensus',
    descriptionKR: '펀딩비 + 롱숏비 집중 — 군중 역이용, 강한 컨센서스에서 위험',
    weakness: '시장 컨센서스가 옳을 때 역행 → 큰 손실. 타이밍이 생명',
    weights: {
      OI_PRICE_CONV: 0.10, FR_TREND: 0.30, LIQUIDATION_TREND: 0.10,
      LS_RATIO_TREND: 0.30, OI_DIVERGENCE: 0.10, SQUEEZE_SIGNAL: 0.10,
    },
  },
];

// ─── VALUATION Specs (밸류에이션) ────────────────────────────

const VALUATION_SPECS: SpecDefinition[] = [
  {
    id: 'valuation_base',
    name: 'Balanced',
    nameKR: '균형 밸류분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced on-chain valuation analysis across all metrics',
    descriptionKR: '모든 밸류에이션 지표를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      MVRV_ZONE: 0.20, NUPL_TREND: 0.15, SOPR_SIGNAL: 0.15,
      CYCLE_POSITION: 0.20, REALIZED_CAP_TREND: 0.15, SUPPLY_PROFIT: 0.15,
    },
  },
  {
    id: 'valuation_cycle_timer',
    name: 'Cycle Timer',
    nameKR: '사이클 타이머',
    tier: 'a',
    unlockMatches: 10,
    description: 'Cycle position + MVRV focused — macro tops/bottoms, useless mid-cycle',
    descriptionKR: '사이클 위치 + MVRV 집중 — 대주기 고/저점 포착, 사이클 중간에 무의미',
    weakness: '사이클 중간 구간에서 방향 판단 불가. 장기 관점 전용',
    weights: {
      MVRV_ZONE: 0.30, NUPL_TREND: 0.10, SOPR_SIGNAL: 0.10,
      CYCLE_POSITION: 0.30, REALIZED_CAP_TREND: 0.10, SUPPLY_PROFIT: 0.10,
    },
  },
  {
    id: 'valuation_profit_tracker',
    name: 'Profit Tracker',
    nameKR: '수익 추적자',
    tier: 'b',
    unlockMatches: 10,
    description: 'SOPR + Supply in Profit focused — realized profit/loss flows, lagging',
    descriptionKR: 'SOPR + 수익권 공급 집중 — 실현 손익 흐름 추적, 후행성',
    weakness: '가격 선행 움직임에 늦게 반응. 이미 움직인 후 확인',
    weights: {
      MVRV_ZONE: 0.10, NUPL_TREND: 0.10, SOPR_SIGNAL: 0.30,
      CYCLE_POSITION: 0.10, REALIZED_CAP_TREND: 0.10, SUPPLY_PROFIT: 0.30,
    },
  },
  {
    id: 'valuation_fair_value_band',
    name: 'Fair Value Band',
    nameKR: '적정가 밴드',
    tier: 'c',
    unlockMatches: 30,
    description: 'Realized Cap + NUPL focused — fair value deviation detection, slow in fast markets',
    descriptionKR: '실현시총 + NUPL 집중 — 적정가 이탈 감지, 빠른 장에서 느림',
    weakness: '급격한 가격 변동 시 적정가 밴드 자체가 이동. 엥커 없음',
    weights: {
      MVRV_ZONE: 0.10, NUPL_TREND: 0.25, SOPR_SIGNAL: 0.10,
      CYCLE_POSITION: 0.10, REALIZED_CAP_TREND: 0.30, SUPPLY_PROFIT: 0.15,
    },
  },
];

// ─── FLOW Specs (자금 흐름) ─────────────────────────────────

const FLOW_SPECS: SpecDefinition[] = [
  {
    id: 'flow_base',
    name: 'Balanced',
    nameKR: '균형 자금분석',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced fund flow analysis across exchange, whale, and on-chain metrics',
    descriptionKR: '모든 자금 흐름 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      EXCHANGE_FLOW: 0.20, WHALE_ACTIVITY: 0.20, MINER_FLOW: 0.15,
      STABLECOIN_FLOW: 0.15, ACTIVE_ADDRESSES: 0.15, ETF_FLOW: 0.15,
    },
  },
  {
    id: 'flow_whale_follower',
    name: 'Whale Follower',
    nameKR: '고래 추종자',
    tier: 'a',
    unlockMatches: 10,
    description: 'Whale + Miner flow focused — follows smart money, can be front-run bait',
    descriptionKR: '고래 + 채굴자 흐름 집중 — 스마트머니 추종, 미끼에 걸릴 수 있음',
    weakness: '고래가 의도적으로 추종자를 유인하는 경우 대형 손실',
    weights: {
      EXCHANGE_FLOW: 0.10, WHALE_ACTIVITY: 0.35, MINER_FLOW: 0.25,
      STABLECOIN_FLOW: 0.10, ACTIVE_ADDRESSES: 0.10, ETF_FLOW: 0.10,
    },
  },
  {
    id: 'flow_exchange_flow',
    name: 'Exchange Flow',
    nameKR: '거래소 흐름',
    tier: 'b',
    unlockMatches: 10,
    description: 'Exchange + Stablecoin flow focused — liquidity movement tracking, delayed signals',
    descriptionKR: '거래소 + 스테이블코인 흐름 집중 — 유동성 이동 추적, 지연 신호',
    weakness: '거래소간 이동이 유출입으로 잘못 해석될 수 있음',
    weights: {
      EXCHANGE_FLOW: 0.30, WHALE_ACTIVITY: 0.10, MINER_FLOW: 0.10,
      STABLECOIN_FLOW: 0.30, ACTIVE_ADDRESSES: 0.10, ETF_FLOW: 0.10,
    },
  },
  {
    id: 'flow_smart_money',
    name: 'Smart Money',
    nameKR: '스마트머니',
    tier: 'c',
    unlockMatches: 30,
    description: 'Active Addresses + ETF flow focused — institutional & retail activity divergence',
    descriptionKR: '활성주소 + ETF 흐름 집중 — 기관 vs 개인 활동 괴리 감지',
    weakness: 'ETF 시장이 비활성일 때 (주말/휴일) 신호 반감. 미국 중심 편향',
    weights: {
      EXCHANGE_FLOW: 0.10, WHALE_ACTIVITY: 0.10, MINER_FLOW: 0.10,
      STABLECOIN_FLOW: 0.10, ACTIVE_ADDRESSES: 0.30, ETF_FLOW: 0.30,
    },
  },
];

// ─── SENTI Specs (센티먼트) ─────────────────────────────────

const SENTI_SPECS: SpecDefinition[] = [
  {
    id: 'senti_base',
    name: 'Balanced',
    nameKR: '균형 센티먼트',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced sentiment analysis across fear/greed, social, news factors',
    descriptionKR: '모든 센티먼트 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      FG_TREND: 0.20, SOCIAL_VOLUME: 0.15, SOCIAL_SENTIMENT: 0.20,
      NEWS_IMPACT: 0.15, SEARCH_TREND: 0.15, CONTRARIAN_SIGNAL: 0.15,
    },
  },
  {
    id: 'senti_crowd_reader',
    name: 'Crowd Reader',
    nameKR: '군중 리더',
    tier: 'a',
    unlockMatches: 10,
    description: 'Social Volume + Sentiment focused — follows crowd momentum, late to reversals',
    descriptionKR: '소셜볼륨 + 감성 집중 — 군중 모멘텀 추종, 반전에 늦음',
    weakness: '군중이 틀릴 때 함께 틀림. 극단적 합의에서 반전 놓침',
    weights: {
      FG_TREND: 0.10, SOCIAL_VOLUME: 0.30, SOCIAL_SENTIMENT: 0.30,
      NEWS_IMPACT: 0.10, SEARCH_TREND: 0.10, CONTRARIAN_SIGNAL: 0.10,
    },
  },
  {
    id: 'senti_fear_buyer',
    name: 'Fear Buyer',
    nameKR: '공포 매수자',
    tier: 'b',
    unlockMatches: 10,
    description: 'F&G + Contrarian focused — buys fear, sells greed, wrong timing possible',
    descriptionKR: '공포탐욕 + 역발상 집중 — 공포에 매수, 탐욕에 매도, 타이밍 실수 가능',
    weakness: '공포가 더 깊어지는 상황에서 조기 매수 → 물림. 바닥 확인 불가',
    weights: {
      FG_TREND: 0.30, SOCIAL_VOLUME: 0.05, SOCIAL_SENTIMENT: 0.10,
      NEWS_IMPACT: 0.10, SEARCH_TREND: 0.10, CONTRARIAN_SIGNAL: 0.35,
    },
  },
  {
    id: 'senti_narrative_tracker',
    name: 'Narrative Tracker',
    nameKR: '내러티브 추적자',
    tier: 'c',
    unlockMatches: 30,
    description: 'News + Search Trend focused — narrative momentum trading, noise-prone',
    descriptionKR: '뉴스 + 검색 트렌드 집중 — 내러티브 모멘텀 트레이딩, 노이즈 민감',
    weakness: '가짜 뉴스/루머에 민감. 내러티브 소진 타이밍 예측 불가',
    weights: {
      FG_TREND: 0.10, SOCIAL_VOLUME: 0.10, SOCIAL_SENTIMENT: 0.10,
      NEWS_IMPACT: 0.30, SEARCH_TREND: 0.30, CONTRARIAN_SIGNAL: 0.10,
    },
  },
];

// ─── MACRO Specs (매크로) ───────────────────────────────────

const MACRO_SPECS: SpecDefinition[] = [
  {
    id: 'macro_base',
    name: 'Balanced',
    nameKR: '균형 매크로',
    tier: 'base',
    unlockMatches: 0,
    description: 'Balanced macro analysis across DXY, equities, yields, dominance',
    descriptionKR: '모든 매크로 팩터를 균등하게 분석하는 기본형',
    weakness: '특화 영역 없이 모든 상황에서 평균적 성능',
    weights: {
      DXY_TREND: 0.20, EQUITY_TREND: 0.20, YIELD_TREND: 0.15,
      BTC_DOMINANCE: 0.15, STABLECOIN_MCAP: 0.15, EVENT_PROXIMITY: 0.15,
    },
  },
  {
    id: 'macro_risk_on_off',
    name: 'Risk On/Off',
    nameKR: '리스크온/오프',
    tier: 'a',
    unlockMatches: 10,
    description: 'Equity + DXY focused — risk appetite gauge, BTC may decouple from equities',
    descriptionKR: '주식시장 + 달러 집중 — 위험선호도 판단, BTC-주식 디커플링 위험',
    weakness: 'BTC가 주식/달러와 디커플링하는 구간에서 완전히 틀림',
    weights: {
      DXY_TREND: 0.30, EQUITY_TREND: 0.30, YIELD_TREND: 0.10,
      BTC_DOMINANCE: 0.10, STABLECOIN_MCAP: 0.10, EVENT_PROXIMITY: 0.10,
    },
  },
  {
    id: 'macro_liquidity_cycle',
    name: 'Liquidity Cycle',
    nameKR: '유동성 사이클',
    tier: 'b',
    unlockMatches: 10,
    description: 'Stablecoin MCap + Yield focused — global liquidity tracking, very slow signals',
    descriptionKR: '스테이블코인 시총 + 금리 집중 — 글로벌 유동성 추적, 매우 느린 신호',
    weakness: '단기 가격 변동과 무관. 수주~수개월 단위 관점이라 매치에서 미스매치',
    weights: {
      DXY_TREND: 0.10, EQUITY_TREND: 0.10, YIELD_TREND: 0.25,
      BTC_DOMINANCE: 0.10, STABLECOIN_MCAP: 0.30, EVENT_PROXIMITY: 0.15,
    },
  },
  {
    id: 'macro_event_trader',
    name: 'Event Trader',
    nameKR: '이벤트 트레이더',
    tier: 'c',
    unlockMatches: 30,
    description: 'Event proximity + DXY focused — FOMC/CPI event trading, useless between events',
    descriptionKR: '이벤트 임박도 + DXY 집중 — FOMC/CPI 이벤트 트레이딩, 이벤트 없으면 무용',
    weakness: '이벤트가 없는 기간에 완전히 무력. 이벤트 결과 예측 불가',
    weights: {
      DXY_TREND: 0.20, EQUITY_TREND: 0.10, YIELD_TREND: 0.10,
      BTC_DOMINANCE: 0.10, STABLECOIN_MCAP: 0.10, EVENT_PROXIMITY: 0.40,
    },
  },
];

// ─── All Specs Registry ─────────────────────────────────────

/** 에이전트별 Spec 목록 */
export const SPEC_REGISTRY: Record<AgentId, SpecDefinition[]> = {
  STRUCTURE:  STRUCTURE_SPECS,
  VPA:        VPA_SPECS,
  ICT:        ICT_SPECS,
  DERIV:      DERIV_SPECS,
  VALUATION:  VALUATION_SPECS,
  FLOW:       FLOW_SPECS,
  SENTI:      SENTI_SPECS,
  MACRO:      MACRO_SPECS,
};

/** 모든 Spec 플랫 배열 (32개) */
export const ALL_SPECS: SpecDefinition[] = Object.values(SPEC_REGISTRY).flat();

// ─── Helpers ────────────────────────────────────────────────

/** 특정 에이전트의 Spec 목록 (대소문자 무관) */
export function getSpecsForAgent(agentId: string): SpecDefinition[] {
  const key = agentId.toUpperCase() as AgentId;
  return SPEC_REGISTRY[key] ?? [];
}

/** 특정 Spec 조회 (agentId + specId, 대소문자 무관) */
export function getSpec(agentId: string, specId: string): SpecDefinition | undefined {
  const key = agentId.toUpperCase() as AgentId;
  return SPEC_REGISTRY[key]?.find(s => s.id === specId);
}

/** 해금 가능한 Spec 목록 (매치 수 기준, 대소문자 무관) */
export function getUnlockedSpecs(agentId: string, totalMatches: number): SpecDefinition[] {
  const key = agentId.toUpperCase() as AgentId;
  return SPEC_REGISTRY[key]?.filter(s => totalMatches >= s.unlockMatches) ?? [];
}

/** 다음 해금까지 남은 매치 수 */
export function getNextUnlockInfo(agentId: AgentId, totalMatches: number): {
  nextSpec: SpecDefinition | null;
  matchesRemaining: number;
} {
  const locked = SPEC_REGISTRY[agentId]
    ?.filter(s => totalMatches < s.unlockMatches)
    .sort((a, b) => a.unlockMatches - b.unlockMatches);

  if (!locked || locked.length === 0) {
    return { nextSpec: null, matchesRemaining: 0 };
  }

  return {
    nextSpec: locked[0],
    matchesRemaining: locked[0].unlockMatches - totalMatches,
  };
}

/** Spec의 가중치 합계 검증 (개발용) */
export function validateSpecWeights(): { specId: string; sum: number; valid: boolean }[] {
  return ALL_SPECS.map(spec => {
    const sum = Object.values(spec.weights).reduce((a, b) => a + b, 0);
    return {
      specId: spec.id,
      sum: Math.round(sum * 100) / 100,
      valid: Math.abs(sum - 1.0) < 0.01,
    };
  });
}
