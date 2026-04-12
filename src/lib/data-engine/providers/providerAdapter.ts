import type { NormalizedSeries, NormalizedSnapshot } from '../types'

/**
 * Interface for data-engine provider adapters.
 * Wraps existing provider implementations and converts their output
 * to normalized format.
 */
export interface DataEngineProvider {
  readonly name: string
  fetchSeries(symbol: string, metric: string, tf: string, limit: number): Promise<NormalizedSeries | null>
  fetchSnapshot(symbol: string, metric: string): Promise<NormalizedSnapshot | null>
  isAvailable(): boolean
}

/**
 * Registry of data engine providers.
 */
export class ProviderRegistry {
  private providers = new Map<string, DataEngineProvider>()

  register(provider: DataEngineProvider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): DataEngineProvider | undefined {
    return this.providers.get(name)
  }

  getAll(): DataEngineProvider[] {
    return [...this.providers.values()]
  }

  getAvailable(): DataEngineProvider[] {
    return [...this.providers.values()].filter(p => p.isAvailable())
  }

  get count(): number {
    return this.providers.size
  }
}
