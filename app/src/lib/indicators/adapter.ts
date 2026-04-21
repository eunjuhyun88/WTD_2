/**
 * Adapter — AnalyzeEnvelope + extra sources → IndicatorValue map keyed by indicator id.
 *
 * Phase 1 bridge: while engine doesn't yet emit the registry-shaped
 * `indicators[]` block natively, derive what we can from the existing
 * AnalyzeEnvelope + any side-fetched payloads (venue divergence, options).
 *
 * Once engine ships the registry-shaped payload (W-0122-D), this adapter
 * shrinks to a straight pass-through.
 */

import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type { IndicatorValue, VenueSeriesRow, HeatmapCell, RegimeState } from './types';

export interface VenueDivergencePayload {
  symbol: string;
  at: number;
  oi: VenueSeriesRow[];
  funding: VenueSeriesRow[];
}

export interface LiqClusterPayload {
  symbol: string;
  at: number;
  window: string;
  cells: HeatmapCell[];
}

export interface IndicatorContextPayload {
  symbol: string;
  at: number;
  context: {
    oi_change_1h?: { value: number; percentile: number };
    oi_change_4h?: { value: number; percentile: number };
    funding_rate?: { value: number; percentile: number };
  };
}

// ── W-0122-F Free Wins payloads ─────────────────────────────────────────────

export interface SsrPayload {
  at: number;
  current: number;
  percentile: number;
  sparkline: number[];
  regime: 'dry_powder_high' | 'dry_powder_low' | 'neutral';
}

export interface RvConePayload {
  symbol: string;
  at: number;
  windows: number[];
  current: Record<string, number>;
  cone: Record<string, { min: number; p10: number; p50: number; p90: number; max: number }>;
  percentile: Record<string, number>;
}

export interface FundingFlipPayload {
  symbol: string;
  at: number;
  currentRate: number;
  previousRate: number;
  flippedAt: number | null;
  persistedHours: number;
  direction: 'pos_to_neg' | 'neg_to_pos' | 'persisted';
  consecutiveIntervals: number;
}

export interface OptionsSnapshotPayload {
  currency: string;
  at: number;
  underlyingPrice: number;
  totalOI: { call: number; put: number; total: number };
  totalVolume24h: { call: number; put: number };
  putCallRatioOi: number;
  putCallRatioVol: number;
  skew25d: number;
  atmIvNearTerm: number;
  counts: { callStrikes: number; putStrikes: number; nearTermInstruments: number };
  expiries: Array<{ expiry: string; daysToExpiry: number; callOi: number; putOi: number; atmIv: number | null }>;
  /** Phase 2 — gamma/pin heuristic (no full Greeks yet). */
  gamma?: {
    pinLevel: number | null;
    pinDistancePct: number | null;
    maxPain: number | null;
    maxPainDistancePct: number | null;
    pinDirection: 'above' | 'below' | 'at' | null;
  };
}

export interface AdapterInput {
  analyze: AnalyzeEnvelope | null;
  venueDivergence?: VenueDivergencePayload | null;
  liqClusters?: LiqClusterPayload | null;
  indicatorContext?: IndicatorContextPayload | null;
  ssr?: SsrPayload | null;
  rvCone?: RvConePayload | null;
  fundingFlip?: FundingFlipPayload | null;
  optionsSnapshot?: OptionsSnapshotPayload | null;
}

/**
 * Build a map of indicator id → IndicatorValue.
 * Missing inputs return a neutral placeholder so the UI can render a skeleton
 * without conditional chains at every call site.
 */
export function buildIndicatorValues(input: AdapterInput): Record<string, IndicatorValue> {
  const out: Record<string, IndicatorValue> = {};
  const now = Date.now();

  const snap = input.analyze?.snapshot;
  const ctxReal = input.indicatorContext?.context;

  // ── OI change (1h) — prefer real 30d percentile, fall back to estimate ─
  if (snap?.oi_change_1h != null) {
    const realCtx = ctxReal?.oi_change_1h;
    out.oi_change_1h = {
      current: snap.oi_change_1h,
      percentile: realCtx
        ? { value: realCtx.percentile, window: '30d' }
        : estimatePercentileFromMagnitude(snap.oi_change_1h, 0.015, 0.08),
      sparkline: syntheticSparkline(snap.oi_change_1h),
      at: now,
    };
  }

  // ── Funding rate ──────────────────────────────────────────────────────
  if (snap?.funding_rate != null) {
    const realCtx = ctxReal?.funding_rate;
    out.funding_rate = {
      current: snap.funding_rate,
      percentile: realCtx
        ? { value: realCtx.percentile, window: '30d' }
        : estimatePercentileFromMagnitude(snap.funding_rate, 0.0003, 0.001),
      sparkline: syntheticSparkline(snap.funding_rate),
      at: now,
    };
  }

  // ── Volume ratio ──────────────────────────────────────────────────────
  if (snap?.vol_ratio_3 != null) {
    out.volume_ratio = {
      current: snap.vol_ratio_3,
      // 1.0x = neutral, 2.0x = warn, 4.0x = extreme
      percentile: estimatePercentileFromMagnitude(snap.vol_ratio_3 - 1, 0.5, 3),
      sparkline: syntheticSparkline(snap.vol_ratio_3),
      at: now,
    };
  }

  // ── Venue divergence (Pillar 3) ───────────────────────────────────────
  if (input.venueDivergence?.oi?.length) {
    out.oi_per_venue = {
      current: input.venueDivergence.oi,
      at: input.venueDivergence.at || now,
    };
  }
  if (input.venueDivergence?.funding?.length) {
    out.funding_per_venue = {
      current: input.venueDivergence.funding,
      at: input.venueDivergence.at || now,
    };
  }

  // ── Liquidation heatmap (Pillar 1) ────────────────────────────────────
  if (input.liqClusters?.cells?.length) {
    out.liq_heatmap = {
      current: input.liqClusters.cells,
      at: input.liqClusters.at || now,
    };
  }

  // ── Stablecoin Supply Ratio (W-0122-F) ────────────────────────────────
  if (input.ssr) {
    out.stablecoin_supply_ratio = {
      current: input.ssr.current,
      percentile: { value: input.ssr.percentile, window: '30d' },
      sparkline: input.ssr.sparkline.slice(-24),
      at: input.ssr.at,
    };
  }

  // ── Realized Volatility (30d window is primary) (W-0122-F) ────────────
  if (input.rvCone) {
    const rv30 = input.rvCone.current['30'];
    const pct30 = input.rvCone.percentile['30'];
    if (rv30 != null && pct30 != null) {
      out.realized_vol_cone = {
        current: rv30 * 100, // present as percent
        percentile: { value: pct30, window: '90d' },
        sparkline: [
          input.rvCone.current['90'] ?? rv30,
          input.rvCone.current['60'] ?? rv30,
          input.rvCone.current['30'] ?? rv30,
          input.rvCone.current['14'] ?? rv30,
          input.rvCone.current['7'] ?? rv30,
        ].map(v => v * 100),
        at: input.rvCone.at,
      };
    }
  }

  // ── Funding Flip (Archetype E — W-0122-F) ─────────────────────────────
  if (input.fundingFlip) {
    const f = input.fundingFlip;
    const regime: RegimeState = {
      label: f.direction === 'persisted'
        ? (f.currentRate >= 0 ? 'POSITIVE' : 'NEGATIVE')
        : 'FLIPPED',
      direction: f.currentRate > 0 ? 'bull' : f.currentRate < 0 ? 'bear' : 'neutral',
      flippedAt: f.flippedAt ? new Date(f.flippedAt).toISOString() : undefined,
      persistedBars: f.consecutiveIntervals,
    };
    out.funding_flip = {
      current: regime,
      state: regime,
      at: f.at,
    };
  }

  // ── Options snapshot (Pillar 2 — W-0122-C1) ──────────────────────────
  if (input.optionsSnapshot) {
    const o = input.optionsSnapshot;
    // Put/Call ratio gauge — presented as percentage of historical distribution.
    // Without full history we map |PCR - 1| to percentile band heuristically:
    // PCR 1.0 → p50, 1.5 → p90 (put-heavy), 0.67 → p90 (call-heavy but same magnitude).
    const pcrDelta = Math.abs(o.putCallRatioOi - 1);
    const pcrPct = 50 + Math.sign(o.putCallRatioOi - 1) * Math.min(45, pcrDelta * 90);
    out.put_call_ratio = {
      current: o.putCallRatioOi,
      percentile: { value: pcrPct, window: '30d' },
      sparkline: [o.putCallRatioOi, o.putCallRatioVol],
      at: o.at,
    };
    // 25d skew: IV points (put - call). Positive = fear premium on puts.
    const skewPct = 50 + Math.max(-45, Math.min(45, o.skew25d * 4));
    out.options_skew_25d = {
      current: o.skew25d,
      percentile: { value: skewPct, window: '30d' },
      sparkline: [o.skew25d],
      at: o.at,
    };
  }

  // ── CVD divergence (Archetype D) ──────────────────────────────────────
  // Derive a DivergenceState from snapshot.cvd_state + flowSummary.cvd.
  // Phase 2: engine will emit a pre-computed DivergenceState with real
  // rolling correlation + bars since last pivot.
  if (snap?.cvd_state) {
    const raw = snap.cvd_state.toLowerCase();
    const priceChange = snap.change24h ?? snap.price_change_pct_24h;
    let type: 'bullish' | 'bearish' | 'aligned' | 'unknown' = 'unknown';
    const cvdPos = /positive|양|bull/.test(raw);
    const cvdNeg = /negative|음|bear/.test(raw);
    if (priceChange != null) {
      if (priceChange > 0 && cvdNeg) type = 'bearish';
      else if (priceChange < 0 && cvdPos) type = 'bullish';
      else if ((priceChange > 0 && cvdPos) || (priceChange < 0 && cvdNeg)) type = 'aligned';
    }
    out.cvd_state = {
      current: {
        type,
        barsSince: 0, // unknown without rolling series; engine will fill
        strength: 0.5,
      },
      at: now,
    };
  }

  return out;
}

/**
 * Rough percentile estimation from a raw magnitude, pinned to a warn/extreme band.
 * Used as a *fallback* until engine emits real rolling percentile.
 * Shape: 50 for 0, 75 for warn threshold, 95 for extreme threshold, 99 for 2× extreme.
 */
function estimatePercentileFromMagnitude(
  value: number,
  warnMag: number,
  extremeMag: number
): { value: number; window: '30d' } {
  const abs = Math.abs(value);
  let pct: number;
  if (abs >= extremeMag * 2) pct = 99;
  else if (abs >= extremeMag)  pct = 95;
  else if (abs >= warnMag)     pct = 75 + ((abs - warnMag) / (extremeMag - warnMag)) * 20;
  else                         pct = 50 + (abs / warnMag) * 25;
  // Signed tails: push toward 100 for positive extremes, 0 for negative extremes.
  const sign = value >= 0 ? 1 : -1;
  const anchored = 50 + sign * (pct - 50);
  return { value: Math.max(0, Math.min(100, anchored)), window: '30d' };
}

/**
 * Synthetic sparkline so UI isn't empty during Phase 1.
 * Replaced by real 24h rolling window once engine ships it.
 */
function syntheticSparkline(current: number): number[] {
  // Generate a monotonic lead-up to current — just a visual placeholder.
  const n = 12;
  return Array.from({ length: n }, (_, i) => current * (0.3 + (i / (n - 1)) * 0.7));
}
