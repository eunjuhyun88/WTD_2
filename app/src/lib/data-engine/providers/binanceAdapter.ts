import type { DataEngineProvider } from './providerAdapter'
import type { NormalizedSeries, NormalizedSnapshot } from '../types'
import { normalizeSymbol } from '../normalization/normalizeSymbol'
import { normalizeTimestamp } from '../normalization/normalizeTimestamp'

/**
 * Binance provider adapter.
 * Wraps the existing binance.ts provider and converts to NormalizedSeries.
 *
 * Note: Does NOT import binance.ts directly to avoid server-side dependency.
 * Instead, accepts a fetch function that the caller provides.
 */
export function createBinanceAdapter(deps: {
  fetchKlines: (symbol: string, interval: string, limit: number) => Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>>
  fetch24hr: (symbol: string) => Promise<{ priceChangePercent: string; volume: string; lastPrice: string } | null>
}): DataEngineProvider {
  return {
    name: 'binance',

    async fetchSeries(symbol, metric, tf, limit) {
      const normalized = normalizeSymbol(symbol)
      if (metric !== 'klines') return null

      try {
        const klines = await deps.fetchKlines(normalized, tf, limit)
        return {
          id: `binance:klines:${normalized}:${tf}`,
          symbol: normalized,
          timeframe: tf,
          provider: 'binance',
          unit: 'usd',
          points: klines.map(k => ({
            ts: normalizeTimestamp(k.time),
            value: k.close,
          })),
          meta: {
            fetchedAt: normalizeTimestamp(Date.now()),
            ttlMs: 60_000,
            cadence: '1m',
          },
        }
      } catch {
        return null
      }
    },

    async fetchSnapshot(symbol, metric) {
      if (metric !== 'ticker') return null
      const normalized = normalizeSymbol(symbol)

      try {
        const ticker = await deps.fetch24hr(normalized)
        if (!ticker) return null
        return {
          id: `binance:ticker:${normalized}`,
          symbol: normalized,
          provider: 'binance',
          ts: normalizeTimestamp(Date.now()),
          values: {
            price: parseFloat(ticker.lastPrice) || null,
            volume24h: parseFloat(ticker.volume) || null,
            changePct24h: parseFloat(ticker.priceChangePercent) || null,
          },
        }
      } catch {
        return null
      }
    },

    isAvailable: () => true,
  }
}
