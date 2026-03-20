// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Etherscan On-chain Client (B-05)
// ═══════════════════════════════════════════════════════════════
// Client-side wrapper for /api/etherscan/onchain proxy
// Maps to: FLOW agent → EXCHANGE_FLOW, VALUATION agent → network activity

export interface EthOnchainData {
  gas: {
    safe: number;
    standard: number;
    fast: number;
    baseFee: number;
  } | null;
  ethSupply: number | null;
  ethPrice: { ethbtc: number; ethusd: number } | null;
  exchangeNetflowEth: number | null;
  // Dune Analytics on-chain metrics
  whaleActivity: number | null;     // large tx count (>$100k) last 24h
  activeAddresses: number | null;   // daily active addresses
  exchangeBalance: number | null;   // ETH held on exchanges (Dune)
  updatedAt: number;
}

/** Fetch on-chain data from our Etherscan proxy */
export async function fetchEthOnchain(): Promise<EthOnchainData | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('/api/etherscan/onchain', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[EthOnchain] fetch error:', err);
    return null;
  }
}

/**
 * Convert gas price to network activity score.
 * High gas → high demand → bullish signal
 * Low gas → low activity → neutral/bearish
 * Range: -30 to +30
 */
export function gasToActivityScore(gasPriceGwei: number): number {
  if (gasPriceGwei > 50) return 30;   // extreme demand
  if (gasPriceGwei > 25) return 15;   // high demand
  if (gasPriceGwei > 10) return 5;    // moderate
  if (gasPriceGwei > 5) return 0;     // normal
  return -15;                          // very low activity
}

/**
 * Convert exchange netflow to flow score.
 * Large balance on exchange → potential sell pressure → bearish
 * Declining balance → accumulation → bullish
 * Returns -50 to +50
 */
export function netflowToScore(netflowEth: number): number {
  // Simple heuristic based on absolute exchange balance
  // Higher balance = more supply on exchanges = bearish
  // This is a snapshot, not a delta — we estimate based on known ranges
  // Binance top addresses typically hold 1-5M ETH
  const midpoint = 2_000_000; // 2M ETH as neutral benchmark
  const deviation = (netflowEth - midpoint) / midpoint;
  return Math.round(Math.max(-50, Math.min(50, -deviation * 80)));
}

/**
 * Whale activity score (Dune).
 * High whale tx count → big money moving → volatility signal
 * Very high = potential distribution (bearish), moderate = accumulation (bullish)
 * Returns -30 to +30
 */
export function whaleActivityToScore(txCount: number): number {
  if (txCount > 500) return -20;  // extreme whale activity → distribution risk
  if (txCount > 300) return -10;  // elevated activity → caution
  if (txCount > 100) return 10;   // moderate activity → healthy accumulation
  if (txCount > 50) return 5;     // normal activity
  return -5;                       // very low → low liquidity risk
}

/**
 * Active addresses score (Dune).
 * Growing active addresses = network adoption = bullish
 * Declining = waning interest = bearish
 * Returns -25 to +25
 */
export function activeAddressesToScore(activeAddr: number): number {
  // ETH typical range: 300K-600K daily active addresses
  if (activeAddr > 600_000) return 25;   // extremely high adoption
  if (activeAddr > 500_000) return 15;   // strong adoption
  if (activeAddr > 400_000) return 5;    // healthy
  if (activeAddr > 300_000) return 0;    // normal
  if (activeAddr > 200_000) return -10;  // declining
  return -20;                             // very low = bearish
}

/**
 * Exchange balance delta score (Dune ETH exchange balance).
 * High exchange reserves → potential sell pressure → bearish
 * Low exchange reserves → holders withdrawing → bullish
 * Returns -40 to +40
 */
export function exchangeBalanceToScore(balanceEth: number): number {
  // ETH exchange reserves benchmarks (2024-2026): ~15-25M ETH
  const midpoint = 18_000_000; // 18M ETH neutral
  const deviation = (balanceEth - midpoint) / midpoint;
  return Math.round(Math.max(-40, Math.min(40, -deviation * 60)));
}
