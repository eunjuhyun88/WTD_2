export interface ApiQuickTrade {
  id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number | null;
  sl: number | null;
  currentPrice: number;
  pnlPercent: number;
  status: 'open' | 'closed' | 'stopped';
  openedAt: number;
  closedAt: number | null;
  closePnl: number | null;
  source: string;
  note: string;
}

export interface ApiTrackedSignal {
  id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  status: 'tracking' | 'expired' | 'converted';
  source: string;
  note: string;
  trackedAt: number;
  expiresAt: number;
}

export interface ApiCopyTradeRun {
  id: string;
  userId: string;
  selectedSignalIds: string[];
  draft: Record<string, unknown>;
  published: boolean;
  publishedTradeId: string | null;
  publishedSignalId: string | null;
  createdAt: number;
  publishedAt: number | null;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // ignore parse
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

function canUseBrowserFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

export async function fetchQuickTradesApi(params?: {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed' | 'stopped';
}): Promise<ApiQuickTrade[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const query = new URLSearchParams();
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.set('offset', String(params.offset));
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const result = await requestJson<{ success: boolean; records: ApiQuickTrade[] }>(
      `/api/quick-trades${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
      }
    );
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function fetchTrackedSignalsApi(params?: {
  limit?: number;
  offset?: number;
  status?: 'tracking' | 'expired' | 'converted';
}): Promise<ApiTrackedSignal[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const query = new URLSearchParams();
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.set('offset', String(params.offset));
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const result = await requestJson<{ success: boolean; records: ApiTrackedSignal[] }>(
      `/api/signals${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
      }
    );
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function openQuickTradeApi(payload: {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number | null;
  sl: number | null;
  currentPrice: number;
  source: string;
  note: string;
}): Promise<ApiQuickTrade | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; trade: ApiQuickTrade }>('/api/quick-trades/open', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.trade || null;
  } catch {
    return null;
  }
}

export async function closeQuickTradeApi(
  tradeId: string,
  payload: { closePrice: number; status?: 'closed' | 'stopped' }
): Promise<ApiQuickTrade | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; trade: ApiQuickTrade }>(
      `/api/quick-trades/${tradeId}/close`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return result.trade || null;
  } catch {
    return null;
  }
}

export async function updateQuickTradePricesApi(payload: {
  prices?: Record<string, number>;
  updates?: { id: string; currentPrice: number }[];
}): Promise<number | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; updated: number }>('/api/quick-trades/prices', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return Number(result.updated ?? 0);
  } catch {
    return null;
  }
}

export async function trackSignalApi(payload: {
  pair: string;
  dir: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  currentPrice: number;
  source: string;
  note: string;
  ttlHours?: number;
}): Promise<ApiTrackedSignal | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; signal: ApiTrackedSignal }>('/api/signals/track', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.signal || null;
  } catch {
    return null;
  }
}

export async function convertSignalApi(
  signalId: string,
  payload: { entry?: number; tp?: number | null; sl?: number | null; note?: string }
): Promise<ApiQuickTrade | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; trade: ApiQuickTrade }>(`/api/signals/${signalId}/convert`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.trade || null;
  } catch {
    return null;
  }
}

export async function untrackSignalApi(signalId: string): Promise<boolean> {
  if (!canUseBrowserFetch()) return false;
  try {
    await requestJson<{ success: boolean }>(`/api/signals/${signalId}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

export async function publishCopyTradeApi(payload: {
  selectedSignalIds: string[];
  draft: {
    pair: string;
    dir: 'LONG' | 'SHORT';
    entry: number;
    tp: number[];
    sl: number;
    orderType?: string;
    leverage?: number;
    sizePercent?: number;
    marginMode?: string;
    evidence?: { icon: string; name: string; text: string; conf: number; color: string }[];
    note?: string;
    source?: string;
  };
  confidence?: number;
}): Promise<{ run: ApiCopyTradeRun; trade: ApiQuickTrade; signal: ApiTrackedSignal } | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    return await requestJson<{ run: ApiCopyTradeRun; trade: ApiQuickTrade; signal: ApiTrackedSignal }>(
      '/api/copy-trades/publish',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  } catch {
    return null;
  }
}
