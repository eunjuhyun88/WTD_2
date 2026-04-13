// ═══════════════════════════════════════════════════════════════
// WTD — Community Posts Store (localStorage persisted)
// ═══════════════════════════════════════════════════════════════

import { writable, derived, get } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import {
  createCommunityPostApi,
  fetchCommunityPostsApi,
  reactCommunityPostApi,
  type ApiCommunityPost
} from '$lib/api/communityApi';

export interface CommunityPost {
  id: string;
  author: string;
  avatar: string;
  avatarColor: string;
  text: string;
  signal: 'long' | 'short' | null;
  timestamp: number;
  likes: number;
}

interface CommunityState {
  posts: CommunityPost[];
  hydrated: boolean;
}

const loaded = loadFromStorage<{ posts: CommunityPost[] }>(STORAGE_KEYS.community, { posts: [] });
export const communityStore = writable<CommunityState>({ ...loaded, hydrated: false });
let _communityHydratePromise: Promise<void> | null = null;

autoSave(communityStore, STORAGE_KEYS.community, (s) => ({ posts: s.posts }));

export const communityPosts = derived(communityStore, $s => $s.posts);

function mapApiPost(post: ApiCommunityPost): CommunityPost {
  return {
    id: post.id,
    author: post.author,
    avatar: post.avatar || '🐕',
    avatarColor: post.avatarColor || '#E8967D',
    text: post.body,
    signal: post.signal,
    timestamp: Number(post.createdAt ?? Date.now()),
    likes: Number(post.likes ?? 0)
  };
}

export async function hydrateCommunityPosts(force = false) {
  if (typeof window === 'undefined') return;
  if (_communityHydratePromise) return _communityHydratePromise;

  const state = get(communityStore);
  if (state.hydrated && !force) return;

  _communityHydratePromise = (async () => {
    const records = await fetchCommunityPostsApi({ limit: 100, offset: 0 });
    if (!records) return;

    communityStore.update((s) => ({
      ...s,
      posts: records.map(mapApiPost),
      hydrated: true
    }));
  })();

  try {
    await _communityHydratePromise;
  } finally {
    _communityHydratePromise = null;
  }
}

export async function addCommunityPost(text: string, signal: 'long' | 'short' | null) {
  const tempId = `tmp-${crypto.randomUUID()}`;
  const post: CommunityPost = {
    id: tempId,
    author: 'You',
    avatar: '🐕',
    avatarColor: '#E8967D',
    text: text.trim(),
    signal,
    timestamp: Date.now(),
    likes: 0
  };
  communityStore.update(s => ({
    ...s,
    posts: [post, ...s.posts].slice(0, 100)
  }));

  const created = await createCommunityPostApi({
    body: post.text,
    signal
  });
  if (!created) return;

  const mapped = mapApiPost(created);
  communityStore.update((s) => ({
    ...s,
    posts: s.posts.map((p) => p.id === tempId ? mapped : p)
  }));
}

export async function likeCommunityPost(postId: string) {
  communityStore.update(s => ({
    ...s,
    posts: s.posts.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p)
  }));

  if (postId.startsWith('tmp-')) return;
  const likes = await reactCommunityPostApi(postId, { emoji: '👍' });
  if (likes == null) return;

  communityStore.update((s) => ({
    ...s,
    posts: s.posts.map((p) => p.id === postId ? { ...p, likes } : p)
  }));
}
