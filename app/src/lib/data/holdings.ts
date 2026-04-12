// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Holdings Data
// ═══════════════════════════════════════════════════════════════

export interface HoldingAsset {
  symbol: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  allocation: number;
}

export const HOLDINGS_DATA: HoldingAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a', amount: 0.85, avgPrice: 94200, currentPrice: 97420, allocation: 0.52 },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ', color: '#627eea', amount: 8.2, avgPrice: 3200, currentPrice: 3481, allocation: 0.18 },
  { symbol: 'SOL', name: 'Solana', icon: 'S', color: '#14f195', amount: 120, avgPrice: 175, currentPrice: 198.46, allocation: 0.15 },
  { symbol: 'AVAX', name: 'Avalanche', icon: 'A', color: '#e84142', amount: 250, avgPrice: 32, currentPrice: 38.50, allocation: 0.06 },
  { symbol: 'DOGE', name: 'Dogecoin', icon: 'Ð', color: '#c2a633', amount: 50000, avgPrice: 0.08, currentPrice: 0.092, allocation: 0.03 },
  { symbol: 'USDC', name: 'USD Coin', icon: '$', color: '#2775ca', amount: 5800, avgPrice: 1, currentPrice: 1, allocation: 0.06 }
];

export function calcTotal(): number {
  return HOLDINGS_DATA.reduce((sum, h) => sum + h.amount * h.currentPrice, 0);
}

export function calcPnL(asset: HoldingAsset): { amount: number; percent: number } {
  const cost = asset.amount * asset.avgPrice;
  const value = asset.amount * asset.currentPrice;
  return {
    amount: value - cost,
    percent: ((value - cost) / cost) * 100
  };
}
