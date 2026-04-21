// ═══════════════════════════════════════════════════════════════
// scanEngine.scoring — Pure scoring / conversion / formatting helpers
// ═══════════════════════════════════════════════════════════════
// Extracted from scanEngine.ts. No side effects, no external I/O.

import type { AgentSignal } from '$lib/data/warroom';

export type Vote = AgentSignal['vote'];

// ── Macro / market scoring ──────────────────────────────────────

/** Fear & Greed → contrarian score (-100 to +100) */
export function fngToScore(value: number): number {
  return Math.round(-(value - 50) * 2);
}

/** BTC dominance → score */
export function btcDominanceToScore(btcDom: number): number {
  return Math.round((btcDom - 50) * 2.5);
}

/** Gas price → activity score */
export function gasToActivityScore(gasPriceGwei: number): number {
  if (gasPriceGwei > 50) return 30;
  if (gasPriceGwei > 25) return 15;
  if (gasPriceGwei > 10) return 5;
  if (gasPriceGwei > 5) return 0;
  return -15;
}

/** Exchange netflow → score (based on ETH balance snapshot) */
export function netflowToScore(netflowEth: number): number {
  const midpoint = 2_000_000;
  const deviation = (netflowEth - midpoint) / midpoint;
  return Math.round(Math.max(-50, Math.min(50, -deviation * 80)));
}

export function whaleActivityToScore(txCount: number): number {
  if (txCount > 500) return -20;
  if (txCount > 300) return -10;
  if (txCount > 100) return 10;
  if (txCount > 50) return 5;
  return -5;
}

export function activeAddressesToScore(activeAddr: number): number {
  if (activeAddr > 600_000) return 25;
  if (activeAddr > 500_000) return 15;
  if (activeAddr > 400_000) return 5;
  if (activeAddr > 300_000) return 0;
  if (activeAddr > 200_000) return -10;
  return -20;
}

export function exchangeBalanceToScore(balanceEth: number): number {
  const midpoint = 18_000_000;
  const deviation = (balanceEth - midpoint) / midpoint;
  return Math.round(Math.max(-40, Math.min(40, -deviation * 60)));
}

/** LunarCrush sentiment (1-5) → contrarian score */
export function sentimentToScore(sentiment: number): number {
  return Math.round(-(sentiment - 3) * 20);
}

export function dominanceToScore(dominance: number): number {
  if (dominance > 25) return -25;
  if (dominance > 15) return -10;
  if (dominance < 2) return 10;
  return 0;
}

export function galaxyToConfBoost(galaxyScore: number): number {
  if (galaxyScore > 70) return 10;
  if (galaxyScore > 50) return 5;
  return 0;
}

/** DXY → crypto score (inverse correlation) */
export function dxyToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  score += changePct > 0.3 ? -15 : changePct < -0.3 ? 15 : -changePct * 30;
  if (trend1m != null) {
    score += trend1m > 2 ? -20 : trend1m < -2 ? 20 : -trend1m * 8;
  }
  return Math.round(Math.max(-40, Math.min(40, score)));
}

export function equityToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  score += changePct > 0.5 ? 10 : changePct < -0.5 ? -10 : changePct * 15;
  if (trend1m != null) {
    score += trend1m > 3 ? 15 : trend1m < -3 ? -15 : trend1m * 4;
  }
  return Math.round(Math.max(-30, Math.min(30, score)));
}

export function yieldToScore(changePct: number): number {
  const score = changePct > 2 ? -20 : changePct < -2 ? 20 : -changePct * 8;
  return Math.round(Math.max(-25, Math.min(25, score)));
}

// ── Computation / formatting helpers ────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) >= 1000) return Math.round(value);
  if (Math.abs(value) >= 100) return Number(value.toFixed(2));
  return Number(value.toFixed(4));
}

export function fmtPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0';
  if (Math.abs(price) >= 1000) return '$' + price.toLocaleString();
  return '$' + price.toFixed(price >= 100 ? 2 : 4);
}

export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function fmtSignedPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatOI(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatFunding(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

// ── Vote / confidence helpers ────────────────────────────────────

export function scoreToVote(score: number, neutralBand = 0.12): Vote {
  if (score > neutralBand) return 'long';
  if (score < -neutralBand) return 'short';
  return 'neutral';
}

export function scoreToConfidence(score: number, base = 58): number {
  const conf = base + Math.abs(score) * 30;
  return Math.round(clamp(conf, 45, 95));
}

export function buildTradePlan(entry: number, vote: Vote, score: number, atrPct: number | null) {
  const baseDir = vote === 'neutral' ? (score >= 0 ? 'long' : 'short') : vote;
  const riskPct = atrPct != null ? clamp((atrPct / 100) * 0.9, 0.0035, 0.03) : 0.008;
  const rr = vote === 'neutral' ? 1.35 : 1.8;
  const risk = Math.max(entry * riskPct, entry * 0.0035);
  const sl = baseDir === 'long' ? roundPrice(entry - risk) : roundPrice(entry + risk);
  const tp = baseDir === 'long' ? roundPrice(entry + risk * rr) : roundPrice(entry - risk * rr);
  return { entry: roundPrice(entry), tp, sl };
}
