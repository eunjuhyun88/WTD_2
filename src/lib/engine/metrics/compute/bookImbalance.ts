/**
 * Order Book Imbalance
 *
 * Formula: (bid_depth - ask_depth) / (bid_depth + ask_depth)
 * Range: [-1, +1]
 * +1 = all bids, no asks (extreme buy pressure)
 * -1 = all asks, no bids (extreme sell pressure)
 *
 * Source: QuestDB, Bookmap, standard market microstructure
 */

/**
 * Compute simple book imbalance from raw depth levels.
 * Sums bid/ask quantities across all provided levels.
 */
export function computeBookImbalance(
  bids: Array<[number, number]>,  // [price, qty]
  asks: Array<[number, number]>,
): { imbalance: number; bidDepth: number; askDepth: number; label: string } {
  let bidDepth = 0;
  let askDepth = 0;

  for (const [, qty] of bids) bidDepth += qty;
  for (const [, qty] of asks) askDepth += qty;

  const total = bidDepth + askDepth;
  if (total <= 0) return { imbalance: 0, bidDepth: 0, askDepth: 0, label: 'NO_DATA' };

  const imbalance = (bidDepth - askDepth) / total;

  let label: string;
  if (imbalance > 0.5) label = 'STRONG_BID';
  else if (imbalance > 0.2) label = 'BID_LEAN';
  else if (imbalance < -0.5) label = 'STRONG_ASK';
  else if (imbalance < -0.2) label = 'ASK_LEAN';
  else label = 'BALANCED';

  return {
    imbalance: Math.round(imbalance * 10000) / 10000,
    bidDepth,
    askDepth,
    label,
  };
}

/**
 * Weighted book imbalance with exponential decay by level distance.
 * Closer-to-market levels have more weight.
 *
 * Weights: level 0 = 1.0, level 1 = 0.5, level 2 = 0.25, ...
 * Formula: weight_i = 0.5^i
 */
export function computeWeightedBookImbalance(
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
): { imbalance: number; weightedBidDepth: number; weightedAskDepth: number } {
  let weightedBid = 0;
  let weightedAsk = 0;

  for (let i = 0; i < bids.length; i++) {
    const weight = Math.pow(0.5, i);
    weightedBid += bids[i][1] * weight;
  }

  for (let i = 0; i < asks.length; i++) {
    const weight = Math.pow(0.5, i);
    weightedAsk += asks[i][1] * weight;
  }

  const total = weightedBid + weightedAsk;
  const imbalance = total > 0 ? (weightedBid - weightedAsk) / total : 0;

  return {
    imbalance: Math.round(imbalance * 10000) / 10000,
    weightedBidDepth: weightedBid,
    weightedAskDepth: weightedAsk,
  };
}

/**
 * Wall intensity at a specific price band.
 * Normalized: resting_notional / rolling_max_notional -> [0, 1]
 *
 * Used for heatmap intensity calculation.
 */
export function computeWallIntensity(
  restingNotionalAtBand: number,
  rollingMaxNotional: number
): number {
  if (rollingMaxNotional <= 0) return 0;
  return Math.min(1, restingNotionalAtBand / rollingMaxNotional);
}
