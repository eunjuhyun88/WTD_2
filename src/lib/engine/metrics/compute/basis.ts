/**
 * Futures-Spot Basis
 *
 * Formula: basis_pct = (futures_price - spot_price) / spot_price * 100
 *
 * When actual spot+futures prices are available, this is the true basis.
 * Fallback: use funding rate * 10000 / 100 as crude proxy (existing behavior).
 */
export function computeBasis(input: {
  markPrice?: number | null;
  spotPrice?: number | null;
  fundingRate?: number | null;
}): { basisPct: number; source: 'actual' | 'funding_proxy'; detail: string } {
  const { markPrice, spotPrice, fundingRate } = input;

  if (markPrice && spotPrice && spotPrice > 0) {
    const basisPct = ((markPrice - spotPrice) / spotPrice) * 100;
    return {
      basisPct: Math.round(basisPct * 10000) / 10000,
      source: 'actual',
      detail: `Basis ${basisPct.toFixed(4)}% (mark ${markPrice.toFixed(2)} vs spot ${spotPrice.toFixed(2)})`,
    };
  }

  if (fundingRate != null) {
    const basisPct = Math.abs(fundingRate) * 100;
    return {
      basisPct: Math.round(basisPct * 100) / 100,
      source: 'funding_proxy',
      detail: `Basis ~${basisPct.toFixed(2)}% (funding rate proxy, not actual spread)`,
    };
  }

  return { basisPct: 0, source: 'funding_proxy', detail: 'No basis data available' };
}

/**
 * ATR-based liquidation price estimation.
 * More accurate than fixed 10% offset.
 *
 * Long liq estimate: price - ATR * multiplier
 * Short liq estimate: price + ATR * multiplier
 */
export function computeLiqEstimate(input: {
  currentPrice: number;
  atr14?: number;
  liqDistPct?: number; // fallback fixed percentage (default 0.10 = 10%)
}): { liqLong: number; liqShort: number; source: 'atr' | 'fixed_pct' } {
  const { currentPrice, atr14, liqDistPct = 0.10 } = input;

  if (currentPrice <= 0) return { liqLong: 0, liqShort: 0, source: 'fixed_pct' };

  if (atr14 && atr14 > 0) {
    // Use 3x ATR as typical liquidation distance (approximate 5-10x leverage)
    const dist = atr14 * 3;
    return {
      liqLong: Math.round((currentPrice - dist) * 100) / 100,
      liqShort: Math.round((currentPrice + dist) * 100) / 100,
      source: 'atr',
    };
  }

  return {
    liqLong: Math.round(currentPrice * (1 - liqDistPct) * 100) / 100,
    liqShort: Math.round(currentPrice * (1 + liqDistPct) * 100) / 100,
    source: 'fixed_pct',
  };
}
