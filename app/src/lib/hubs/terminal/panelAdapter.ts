/**
 * Cogochi panel adapter.
 *
 * Thin view-model types for wiring terminal components into the
 * cogochi AppShell decide layer. Kept separate from the terminal
 * panelAdapter to avoid naming collisions.
 */

export interface CogochiPanelViewModel {
  symbol: string;
  timeframe: string;
  patternSlug: string | null;
  verdict: string | null;
  confidence: number | null;
  evidence: Array<{ label: string; value: string; tone: 'pos' | 'neg' | 'amb' | 'neutral' }>;
}

export function buildCogochiDecisionBundle(input: {
  symbol: string;
  timeframe?: string;
  patternSlug?: string;
}): CogochiPanelViewModel {
  return {
    symbol: input.symbol,
    timeframe: input.timeframe ?? '1h',
    patternSlug: input.patternSlug ?? null,
    verdict: null,
    confidence: null,
    evidence: [],
  };
}
