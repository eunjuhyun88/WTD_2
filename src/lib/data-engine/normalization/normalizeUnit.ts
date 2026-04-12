// ═══════════════════════════════════════════════════════════════
// Data Engine — Unit Normalization
// ═══════════════════════════════════════════════════════════════
//
// Convert between different unit representations used across providers.

// ─── Funding Rate ─────────────────────────────────────────────

/**
 * Convert a raw funding rate to basis points (BPS).
 *
 * 8-hour rate (e.g., 0.0001 = 0.01%) → BPS (e.g., 1.0)
 *
 * @param rate - Raw funding rate (e.g., 0.0001).
 * @returns Rate in basis points, rounded to 2 decimal places.
 */
export function fundingRateToBps(rate: number): number {
	return Math.round(rate * 10_000 * 100) / 100;
}

/**
 * Convert basis points back to a raw funding rate.
 *
 * @param bps - Funding rate in basis points.
 * @returns Raw rate (e.g., 0.0001).
 */
export function bpsToFundingRate(bps: number): number {
	return bps / 10_000;
}

// ─── Open Interest ────────────────────────────────────────────

/**
 * Convert open interest from contract count to USD notional.
 *
 * For linear (USDT-margined): contracts are in base asset units.
 *   USD = contracts * contractMultiplier * price
 *
 * For inverse (coin-margined): contracts are denominated in USD.
 *   USD = contracts * contractMultiplier
 *
 * @param contracts          - OI in contract units.
 * @param price              - Current mark/last price in USD.
 * @param contractType       - 'linear' (USDT-margined) or 'inverse' (coin-margined).
 * @param contractMultiplier - Face value per contract (default 1).
 * @returns USD notional value of open interest.
 */
export function oiContractsToUsd(
	contracts: number,
	price: number,
	contractType: 'linear' | 'inverse' = 'linear',
	contractMultiplier = 1,
): number {
	if (price <= 0) return 0;
	if (contractType === 'inverse') {
		// Coin-margined: contracts denominated in USD
		return contracts * contractMultiplier;
	}
	// Linear (USDT-margined): contracts are in base asset
	return contracts * contractMultiplier * price;
}

// ─── Percentage / Ratio ──────────────────────────────────────

/**
 * Convert a percentage to a ratio (e.g., 5.5 → 0.055).
 *
 * @param pct - Percentage value.
 * @returns Ratio in [0, 1] range (or beyond for values > 100%).
 */
export function percentToRatio(pct: number): number {
	return pct / 100;
}

/**
 * Convert a ratio to a percentage (e.g., 0.055 → 5.5).
 *
 * @param ratio - Ratio value.
 * @returns Percentage value.
 */
export function ratioToPercent(ratio: number): number {
	return ratio * 100;
}

// ─── Annualized / 8-Hour Rates ───────────────────────────────

/**
 * Convert an annualized rate to an 8-hour rate.
 * annual / 365 / 3
 *
 * @param annualRate - Annualized rate (e.g., 0.36 for 36% APR).
 * @returns 8-hour rate.
 */
export function annualToEightHour(annualRate: number): number {
	return annualRate / 365 / 3;
}

/**
 * Convert an 8-hour rate to an annualized rate.
 * rate8h * 3 * 365
 *
 * @param rate8h - 8-hour funding rate.
 * @returns Annualized rate.
 */
export function eightHourToAnnual(rate8h: number): number {
	return rate8h * 3 * 365;
}
