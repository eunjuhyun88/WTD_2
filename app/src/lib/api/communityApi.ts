export interface ApiCommunityPost {
  id: string;
  userId: string | null;
  author: string;
  avatar: string;
  avatarColor: string;
  body: string;
  signal: 'long' | 'short' | null;
  likes: number;
  createdAt: number;
}

interface CommunityListResponse {
  success: boolean;
  total: number;
  records: ApiCommunityPost[];
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

export async function fetchCommunityPostsApi(params?: {
  limit?: number;
  offset?: number;
  signal?: 'long' | 'short' | null;
}): Promise<ApiCommunityPost[] | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    if (params?.signal) search.set('signal', params.signal);

    const query = search.toString();
    const url = query ? `/api/community/posts?${query}` : '/api/community/posts';
    const result = await requestJson<CommunityListResponse>(url, { method: 'GET' });
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return null;
  }
}

export async function createCommunityPostApi(payload: {
  body: string;
  signal?: 'long' | 'short' | null;
  author?: string;
  avatar?: string;
  avatarColor?: string;
}): Promise<ApiCommunityPost | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; post: ApiCommunityPost }>('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result.post || null;
  } catch {
    return null;
  }
}

export async function reactCommunityPostApi(postId: string, payload?: { emoji?: string }): Promise<number | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; likes: number }>(
      `/api/community/posts/${postId}/react`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }
    );
    return Number(result.likes ?? 0);
  } catch {
    return null;
  }
}

export async function unreactCommunityPostApi(postId: string, payload?: { emoji?: string }): Promise<number | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; likes: number }>(
      `/api/community/posts/${postId}/react`,
      {
        method: 'DELETE',
        body: JSON.stringify(payload || {}),
      }
    );
    return Number(result.likes ?? 0);
  } catch {
    return null;
  }
}
