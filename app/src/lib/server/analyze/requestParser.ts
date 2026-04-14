import type { AnalyzeRequestInput } from './types';

export function parseAnalyzeRequest(url: URL): AnalyzeRequestInput {
  return {
    symbol: (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase(),
    tf: (url.searchParams.get('tf') || '4h').toLowerCase(),
  };
}
