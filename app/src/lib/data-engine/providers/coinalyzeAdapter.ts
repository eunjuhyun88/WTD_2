import type { DataEngineProvider } from './providerAdapter'
import type { NormalizedSeries, NormalizedSnapshot } from '../types'
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

    async fetchSeries(symbol: string, metric: string, tf: string, limit: number): Promise<NormalizedSeries | null> {
      const normalized = normalizeSymbol(symbol)
      try {
        if (metric === 'oi') {
          const data = await deps.fetchOIHistory(normalized, tf, limit)
          return {
            rawId: `coinalyze:oi:${normalized}:${tf}`,
            symbol: normalized,
            tf,
            points: data.map(d => ({ t: normalizeTimestamp(d.time), v: d.value })),
            updatedAt: Date.now(),
          }
        }
        if (metric === 'funding') {
          const data = await deps.fetchFundingHistory(normalized, tf, limit)
          return {
            rawId: `coinalyze:funding:${normalized}:${tf}`,
            symbol: normalized,
            tf,
            points: data.map(d => ({ t: normalizeTimestamp(d.time), v: d.value })),
            updatedAt: Date.now(),
          }
        }
        return null
      } catch {
        return null
      }
    },

    async fetchSnapshot(symbol: string, metric: string): Promise<NormalizedSnapshot | null> {
      const normalized = normalizeSymbol(symbol)
      try {
        if (metric === 'oi') {
          const data = await deps.fetchCurrentOI(normalized)
          if (!data) return null
          return {
            rawId: `coinalyze:oi:${normalized}`,
            symbol: normalized,
            value: data.value,
            updatedAt: normalizeTimestamp(data.update),
          }
        }
        if (metric === 'funding') {
          const data = await deps.fetchCurrentFunding(normalized)
          if (!data) return null
          return {
            rawId: `coinalyze:funding:${normalized}`,
            symbol: normalized,
            value: data.value,
            updatedAt: normalizeTimestamp(data.update),
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
