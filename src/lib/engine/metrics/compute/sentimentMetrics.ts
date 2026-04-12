/**
 * Sentiment Metrics (Santiment methodology)
 *
 * Santiment uses ML models trained on ~1.6M tweets.
 * Each document gets positive_score + negative_score = 1.
 * Aggregation uses 0.7 confidence threshold.
 */

/**
 * Sentiment Balance
 * Formula: positive_sentiment - negative_sentiment
 * where positive/negative only count documents with score > 0.7
 *
 * Range: unbounded, typically [-100, +100]
 */
export function computeSentimentBalance(
  positive: number | null | undefined,
  negative: number | null | undefined
): { balance: number | null; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null } {
  if (positive == null || negative == null) return { balance: null, signal: null };
  const balance = positive - negative;
  let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  if (balance > 10) signal = 'BULLISH';
  else if (balance < -10) signal = 'BEARISH';
  else signal = 'NEUTRAL';
  return { balance, signal };
}

/**
 * Weighted Sentiment (Santiment methodology)
 *
 * Formula: Z-score of (unique_social_volume × sentiment_balance)
 *   X(t) = unique_social_volume(t) × sentiment_balance(t)
 *   weighted_sentiment(t, d) = (X(t) - mean(X, window=d)) / stddev(X, window=d)
 *
 * Spikes when: high social volume AND strong directional sentiment
 * Near zero when: low volume OR mixed sentiment
 *
 * @param history Array of { uniqueSocialVol, sentimentBalance } data points
 * @param windowSize Rolling Z-score window (default 14 periods)
 */
export function computeWeightedSentiment(
  history: Array<{ uniqueSocialVol: number; sentimentBalance: number }>,
  windowSize = 14
): { value: number | null; signal: 'EXTREME_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'EXTREME_BEAR' | null } {
  if (history.length < windowSize + 1) return { value: null, signal: null };

  // Compute X = uniqueSocialVol × sentimentBalance for each period
  const xValues = history.map(h => h.uniqueSocialVol * h.sentimentBalance);

  // Rolling window for mean and stddev
  const window = xValues.slice(-windowSize);
  const currentX = xValues[xValues.length - 1];

  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
  const stddev = Math.sqrt(variance);

  if (stddev <= 0) return { value: 0, signal: 'NEUTRAL' };

  const zscore = (currentX - mean) / stddev;
  const rounded = Math.round(zscore * 1000) / 1000;

  let signal: 'EXTREME_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'EXTREME_BEAR';
  if (zscore > 2) signal = 'EXTREME_BULL';
  else if (zscore > 1) signal = 'BULL';
  else if (zscore < -2) signal = 'EXTREME_BEAR';
  else if (zscore < -1) signal = 'BEAR';
  else signal = 'NEUTRAL';

  return { value: rounded, signal };
}

/**
 * Fear & Greed Index scoring
 *
 * Scale: 0-100
 * Factors: Volatility 25%, Momentum/Volume 25%, Social 15%,
 *          Surveys 15% (paused), BTC Dominance 10%, Trends 10%
 *
 * Zones: Extreme Fear (0-24), Fear (25-49), Neutral (50),
 *        Greed (51-74), Extreme Greed (75-100)
 */
export function classifyFearGreed(value: number | null | undefined): {
  value: number | null;
  zone: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED' | null;
  contrarianSignal: 'BUY' | 'SELL' | 'NONE' | null;
} {
  if (value == null || !Number.isFinite(value)) {
    return { value: null, zone: null, contrarianSignal: null };
  }

  let zone: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  let contrarianSignal: 'BUY' | 'SELL' | 'NONE';

  if (value <= 24) { zone = 'EXTREME_FEAR'; contrarianSignal = 'BUY'; }
  else if (value <= 49) { zone = 'FEAR'; contrarianSignal = 'NONE'; }
  else if (value <= 51) { zone = 'NEUTRAL'; contrarianSignal = 'NONE'; }
  else if (value <= 74) { zone = 'GREED'; contrarianSignal = 'NONE'; }
  else { zone = 'EXTREME_GREED'; contrarianSignal = 'SELL'; }

  return { value, zone, contrarianSignal };
}
