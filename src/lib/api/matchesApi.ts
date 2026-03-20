export interface ApiMatchVote {
  agentId: string;
  name: string;
  icon: string;
  color: string;
  dir: string;
  conf: number;
}

export interface ApiMatchHypothesis {
  dir: string;
  conf: number;
  tf: string;
  entry: number;
  tp: number;
  sl: number;
  rr: number;
}

export interface ApiMatchRecord {
  id: string;
  userId: string | null;
  matchN: number;
  win: boolean;
  lp: number;
  score: number;
  streak: number;
  agents: string[];
  agentVotes: ApiMatchVote[];
  hypothesis: ApiMatchHypothesis | null;
  battleResult: string | null;
  consensusType: string | null;
  lpMult: number;
  signals: string[];
  createdAt: number;
}

interface FetchMatchesResponse {
  success: boolean;
  records: ApiMatchRecord[];
}

interface CreateMatchResponse {
  success: boolean;
  record: ApiMatchRecord;
}

interface CreateMatchPayload {
  matchN: number;
  win: boolean;
  lp: number;
  score: number;
  streak: number;
  agents: string[];
  agentVotes: ApiMatchVote[];
  hypothesis: ApiMatchHypothesis | null;
  battleResult: string | null;
  consensusType: string | null;
  lpMult: number;
  signals: string[];
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

export async function fetchMatchesApi(params?: {
  limit?: number;
  offset?: number;
}): Promise<ApiMatchRecord[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const query = new URLSearchParams();
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.set('offset', String(params.offset));
    const qs = query.toString();
    const result = await requestJson<FetchMatchesResponse>(`/api/matches${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function createMatchApi(payload: CreateMatchPayload): Promise<ApiMatchRecord | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<CreateMatchResponse>('/api/matches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.record || null;
  } catch {
    return null;
  }
}
