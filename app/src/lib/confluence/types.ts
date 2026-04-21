/**
 * Confluence Engine — type surface.
 *
 * W-0122 master moat layer. Takes readings from all 4 pillars (+ the base
 * pattern engine) and produces a single directional score with a
 * contribution breakdown so traders see *why* the score is what it is.
 *
 * Phase 1 (this file): heuristic weights, app-side composition.
 * Phase 2: engine-side scoring with weights learned from Flywheel outcomes.
 */

/** One contribution to the confluence score. */
export interface ConfluenceContribution {
  /** Pillar / indicator id (pattern / venue_divergence / rv_cone / ssr / funding_flip / liq_magnet / ...). */
  source: string;
  /** Signed score in [-1, 1] — positive = bullish, negative = bearish. */
  score: number;
  /** Weight assigned to this contribution; weights sum to 1 across contributions with a value. */
  weight: number;
  /** Weighted score (= score * weight), in [-weight, +weight]. */
  weighted: number;
  /** Human label for UI. */
  label: string;
  /** One-line reasoning shown in tooltip. */
  reason?: string;
  /** Absolute magnitude before weighting — used to rank contributions for display. */
  magnitude: number;
}

export type ConfluenceRegime = 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';

export interface ConfluenceResult {
  at: number;
  symbol: string;

  /** Normalized score in [-100, +100]. Positive = bullish. */
  score: number;

  /** Confidence in the score: fraction [0, 1] of contributions that *agree* with the sign. */
  confidence: number;

  /** Regime bucket derived from score + confidence. */
  regime: ConfluenceRegime;

  /** Contribution list sorted by absolute magnitude (largest first). */
  contributions: ConfluenceContribution[];

  /** Top 3 contributions by magnitude — shortcut for the banner UI. */
  top: ConfluenceContribution[];

  /** True when ≥2 contributions have opposite signs AND both have magnitude ≥ 0.3.
   *  Divergence moments are rare high-alpha windows. */
  divergence: boolean;
}

/** Static weights used in Phase 1 before the Flywheel learns real weights. */
export const PHASE1_WEIGHTS: Record<string, number> = {
  pattern: 0.30,           // existing 80 block ensemble — anchor of the score
  venue_divergence: 0.20,  // our independent edge (Pillar 3)
  funding_flip: 0.15,      // timing signal (Archetype E)
  liq_magnet: 0.15,        // Pillar 1 magnetic attraction
  rv_cone: 0.10,           // volatility regime
  ssr: 0.10,               // dry powder / cycle context
};

export function regimeFromScore(score: number, confidence: number): ConfluenceRegime {
  if (score >= 40 && confidence >= 0.6) return 'strong_bull';
  if (score >= 15) return 'bull';
  if (score <= -40 && confidence >= 0.6) return 'strong_bear';
  if (score <= -15) return 'bear';
  return 'neutral';
}
