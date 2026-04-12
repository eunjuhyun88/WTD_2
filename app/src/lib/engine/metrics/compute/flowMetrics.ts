/**
 * Exchange Flow Metrics
 *
 * Exchange Netflow = inflow - outflow (CryptoQuant/IntoTheBlock standard)
 * Positive = coins entering exchanges (potential sell pressure)
 * Negative = coins leaving exchanges (accumulation signal)
 */

/**
 * Exchange Netflow
 * Formula: inflow - outflow
 * Display: bar chart, green (negative/outflow) / red (positive/inflow)
 */
export function computeExchangeNetflow(
  inflow: number | null | undefined,
  outflow: number | null | undefined
): { netflow: number | null; signal: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL' | null } {
  if (inflow == null || outflow == null) return { netflow: null, signal: null };
  const netflow = inflow - outflow;
  let signal: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  if (netflow > 0) signal = 'INFLOW';
  else if (netflow < 0) signal = 'OUTFLOW';
  else signal = 'NEUTRAL';
  return { netflow, signal };
}

/**
 * Exchange Netflow MA7 (7-day moving average for smoothing)
 * Formula: SMA(7, daily_netflow)
 */
export function computeNetflowMA7(dailyNetflows: number[]): number | null {
  if (dailyNetflows.length < 7) return null;
  const last7 = dailyNetflows.slice(-7);
  return last7.reduce((a, b) => a + b, 0) / 7;
}

/**
 * OI-Weighted Funding Rate
 * Formula: SUM(funding_rate_i × OI_i) / SUM(OI_i) across all exchanges
 *
 * This aggregates funding rates weighted by each exchange's open interest
 * to get a more representative cross-exchange funding rate.
 *
 * Source: CoinGlass weighted average methodology
 */
export function computeOIWeightedFunding(
  exchanges: Array<{ fundingRate: number; openInterest: number }>
): { weightedRate: number; weightedBps: number; exchangeCount: number } | null {
  if (exchanges.length === 0) return null;

  let totalWeightedRate = 0;
  let totalOI = 0;

  for (const ex of exchanges) {
    if (ex.openInterest <= 0) continue;
    totalWeightedRate += ex.fundingRate * ex.openInterest;
    totalOI += ex.openInterest;
  }

  if (totalOI <= 0) return null;

  const weightedRate = totalWeightedRate / totalOI;
  return {
    weightedRate,
    weightedBps: Math.round(weightedRate * 10_000 * 100) / 100,
    exchangeCount: exchanges.length,
  };
}

/**
 * OI Aggregation (Coinalyze standard)
 * Formula: coin_margined_OI_usd + stablecoin_margined_OI × current_price
 *
 * Coin-margined contracts are already USD-denominated.
 * Stablecoin-margined contracts are denominated in base asset.
 */
export function computeAggregatedOI(input: {
  coinMarginedUsd?: number;
  stablecoinMarginedCoins?: number;
  currentPrice: number;
}): number {
  const coinOI = input.coinMarginedUsd ?? 0;
  const stableOI = (input.stablecoinMarginedCoins ?? 0) * input.currentPrice;
  return coinOI + stableOI;
}
