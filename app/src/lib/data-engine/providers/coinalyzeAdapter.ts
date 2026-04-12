import type { DataEngineProvider } from './providerAdapter'
import type { NormalizedSeries, NormalizedSnapshot, DataCadence } from '../types'
import { normalizeSymbol } from '../normalization/normalizeSymbol'
import { normalizeTimestamp } from '../normalization/normalizeTimestamp'

/**
 * Coinalyze provider adapter.
 * Wraps coinalyze.ts for cross-exchange derivatives data.
 */
export function createCoinalyzeAdapter(deps: {
  fetchOIHistory: (pair: string, tf: string, limit: number) => Promise<Array<{ time: number; value: number }>>
  fetchFundingHistory: (pair: string, tf: string, limit: number) => Promise<Array<{ time: number; value: number }>>
  fetchCurrentOI: (pair: string) => Promise<{ value: number; update: number } | null>
  fetchCurrentFunding: (pair: string) => Promise<{ value: number; update: number } | null>
}): DataEngineProvider {
  return {
    name: 'coinalyze',

    async fetchSeries(symbol, metric, tf, limit) {
      const normalized = normalizeSymbol(symbol)
      try {
        if (metric === 'oi') {
          const data = await deps.fetchOIHistory(normalized, tf, limit)
          return {
            id: `coinalyze:oi:${normalized}:${tf}`,
            symbol: normalized,
            timeframe: tf,
            provider: 'coinalyze',
            unit: 'usd',
            points: data.map(d => ({ ts: normalizeTimestamp(d.time), value: d.value })),
            meta: { fetchedAt: normalizeTimestamp(Date.now()), ttlMs: 60_000, cadence: '5m' as DataCadence },
          }
        }
        if (metric === 'funding') {
          const data = await deps.fetchFundingHistory(normalized, tf, limit)
          return {
            id: `coinalyze:funding:${normalized}:${tf}`,
            symbol: normalized,
            timeframe: tf,
            provider: 'coinalyze',
            unit: 'ratio',
            points: data.map(d => ({ ts: normalizeTimestamp(d.time), value: d.value })),
            meta: { fetchedAt: normalizeTimestamp(Date.now()), ttlMs: 60_000, cadence: '5m' as DataCadence },
          }
        }
        return null
      } catch {
        return null
      }
    },

    async fetchSnapshot(symbol, metric) {
      const normalized = normalizeSymbol(symbol)
      try {
        if (metric === 'oi') {
          const data = await deps.fetchCurrentOI(normalized)
          if (!data) return null
          return {
            id: `coinalyze:oi:${normalized}`,
            symbol: normalized,
            provider: 'coinalyze',
            ts: normalizeTimestamp(data.update),
            values: { oi_usd: data.value } as Record<string, number | null>,
          }
        }
        if (metric === 'funding') {
          const data = await deps.fetchCurrentFunding(normalized)
          if (!data) return null
          return {
            id: `coinalyze:funding:${normalized}`,
            symbol: normalized,
            provider: 'coinalyze',
            ts: normalizeTimestamp(data.update),
            values: { funding_rate: data.value } as Record<string, number | null>,
          }
        }
        return null
      } catch {
        return null
      }
    },

    isAvailable: () => true,
  }
}
