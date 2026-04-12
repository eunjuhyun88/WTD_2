import { hydrateQuickTrades } from './quickTradeStore';
import { hydrateTrackedSignals } from './trackedSignalStore';
import { hydrateMatchHistory } from './matchHistoryStore';
import { hydrateUserProfile } from './userProfileStore';
import { hydrateCommunityPosts } from './communityStore';
import { notifications } from './notificationStore';
import { ensureLivePriceSyncStarted } from '$lib/services/livePriceSyncService';
import { hydrateAgentStats } from './agentData';

let _domainHydrationPromise: Promise<void> | null = null;
let _backgroundHydrationPromise: Promise<void> | null = null;
let _backgroundHydrationTimer: ReturnType<typeof setTimeout> | null = null;
const BACKGROUND_HYDRATION_DELAY_MS = 1200;

function runBackgroundHydration(force = false): Promise<void> {
  if (_backgroundHydrationPromise && !force) return _backgroundHydrationPromise;

  _backgroundHydrationPromise = Promise.allSettled([
    hydrateMatchHistory(force),
    hydrateUserProfile(force),
    hydrateAgentStats(force),
    hydrateCommunityPosts(force),
    notifications.hydrate(force)
  ]).then(() => undefined);

  return _backgroundHydrationPromise.finally(() => {
    _backgroundHydrationPromise = null;
  });
}

function scheduleBackgroundHydration(force = false): void {
  if (_backgroundHydrationTimer) {
    if (!force) return;
    clearTimeout(_backgroundHydrationTimer);
    _backgroundHydrationTimer = null;
  }

  _backgroundHydrationTimer = setTimeout(() => {
    _backgroundHydrationTimer = null;
    void runBackgroundHydration(force);
  }, force ? 0 : BACKGROUND_HYDRATION_DELAY_MS);
}

export async function hydrateDomainStores(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  ensureLivePriceSyncStarted();
  if (_domainHydrationPromise) return _domainHydrationPromise;

  scheduleBackgroundHydration(force);

  _domainHydrationPromise = Promise.allSettled([
    hydrateQuickTrades(force),
    hydrateTrackedSignals(force)
  ]).then(() => undefined);

  try {
    await _domainHydrationPromise;
  } finally {
    _domainHydrationPromise = null;
  }
}
