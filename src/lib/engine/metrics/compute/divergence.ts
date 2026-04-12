/**
 * Normalized divergence detection.
 * Re-exports the fixed detectDivergence from trend.ts.
 *
 * Confidence formula:
 *   priceDeltaPct = |price2 - price1| / price1 * 100
 *   indDeltaPct = |ind2 - ind1| / |ind1| * 100
 *   confidence = clamp(priceDeltaPct * 4 + indDeltaPct * 6, 15, 90)
 *
 * Indicator weight (6x) > price weight (4x) because divergence
 * is defined by the indicator failing to confirm price action.
 */
export { detectDivergence } from '../../trend';
