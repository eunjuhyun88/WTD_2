import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type { WatchlistPreview } from '$lib/contracts/terminalPersistence';

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
