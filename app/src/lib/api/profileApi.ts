export interface ApiProfilePayload {
  id: string;
  email: string | null;
  nickname: string | null;
  walletAddress: string | null;
  tier: string;
  phase: number;
  avatar: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  stats: {
    displayTier: string;
    totalMatches: number;
    wins: number;
    losses: number;
    streak: number;
    bestStreak: number;
    totalLp: number;
    totalPnl: number;
    badges: unknown[];
    updatedAt: number | null;
  };
}

export interface ApiProfileBadgePayload {
  id: string;
  name?: string;
  icon?: string;
  category?: string;
  earnedAt?: number | null;
}

export interface ApiPassportPayload {
  tier: string;
  totalMatches: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  totalLp: number;
  totalPnl: number;
  badges: unknown[];
  openTrades: number;
  trackedSignals: number;
  winRate: number;
  agentSummary: {
    totalAgents: number;
    avgLevel: number;
  };
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

export async function fetchProfileApi(): Promise<ApiProfilePayload | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; profile: ApiProfilePayload }>('/api/profile', {
      method: 'GET',
    });
    return result.profile || null;
  } catch {
    return null;
  }
}

export async function updateProfileApi(payload: {
  nickname?: string;
  avatar?: string;
  displayTier?: string;
  badges?: ApiProfileBadgePayload[];
}): Promise<boolean> {
  if (!canUseBrowserFetch()) return false;
  try {
    await requestJson<{ success: boolean }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchPassportApi(): Promise<ApiPassportPayload | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; passport: ApiPassportPayload }>('/api/profile/passport', {
      method: 'GET',
    });
    return result.passport || null;
  } catch {
    return null;
  }
}
