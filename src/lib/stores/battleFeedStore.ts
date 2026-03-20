// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Battle Feed Store (Arena real-time feed)
// Connected to BottomBar for live agent decisions
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';

export interface FeedItem {
  id: number;
  agentId: string;
  agentName: string;
  agentIcon: string;
  agentColor: string;
  text: string;
  dir?: 'LONG' | 'SHORT' | 'NEUTRAL';
  conf?: number;
  phase: string;
  ts: number;
}

interface BattleFeedState {
  items: FeedItem[];
  maxItems: number;
}

const feedStore = writable<BattleFeedState>({
  items: [],
  maxItems: 50
});

let nextId = 0;

export function pushFeedItem(item: Omit<FeedItem, 'id' | 'ts'>) {
  feedStore.update(s => {
    const newItem: FeedItem = {
      ...item,
      id: nextId++,
      ts: Date.now()
    };
    const items = [newItem, ...s.items].slice(0, s.maxItems);
    return { ...s, items };
  });
}

export function clearFeed() {
  feedStore.update(s => ({ ...s, items: [] }));
}

// Derived: latest 5 items for BottomBar
export const latestFeed = derived(feedStore, $f => $f.items.slice(0, 5));
// Full feed
export const battleFeed = derived(feedStore, $f => $f.items);

export { feedStore };
