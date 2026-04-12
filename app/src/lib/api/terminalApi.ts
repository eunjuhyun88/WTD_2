// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Terminal Scan API Client (browser-side)
// ═══════════════════════════════════════════════════════════════
//
// Wraps /api/terminal/scan/* endpoints for the Terminal page.

import type {
  TerminalScanSummary,
  TerminalScanDetail,
  TerminalScanSignal,
} from '$lib/services/scanService';

type JsonRecord = Record<string, unknown>;

// ─── Response Types ─────────────────────────────────────────

export interface RunScanResponse {
  success: boolean;
  scanId: string;
  persisted: boolean;
  warning?: string;
  data: TerminalScanDetail;
}

export interface ScanHistoryResponse {
  success: boolean;
  records: TerminalScanSummary[];
  pagination: { limit: number; offset: number; total: number };
  warning?: string;
}

export interface ScanDetailResponse {
  success: boolean;
  record: TerminalScanDetail | null;
  warning?: string;
}

export interface ScanSignalsResponse {
  success: boolean;
  records: TerminalScanSignal[];
  warning?: string;
}

// ─── Market Snapshot Response ───────────────────────────────

export interface MarketSnapshotResponse {
  success: boolean;
  pair: string;
  timeframe: string;
  at: number;
  sources: Record<string, boolean>;
  warning?: string;
}

// ─── Helper ─────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function extractDataRecord(payload: JsonRecord): JsonRecord | null {
  return isRecord(payload.data) ? payload.data : null;
}

function parseErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  return `API error ${status}`;
}

function isSuccessEnvelope(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  return payload.success === true || payload.ok === true;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTimestampMs(value: unknown): number {
  const asNumber = parseNumber(value);
  if (asNumber !== null) return asNumber;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function toBooleanMap(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const mapped: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    mapped[key] = Boolean(raw);
  }
  return mapped;
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function pickWarning(payload: JsonRecord, data: JsonRecord | null): string | undefined {
  if (typeof payload.warning === 'string') return payload.warning;
  if (data && typeof data.warning === 'string') return data.warning;
  return undefined;
}

async function apiCall<T extends JsonRecord>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok || !isSuccessEnvelope(payload)) {
    throw new Error(parseErrorMessage(payload, res.status));
  }
  if (!isRecord(payload)) {
    throw new Error(`Invalid API response (${res.status})`);
  }
  return payload as T;
}

// ─── Terminal Scan API ──────────────────────────────────────

/** Run a new terminal scan */
export async function runTerminalScan(
  pair = 'BTC/USDT',
  timeframe = '4h',
): Promise<RunScanResponse> {
  const payload = await apiCall<JsonRecord>('/api/terminal/scan', {
    method: 'POST',
    body: JSON.stringify({ pair, timeframe }),
  });

  const data = extractDataRecord(payload);
  if (!data) throw new Error('Malformed scan payload');

  return {
    success: true,
    scanId: pickString(payload.scanId, pickString(data.scanId, '')),
    persisted: payload.persisted === true,
    warning: pickWarning(payload, data),
    data: data as unknown as TerminalScanDetail,
  };
}

/** Get scan history */
export async function getScanHistory(
  options: { pair?: string; timeframe?: string; limit?: number; offset?: number } = {},
): Promise<ScanHistoryResponse> {
  const params = new URLSearchParams();
  if (options.pair) params.set('pair', options.pair);
  if (options.timeframe) params.set('timeframe', options.timeframe);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const payload = await apiCall<JsonRecord>(`/api/terminal/scan/history?${params}`);
  const data = extractDataRecord(payload);

  const recordsSource = Array.isArray(payload.records)
    ? payload.records
    : data && Array.isArray(data.records)
      ? data.records
      : [];
  const paginationSource = isRecord(payload.pagination)
    ? payload.pagination
    : data && isRecord(data.pagination)
      ? data.pagination
      : {};

  return {
    success: true,
    records: recordsSource as TerminalScanSummary[],
    pagination: {
      limit: parseNumber(paginationSource.limit) ?? 20,
      offset: parseNumber(paginationSource.offset) ?? 0,
      total: parseNumber(paginationSource.total) ?? 0,
    },
    warning: pickWarning(payload, data),
  };
}

/** Get scan detail by ID */
export async function getScanDetail(scanId: string): Promise<ScanDetailResponse> {
  const payload = await apiCall<JsonRecord>(`/api/terminal/scan/${scanId}`);
  const data = extractDataRecord(payload);

  const recordRaw = payload.record ?? data;
  const record = isRecord(recordRaw) ? (recordRaw as TerminalScanDetail) : null;

  return {
    success: true,
    record,
    warning: pickWarning(payload, data),
  };
}

/** Get scan signals by scan ID */
export async function getScanSignals(scanId: string): Promise<ScanSignalsResponse> {
  const payload = await apiCall<JsonRecord>(`/api/terminal/scan/${scanId}/signals`);
  const data = extractDataRecord(payload);
  const records = Array.isArray(payload.records)
    ? payload.records
    : data && Array.isArray(data.records)
      ? data.records
      : [];

  return {
    success: true,
    records: records as TerminalScanSignal[],
    warning: pickWarning(payload, data),
  };
}

// ─── Market Data API ────────────────────────────────────────

/** Get market snapshot (aggregated from all sources) */
export async function getMarketSnapshot(
  pair = 'BTC/USDT',
  timeframe = '4h',
): Promise<MarketSnapshotResponse> {
  const params = new URLSearchParams();
  params.set('pair', pair);
  params.set('timeframe', timeframe);

  const payload = await apiCall<JsonRecord>(`/api/market/snapshot?${params.toString()}`);
  const data = extractDataRecord(payload) ?? payload;

  return {
    success: true,
    pair: pickString(data.pair, pair),
    timeframe: pickString(data.timeframe, timeframe),
    at: parseTimestampMs(data.at),
    sources: toBooleanMap(data.sources),
    warning: pickWarning(payload, data),
  };
}

/** Get Fear & Greed index */
export async function getFearGreed(): Promise<{
  success: boolean;
  current: { value: number; classification: string } | null;
}> {
  const payload = await apiCall<JsonRecord>('/api/feargreed');
  const data = extractDataRecord(payload) ?? payload;
  const currentRaw = data.current;

  if (!isRecord(currentRaw)) {
    return { success: true, current: null };
  }

  const value = parseNumber(currentRaw.value);
  if (value === null) {
    return { success: true, current: null };
  }

  return {
    success: true,
    current: {
      value,
      classification: pickString(currentRaw.classification, 'unknown'),
    },
  };
}

/** Get CoinGecko global data */
export async function getCoinGeckoGlobal(): Promise<{
  success: boolean;
  data: {
    btcDominance: number;
    totalMarketCap: number;
    marketCapChange24hPct: number;
  } | null;
}> {
  const payload = await apiCall<JsonRecord>('/api/coingecko/global');
  const data = extractDataRecord(payload) ?? payload;
  const global = isRecord(data.global) ? data.global : null;

  const btcDominance = parseNumber(data.btcDominance) ?? parseNumber(global?.btcDominance);
  const totalMarketCap = parseNumber(data.totalMarketCap) ?? parseNumber(global?.totalMarketCapUsd);
  const marketCapChange24hPct =
    parseNumber(data.marketCapChange24hPct) ?? parseNumber(global?.marketCapChange24hPct);

  if (btcDominance === null || totalMarketCap === null || marketCapChange24hPct === null) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: {
      btcDominance,
      totalMarketCap,
      marketCapChange24hPct,
    },
  };
}

/** Get Yahoo Finance data for a symbol */
export async function getYahooData(symbol: string): Promise<{
  success: boolean;
  symbol: string;
  points: Array<{ timestampMs: number; close: number }>;
}> {
  const payload = await apiCall<JsonRecord>(`/api/yahoo/${encodeURIComponent(symbol)}`);
  const data = extractDataRecord(payload) ?? payload;
  const pointsRaw = Array.isArray(data.points) ? data.points : [];
  const points: Array<{ timestampMs: number; close: number }> = [];

  for (const row of pointsRaw) {
    if (!isRecord(row)) continue;
    const timestampMs = parseNumber(row.timestampMs);
    const close = parseNumber(row.close);
    if (timestampMs === null || close === null) continue;
    points.push({ timestampMs, close });
  }

  return {
    success: true,
    symbol: pickString(data.symbol, symbol),
    points,
  };
}
