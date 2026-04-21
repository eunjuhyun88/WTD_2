export function getScanMarketMaxParallelSymbols(): number {
  const raw = process.env.SCAN_MARKET_MAX_PARALLEL_SYMBOLS?.trim() ?? '';
  const parsed = raw === '' ? 6 : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(32, parsed));
}

export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  if (items.length === 0) return [];

  const results = new Array<PromiseSettledResult<R>>(items.length);
  const concurrency = Math.max(1, Math.min(items.length, limit));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        results[currentIndex] = {
          status: 'fulfilled',
          value: await mapper(items[currentIndex], currentIndex),
        };
      } catch (reason) {
        results[currentIndex] = {
          status: 'rejected',
          reason,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
