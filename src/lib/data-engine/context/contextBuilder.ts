import type { SeriesCache } from '../cache/seriesCache'
import type { SnapshotCache } from '../cache/snapshotCache'

/**
 * Build a MetricContext-compatible object from cached data.
 * This is the bridge between data-engine and metric-engine.
 *
 * Returns a plain object that can be spread into MetricContext.
 */
export function buildContextFromCache(
  symbol: string,
  timeframe: string,
  seriesCache: SeriesCache,
  snapshotCache: SnapshotCache,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    symbol,
    timeframe,
  }

  // Klines from series cache
  const klines = seriesCache.get(`binance:klines:${symbol}:${timeframe}`)
  if (klines) {
    context.klinePoints = klines.points
    context.klineCount = klines.points.length
  }

  // 5m klines for CVD/momentum
  const klines5m = seriesCache.get(`binance:klines:${symbol}:5m`)
  if (klines5m) context.klines5mPoints = klines5m.points

  // OI history
  const oi = seriesCache.get(`coinalyze:oi:${symbol}:${timeframe}`)
  if (oi) context.oiHistory = oi.points

  // Funding history
  const funding = seriesCache.get(`coinalyze:funding:${symbol}:${timeframe}`)
  if (funding) context.fundingHistory = funding.points

  // Snapshots
  const snapshots = snapshotCache.getAll(symbol)
  for (const snap of snapshots) {
    for (const [key, value] of Object.entries(snap.values)) {
      if (value != null) context[`snapshot_${snap.provider}_${key}`] = value
    }
  }

  return context
}
