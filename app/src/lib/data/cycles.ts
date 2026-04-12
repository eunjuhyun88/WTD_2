// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Market Cycle Definitions
// ═══════════════════════════════════════════════════════════════
//
// Predefined BTC market cycles for backtesting.
// Each cycle covers a distinct market regime with known characteristics.

export interface MarketCycle {
  id: string;
  label: string;
  startDate: string;       // ISO date 'YYYY-MM-DD'
  endDate: string;         // ISO date 'YYYY-MM-DD'
  description: string;
  btcChangePercent: number; // Approximate BTC price change during cycle
  regime: 'bull' | 'bear' | 'crash' | 'recovery' | 'sideways';
}

export const MARKET_CYCLES: MarketCycle[] = [
  {
    id: '2018-bear',
    label: '2018 Capitulation',
    startDate: '2018-11-01',
    endDate: '2019-02-28',
    description: 'BCH war → $3,200 bottom. Extreme capitulation & miner shutdown.',
    btcChangePercent: -50,
    regime: 'bear',
  },
  {
    id: '2019-rally',
    label: '2019 Recovery Rally',
    startDate: '2019-03-01',
    endDate: '2019-06-30',
    description: '$3,200 → $13,800. V-shaped recovery driven by Tether/Bitfinex narrative.',
    btcChangePercent: 340,
    regime: 'bull',
  },
  {
    id: '2020-covid',
    label: '2020 COVID Crash',
    startDate: '2020-02-15',
    endDate: '2020-05-31',
    description: 'Black Thursday -53% in 24h, then rapid recovery. Liquidity cascade.',
    btcChangePercent: -10, // net: crash then recovery
    regime: 'crash',
  },
  {
    id: '2020-accumulation',
    label: '2020 Accumulation',
    startDate: '2020-06-01',
    endDate: '2020-12-31',
    description: '$9K → $29K. Institutional accumulation (MicroStrategy, Grayscale).',
    btcChangePercent: 220,
    regime: 'recovery',
  },
  {
    id: '2021-bull',
    label: '2021 Bull Run',
    startDate: '2021-01-01',
    endDate: '2021-04-14',
    description: '$29K → $64K ATH. Coinbase IPO, Tesla buy, NFT mania.',
    btcChangePercent: 120,
    regime: 'bull',
  },
  {
    id: '2021-midcycle',
    label: '2021 Mid-Cycle Crash',
    startDate: '2021-04-15',
    endDate: '2021-07-20',
    description: '$64K → $29K. China mining ban, Elon FUD, -55% drawdown.',
    btcChangePercent: -55,
    regime: 'crash',
  },
  {
    id: '2021-bull2',
    label: '2021 Bull Run 2',
    startDate: '2021-07-21',
    endDate: '2021-11-10',
    description: '$29K → $69K ATH. El Salvador, futures ETF approval.',
    btcChangePercent: 138,
    regime: 'bull',
  },
  {
    id: '2022-bear',
    label: '2022 Bear Market',
    startDate: '2022-01-01',
    endDate: '2022-11-30',
    description: '$47K → $16K. LUNA collapse, 3AC, FTX. -77% from ATH.',
    btcChangePercent: -66,
    regime: 'bear',
  },
  {
    id: '2023-recovery',
    label: '2023 Recovery',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    description: '$16K → $42K. ETF speculation, banking crisis safe haven.',
    btcChangePercent: 156,
    regime: 'recovery',
  },
  {
    id: '2024-halving',
    label: '2024 Halving Rally',
    startDate: '2024-01-01',
    endDate: '2024-03-31',
    description: '$42K → $73K. Spot ETF approval, halving anticipation.',
    btcChangePercent: 73,
    regime: 'bull',
  },
  {
    id: '2024-consolidation',
    label: '2024 Consolidation',
    startDate: '2024-04-01',
    endDate: '2024-09-30',
    description: '$73K → $54K → $66K. Post-halving ranging, Mt. Gox overhang.',
    btcChangePercent: -10,
    regime: 'sideways',
  },
  {
    id: '2024-trump',
    label: '2024 Election Rally',
    startDate: '2024-10-01',
    endDate: '2024-12-31',
    description: '$66K → $108K. Trump election, strategic BTC reserve narrative.',
    btcChangePercent: 63,
    regime: 'bull',
  },
];

// ─── Helpers ──────────────────────────────────────────────────

/** Convert ISO date string to Unix ms timestamp */
export function dateToMs(isoDate: string): number {
  return new Date(isoDate + 'T00:00:00Z').getTime();
}

/** Get cycle by ID */
export function getCycle(id: string): MarketCycle | undefined {
  return MARKET_CYCLES.find(c => c.id === id);
}

/** Interval string to milliseconds */
const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

/** Estimate number of klines for a cycle at given interval */
export function estimateKlineCount(cycle: MarketCycle, interval: string): number {
  const ms = INTERVAL_MS[interval];
  if (!ms) return 0;
  const duration = dateToMs(cycle.endDate) - dateToMs(cycle.startDate);
  return Math.ceil(duration / ms);
}

/** Supported backtest intervals */
export const BACKTEST_INTERVALS = ['1h', '4h', '1d'] as const;
export type BacktestInterval = typeof BACKTEST_INTERVALS[number];
