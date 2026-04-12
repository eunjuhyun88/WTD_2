export interface ApiPredictionPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  direction: 'YES' | 'NO';
  entryOdds: number | null;
  amount: number;
  currentOdds: number | null;
  settled: boolean;
  pnl: number | null;
  createdAt: number;
}

interface PredictionListResponse {
  success: boolean;
  records: ApiPredictionPosition[];
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
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

function canUseBrowserFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

export async function votePredictionApi(payload: {
  marketId: string;
  marketTitle?: string;
  direction: 'YES' | 'NO';
  entryOdds?: number;
}): Promise<boolean> {
  if (!canUseBrowserFetch()) return false;
  try {
    await requestJson('/api/predictions/vote', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchPredictionPositionsApi(params?: {
  limit?: number;
  offset?: number;
  settled?: boolean;
}): Promise<ApiPredictionPosition[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    if (params?.settled != null) search.set('settled', String(params.settled));

    const query = search.toString();
    const url = query ? `/api/predictions?${query}` : '/api/predictions';
    const result = await requestJson<PredictionListResponse>(url, {
      method: 'GET',
    });
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function openPredictionPositionApi(payload: {
  marketId: string;
  marketTitle: string;
  direction: 'YES' | 'NO';
  entryOdds: number;
  currentOdds: number;
  amount: number;
}): Promise<ApiPredictionPosition | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; position: ApiPredictionPosition }>(
      '/api/predictions/positions/open',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return result.position || null;
  } catch {
    return null;
  }
}

export async function closePredictionPositionApi(
  id: string,
  payload: { closeOdds?: number; outcome?: 'YES' | 'NO' }
): Promise<ApiPredictionPosition | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; position: ApiPredictionPosition }>(
      `/api/predictions/positions/${id}/close`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return result.position || null;
  } catch {
    return null;
  }
}
