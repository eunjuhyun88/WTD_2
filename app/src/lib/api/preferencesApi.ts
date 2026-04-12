export interface ApiUserPreferences {
  userId: string;
  defaultPair: string;
  defaultTimeframe: string;
  battleSpeed: number;
  signalsEnabled: boolean;
  sfxEnabled: boolean;
  chartTheme: string;
  dataSource: string;
  language: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiUserUiState {
  userId: string;
  terminalLeftWidth: number;
  terminalRightWidth: number;
  terminalLeftCollapsed: boolean;
  terminalRightCollapsed: boolean;
  terminalMobileTab: string;
  terminalActiveTab: string;
  terminalInnerTab: string;
  passportActiveTab: string;
  signalsFilter: string;
  oraclePeriod: string;
  oracleSort: string;
  createdAt: number;
  updatedAt: number;
}

type JsonHeaders = Record<string, string>;

function canUseBrowserFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const headers: JsonHeaders = {
    'content-type': 'application/json',
    ...(init.headers as JsonHeaders | undefined),
  };

  const res = await fetch(url, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(10_000) });
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

export async function fetchPreferencesApi(): Promise<ApiUserPreferences | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; preferences: ApiUserPreferences }>('/api/preferences', {
      method: 'GET',
    });
    return result.preferences || null;
  } catch {
    return null;
  }
}

export async function updatePreferencesApi(payload: Partial<ApiUserPreferences>): Promise<ApiUserPreferences | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; preferences: ApiUserPreferences }>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return result.preferences || null;
  } catch {
    return null;
  }
}

export async function fetchUiStateApi(): Promise<ApiUserUiState | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; uiState: ApiUserUiState }>('/api/ui-state', {
      method: 'GET',
    });
    return result.uiState || null;
  } catch {
    return null;
  }
}

export async function updateUiStateApi(payload: Partial<ApiUserUiState>): Promise<ApiUserUiState | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; uiState: ApiUserUiState }>('/api/ui-state', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return result.uiState || null;
  } catch {
    return null;
  }
}
