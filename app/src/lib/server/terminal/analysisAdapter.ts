import type { TerminalWatchlistItem } from '$lib/contracts/terminalPersistence';
import { getAnalyzeEnvelope } from '$lib/server/analyze/service';
import { deriveWatchlistPreview } from '$lib/terminal/watchlistPreview';

export async function enrichTerminalWatchlist(
  items: TerminalWatchlistItem[],
  options: { skipSymbols?: string[] } = {},
): Promise<TerminalWatchlistItem[]> {
  const skipped = new Set(options.skipSymbols?.map((symbol) => symbol.toUpperCase()) ?? []);
  return Promise.all(
    items.map(async (item) => {
      if (skipped.has(item.symbol.toUpperCase())) return item;
      try {
        const payload = await getAnalyzeEnvelope({
          symbol: item.symbol,
          tf: item.timeframe,
          requestId: `watchlist:${item.symbol}:${item.timeframe}`,
        });
        return {
          ...item,
          preview: deriveWatchlistPreview(payload),
        };
      } catch {
        return item;
      }
    }),
  );
}
