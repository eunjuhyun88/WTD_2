import {
  parseMacroCalendarResponse,
  parsePatternCaptureProjectionResponse,
  parsePatternCaptureResponse,
  parsePatternCaptureSimilarResponse,
  parseTerminalAlertsResponse,
  parseTerminalExportJobResponse,
  parseTerminalPinsResponse,
  parseTerminalWatchlistResponse,
  type MacroCalendarItem,
  type PatternCaptureCreateRequest,
  type PatternCaptureProjectionRequest,
  type PatternCaptureProjectionResponse,
  type PatternCaptureQuery,
  type PatternCaptureRecord,
  type PatternCaptureSimilarityDraft,
  type PatternCaptureSimilarityMatch,
  type TerminalAlertCreateRequest,
  type TerminalAlertRule,
  type TerminalExportJob,
  type TerminalExportRequest,
  type TerminalPin,
  type TerminalWatchlistItem,
} from '$lib/contracts/terminalPersistence';

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

export async function fetchTerminalWatchlist(): Promise<{
  items: TerminalWatchlistItem[];
  activeSymbol?: string;
}> {
  const res = await fetch('/api/terminal/watchlist');
  if (!res.ok) return { items: [] };
  const payload = parseTerminalWatchlistResponse(await readJson(res));
  return { items: payload.items, activeSymbol: payload.activeSymbol };
}

export async function saveTerminalWatchlist(args: {
  items: TerminalWatchlistItem[];
  activeSymbol?: string;
}): Promise<{
  items: TerminalWatchlistItem[];
  activeSymbol?: string;
} | null> {
  const res = await fetch('/api/terminal/watchlist', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  const payload = parseTerminalWatchlistResponse(await readJson(res));
  return { items: payload.items, activeSymbol: payload.activeSymbol };
}

export async function fetchTerminalPins(): Promise<TerminalPin[]> {
  const res = await fetch('/api/terminal/pins');
  if (!res.ok) return [];
  const payload = parseTerminalPinsResponse(await readJson(res));
  return payload.pins;
}

export async function saveTerminalPins(pins: TerminalPin[]): Promise<TerminalPin[] | null> {
  const res = await fetch('/api/terminal/pins', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pins }),
  });
  if (!res.ok) return null;
  const payload = parseTerminalPinsResponse(await readJson(res));
  return payload.pins;
}

export async function fetchTerminalAlerts(): Promise<TerminalAlertRule[]> {
  const res = await fetch('/api/terminal/alerts');
  if (!res.ok) return [];
  const payload = parseTerminalAlertsResponse(await readJson(res));
  return payload.alerts;
}

export async function createTerminalAlert(input: TerminalAlertCreateRequest): Promise<TerminalAlertRule | null> {
  const res = await fetch('/api/terminal/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const payload = parseTerminalAlertsResponse(await readJson(res));
  return payload.alerts[0] ?? null;
}

export async function deleteTerminalAlert(id: string): Promise<boolean> {
  const res = await fetch(`/api/terminal/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) return false;
  const payload = (await readJson(res)) as { deleted?: boolean };
  return Boolean(payload.deleted ?? true);
}

export async function createTerminalExport(input: TerminalExportRequest): Promise<TerminalExportJob | null> {
  const res = await fetch('/api/terminal/exports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const payload = parseTerminalExportJobResponse(await readJson(res));
  return payload.job;
}

export async function fetchTerminalExport(id: string): Promise<TerminalExportJob | null> {
  const res = await fetch(`/api/terminal/exports/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const payload = parseTerminalExportJobResponse(await readJson(res));
  return payload.job;
}

export async function fetchMacroCalendar(): Promise<MacroCalendarItem[]> {
  const res = await fetch('/api/market/macro-calendar');
  if (!res.ok) return [];
  const payload = parseMacroCalendarResponse(await readJson(res));
  return payload.items;
}

export async function fetchPatternCaptures(query: Partial<PatternCaptureQuery> = {}): Promise<PatternCaptureRecord[]> {
  const params = new URLSearchParams();
  if (query.id) params.set('id', query.id);
  if (query.symbol) params.set('symbol', query.symbol);
  if (query.timeframe) params.set('timeframe', query.timeframe);
  if (query.verdict) params.set('verdict', query.verdict);
  if (query.triggerOrigin) params.set('triggerOrigin', query.triggerOrigin);
  if (query.limit) params.set('limit', String(query.limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/terminal/pattern-captures${suffix}`);
  if (!res.ok) return [];
  const payload = parsePatternCaptureResponse(await readJson(res));
  return payload.records;
}

export async function fetchPatternCaptureById(id: string): Promise<PatternCaptureRecord | null> {
  const records = await fetchPatternCaptures({ id, limit: 1 });
  return records[0] ?? null;
}

export async function createPatternCapture(input: PatternCaptureCreateRequest): Promise<PatternCaptureRecord | null> {
  const res = await fetch('/api/terminal/pattern-captures', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const payload = parsePatternCaptureResponse(await readJson(res));
  return payload.records[0] ?? null;
}

export async function projectPatternCapture(
  id: string,
  input: Partial<PatternCaptureProjectionRequest> = {},
): Promise<PatternCaptureProjectionResponse | null> {
  const res = await fetch(`/api/terminal/pattern-captures/${encodeURIComponent(id)}/project`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  return parsePatternCaptureProjectionResponse(await readJson(res));
}

export async function fetchSimilarPatternCaptures(
  input: PatternCaptureSimilarityDraft,
): Promise<PatternCaptureSimilarityMatch[]> {
  const res = await fetch('/api/terminal/pattern-captures/similar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return [];
  const payload = parsePatternCaptureSimilarResponse(await readJson(res));
  return payload.matches;
}
