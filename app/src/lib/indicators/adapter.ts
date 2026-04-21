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
import type { IndicatorValue, VenueSeriesRow, HeatmapCell } from './types';

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

export interface AdapterInput {
  analyze: AnalyzeEnvelope | null;
  venueDivergence?: VenueDivergencePayload | null;
  liqClusters?: LiqClusterPayload | null;
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

  // ── OI change (1h) ────────────────────────────────────────────────────
  if (snap?.oi_change_1h != null) {
    out.oi_change_1h = {
      current: snap.oi_change_1h,
      percentile: estimatePercentileFromMagnitude(snap.oi_change_1h, 0.015, 0.08),
      sparkline: syntheticSparkline(snap.oi_change_1h),
      at: now,
    };
  }

  // ── Funding rate ──────────────────────────────────────────────────────
  if (snap?.funding_rate != null) {
    out.funding_rate = {
      current: snap.funding_rate,
      // funding typical band ±0.03% normal, ±0.1% extreme
      percentile: estimatePercentileFromMagnitude(snap.funding_rate, 0.0003, 0.001),
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
