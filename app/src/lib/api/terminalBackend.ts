import type {
  AnalyzeEnvelope,
  DerivativesEnvelope,
  EventsEnvelope,
  FlowEnvelope,
  SnapshotEnvelope,
} from '$lib/contracts/terminalBackend';
import type { ConfluenceResult } from '$lib/confluence/types';
import type { MemoryQueryResponse } from '$lib/contracts/terminalMemory';
import type { CaptureRecord, RuntimeCaptureListResponse } from '$lib/contracts/runtime/captures';
import type {
  FundingFlipPayload,
  FundingHistoryPayload,
  IndicatorContextPayload,
  LiqClusterPayload,
  OptionsSnapshotPayload,
  RvConePayload,
  SsrPayload,
  VenueDivergencePayload,
} from '$lib/indicators/adapter';
import {
  fromEngineMemoryQueryWire,
  toEngineMemoryDebugSessionWire,
  toEngineMemoryFeedbackWire,
  toEngineMemoryQueryWire,
} from '$lib/api/terminalMemoryAdapter';

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

export type RecentCaptureSummary = Pick<
  CaptureRecord,
  'capture_id' | 'symbol' | 'pattern_slug' | 'timeframe' | 'captured_at_ms' | 'status'
>;

export interface ConfluenceHistoryEntry {
  at: number;
  score: number;
  confidence: number;
  regime: string;
  divergence: boolean;
}

export interface TradeOutcomeResult {
  saved: boolean;
  count: number;
  training_triggered: boolean;
}

export interface AlphaWorldModelPhase {
  symbol: string;
  grade: string;
  phase: string;
  entered_at: string | null;
}

export interface AlphaWorldModelResponse {
  phases?: AlphaWorldModelPhase[];
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
  liqBars?: Array<{
    time: number;
    longUsd: number;
    shortUsd: number;
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

export async function fetchAnalyze(symbol: string, tf: string): Promise<AnalyzeEnvelope | null> {
  const res = await fetch(`/api/cogochi/analyze?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
  if (!res.ok) return null;
  return await readJson<AnalyzeEnvelope>(res);
}

/**
 * Lightweight version for callers (e.g. cogochi TradeMode) that only need
 * analyze + chart klines — skips the 2 extra market/* fetches the terminal
 * orchestrator needs.
 */
export async function fetchAnalyzeAndChart(args: {
  symbol: string;
  tf: string;
}): Promise<{ analyze: AnalyzeEnvelope | null; chartPayload: ChartSeriesPayload | null }> {
  const { symbol, tf } = args;
  const [analyzeRes, chartRes] = await Promise.allSettled([
    fetchAnalyze(symbol, tf),
    fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500`),
  ]);
  const analyze =
    analyzeRes.status === 'fulfilled'
      ? analyzeRes.value
      : null;
  const chartPayload =
    chartRes.status === 'fulfilled' && chartRes.value.ok
      ? await readJson<ChartSeriesPayload>(chartRes.value)
      : null;
  return { analyze, chartPayload };
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

export async function fetchRecentCaptures(limit = 8): Promise<RecentCaptureSummary[]> {
  const res = await fetch(`/api/runtime/captures?limit=${limit}`);
  if (!res.ok) return [];
  const payload = await readJson<RuntimeCaptureListResponse>(res);
  return payload?.ok && Array.isArray(payload.captures) ? payload.captures : [];
}

export async function fetchConfluenceCurrent(symbol: string, tf: string): Promise<ConfluenceResult | null> {
  const res = await fetch(`/api/confluence/current?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
  if (!res.ok) return null;
  return await readJson<ConfluenceResult>(res);
}

export async function fetchConfluenceHistory(symbol: string, limit = 96): Promise<ConfluenceHistoryEntry[]> {
  const res = await fetch(`/api/confluence/history?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
  if (!res.ok) return [];
  const payload = await readJson<{ entries?: ConfluenceHistoryEntry[] }>(res);
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

export async function fetchVenueDivergence(symbol: string): Promise<VenueDivergencePayload | null> {
  const res = await fetch(`/api/market/venue-divergence?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  return await readJson<VenueDivergencePayload>(res);
}

export async function fetchLiqClusters(symbol: string, window = '4h'): Promise<LiqClusterPayload | null> {
  const res = await fetch(`/api/market/liq-clusters?symbol=${encodeURIComponent(symbol)}&window=${encodeURIComponent(window)}`);
  if (!res.ok) return null;
  return await readJson<LiqClusterPayload>(res);
}

export async function fetchIndicatorContext(symbol: string): Promise<IndicatorContextPayload | null> {
  const res = await fetch(`/api/market/indicator-context?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  return await readJson<IndicatorContextPayload>(res);
}

export async function fetchSsr(): Promise<SsrPayload | null> {
  const res = await fetch('/api/market/stablecoin-ssr');
  if (!res.ok) return null;
  return await readJson<SsrPayload>(res);
}

export async function fetchRvCone(symbol: string): Promise<RvConePayload | null> {
  const res = await fetch(`/api/market/rv-cone?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  return await readJson<RvConePayload>(res);
}

export async function fetchFundingFlip(symbol: string): Promise<FundingFlipPayload | null> {
  const res = await fetch(`/api/market/funding-flip?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  return await readJson<FundingFlipPayload>(res);
}

export async function fetchFundingHistory(symbol: string, limit = 270): Promise<FundingHistoryPayload | null> {
  const res = await fetch(`/api/market/funding?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
  if (!res.ok) return null;
  return await readJson<FundingHistoryPayload>(res);
}

export async function fetchOptionsSnapshot(currency: string): Promise<OptionsSnapshotPayload | null> {
  const res = await fetch(`/api/market/options-snapshot?currency=${encodeURIComponent(currency)}`);
  if (!res.ok) return null;
  return await readJson<OptionsSnapshotPayload>(res);
}

export async function submitTradeOutcome(args: {
  snapshot: unknown;
  outcome: 1 | 0 | -1;
  symbol: string;
  timeframe: string;
}): Promise<TradeOutcomeResult | null> {
  const res = await fetch('/api/cogochi/outcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return await readJson<TradeOutcomeResult>(res);
}

export async function fetchAlphaWorldModel(): Promise<AlphaWorldModelResponse> {
  const res = await fetch('/api/cogochi/alpha/world-model');
  if (!res.ok) return {};
  return (await readJson<AlphaWorldModelResponse>(res)) ?? {};
}

export type MemoryRerankRecord = MemoryQueryResponse['records'][number];

export interface MemoryRerankResult {
  queryId: string;
  records: MemoryRerankRecord[];
}

type MemoryFeedbackArgs = {
  queryId: string;
  memoryId: string;
  event: 'retrieved' | 'used' | 'dismissed' | 'contradicted' | 'confirmed';
  symbol: string;
  timeframe: string;
  intent: string;
  mode?: string;
};

const MEMORY_FEEDBACK_BATCH_MAX = 20;
const MEMORY_FEEDBACK_FLUSH_MS = 350;
let pendingMemoryFeedback: MemoryFeedbackArgs[] = [];
let memoryFeedbackFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushMemoryFeedbackQueue(): Promise<void> {
  if (pendingMemoryFeedback.length === 0) return;
  const batch = pendingMemoryFeedback.splice(0, MEMORY_FEEDBACK_BATCH_MAX);
  if (memoryFeedbackFlushTimer) {
    clearTimeout(memoryFeedbackFlushTimer);
    memoryFeedbackFlushTimer = null;
  }
  try {
    await fetch('/api/engine/memory/feedback/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        items: batch.map((args) => toEngineMemoryFeedbackWire({
          queryId: args.queryId,
          memoryId: args.memoryId,
          event: args.event,
          context: {
            symbol: args.symbol,
            timeframe: args.timeframe,
            intent: args.intent,
            mode: args.mode ?? 'terminal',
          },
          occurredAt: new Date().toISOString(),
        })),
      }),
    });
  } catch {
    // Best-effort telemetry; dropping a batch is acceptable.
  } finally {
    if (pendingMemoryFeedback.length > 0) {
      memoryFeedbackFlushTimer = setTimeout(() => {
        void flushMemoryFeedbackQueue();
      }, MEMORY_FEEDBACK_FLUSH_MS);
    }
  }
}

function scheduleMemoryFeedbackFlush() {
  if (pendingMemoryFeedback.length >= MEMORY_FEEDBACK_BATCH_MAX) {
    void flushMemoryFeedbackQueue();
    return;
  }
  if (memoryFeedbackFlushTimer) return;
  memoryFeedbackFlushTimer = setTimeout(() => {
    void flushMemoryFeedbackQueue();
  }, MEMORY_FEEDBACK_FLUSH_MS);
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
  const payload = toEngineMemoryQueryWire({
    query: args.query,
    topK: args.topK ?? Math.max(1, args.candidates.length),
    includeRejected: false,
    includeSnapshots: false,
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
      baseScore: candidate.baseScore,
      confidence: candidate.confidence ?? 'observed',
      accessCount: candidate.accessCount ?? 0,
      tags: candidate.tags ?? [],
      conditions: {},
    })),
  });

  const res = await fetch('/api/engine/memory/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { queryId: '', records: [] };
  const body = await readJson<unknown>(res);
  const parsed = fromEngineMemoryQueryWire(body);
  return {
    queryId: parsed.queryId,
    records: parsed.records,
  };
}

export async function sendMemoryFeedback(args: MemoryFeedbackArgs): Promise<void> {
  if (!args.queryId || !args.memoryId) return;
  pendingMemoryFeedback.push(args);
  scheduleMemoryFeedbackFlush();
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
    body: JSON.stringify(toEngineMemoryDebugSessionWire({
      sessionId: args.sessionId,
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
        rejectionReason: hypothesis.rejectionReason,
      })),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    })),
  });
}
