export type ApiNotificationType = 'alert' | 'critical' | 'info' | 'success';

export interface ApiNotification {
  id: string;
  userId: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  isRead: boolean;
  dismissable: boolean;
  createdAt: number;
  readAt: number | null;
}

interface NotificationListResponse {
  success: boolean;
  total: number;
  records: ApiNotification[];
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

export async function fetchNotificationsApi(params?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<ApiNotification[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    if (params?.unreadOnly != null) search.set('unreadOnly', String(params.unreadOnly));

    const query = search.toString();
    const url = query ? `/api/notifications?${query}` : '/api/notifications';
    const result = await requestJson<NotificationListResponse>(url, { method: 'GET' });
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function createNotificationApi(payload: {
  type: ApiNotificationType;
  title: string;
  body: string;
  dismissable?: boolean;
}): Promise<ApiNotification | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; notification: ApiNotification }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.notification || null;
  } catch {
    return null;
  }
}

export async function markNotificationsReadApi(ids?: string[]): Promise<number | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; updated: number }>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(ids && ids.length ? { ids } : {}),
    });
    return Number(result.updated ?? 0);
  } catch {
    return null;
  }
}

export async function deleteNotificationApi(id: string): Promise<boolean> {
  if (!canUseBrowserFetch()) return false;
  try {
    await requestJson<{ success: boolean }>(`/api/notifications/${id}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}
