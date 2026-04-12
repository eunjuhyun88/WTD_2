export interface ApiAgentStat {
  id: string;
  userId: string;
  agentId: string;
  level: number;
  xp: number;
  xpMax: number;
  wins: number;
  losses: number;
  bestStreak: number;
  curStreak: number;
  avgConf: number;
  bestConf: number;
  stamps: Record<string, number>;
  updatedAt: number;
}

function canUseBrowserFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
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

export async function fetchAgentStatsApi(): Promise<ApiAgentStat[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; records: ApiAgentStat[] }>('/api/agents/stats', {
      method: 'GET',
    });
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function updateAgentStatApi(
  agentId: string,
  payload: {
    level: number;
    xp: number;
    xpMax: number;
    wins: number;
    losses: number;
    bestStreak: number;
    curStreak: number;
    avgConf: number;
    bestConf: number;
    stamps: Record<string, number>;
  }
): Promise<boolean> {
  if (!canUseBrowserFetch()) return false;
  try {
    await requestJson<{ success: boolean }>(`/api/agents/stats/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}
