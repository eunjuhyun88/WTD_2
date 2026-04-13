// ═══════════════════════════════════════════════════════════════
// WTD — Terminal Scan Service (server)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import { runServerScan, type WarRoomScanResult } from '$lib/server/scanEngine';
import { PAIR_RE, UUID_RE, toBoundedInt } from '$lib/server/apiValidation';
import { query, withTransaction } from '$lib/server/db';

const VALID_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

type ScanConsensus = 'long' | 'short' | 'neutral';

type ScanRunRow = {
  id: string;
  pair: string;
  timeframe: string;
  token: string;
  consensus: ScanConsensus;
  avg_confidence: string | number;
  summary: string;
  highlights: unknown;
  created_at: string;
};

type ScanSignalRow = {
  id: string;
  scan_id: string;
  agent_id: string;
  agent_name: string;
  vote: ScanConsensus;
  confidence: string | number;
  analysis_text: string;
  data_source: string;
  entry_price: string | number;
  tp_price: string | number;
  sl_price: string | number;
  created_at: string;
};

export type TerminalScanSignal = {
  id: string;
  scanId: string;
  agentId: string;
  name: string;
  vote: ScanConsensus;
  conf: number;
  text: string;
  src: string;
  entry: number;
  tp: number;
  sl: number;
  time: string;
};

export type TerminalScanSummary = {
  scanId: string;
  pair: string;
  timeframe: string;
  token: string;
  createdAt: number;
  label: string;
  consensus: ScanConsensus;
  avgConfidence: number;
  summary: string;
  highlights: {
    agent: string;
    vote: ScanConsensus;
    conf: number;
    note: string;
  }[];
};

export type TerminalScanDetail = TerminalScanSummary & {
  signals: TerminalScanSignal[];
};

export type RunTerminalScanResult = {
  scanId: string;
  persisted: boolean;
  warning?: string;
  data: Omit<TerminalScanDetail, 'scanId'> & { scanId: string };
};

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Number(n) : fallback;
}

function toLabel(tsMs: number): string {
  const date = new Date(tsMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizePairInput(value: unknown): string {
  const pair = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!pair) return 'BTC/USDT';
  if (!PAIR_RE.test(pair)) throw new Error('pair must be like BTC/USDT');
  return pair;
}

function normalizeTimeframeInput(value: unknown): string {
  const timeframe = typeof value === 'string' ? value.trim().toLowerCase() : '4h';
  if (!timeframe) return '4h';
  if (!VALID_TIMEFRAMES.has(timeframe)) throw new Error('timeframe must be one of 1m,5m,15m,30m,1h,4h,1d,1w');
  return timeframe;
}

function parseHighlights(raw: unknown): TerminalScanSummary['highlights'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      agent: typeof item.agent === 'string' ? item.agent : 'AGENT',
      vote: item.vote === 'long' || item.vote === 'short' || item.vote === 'neutral' ? item.vote : 'neutral',
      conf: Math.round(toNumber(item.conf as string | number | null, 0)),
      note: typeof item.note === 'string' ? item.note : '',
    }));
}

function mapRunRow(row: ScanRunRow): TerminalScanSummary {
  const createdAt = new Date(row.created_at).getTime();
  return {
    scanId: row.id,
    pair: row.pair,
    timeframe: row.timeframe,
    token: row.token,
    createdAt,
    label: toLabel(createdAt),
    consensus: row.consensus,
    avgConfidence: Math.round(toNumber(row.avg_confidence, 0)),
    summary: row.summary,
    highlights: parseHighlights(row.highlights),
  };
}

function mapSignalRow(row: ScanSignalRow): TerminalScanSignal {
  const createdAt = new Date(row.created_at).getTime();
  return {
    id: row.id,
    scanId: row.scan_id,
    agentId: row.agent_id,
    name: row.agent_name,
    vote: row.vote,
    conf: Math.round(toNumber(row.confidence, 0)),
    text: row.analysis_text,
    src: row.data_source,
    entry: toNumber(row.entry_price, 0),
    tp: toNumber(row.tp_price, 0),
    sl: toNumber(row.sl_price, 0),
    time: toLabel(createdAt),
  };
}

function fromScanResult(scanId: string, scan: WarRoomScanResult): RunTerminalScanResult['data'] {
  return {
    scanId,
    pair: scan.pair,
    timeframe: scan.timeframe,
    token: scan.token,
    createdAt: scan.createdAt,
    label: scan.label,
    consensus: scan.consensus,
    avgConfidence: scan.avgConfidence,
    summary: scan.summary,
    highlights: scan.highlights.map((h) => ({
      agent: h.agent,
      vote: h.vote,
      conf: h.conf,
      note: h.note,
    })),
    signals: scan.signals.map((s) => ({
      id: s.id,
      scanId,
      agentId: s.agentId,
      name: s.name,
      vote: s.vote,
      conf: s.conf,
      text: s.text,
      src: s.src,
      entry: s.entry,
      tp: s.tp,
      sl: s.sl,
      time: s.time,
    })),
  };
}

export function isPersistenceUnavailableError(error: unknown): boolean {
  const errObj = error as Record<string, unknown> | null | undefined;
  const code = typeof errObj?.code === 'string' ? errObj.code : '';
  return code === '42P01' || code === '42703' || code === '23503';
}

export function normalizeScanRequest(input: { pair?: unknown; timeframe?: unknown }): {
  pair: string;
  timeframe: string;
} {
  return {
    pair: normalizePairInput(input.pair),
    timeframe: normalizeTimeframeInput(input.timeframe),
  };
}

async function persistScan(userId: string, scan: WarRoomScanResult): Promise<string> {
  return withTransaction(async (client) => {
    const runRes = await client.query<{ id: string }>(
      `
        INSERT INTO terminal_scan_runs (
          user_id, pair, timeframe, token, consensus, avg_confidence, summary, highlights
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING id
      `,
      [
        userId,
        scan.pair,
        scan.timeframe,
        scan.token,
        scan.consensus,
        scan.avgConfidence,
        scan.summary,
        JSON.stringify(scan.highlights),
      ]
    );
    const scanId = runRes.rows[0].id;

    // Batch INSERT — eliminates N+1 query problem (8 signals → 1 query)
    if (scan.signals.length > 0) {
      const cols = 11; // columns per signal row
      const placeholders: string[] = [];
      const values: unknown[] = [];
      for (let i = 0; i < scan.signals.length; i++) {
        const sig = scan.signals[i];
        const base = i * cols;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
        );
        values.push(
          scanId, userId, sig.agentId, sig.name, sig.vote,
          sig.conf, sig.text, sig.src, sig.entry, sig.tp, sig.sl
        );
      }
      await client.query(
        `INSERT INTO terminal_scan_signals (
          scan_id, user_id, agent_id, agent_name, vote, confidence,
          analysis_text, data_source, entry_price, tp_price, sl_price
        ) VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    return scanId;
  });
}

export async function runTerminalScan(
  userId: string,
  request: { pair?: unknown; timeframe?: unknown }
): Promise<RunTerminalScanResult> {
  const { pair, timeframe } = normalizeScanRequest(request);
  const scan = await runServerScan(pair, timeframe);

  try {
    const scanId = await persistScan(userId, scan);
    return {
      scanId,
      persisted: true,
      data: fromScanResult(scanId, scan),
    };
  } catch (error: unknown) {
    if (isPersistenceUnavailableError(error)) {
      const scanId = randomUUID();
      return {
        scanId,
        persisted: false,
        warning: 'terminal scan tables are unavailable; returning non-persistent scan result',
        data: fromScanResult(scanId, scan),
      };
    }
    throw error;
  }
}

export async function listTerminalScans(
  userId: string,
  input: { pair?: unknown; timeframe?: unknown; limit?: unknown; offset?: unknown }
): Promise<{
  records: TerminalScanSummary[];
  pagination: { limit: number; offset: number; total: number };
  warning?: string;
}> {
  const pair = typeof input.pair === 'string' ? input.pair.trim().toUpperCase() : '';
  const timeframe = typeof input.timeframe === 'string' ? input.timeframe.trim().toLowerCase() : '';
  const limit = toBoundedInt(input.limit, 20, 1, 200);
  const offset = toBoundedInt(input.offset, 0, 0, 5000);

  const where: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (pair) {
    params.push(pair);
    where.push(`pair = $${params.length}`);
  }
  if (timeframe) {
    params.push(timeframe);
    where.push(`timeframe = $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  try {
    const totalRes = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM terminal_scan_runs WHERE ${whereSql}`,
      params
    );

    const listParams = [...params, limit, offset];
    const rows = await query<ScanRunRow>(
      `
        SELECT
          id, pair, timeframe, token, consensus, avg_confidence, summary, highlights, created_at
        FROM terminal_scan_runs
        WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      listParams
    );

    return {
      records: rows.rows.map(mapRunRow),
      pagination: {
        limit,
        offset,
        total: Number(totalRes.rows[0]?.total ?? '0'),
      },
    };
  } catch (error: unknown) {
    if (isPersistenceUnavailableError(error)) {
      return {
        records: [],
        pagination: { limit, offset, total: 0 },
        warning: 'terminal scan tables are unavailable',
      };
    }
    throw error;
  }
}

export async function getTerminalScan(
  userId: string,
  scanId: string
): Promise<{ record: TerminalScanDetail | null; warning?: string }> {
  if (!UUID_RE.test(scanId)) return { record: null };

  try {
    const run = await query<ScanRunRow>(
      `
        SELECT
          id, pair, timeframe, token, consensus, avg_confidence, summary, highlights, created_at
        FROM terminal_scan_runs
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [scanId, userId]
    );
    const runRow = run.rows[0];
    if (!runRow) return { record: null };

    const signals = await query<ScanSignalRow>(
      `
        SELECT
          id, scan_id, agent_id, agent_name, vote, confidence, analysis_text,
          data_source, entry_price, tp_price, sl_price, created_at
        FROM terminal_scan_signals
        WHERE scan_id = $1 AND user_id = $2
        ORDER BY created_at DESC
      `,
      [scanId, userId]
    );

    const summary = mapRunRow(runRow);
    return {
      record: {
        ...summary,
        signals: signals.rows.map(mapSignalRow),
      },
    };
  } catch (error: unknown) {
    if (isPersistenceUnavailableError(error)) {
      return { record: null, warning: 'terminal scan tables are unavailable' };
    }
    throw error;
  }
}

export async function getTerminalScanSignals(
  userId: string,
  scanId: string
): Promise<{ records: TerminalScanSignal[]; warning?: string }> {
  if (!UUID_RE.test(scanId)) return { records: [] };

  try {
    const rows = await query<ScanSignalRow>(
      `
        SELECT
          id, scan_id, agent_id, agent_name, vote, confidence, analysis_text,
          data_source, entry_price, tp_price, sl_price, created_at
        FROM terminal_scan_signals
        WHERE scan_id = $1 AND user_id = $2
        ORDER BY created_at DESC
      `,
      [scanId, userId]
    );
    return { records: rows.rows.map(mapSignalRow) };
  } catch (error: unknown) {
    if (isPersistenceUnavailableError(error)) {
      return { records: [], warning: 'terminal scan tables are unavailable' };
    }
    throw error;
  }
}

