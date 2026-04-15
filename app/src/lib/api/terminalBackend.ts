import type {
  AnalyzeEnvelope,
  DerivativesEnvelope,
  EventsEnvelope,
  FlowEnvelope,
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
  chartPayload: ChartSeriesPayload | null;
  snapshot: SnapshotEnvelope | null;
  derivatives: DerivativesEnvelope | null;
}

export interface ChartSeriesPayload {
  symbol: string;
  tf: string;
  klines: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  oiBars: Array<{
    time: number;
    value: number;
    color: string;
  }>;
  fundingBars: Array<{
    time: number;
    value: number;
    color: string;
  }>;
  cvdBars?: Array<{
    time: number;
    value: number;
  }>;
  indicators: Record<string, unknown>;
}

export async function fetchTerminalBundle(args: {
  symbol: string;
  tf: string;
}): Promise<TerminalBundleResult> {
  const { symbol, tf } = args;
  const pair = `${symbol.replace('USDT', '')}/USDT`;
  const [analyzeRes, chartRes, snapshotRes, derivRes] = await Promise.allSettled([
    fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
    fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500`),
    fetch(`/api/market/snapshot?pair=${encodeURIComponent(pair)}&timeframe=${tf}&persist=0`),
    fetch(`/api/market/derivatives/${encodeURIComponent(pair)}?timeframe=${tf}`),
  ]);

  const analyze =
    analyzeRes.status === 'fulfilled' && analyzeRes.value.ok
      ? await readJson<AnalyzeEnvelope>(analyzeRes.value)
      : null;
  const chartPayload =
    chartRes.status === 'fulfilled' && chartRes.value.ok
      ? await readJson<ChartSeriesPayload>(chartRes.value)
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
    chartPayload,
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

export interface MemoryRerankRecord {
  id: string;
  score: number;
  reasons: string[];
}

export interface MemoryRerankResult {
  queryId: string;
  records: MemoryRerankRecord[];
}

export async function fetchMemoryRerank(args: {
  query: string;
  symbol: string;
  timeframe: string;
  intent: string;
  mode?: string;
  topK?: number;
  candidates: Array<{
    id: string;
    text: string;
    baseScore: number;
    confidence?: 'verified' | 'observed' | 'hypothesis';
    accessCount?: number;
    tags?: string[];
  }>;
}): Promise<MemoryRerankResult> {
  const payload = {
    query: args.query,
    top_k: args.topK ?? Math.max(1, args.candidates.length),
    context: {
      symbol: args.symbol,
      timeframe: args.timeframe,
      intent: args.intent,
      mode: args.mode ?? 'terminal',
    },
    candidates: args.candidates.map((candidate) => ({
      id: candidate.id,
      kind: 'fact',
      text: candidate.text,
      base_score: candidate.baseScore,
      confidence: candidate.confidence ?? 'observed',
      access_count: candidate.accessCount ?? 0,
      tags: candidate.tags ?? [],
    })),
  };

  const res = await fetch('/api/engine/memory/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { queryId: '', records: [] };
  const body = await readJson<{ query_id?: string; records?: Array<{ id?: string; score?: number; reasons?: string[] }> }>(res);
  const records = (body?.records ?? [])
    .filter((record) => typeof record.id === 'string' && Number.isFinite(record.score))
    .map((record) => ({
      id: record.id as string,
      score: Number(record.score),
      reasons: Array.isArray(record.reasons) ? record.reasons : [],
    }));
  return {
    queryId: body?.query_id ?? '',
    records,
  };
}

export async function sendMemoryFeedback(args: {
  queryId: string;
  memoryId: string;
  event: 'retrieved' | 'used' | 'dismissed' | 'contradicted' | 'confirmed';
  symbol: string;
  timeframe: string;
  intent: string;
  mode?: string;
}): Promise<void> {
  if (!args.queryId || !args.memoryId) return;
  await fetch('/api/engine/memory/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query_id: args.queryId,
      memory_id: args.memoryId,
      event: args.event,
      context: {
        symbol: args.symbol,
        timeframe: args.timeframe,
        intent: args.intent,
        mode: args.mode ?? 'terminal',
      },
      occurred_at: new Date().toISOString(),
    }),
  });
}

export async function sendMemoryDebugSession(args: {
  sessionId: string;
  symbol: string;
  timeframe: string;
  intent: string;
  hypotheses: Array<{
    id: string;
    text: string;
    status: 'open' | 'confirmed' | 'rejected';
    evidence?: string[];
    rejectionReason?: string;
  }>;
}): Promise<void> {
  if (!args.sessionId || args.hypotheses.length === 0) return;
  await fetch('/api/engine/memory/debug-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: args.sessionId,
      context: {
        symbol: args.symbol,
        timeframe: args.timeframe,
        intent: args.intent,
        mode: 'terminal',
      },
      hypotheses: args.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        text: hypothesis.text,
        status: hypothesis.status,
        evidence: hypothesis.evidence ?? [],
        rejection_reason: hypothesis.rejectionReason,
      })),
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    }),
  });
}
