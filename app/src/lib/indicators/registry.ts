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
  },

  // ── Options (Pillar 2 — W-0122-C) ──────────────────────────────
  options_skew_25d: {
    id: 'options_skew_25d',
    label: 'Skew 25d',
    family: 'Options',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'deribit', stream: 'ticker.BTC-*' },
    thresholds: { warn: 60, extreme: 90, historical: 98 },
    priority: 1,
    defaultVisible: false,
    unit: '',
    relatedBlocks: ['skew_extreme_fear', 'skew_extreme_greed'],
    description: 'Deribit 25-delta skew (IV_put25 − IV_call25). Negative = fear priced in.',
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
  },

  put_call_ratio: {
    id: 'put_call_ratio',
    label: 'P/C',
    family: 'Options',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'deribit', endpoint: '/options/put-call' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 2,
    defaultVisible: false,
    unit: '',
    relatedBlocks: ['put_call_ratio_extreme'],
  },

  // ── Netflow (Pillar 4 — W-0122-D) ──────────────────────────────
  exchange_netflow: {
    id: 'exchange_netflow',
    label: 'Netflow',
    family: 'Netflow',
    archetype: 'A',
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
  },

  stablecoin_supply_ratio: {
    id: 'stablecoin_supply_ratio',
    label: 'SSR',
    family: 'Netflow',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'derived' },
    thresholds: { warn: 60, extreme: 90 },
    priority: 2,
    defaultVisible: false,
    unit: '',
    description: 'Stablecoin market cap / BTC market cap — dry powder on sidelines',
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
