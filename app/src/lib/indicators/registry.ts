/**
 * INDICATOR_REGISTRY — declarative metadata for all indicators.
 *
 * Add here to expose a new indicator to the UI.
 * The dispatcher (IndicatorRenderer.svelte) reads this at render time.
 *
 * Phase 1 entries: the set the UI needs *now* to replace hardcoded evidenceItems.
 * Phase 2 will register the remaining 70+ building blocks wholesale.
 */

import type { IndicatorDef, IndicatorFamily, IndicatorArchetype } from './types';

export const INDICATOR_REGISTRY: Record<string, IndicatorDef> = {
  // ── OI family ───────────────────────────────────────────────────
  oi_change_1h: {
    id: 'oi_change_1h',
    label: 'OI 1h',
    family: 'OI',
    archetype: 'A',
    dimensions: ['horizon', 'percentile'],
    source: { provider: 'coinalyze', endpoint: '/oi/delta?horizon=1h' },
    thresholds: { warn: 50, extreme: 90, historical: 98 },
    priority: 0,
    defaultVisible: true,
    unit: '%',
    relatedBlocks: ['oi_change', 'oi_acceleration', 'oi_hold_after_spike'],
    description: 'Open interest delta — 1h change; percentile vs 30-day distribution',
    aiSynonyms: ['oi', 'open interest', '오아이', '미결제약정', 'oi 1h', 'oi 변화'],
    aiExampleQueries: ['OI 보여줘', 'open interest 1h', 'OI 급증?'],
    alternateArchetypes: ['D'],
  },

  oi_change_4h: {
    id: 'oi_change_4h',
    label: 'OI 4h',
    family: 'OI',
    archetype: 'A',
    dimensions: ['horizon', 'percentile'],
    source: { provider: 'coinalyze', endpoint: '/oi/delta?horizon=4h' },
    thresholds: { warn: 50, extreme: 90, historical: 98 },
    priority: 1,
    defaultVisible: true,
    unit: '%',
    aiSynonyms: ['oi 4h', 'open interest 4h', '오아이 4h'],
    aiExampleQueries: ['OI 4h 어때?'],
    alternateArchetypes: ['D'],
  },

  oi_per_venue: {
    id: 'oi_per_venue',
    label: 'OI / venue',
    family: 'OI',
    archetype: 'F',
    dimensions: ['venue', 'horizon'],
    source: { provider: 'coinalyze', endpoint: '/oi/per-venue' },
    priority: 0,
    defaultVisible: true,
    unit: '%',
    relatedBlocks: [
      'oi_exchange_divergence',
      'venue_oi_divergence_bull',
      'venue_oi_divergence_bear',
      'isolated_venue_pump',
    ],
    description: 'OI change across Binance / Bybit / OKX — divergence = isolated leverage',
    aiSynonyms: ['oi venue', 'oi by exchange', 'exchange oi', 'venue oi divergence', '거래소별 oi'],
    aiExampleQueries: ['거래소별 OI 보여줘', 'venue oi divergence?'],
    alternateArchetypes: ['A'],
  },

  // ── Funding family ──────────────────────────────────────────────
  funding_rate: {
    id: 'funding_rate',
    label: 'Funding',
    family: 'Funding',
    archetype: 'A',
    dimensions: ['horizon', 'percentile', 'regime'],
    source: { provider: 'coinalyze', endpoint: '/funding' },
    thresholds: { warn: 60, extreme: 92, historical: 99 },
    priority: 0,
    defaultVisible: true,
    unit: '%',
    relatedBlocks: [
      'funding_extreme',
      'funding_flip',
      'positive_funding_bias',
      'negative_funding_bias',
    ],
    description: 'Perpetual funding rate — percentile vs 30d; regime-aware extreme bands',
    aiSynonyms: ['funding', 'funding rate', '펀딩', '펀딩율', 'fr', 'perp funding'],
    aiExampleQueries: ['펀딩 보여줘', 'funding rate 어때?', 'funding 지금 어느 수준?'],
    alternateArchetypes: ['F'],
  },

  funding_per_venue: {
    id: 'funding_per_venue',
    label: 'Funding / venue',
    family: 'Funding',
    archetype: 'F',
    dimensions: ['venue'],
    source: { provider: 'coinalyze', endpoint: '/funding/per-venue' },
    priority: 1,
    defaultVisible: true,
    unit: '%',
    relatedBlocks: ['venue_funding_spread_extreme'],
    aiSynonyms: ['venue funding', 'funding spread', 'funding per exchange', '거래소별 펀딩'],
    aiExampleQueries: ['거래소별 펀딩 차이?', 'funding spread 확인'],
    alternateArchetypes: ['A'],
  },

  // ── CVD family ──────────────────────────────────────────────────
  cvd_state: {
    id: 'cvd_state',
    label: 'CVD',
    family: 'CVD',
    archetype: 'D',
    dimensions: ['side'],
    source: { provider: 'derived' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 0,
    defaultVisible: true,
    unit: '',
    relatedBlocks: ['cvd_price_divergence', 'delta_flip_positive', 'delta_flip_negative'],
    description: 'Cumulative volume delta — divergence vs price is the alpha',
    aiSynonyms: ['cvd', 'cumulative volume delta', 'delta', '델타', '누적델타', 'volume delta'],
    aiExampleQueries: ['CVD 다이버전스?', 'delta 지금 어때', 'cvd 보여줘'],
    alternateArchetypes: ['A'],
  },

  // ── Volume family ───────────────────────────────────────────────
  volume_ratio: {
    id: 'volume_ratio',
    label: 'Vol',
    family: 'Volume',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'derived' },
    thresholds: { warn: 60, extreme: 90, historical: 98 },
    priority: 1,
    defaultVisible: true,
    unit: 'x',
    relatedBlocks: ['volume_spike', 'volume_dryup', 'volume_surge_bull', 'volume_surge_bear'],
    aiSynonyms: ['volume', 'vol', '거래량', 'volume ratio', '볼륨'],
    aiExampleQueries: ['거래량 체크', 'volume 이상 있어?'],
  },

  // ── Premium (Pillar 1 of our existing assets) ───────────────────
  coinbase_premium: {
    id: 'coinbase_premium',
    label: 'Coinbase Prem',
    family: 'Premium',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'derived' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 1,
    defaultVisible: false,
    unit: '%',
    relatedBlocks: ['coinbase_premium_positive', 'coinbase_premium_weak'],
    description: 'Coinbase–Binance price gap — US institutional bid proxy',
    aiSynonyms: ['coinbase premium', 'cb premium', 'cbp', '코인베이스 프리미엄', 'us premium'],
    aiExampleQueries: ['coinbase premium 지금?', 'US 기관 매수세 확인'],
    alternateArchetypes: ['D'],
  },

  // ── Liquidations (Pillar 1 — W-0122-B) ─────────────────────────
  liq_heatmap: {
    id: 'liq_heatmap',
    label: 'Liq map',
    family: 'Liquidations',
    archetype: 'C',
    dimensions: ['price_level', 'venue', 'side'],
    source: { provider: 'binance', stream: '!forceOrder@arr' },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: [
      'liq_zone_squeeze_setup',
      'liq_magnet_above',
      'liq_magnet_below',
      'multi_venue_liq_cascade',
    ],
    description: 'Liquidation clusters — price×time heatmap. Clusters act as magnets.',
    aiSynonyms: ['liq', 'liquidation', 'liq heatmap', '청산', '청산히트맵', 'liquidation map', 'liq cluster'],
    aiExampleQueries: ['청산 히트맵 보여줘', 'liq cluster 어디?', '청산 매그넷 확인'],
    alternateArchetypes: ['I'],
  },

  // ── Options (Pillar 2 — W-0122-C) ──────────────────────────────
  options_skew_25d: {
    id: 'options_skew_25d',
    label: 'Skew 25d',
    family: 'Options',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'deribit', endpoint: '/api/market/options-snapshot' },
    thresholds: { warn: 60, extreme: 90, historical: 98 },
    priority: 1,
    defaultVisible: true,
    unit: 'pts',
    relatedBlocks: ['skew_extreme_fear', 'skew_extreme_greed'],
    description: 'Deribit 25-delta skew proxy (OTM put IV − OTM call IV). Positive = fear priced in.',
    aiSynonyms: ['skew', '스큐', '25d skew', 'put call skew', 'options skew', 'iv skew', '변동성 스큐'],
    aiExampleQueries: ['skew 보여줘', '스큐 지금 어때?', '옵션 공포 측정'],
    alternateArchetypes: ['G'],
  },

  gamma_flip_level: {
    id: 'gamma_flip_level',
    label: 'Gamma flip',
    family: 'Options',
    archetype: 'E',
    dimensions: ['price_level', 'regime'],
    source: { provider: 'deribit', endpoint: '/options/gex' },
    priority: 0,
    defaultVisible: false,
    relatedBlocks: ['gamma_flip_proximity'],
    description: 'Market-maker gamma flip price. Above = pin; below = trend.',
    aiSynonyms: ['gamma', 'gamma flip', '감마', '감마플립', 'gex', 'gamma exposure', 'gamma pin'],
    aiExampleQueries: ['gamma pin 이 뭐야?', '감마 플립 레벨?', 'gex 확인'],
    alternateArchetypes: ['I'],
  },

  put_call_ratio: {
    id: 'put_call_ratio',
    label: 'P/C',
    family: 'Options',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'deribit', endpoint: '/api/market/options-snapshot' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 2,
    defaultVisible: true,
    unit: '',
    relatedBlocks: ['put_call_ratio_extreme'],
    description: 'Put/Call open interest ratio from Deribit — >1 = put-heavy, <1 = call-heavy',
    aiSynonyms: ['put call ratio', 'pcr', 'p/c', 'put/call', '풋콜비율'],
    aiExampleQueries: ['put call ratio 어때?', 'pcr 확인'],
  },

  // ── Netflow (Pillar 4 — W-0122-D) ──────────────────────────────
  exchange_netflow: {
    id: 'exchange_netflow',
    label: 'Netflow',
    family: 'Netflow',
    archetype: 'H',
    dimensions: ['venue', 'horizon', 'percentile'],
    source: { provider: 'arkham', endpoint: '/netflow/{exchange}' },
    thresholds: { warn: 70, extreme: 92 },
    priority: 1,
    defaultVisible: false,
    unit: 'USD',
    relatedBlocks: [
      'exchange_netflow_inflow_spike',
      'exchange_netflow_outflow_persistent',
      'whale_transfer_to_exchange',
    ],
    description: 'Exchange netflow via Arkham — inflow = sell pressure, outflow = hodl',
    aiSynonyms: ['netflow', 'exchange netflow', '넷플로우', '거래소 유입', '코인 유출', 'on-chain flow'],
    aiExampleQueries: ['거래소 유입 확인', 'netflow 지금?', '고래 거래소 이동?'],
    alternateArchetypes: ['A'],
  },

  // ── Netflow derived ──────────────────────────────────────────────────
  funding_term_structure: {
    id: 'funding_term_structure',
    label: 'Fund curve',
    family: 'Funding',
    archetype: 'G',
    dimensions: ['horizon'],
    source: { provider: 'derived' },
    priority: 2,
    defaultVisible: false,
    unit: '%',
    description: 'Funding rate across tenors (8h/1d/7d/30d/90d) — contango vs backwardation',
    aiSynonyms: ['funding curve', 'funding term structure', '펀딩 커브', '선물 베이시스 커브'],
    aiExampleQueries: ['funding curve 어때?', '펀딩 장기 추세?'],
  },

  // ── Liquidations derived ─────────────────────────────────────────────
  liq_by_level: {
    id: 'liq_by_level',
    label: 'Liq levels',
    family: 'Liquidations',
    archetype: 'I',
    dimensions: ['price_level', 'side'],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    description: 'Liquidation notional by price level — shows magnet zones as histogram',
    aiSynonyms: ['liq by level', 'liquidation histogram', '청산 레벨', 'liq histogram'],
    aiExampleQueries: ['청산 레벨 분포?', 'liq histogram'],
    alternateArchetypes: ['C'],
  },

  // ── Whale events ────────────────────────────────────────────────────
  whale_transfers: {
    id: 'whale_transfers',
    label: 'Whale moves',
    family: 'Netflow',
    archetype: 'J',
    dimensions: ['venue', 'side'],
    source: { provider: 'arkham', endpoint: '/transfers' },
    priority: 3,
    defaultVisible: false,
    description: 'Large wallet transfers — Phase 2 Arkham integration',
    aiSynonyms: ['whale', '고래', '고래 이동', 'whale transfer', 'large transfer'],
    aiExampleQueries: ['고래 이동?', 'whale 거래소 이동?'],
    alternateArchetypes: ['H'],
  },

  stablecoin_supply_ratio: {
    id: 'stablecoin_supply_ratio',
    label: 'SSR',
    family: 'Netflow',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'derived', endpoint: '/api/market/stablecoin-ssr' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 2,
    defaultVisible: true,
    unit: '',
    description: 'BTC mcap / stablecoin supply — low = dry powder on sidelines (bullish setup)',
    aiSynonyms: ['ssr', 'stablecoin ratio', 'stablecoin supply', '스테이블코인 비율', 'dry powder'],
    aiExampleQueries: ['dry powder 확인', 'ssr 지금?'],
  },

  // ── Volatility (Pillar-adjacent free win — W-0122-F) ────────────
  realized_vol_cone: {
    id: 'realized_vol_cone',
    label: 'RV 30d',
    family: 'Volatility',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'derived', endpoint: '/api/market/rv-cone' },
    thresholds: { warn: 60, extreme: 90, historical: 98 },
    priority: 1,
    defaultVisible: true,
    unit: '%',
    relatedBlocks: ['atr_ultra_low', 'bollinger_squeeze', 'bollinger_expansion'],
    description: 'Annualized 30d realized volatility vs 180d cone. Low = compression setup.',
  },

  // ── Funding regime flip (Archetype E — W-0122-F) ────────────────
  funding_flip: {
    id: 'funding_flip',
    label: 'Funding regime',
    family: 'Funding',
    archetype: 'E',
    dimensions: ['regime'],
    source: { provider: 'binance', endpoint: '/api/market/funding-flip' },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['funding_flip', 'positive_funding_bias', 'negative_funding_bias'],
    description: 'Time since last funding sign flip — fresh flips unwind one-sided leverage.',
  },

  // ── TV TA indicators (Phase 1A, W-0400) — client-calculated ────────────────

  rsi: {
    id: 'rsi',
    label: 'RSI',
    family: 'RelativeStrength',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'rsi',
    category: 'TA',
    paramSchema: {
      period: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'Period' },
    },
    description: 'Relative Strength Index — momentum oscillator (0–100)',
    aiSynonyms: ['rsi', '상대강도', '알에스아이', '상대강도지수', 'relative strength'],
    aiExampleQueries: ['RSI 보여줘', 'RSI 14', '과매수 과매도'],
  },

  macd: {
    id: 'macd',
    label: 'MACD',
    family: 'RelativeStrength',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'macd',
    category: 'TA',
    paramSchema: {
      fast: { type: 'number', default: 12, min: 2, max: 100, step: 1, label: 'Fast' },
      slow: { type: 'number', default: 26, min: 2, max: 200, step: 1, label: 'Slow' },
      signal: { type: 'number', default: 9, min: 2, max: 50, step: 1, label: 'Signal' },
    },
    description: 'Moving Average Convergence Divergence — trend momentum',
    aiSynonyms: ['macd', '맥디', 'moving average convergence', '수렴확산'],
    aiExampleQueries: ['MACD 보여줘', 'MACD 12 26 9', '맥디'],
  },

  ema: {
    id: 'ema',
    label: 'EMA',
    family: 'MovingAverage',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'ema',
    category: 'TA',
    paramSchema: {
      period: { type: 'number', default: 20, min: 2, max: 500, step: 1, label: 'Period' },
    },
    description: 'Exponential Moving Average — trend line overlay on price',
    aiSynonyms: ['ema', '지수이동평균', '이이엠에이', 'exponential moving average', '이동평균'],
    aiExampleQueries: ['EMA 20', '지수이동평균', 'EMA 추세'],
  },

  bb: {
    id: 'bb',
    label: 'BB',
    family: 'Volatility',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'bb',
    category: 'TA',
    paramSchema: {
      period: { type: 'number', default: 20, min: 2, max: 200, step: 1, label: 'Period' },
      multiplier: { type: 'number', default: 2, min: 0.5, max: 5, step: 0.5, label: 'Multiplier' },
    },
    description: 'Bollinger Bands — volatility envelope around moving average',
    aiSynonyms: ['bb', '볼린저밴드', '볼린저', 'bollinger bands', 'bollinger'],
    aiExampleQueries: ['볼린저밴드', 'BB 20', '밴드 수축'],
  },

  vwap: {
    id: 'vwap',
    label: 'VWAP',
    family: 'PriceAction',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'vwap',
    category: 'TA',
    paramSchema: {
      anchor: { type: 'string', default: 'session', label: 'Anchor' },
    },
    description: 'Volume Weighted Average Price — institutional reference price',
    aiSynonyms: ['vwap', '브이왑', '거래량가중평균', 'volume weighted average', '기관'],
    aiExampleQueries: ['VWAP 보여줘', '거래량가중평균', 'VWAP 기준'],
  },

  atr_bands: {
    id: 'atr_bands',
    label: 'ATR Bands',
    family: 'Volatility',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 2,
    defaultVisible: false,
    engineKey: 'atr_bands',
    category: 'TA',
    paramSchema: {
      period: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'Period' },
      multiplier: { type: 'number', default: 2, min: 0.5, max: 5, step: 0.5, label: 'Multiplier' },
    },
    description: 'ATR-based volatility bands — dynamic support/resistance',
    aiSynonyms: ['atr', 'atr bands', '에이티알', '평균진폭', 'average true range'],
    aiExampleQueries: ['ATR bands', 'ATR 밴드', '변동성 밴드'],
  },

  volume_ta: {
    id: 'volume_ta',
    label: 'Volume',
    family: 'Volume',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'volume',
    category: 'TA',
    description: 'Bar volume histogram — raw trade volume per candle',
    aiSynonyms: ['volume', '거래량', '볼륨', '체결량'],
    aiExampleQueries: ['거래량', 'volume 보여줘', '볼륨'],
  },

  oi_ta: {
    id: 'oi_ta',
    label: 'OI Chart',
    family: 'OI',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'oi',
    category: 'TA',
    paramSchema: {
      maWindow: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'MA Window' },
    },
    description: 'Open interest as chart sub-pane with MA overlay',
    aiSynonyms: ['oi chart', 'oi 차트', '미결제약정 차트', 'open interest chart'],
    aiExampleQueries: ['OI 차트', 'open interest 차트'],
  },

  cvd_ta: {
    id: 'cvd_ta',
    label: 'CVD',
    family: 'CVD',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 1,
    defaultVisible: false,
    engineKey: 'cvd',
    category: 'TA',
    paramSchema: {
      maWindow: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'MA Window' },
    },
    description: 'Cumulative Volume Delta — buy/sell pressure divergence',
    aiSynonyms: ['cvd', '씨브이디', '누적거래량델타', 'cumulative volume delta', '델타'],
    aiExampleQueries: ['CVD 차트', '누적거래량', '매수매도 압력'],
  },

  derivatives_ta: {
    id: 'derivatives_ta',
    label: 'Derivatives',
    family: 'Funding',
    archetype: 'A',
    dimensions: [],
    source: { provider: 'derived' },
    priority: 2,
    defaultVisible: false,
    engineKey: 'derivatives',
    category: 'TA',
    paramSchema: {
      maWindow: { type: 'number', default: 14, min: 2, max: 100, step: 1, label: 'MA Window' },
    },
    description: 'Derivatives data sub-pane — funding + OI composite',
    aiSynonyms: ['derivatives', '파생', '파생상품', 'futures data', '선물'],
    aiExampleQueries: ['파생 데이터', 'derivatives 차트', '선물 지표'],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function byFamily(family: IndicatorFamily): IndicatorDef[] {
  return Object.values(INDICATOR_REGISTRY).filter(d => d.family === family);
}

export function byArchetype(archetype: IndicatorArchetype): IndicatorDef[] {
  return Object.values(INDICATOR_REGISTRY).filter(d => d.archetype === archetype);
}

export function defaultVisible(): IndicatorDef[] {
  return Object.values(INDICATOR_REGISTRY)
    .filter(d => d.defaultVisible)
    .sort((a, b) => a.priority - b.priority);
}

export function getIndicator(id: string): IndicatorDef | undefined {
  return INDICATOR_REGISTRY[id];
}
