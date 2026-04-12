// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Passport Pure Helper Functions
//  Extracted from passport/+page.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

import type { HoldingAsset } from '$lib/data/holdings';
import { timeSince as _timeSince, formatAgo as _formatAgo } from '$lib/utils/time';

// ─── Asset Constants ─────────────────────────────────────────

/** Color map for known assets (donut chart) */
export const ASSET_COLORS: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#14f195', AVAX: '#e84142',
  DOGE: '#c2a633', USDC: '#2775ca', USDT: '#26a17b', BNB: '#f3ba2f',
  ADA: '#0d1e30', MATIC: '#8247e5', DOT: '#e6007a', LINK: '#2a5ada',
};

/** Icon map for known assets */
export const ASSET_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', SOL: 'S', AVAX: 'A', DOGE: 'Ð',
  USDC: '$', USDT: '$', BNB: 'B', ADA: 'A', MATIC: 'M', DOT: 'D', LINK: 'L',
};

// ─── Holdings Helpers ────────────────────────────────────────

/** Overlay live prices onto holdings array and recalculate allocation */
export function withLivePrices(holdings: HoldingAsset[], prices: Record<string, number>): HoldingAsset[] {
  const repriced = holdings.map((asset) => {
    const livePrice = prices[asset.symbol];
    const currentPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : asset.currentPrice;
    return { ...asset, currentPrice };
  });

  const totalValue = repriced.reduce((sum, asset) => sum + asset.amount * asset.currentPrice, 0);
  if (totalValue <= 0) {
    return repriced.map((asset) => ({ ...asset, allocation: 0 }));
  }

  return repriced.map((asset) => ({
    ...asset,
    allocation: (asset.amount * asset.currentPrice) / totalValue,
  }));
}

/** Convert raw API holding item to HoldingAsset */
export function toHoldingAsset(item: {
  symbol: string;
  name: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
}): HoldingAsset {
  return {
    symbol: item.symbol,
    name: item.name,
    icon: ASSET_ICONS[item.symbol] || item.symbol[0],
    color: ASSET_COLORS[item.symbol] || '#888',
    amount: item.amount,
    avgPrice: item.avgPrice,
    currentPrice: item.currentPrice,
    allocation: 0,
  };
}

// ─── Trade Statistics ────────────────────────────────────────

interface ClosedTradeLike {
  closePnl?: number | null;
}

interface DirectionalTradeLike {
  dir?: string | null;
}

/** Summarize closed trades into win/loss stats */
export function summarizeClosedTrades(trades: ClosedTradeLike[]) {
  let wins = 0;
  let losses = 0;
  let winPnlSum = 0;
  let lossPnlAbsSum = 0;

  for (const trade of trades) {
    const pnl = trade.closePnl ?? 0;
    if (pnl > 0) {
      wins += 1;
      winPnlSum += pnl;
    } else if (pnl < 0) {
      losses += 1;
      lossPnlAbsSum += Math.abs(pnl);
    }
  }

  return {
    wins,
    losses,
    avgWinPnl: wins > 0 ? winPnlSum / wins : 0,
    avgLossPnl: losses > 0 ? lossPnlAbsSum / losses : 0
  };
}

/** Count how many trades are LONG */
export function countLongTrades(trades: DirectionalTradeLike[]): number {
  return trades.reduce((count, trade) => count + (trade.dir === 'LONG' ? 1 : 0), 0);
}

// ─── Display Helpers ─────────────────────────────────────────

export type FocusTone = 'good' | 'warn' | 'bad' | 'neutral';

/** Map focus tone to CSS class name */
export function focusToneClass(tone: FocusTone): string {
  if (tone === 'good') return 'focus-good';
  if (tone === 'warn') return 'focus-warn';
  if (tone === 'bad') return 'focus-bad';
  return 'focus-neutral';
}

/** Format timestamp as locale date-time string */
export function formatDateTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '-';
  return new Date(ts).toLocaleString();
}

/** Format timestamp as relative "ago" string */
export const formatAgo = _formatAgo;

/** Map status string to color */
export function statusColor(status: string | null | undefined): string {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'failed' || normalized === 'fail') return '#ff725d';
  if (normalized === 'running' || normalized === 'processing') return '#ffd060';
  if (normalized === 'succeeded' || normalized === 'done' || normalized === 'pass' || normalized === 'ready') return '#9dffcf';
  if (normalized === 'queued' || normalized === 'pending' || normalized === 'draft') return '#8bd8ff';
  return '#c9c2bf';
}

/** Truncate text to maxLen with ellipsis */
export function compactSummary(text: string, maxLen = 240): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}

/** Format eval metrics as compact preview string */
export function evalMetricsPreview(metrics: Record<string, unknown>): string {
  const pairs = Object.entries(metrics).slice(0, 3);
  if (pairs.length === 0) return 'No metrics';
  return pairs
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(3) : String(v)}`)
    .join(' · ');
}

// ─── Tier Display ────────────────────────────────────────────

/** Map tier to display color */
export function tierColor(t: string): string {
  if (t === 'diamond') return '#00d4ff';
  if (t === 'gold') return '#ffd060';
  if (t === 'silver') return '#c0c0c0';
  return '#cd7f32';
}

/** Map tier to emoji */
export function tierEmoji(t: string): string {
  if (t === 'diamond') return '💎';
  if (t === 'gold') return '🏆';
  if (t === 'silver') return '🌙';
  return '🐶';
}

/** Map tier to display label */
export function tierLabel(t: string): string {
  if (t === 'diamond') return 'DIAMOND PAWS';
  if (t === 'gold') return 'GOLD DOGE';
  if (t === 'silver') return 'SILVER MOON';
  return 'BRONZE WOW';
}

// ─── PnL Formatting ─────────────────────────────────────────

/** Return color based on PnL sign */
export function pnlColor(v: number): string { return v >= 0 ? '#00ff88' : '#ff2d55'; }

/** Return prefix sign for PnL value */
export function pnlPrefix(v: number): string { return v >= 0 ? '+' : ''; }

/** Format timestamp as relative time-since string */
export const timeSince = _timeSince;

// ─── Tab Validation ──────────────────────────────────────────

export type PassportTabType = 'profile' | 'wallet' | 'positions' | 'arena';

/** Type guard for valid passport tab values */
export function isPassportTab(value: string): value is PassportTabType {
  return value === 'profile' || value === 'wallet' || value === 'positions' || value === 'arena';
}
