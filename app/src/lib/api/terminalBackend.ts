import type {
  AnalyzeEnvelope,
  DerivativesEnvelope,
  EventsEnvelope,
  FlowEnvelope,
  SeriesBar,
  SnapshotEnvelope,
} from '$lib/contracts/terminalBackend';

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface TerminalBundleResult {
  analyze: AnalyzeEnvelope | null;
  ohlcvBars: SeriesBar[];
  oiBars: SeriesBar[];
  fundingBars: SeriesBar[];
  snapshot: SnapshotEnvelope | null;
  derivatives: DerivativesEnvelope | null;
}

export async function fetchTerminalBundle(args: {
  symbol: string;
  tf: string;
  interval: string;
  oiPeriod: string;
}): Promise<TerminalBundleResult> {
  const { symbol, tf, interval, oiPeriod } = args;
  const pair = `${symbol.replace('USDT', '')}/USDT`;
  const [analyzeRes, ohlcvRes, oiRes, fundingRes, snapshotRes, derivRes] = await Promise.allSettled([
    fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
    fetch(`/api/market/ohlcv?symbol=${symbol}&interval=${interval}&limit=100`),
    fetch(`/api/market/oi?symbol=${symbol}&period=${oiPeriod}&limit=96`),
    fetch(`/api/market/funding?symbol=${symbol}&limit=96`),
    fetch(`/api/market/snapshot?pair=${encodeURIComponent(pair)}&timeframe=${tf}&persist=0`),
    fetch(`/api/market/derivatives/${encodeURIComponent(pair)}?timeframe=${tf}`),
  ]);

  const analyze =
    analyzeRes.status === 'fulfilled' && analyzeRes.value.ok
      ? await readJson<AnalyzeEnvelope>(analyzeRes.value)
      : null;
  const ohlcvPayload =
    ohlcvRes.status === 'fulfilled' && ohlcvRes.value.ok
      ? await readJson<{ bars?: SeriesBar[] }>(ohlcvRes.value)
      : null;
  const oiPayload =
    oiRes.status === 'fulfilled' && oiRes.value.ok
      ? await readJson<{ bars?: SeriesBar[] }>(oiRes.value)
      : null;
  const fundingPayload =
    fundingRes.status === 'fulfilled' && fundingRes.value.ok
      ? await readJson<{ bars?: SeriesBar[] }>(fundingRes.value)
      : null;
  const snapshotPayload =
    snapshotRes.status === 'fulfilled' && snapshotRes.value.ok
      ? await readJson<{ data?: SnapshotEnvelope }>(snapshotRes.value)
      : null;
  const derivativesPayload =
    derivRes.status === 'fulfilled' && derivRes.value.ok
      ? await readJson<{ data?: DerivativesEnvelope }>(derivRes.value)
      : null;

  return {
    analyze,
    ohlcvBars: ohlcvPayload?.bars ?? [],
    oiBars: oiPayload?.bars ?? [],
    fundingBars: fundingPayload?.bars ?? [],
    snapshot: snapshotPayload?.data ?? null,
    derivatives: derivativesPayload?.data ?? null,
  };
}

export async function fetchFlowBias(pair: string, tf: string): Promise<'LONG' | 'SHORT' | 'NEUTRAL'> {
  const res = await fetch(`/api/market/flow?pair=${encodeURIComponent(pair)}&timeframe=${tf}`);
  if (!res.ok) return 'NEUTRAL';
  const payload = await readJson<FlowEnvelope>(res);
  return payload?.bias ?? 'NEUTRAL';
}

export async function fetchMarketEvents(pair: string, tf: string): Promise<Array<{ tag?: string; level?: string; text?: string }>> {
  const res = await fetch(`/api/market/events?pair=${encodeURIComponent(pair)}&timeframe=${tf}`);
  if (!res.ok) return [];
  const payload = await readJson<EventsEnvelope>(res);
  return payload?.data?.records ?? [];
}
