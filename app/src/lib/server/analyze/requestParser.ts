import type { AnalyzeRequestInput } from './types';

function normalizeOrDefault(value: string | null, fallback: string, transform: (input: string) => string): string {
  const normalized = typeof value === 'string' ? transform(value.trim()) : '';
  return normalized || fallback;
}

export function parseAnalyzeRequest(url: URL): AnalyzeRequestInput {
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw ? parseInt(fromRaw, 10) : undefined;
  const to = toRaw ? parseInt(toRaw, 10) : undefined;
  return {
    symbol: normalizeOrDefault(url.searchParams.get('symbol'), 'BTCUSDT', (input) => input.toUpperCase()),
    tf: normalizeOrDefault(url.searchParams.get('tf'), '4h', (input) => input.toLowerCase()),
    ...(Number.isFinite(from) && { from }),
    ...(Number.isFinite(to) && { to }),
  };
}
