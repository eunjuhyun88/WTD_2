/**
 * Confluence scoring — pure function that reads raw pillar payloads and
 * emits a ConfluenceResult.
 *
 * Design principle: each pillar produces a signed score in [-1, 1] with the
 * convention:
 *   + = bullish for the next few periods
 *   - = bearish for the next few periods
 *
 * All scoring is heuristic in Phase 1. Every heuristic has a tunable param
 * that the Flywheel can later learn from outcomes.
 */

import type {
  ConfluenceContribution,
  ConfluenceResult,
} from './types';
import { PHASE1_WEIGHTS, regimeFromScore } from './types';

// Raw pillar inputs — matches the adapter payload shapes so the aggregator
// endpoint can just pass them through.

export interface PatternInput {
  /** Engine's existing ensemble score (0-100 bullish-leaning by convention). */
  score: number | null;
  /** Direction hint from the engine ('long' | 'short' | 'neutral' | other). */
  direction?: string | null;
  /** Number of triggered blocks — proxy for pattern richness. */
  activeBlocks?: number | null;
}

export interface VenueDivergenceInput {
  /** Per-venue OI delta rows with highlight flag on the extreme venue. */
  oi: Array<{ venue: string; current: number; highlight?: boolean }>;
  funding: Array<{ venue: string; current: number; highlight?: boolean }>;
}

export interface RvConeInput {
  /** Current percentile of 30d RV within the 180d cone (0-100). */
  percentile30d: number | null;
}

export interface SsrInput {
  /** 30d percentile (0-100). */
  percentile: number | null;
  regime: 'dry_powder_high' | 'dry_powder_low' | 'neutral' | null;
}

export interface FundingFlipInput {
  direction: 'pos_to_neg' | 'neg_to_pos' | 'persisted' | null;
  persistedHours: number;
  consecutiveIntervals: number;
  currentRate: number;
}

export interface LiqMagnetInput {
  /** Distance from current price to nearest significant liq cluster on each side, in %.
   *  null if no cluster exists or data unavailable. */
  aboveDistancePct: number | null;
  belowDistancePct: number | null;
  /** Intensity of the closer cluster (normalized 0-1). */
  intensity: number;
}

export interface OptionsInput {
  /** Put/Call OI ratio — >1 = more puts than calls. */
  putCallRatioOi: number;
  /** Put/Call 24h volume ratio. */
  putCallRatioVol: number;
  /** 25-delta skew proxy (OTM put IV minus OTM call IV, in IV%-points). Positive = fear premium. */
  skew25d: number;
  /** Near-term ATM IV (DVOL proxy) in IV% */
  atmIvNearTerm: number;
  /** Phase 2 — distance from spot to near-term pin level, as % (signed: +above, -below).
   *  null if pin not resolvable. */
  pinDistancePct?: number | null;
  /** Phase 2 — max-pain strike distance from spot as % (signed). */
  maxPainDistancePct?: number | null;
}

export interface ConfluenceInput {
  symbol: string;
  at: number;
  pattern: PatternInput | null;
  venueDivergence: VenueDivergenceInput | null;
  rvCone: RvConeInput | null;
  ssr: SsrInput | null;
  fundingFlip: FundingFlipInput | null;
  liqMagnet: LiqMagnetInput | null;
  options: OptionsInput | null;
}

// ── Per-pillar scoring ──────────────────────────────────────────────────────

/** Pattern ensemble: treat engine score [0,100] centered at 50 → map to [-1, 1]. */
function scorePattern(p: PatternInput | null): ConfluenceContribution | null {
  if (!p || p.score == null) return null;
  const normalized = (p.score - 50) / 50; // [-1, 1]
  // Direction hint overrides if the engine is confident either way.
  let dir = 0;
  if (p.direction) {
    const d = p.direction.toLowerCase();
    if (/long|bull/.test(d)) dir = +0.2;
    else if (/short|bear/.test(d)) dir = -0.2;
  }
  const raw = Math.max(-1, Math.min(1, normalized + dir));
  return {
    source: 'pattern',
    label: 'Pattern ensemble',
    score: raw,
    weight: PHASE1_WEIGHTS.pattern,
    weighted: raw * PHASE1_WEIGHTS.pattern,
    magnitude: Math.abs(raw),
    reason: `Engine score ${p.score.toFixed(0)}/100${p.direction ? `, dir=${p.direction}` : ''}`,
  };
}

/** Venue divergence: isolated-venue leverage pump = directional signal.
 *  If one venue's OI spikes while others are flat, the leveraged side is at risk of a cascade. */
function scoreVenueDivergence(v: VenueDivergenceInput | null): ConfluenceContribution | null {
  if (!v || !v.oi?.length) return null;

  // Compute spread between most-extreme venue and median venue.
  const oiValues = v.oi.map(r => r.current).filter(x => Number.isFinite(x));
  if (oiValues.length < 2) return null;
  const sorted = [...oiValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  const min = sorted[0];
  const topSpread = max - median;
  const bottomSpread = median - min;

  // A strong isolated pump in one direction is *bearish* short-term (cascade risk on that side).
  // Heuristic: if the top outlier is >3% above median, that side is over-levered long → short bias.
  let raw = 0;
  let reason = '';
  const threshold = 0.015; // 1.5%
  if (topSpread > bottomSpread && topSpread > threshold) {
    raw = -Math.min(1, topSpread / 0.06); // scale to [-1, 0]
    const hot = v.oi.find(r => r.current === max);
    reason = `${hot?.venue ?? 'venue'} OI +${(max * 100).toFixed(1)}% while median ${(median * 100).toFixed(1)}% — long cascade risk`;
  } else if (bottomSpread > topSpread && bottomSpread > threshold) {
    raw = Math.min(1, bottomSpread / 0.06);
    const cold = v.oi.find(r => r.current === min);
    reason = `${cold?.venue ?? 'venue'} OI ${(min * 100).toFixed(1)}% while median ${(median * 100).toFixed(1)}% — short cascade risk`;
  } else {
    reason = 'Venues aligned';
  }

  return {
    source: 'venue_divergence',
    label: 'Venue divergence',
    score: raw,
    weight: PHASE1_WEIGHTS.venue_divergence,
    weighted: raw * PHASE1_WEIGHTS.venue_divergence,
    magnitude: Math.abs(raw),
    reason,
  };
}

/** RV cone: low RV = compression (neutral-coiling setup, slight bullish lean statistically).
 *  High RV = already expanded (late-move / mean-reversion risk). */
function scoreRvCone(r: RvConeInput | null): ConfluenceContribution | null {
  if (!r || r.percentile30d == null) return null;
  // Map percentile: p10 → +0.6 (compression = setup), p50 → 0, p90 → -0.4 (exhaustion)
  // Slightly asymmetric because expansion is less directional than compression.
  const pct = r.percentile30d;
  let raw: number;
  if (pct < 50) raw = (50 - pct) / 50 * 0.6;
  else raw = -((pct - 50) / 50) * 0.4;
  return {
    source: 'rv_cone',
    label: 'RV regime',
    score: raw,
    weight: PHASE1_WEIGHTS.rv_cone,
    weighted: raw * PHASE1_WEIGHTS.rv_cone,
    magnitude: Math.abs(raw),
    reason: pct < 30 ? `RV p${pct.toFixed(0)} — compression setup`
          : pct > 70 ? `RV p${pct.toFixed(0)} — expanded, mean-reversion risk`
          : `RV p${pct.toFixed(0)} — middle`,
  };
}

/** SSR: low SSR = dry powder, bullish structural setup.
 *  High SSR = depleted reserves, weak bid from the sidelines. */
function scoreSsr(s: SsrInput | null): ConfluenceContribution | null {
  if (!s || s.percentile == null) return null;
  // Mirror of RV but lower sensitivity (SSR is slow-moving).
  const pct = s.percentile;
  let raw: number;
  if (pct < 25) raw = 0.6;
  else if (pct > 75) raw = -0.4;
  else raw = (50 - pct) / 50 * 0.3;
  return {
    source: 'ssr',
    label: 'SSR',
    score: raw,
    weight: PHASE1_WEIGHTS.ssr,
    weighted: raw * PHASE1_WEIGHTS.ssr,
    magnitude: Math.abs(raw),
    reason: s.regime === 'dry_powder_high' ? 'Dry powder abundant'
          : s.regime === 'dry_powder_low' ? 'Dry powder depleted'
          : `SSR p${pct.toFixed(0)}`,
  };
}

/** Funding flip: fresh flip = unwinding leverage. Persistence of current side inversely correlates with exhaustion. */
function scoreFundingFlip(f: FundingFlipInput | null): ConfluenceContribution | null {
  if (!f || !f.direction) return null;
  // If flipped recently (<24h), momentum favors the new side.
  // If persisted long (>72h) at extreme, mean-reversion risk grows.
  let raw = 0;
  let reason = '';
  if (f.direction === 'neg_to_pos' && f.persistedHours < 24) {
    raw = 0.5;
    reason = `Flipped to positive ${f.persistedHours.toFixed(1)}h ago — bullish unwind`;
  } else if (f.direction === 'pos_to_neg' && f.persistedHours < 24) {
    raw = -0.5;
    reason = `Flipped to negative ${f.persistedHours.toFixed(1)}h ago — bearish unwind`;
  } else if (f.persistedHours > 72 && Math.abs(f.currentRate) > 0.0001) {
    // Extended one-sided funding → mean-reversion risk the other way.
    raw = f.currentRate > 0 ? -0.3 : 0.3;
    reason = `${f.currentRate > 0 ? 'Positive' : 'Negative'} funding persisted ${f.persistedHours.toFixed(0)}h — reversal risk`;
  } else {
    reason = `Stable (${f.currentRate > 0 ? '+' : ''}${(f.currentRate * 100).toFixed(4)}%)`;
  }
  return {
    source: 'funding_flip',
    label: 'Funding regime',
    score: raw,
    weight: PHASE1_WEIGHTS.funding_flip,
    weighted: raw * PHASE1_WEIGHTS.funding_flip,
    magnitude: Math.abs(raw),
    reason,
  };
}

/** Liq magnet: close cluster above = upside magnet (bullish pull), below = downside magnet. */
function scoreLiqMagnet(l: LiqMagnetInput | null): ConfluenceContribution | null {
  if (!l) return null;
  const above = l.aboveDistancePct;
  const below = l.belowDistancePct;
  if (above == null && below == null) return null;

  // Magnet strength decays with distance (% from current price).
  const magnetScore = (dist: number | null) => {
    if (dist == null) return 0;
    if (dist < 0.5) return 1;      // within 0.5% — very strong pull
    if (dist < 2) return 1 - (dist - 0.5) / 1.5 * 0.5;
    if (dist < 5) return 0.5 - (dist - 2) / 3 * 0.4;
    return 0.1;
  };

  const aboveMag = magnetScore(above) * l.intensity;
  const belowMag = magnetScore(below) * l.intensity;
  const raw = Math.max(-1, Math.min(1, aboveMag - belowMag));

  const closerSide = above != null && (below == null || above < below) ? 'above' : 'below';
  const closerDist = closerSide === 'above' ? above : below;
  const reason = closerDist == null
    ? 'Clusters not resolved'
    : `${closerSide === 'above' ? 'Upside' : 'Downside'} magnet ~${closerDist.toFixed(1)}% away`;

  return {
    source: 'liq_magnet',
    label: 'Liq magnet',
    score: raw,
    weight: PHASE1_WEIGHTS.liq_magnet,
    weighted: raw * PHASE1_WEIGHTS.liq_magnet,
    magnitude: Math.abs(raw),
    reason,
  };
}

/** Options signal: skew + P/C ratio combined.
 *  25d skew (put IV minus call IV) is the cleanest single-number fear gauge:
 *    skew > +5  → strong fear priced in → contrarian bullish
 *    skew < -2  → complacency → contrarian bearish
 *  P/C ratio complements: extreme reading reinforces the signal.
 */
function scoreOptions(o: OptionsInput | null): ConfluenceContribution | null {
  if (!o) return null;
  // Skew component — contrarian signal, bounded to ±1.
  // Historical BTC 25d skew ranges roughly [-5, +15]. Strong fear > +8, complacency < -2.
  let skewRaw = 0;
  if (o.skew25d > 8) skewRaw = Math.min(0.8, (o.skew25d - 8) / 10 + 0.3);    // +fear → +bull
  else if (o.skew25d < -2) skewRaw = -Math.min(0.6, (-o.skew25d - 2) / 6 + 0.2); // complacent → -bear
  else skewRaw = o.skew25d / 20; // middle band: mild

  // Put/Call component — also contrarian.
  // BTC PCR historical: ~0.5-1.2 typical, extremes 0.3 / 1.5.
  let pcrRaw = 0;
  if (o.putCallRatioOi > 1.2) pcrRaw = Math.min(0.6, (o.putCallRatioOi - 1.2) * 2); // put-heavy → bullish contrarian
  else if (o.putCallRatioOi < 0.6 && o.putCallRatioOi > 0) pcrRaw = -Math.min(0.5, (0.6 - o.putCallRatioOi) * 2); // call-heavy → bearish
  else pcrRaw = 0;

  // Gamma pin component (Phase 2) — close pin above = bullish magnet, below = bearish.
  // Magnet strength decays with distance. Only meaningful within ±3%.
  let gammaRaw = 0;
  let gammaReason = '';
  if (o.pinDistancePct != null && Number.isFinite(o.pinDistancePct)) {
    const d = o.pinDistancePct;
    const abs = Math.abs(d);
    if (abs < 3) {
      const strength = abs < 0.5 ? 1 : abs < 1.5 ? 0.7 : 0.4;
      gammaRaw = Math.sign(d) * strength * 0.4; // max |0.4|
      gammaReason = `pin ${d >= 0 ? '+' : ''}${d.toFixed(1)}% away`;
    }
  }

  // Combined — skew dominates (0.55), P/C secondary (0.25), gamma magnet (0.20).
  const raw = Math.max(-1, Math.min(1, skewRaw * 0.55 + pcrRaw * 0.25 + gammaRaw * 0.20));

  const skewLabel = o.skew25d > 8 ? 'fear premium' : o.skew25d < -2 ? 'complacent' : 'neutral';
  const reason = gammaReason
    ? `skew ${o.skew25d.toFixed(1)}pts (${skewLabel}), P/C ${o.putCallRatioOi.toFixed(2)}, ${gammaReason}`
    : `skew ${o.skew25d.toFixed(1)}pts (${skewLabel}), P/C ${o.putCallRatioOi.toFixed(2)}`;

  return {
    source: 'options',
    label: 'Options',
    score: raw,
    weight: PHASE1_WEIGHTS.options,
    weighted: raw * PHASE1_WEIGHTS.options,
    magnitude: Math.abs(raw),
    reason,
  };
}

// ── Composition ─────────────────────────────────────────────────────────────

export function computeConfluence(input: ConfluenceInput): ConfluenceResult {
  const rawContributions: (ConfluenceContribution | null)[] = [
    scorePattern(input.pattern),
    scoreVenueDivergence(input.venueDivergence),
    scoreRvCone(input.rvCone),
    scoreSsr(input.ssr),
    scoreFundingFlip(input.fundingFlip),
    scoreLiqMagnet(input.liqMagnet),
    scoreOptions(input.options),
  ];
  const contributions = rawContributions.filter((c): c is ConfluenceContribution => c !== null);

  // If no contributions, return neutral.
  if (!contributions.length) {
    return {
      at: input.at,
      symbol: input.symbol,
      score: 0,
      confidence: 0,
      regime: 'neutral',
      contributions: [],
      top: [],
      divergence: false,
    };
  }

  // Re-normalize weights across *present* contributions so missing pillars
  // don't artificially depress the score.
  const totalWeight = contributions.reduce((s, c) => s + c.weight, 0);
  const norm = totalWeight > 0 ? 1 / totalWeight : 0;
  const renormed = contributions.map(c => ({
    ...c,
    weight: c.weight * norm,
    weighted: c.weighted * norm,
  }));

  // Weighted sum → [-1, 1], then scale to [-100, 100].
  const weightedSum = renormed.reduce((s, c) => s + c.weighted, 0);
  const score = Math.max(-100, Math.min(100, weightedSum * 100));

  // Confidence = fraction of *material* contributions (|score| > 0.2) that agree with the sign.
  const overallSign = Math.sign(weightedSum);
  const material = renormed.filter(c => Math.abs(c.score) > 0.2);
  const agreeing = material.filter(c => Math.sign(c.score) === overallSign).length;
  const confidence = material.length ? agreeing / material.length : 0;

  // Divergence: at least 2 material contributions on opposite sides.
  const positives = material.filter(c => c.score > 0.3);
  const negatives = material.filter(c => c.score < -0.3);
  const divergence = positives.length >= 1 && negatives.length >= 1;

  const sorted = [...renormed].sort((a, b) => b.magnitude - a.magnitude);

  return {
    at: input.at,
    symbol: input.symbol,
    score,
    confidence,
    regime: regimeFromScore(score, confidence),
    contributions: sorted,
    top: sorted.slice(0, 3),
    divergence,
  };
}
