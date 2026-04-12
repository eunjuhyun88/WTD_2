/**
 * Manages symbol-level data subscriptions.
 * When a user views BTCUSDT in the terminal, the subscription manager
 * ensures the right data types are being polled for that symbol.
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Set<string>>()

  subscribe(symbol: string, dataTypes: string[]): void {
    const existing = this.subscriptions.get(symbol) ?? new Set()
    for (const dt of dataTypes) existing.add(dt)
    this.subscriptions.set(symbol, existing)
  }

  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol)
  }

  unsubscribeDataType(symbol: string, dataType: string): void {
    const existing = this.subscriptions.get(symbol)
    if (existing) {
      existing.delete(dataType)
      if (existing.size === 0) this.subscriptions.delete(symbol)
    }
  }

  getDataTypes(symbol: string): string[] {
    const types = this.subscriptions.get(symbol)
    return types ? [...types] : []
  }

  getActiveSubscriptions(): Map<string, string[]> {
    const result = new Map<string, string[]>()
    for (const [symbol, types] of this.subscriptions) {
      result.set(symbol, [...types])
    }
    return result
  }

  getActiveSymbols(): string[] {
    return [...this.subscriptions.keys()]
  }

  isSubscribed(symbol: string, dataType?: string): boolean {
    if (!this.subscriptions.has(symbol)) return false
    if (!dataType) return true
    return this.subscriptions.get(symbol)!.has(dataType)
  }

  clear(): void {
    this.subscriptions.clear()
  }

  get symbolCount(): number {
    return this.subscriptions.size
  }
}
