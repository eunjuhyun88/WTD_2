import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type { TerminalWatchlistItem, WatchlistPreview } from '$lib/contracts/terminalPersistence';
import { getAnalyzeEnvelope } from '$lib/server/analyze/service';

export function deriveWatchlistPreview(payload: AnalyzeEnvelope | null): WatchlistPreview | undefined {
  if (!payload) return undefined;

  const verdict = String(payload.deep?.verdict ?? '').toUpperCase();
  const bias =
    payload.riskPlan?.bias?.includes('bear') || verdict.includes('BEAR')
      ? 'bearish'
      : payload.riskPlan?.bias?.includes('bull') || verdict.includes('BULL')
        ? 'bullish'
        : 'neutral';

  return {
    price: payload.price ?? null,
    change24h: payload.change24h ?? null,
    bias,
    confidence:
      payload.entryPlan?.confidencePct != null && payload.entryPlan.confidencePct >= 68
        ? 'high'
        : payload.entryPlan?.confidencePct != null && payload.entryPlan.confidencePct >= 54
          ? 'medium'
          : 'low',
    action: payload.ensemble?.reason ?? payload.riskPlan?.bias ?? undefined,
    invalidation: payload.riskPlan?.invalidation ?? undefined,
  };
}

export async function enrichTerminalWatchlist(items: TerminalWatchlistItem[]): Promise<TerminalWatchlistItem[]> {
  return Promise.all(
    items.map(async (item) => {
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
