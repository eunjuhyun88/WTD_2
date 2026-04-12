/**
 * BTC Halving Cycle Position
 *
 * Known BTC halvings:
 * - 2012-11-28 (block 210,000)
 * - 2016-07-09 (block 420,000)
 * - 2020-05-11 (block 630,000)
 * - 2024-04-19 (block 840,000)
 * - Next expected: ~2028-04 (block 1,050,000)
 *
 * Cycle position = daysSinceLastHalving / avgCycleDays (~1460)
 *
 * Scoring based on historical cycle patterns:
 * - 0-15%: Post-halving accumulation (historically bullish)
 * - 15-50%: Bull run phase
 * - 50-75%: Peak / distribution
 * - 75-100%: Bear market / late accumulation
 */

const HALVING_DATES = [
  new Date('2012-11-28T00:00:00Z').getTime(),
  new Date('2016-07-09T00:00:00Z').getTime(),
  new Date('2020-05-11T00:00:00Z').getTime(),
  new Date('2024-04-19T00:00:00Z').getTime(),
];

const AVG_CYCLE_DAYS = 1460; // ~4 years
const MS_PER_DAY = 86_400_000;

export function computeCyclePosition(nowMs: number = Date.now()): {
  cycleProgress: number; // 0.0 to 1.0+
  daysSinceHalving: number;
  phase: 'ACCUMULATION' | 'BULL_RUN' | 'DISTRIBUTION' | 'BEAR_LATE_ACC';
  score: number; // -100 to +100
  detail: string;
} {
  // Find most recent halving
  let lastHalving = HALVING_DATES[0];
  for (const h of HALVING_DATES) {
    if (h <= nowMs) lastHalving = h;
  }

  const daysSince = Math.floor((nowMs - lastHalving) / MS_PER_DAY);
  const progress = daysSince / AVG_CYCLE_DAYS;

  let phase: 'ACCUMULATION' | 'BULL_RUN' | 'DISTRIBUTION' | 'BEAR_LATE_ACC';
  let score: number;

  if (progress < 0.15) {
    phase = 'ACCUMULATION';
    score = 60; // post-halving = historically bullish
  } else if (progress < 0.50) {
    phase = 'BULL_RUN';
    score = 40; // mid-cycle bull
  } else if (progress < 0.75) {
    phase = 'DISTRIBUTION';
    score = -40; // peak / distribution zone
  } else {
    phase = 'BEAR_LATE_ACC';
    score = -20; // bear market, but approaching next halving
  }

  const detail = `Cycle ${(progress * 100).toFixed(1)}% · ${daysSince}d since halving · ${phase}`;
  return { cycleProgress: Math.round(progress * 1000) / 1000, daysSinceHalving: daysSince, phase, score, detail };
}
