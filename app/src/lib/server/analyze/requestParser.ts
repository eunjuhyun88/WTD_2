import type { AnalyzeRequestInput } from './types';

function normalizeOrDefault(value: string | null, fallback: string, transform: (input: string) => string): string {
  const normalized = typeof value === 'string' ? transform(value.trim()) : '';
  return normalized || fallback;
}

export function parseAnalyzeRequest(url: URL): AnalyzeRequestInput {
  return {
    symbol: normalizeOrDefault(url.searchParams.get('symbol'), 'BTCUSDT', (input) => input.toUpperCase()),
    tf: normalizeOrDefault(url.searchParams.get('tf'), '4h', (input) => input.toLowerCase()),
  };
}
