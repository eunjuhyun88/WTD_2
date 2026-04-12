/**
 * On-Chain Valuation Metrics
 *
 * All formulas follow Glassnode/CryptoQuant canonical definitions.
 * These are pure computation functions — they accept pre-fetched data
 * and return computed values. They do NOT fetch data themselves.
 *
 * When source data is unavailable, functions return null (fail-open).
 */

// ── SOPR Variants ────────────────────────────────────────────

/**
 * SOPR (Spent Output Profit Ratio)
 * Formula: SUM(realized_value_spent) / SUM(value_at_creation)
 * Key level: 1.0 (break-even line)
 *
 * We accept provider-authoritative SOPR values since the UTXO-level
 * computation requires full blockchain data (Glassnode/CryptoQuant API).
 *
 * This function normalizes and validates the provider value.
 */
export function validateSOPR(rawSopr: number | null | undefined): {
  value: number | null;
  zone: 'PROFIT_TAKING' | 'BREAK_EVEN' | 'CAPITULATION' | null;
} {
  if (rawSopr == null || !Number.isFinite(rawSopr) || rawSopr <= 0) {
    return { value: null, zone: null };
  }
  let zone: 'PROFIT_TAKING' | 'BREAK_EVEN' | 'CAPITULATION';
  if (rawSopr > 1.02) zone = 'PROFIT_TAKING';
  else if (rawSopr < 0.98) zone = 'CAPITULATION';
  else zone = 'BREAK_EVEN';
  return { value: rawSopr, zone };
}

/** Validate aSOPR (adjusted, excludes UTXOs < 1 hour) */
export function validateASOPR(rawAsopr: number | null | undefined) {
  return validateSOPR(rawAsopr); // Same validation, different input source
}

/** Validate STH-SOPR (Short-Term Holder, UTXOs < 155 days) */
export function validateSTHSOPR(rawSthSopr: number | null | undefined) {
  return validateSOPR(rawSthSopr);
}

/** Validate LTH-SOPR (Long-Term Holder, UTXOs >= 155 days) */
export function validateLTHSOPR(rawLthSopr: number | null | undefined) {
  return validateSOPR(rawLthSopr);
}

// ── MVRV Variants ────────────────────────────────────────────

/**
 * MVRV (Market Value to Realized Value)
 * Formula: market_cap / realized_cap
 *
 * Zones (Glassnode convention):
 * - > 3.5: Overvalued (historically indicates top)
 * - 2.0-3.5: Elevated
 * - 1.0-2.0: Fair value
 * - < 1.0: Undervalued (historically indicates bottom)
 */
export function computeMVRV(
  marketCap: number | null | undefined,
  realizedCap: number | null | undefined
): {
  value: number | null;
  zone: 'OVERVALUED' | 'ELEVATED' | 'FAIR' | 'UNDERVALUED' | null;
} {
  if (marketCap == null || realizedCap == null || realizedCap <= 0) {
    return { value: null, zone: null };
  }
  const mvrv = marketCap / realizedCap;
  let zone: 'OVERVALUED' | 'ELEVATED' | 'FAIR' | 'UNDERVALUED';
  if (mvrv > 3.5) zone = 'OVERVALUED';
  else if (mvrv > 2.0) zone = 'ELEVATED';
  else if (mvrv >= 1.0) zone = 'FAIR';
  else zone = 'UNDERVALUED';
  return { value: Math.round(mvrv * 1000) / 1000, zone };
}

/**
 * MVRV Z-Score
 * Formula: (market_cap - realized_cap) / stddev(market_cap - realized_cap)
 *
 * The standard deviation is computed over an expanding window from
 * the first available data point. In practice, this requires historical
 * data that we may not have — so we accept a pre-computed Z-score or
 * compute from a rolling window approximation.
 *
 * Zones:
 * - > 7: Extreme overvaluation (red)
 * - 2-7: Elevated
 * - 0-2: Normal
 * - < 0: Undervaluation (green)
 */
export function computeMVRVZScore(
  marketCap: number,
  realizedCap: number,
  historicalDeltas?: number[] // historical (mcap - rcap) series for stddev
): { value: number | null; zone: 'EXTREME_HIGH' | 'HIGH' | 'NORMAL' | 'LOW' | null } {
  if (realizedCap <= 0) return { value: null, zone: null };

  const delta = marketCap - realizedCap;

  if (!historicalDeltas || historicalDeltas.length < 30) {
    // Can't compute Z-score without sufficient history
    // Return MVRV ratio as fallback signal
    return { value: null, zone: null };
  }

  const mean = historicalDeltas.reduce((a, b) => a + b, 0) / historicalDeltas.length;
  const variance =
    historicalDeltas.reduce((a, b) => a + (b - mean) ** 2, 0) / historicalDeltas.length;
  const stddev = Math.sqrt(variance);

  if (stddev <= 0) return { value: null, zone: null };

  const zscore = (delta - mean) / stddev;
  let zone: 'EXTREME_HIGH' | 'HIGH' | 'NORMAL' | 'LOW';
  if (zscore > 7) zone = 'EXTREME_HIGH';
  else if (zscore > 2) zone = 'HIGH';
  else if (zscore >= 0) zone = 'NORMAL';
  else zone = 'LOW';

  return { value: Math.round(zscore * 1000) / 1000, zone };
}

// ── NUPL ─────────────────────────────────────────────────────

/**
 * NUPL (Net Unrealized Profit/Loss)
 * Formula: (market_cap - realized_cap) / market_cap = 1 - 1/MVRV
 *
 * Zones (Glassnode convention):
 * - < 0: Capitulation (red)
 * - 0-0.25: Hope/Fear (orange)
 * - 0.25-0.50: Optimism/Anxiety (yellow)
 * - 0.50-0.75: Belief/Denial (green)
 * - > 0.75: Euphoria/Greed (blue)
 */
export function computeNUPL(
  marketCap: number | null | undefined,
  realizedCap: number | null | undefined
): {
  value: number | null;
  zone: 'CAPITULATION' | 'HOPE_FEAR' | 'OPTIMISM' | 'BELIEF' | 'EUPHORIA' | null;
} {
  if (marketCap == null || realizedCap == null || marketCap <= 0) {
    return { value: null, zone: null };
  }
  const nupl = (marketCap - realizedCap) / marketCap;
  let zone: 'CAPITULATION' | 'HOPE_FEAR' | 'OPTIMISM' | 'BELIEF' | 'EUPHORIA';
  if (nupl < 0) zone = 'CAPITULATION';
  else if (nupl < 0.25) zone = 'HOPE_FEAR';
  else if (nupl < 0.5) zone = 'OPTIMISM';
  else if (nupl < 0.75) zone = 'BELIEF';
  else zone = 'EUPHORIA';
  return { value: Math.round(nupl * 10000) / 10000, zone };
}

// ── CDD & Dormancy ───────────────────────────────────────────

/**
 * CDD (Coin Days Destroyed)
 * Formula: SUM(coin_amount_i × days_since_last_move_i) for all spent outputs per day
 *
 * Provider-authoritative — we validate and pass through.
 */
export function validateCDD(rawCdd: number | null | undefined): {
  value: number | null;
  elevated: boolean;
} {
  if (rawCdd == null || !Number.isFinite(rawCdd)) {
    return { value: null, elevated: false };
  }
  // CDD > 15M is historically elevated for BTC
  return { value: rawCdd, elevated: rawCdd > 15_000_000 };
}

/**
 * Dormancy
 * Formula: CDD / daily_transaction_count
 *
 * High dormancy = old coins moving (smart money or capitulation).
 */
export function computeDormancy(
  cdd: number | null | undefined,
  dailyTxCount: number | null | undefined
): {
  value: number | null;
  elevated: boolean;
} {
  if (cdd == null || dailyTxCount == null || dailyTxCount <= 0) {
    return { value: null, elevated: false };
  }
  const dormancy = cdd / dailyTxCount;
  return { value: Math.round(dormancy * 100) / 100, elevated: dormancy > 50 };
}
