/**
 * Map a higher-timeframe indicator series onto lower-timeframe bar times (TradingView-style forward step).
 * For each LTF open time `t`, uses the last HTF point with `time <= t` (Binance kline `time` = bar open ms→s).
 */
export function alignHtfSeriesToLtfTimes(
  ltfTimes: number[],
  htfSeries: Array<{ time: number; value: number }>,
): Array<{ time: number; value: number }> {
  if (ltfTimes.length === 0 || htfSeries.length === 0) return [];
  let h = 0;
  let cur: number | null = null;
  return ltfTimes.map((t) => {
    while (h < htfSeries.length && htfSeries[h].time <= t) {
      cur = htfSeries[h].value;
      h++;
    }
    return { time: t, value: cur ?? Number.NaN };
  });
}

/** Minutes per bar for comparison (approximate; matches terminal TF keys). */
export const TF_MINUTES: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '6h': 360,
  '12h': 720,
  '1d': 1440,
  '1w': 10080,
};

export function tfMinutes(tf: string): number {
  return TF_MINUTES[tf] ?? 60;
}

/** True if `higherTf` is strictly higher timeframe than `chartTf`. */
export function isStrictlyHigherTf(chartTf: string, higherTf: string): boolean {
  return tfMinutes(higherTf) > tfMinutes(chartTf);
}
