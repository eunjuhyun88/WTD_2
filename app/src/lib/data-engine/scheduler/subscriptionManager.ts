// ─── Subscription Manager ────────────────────────────────────
// 심볼별 구독 관리.  구독자가 있는 심볼만 폴링.
// ref-count 기반: subscribe / unsubscribe.

import { registerPoller, unregisterPoller } from './pollingScheduler';
import { getCadence } from './cadenceRegistry';

type FetcherFactory = (symbol: string, rawId: string) => (() => Promise<void>);

interface Subscription {
  symbol: string;
  rawIds: string[];
  refCount: number;
}

const subscriptions = new Map<string, Subscription>(); // key = symbol

let _fetcherFactory: FetcherFactory | null = null;

/** 초기화: fetcher 팩토리 등록 */
export function initSubscriptionManager(factory: FetcherFactory): void {
  _fetcherFactory = factory;
}

/**
 * 심볼 + rawId 목록 구독.
 * 이미 구독 중이면 refCount만 증가.
 */
export function subscribe(symbol: string, rawIds: string[]): void {
  const existing = subscriptions.get(symbol);
  if (existing) {
    existing.refCount++;
    return;
  }

  const sub: Subscription = { symbol, rawIds, refCount: 1 };
  subscriptions.set(symbol, sub);

  // 폴러 등록
  if (_fetcherFactory) {
    for (const rawId of rawIds) {
      const pollerId = `${symbol}:${rawId}`;
      const fn = _fetcherFactory(symbol, rawId);
      registerPoller(pollerId, fn, getCadence(rawId));
    }
  }
}

/**
 * 심볼 구독 해제.
 * refCount가 0이 되면 폴러 제거.
 */
export function unsubscribe(symbol: string): void {
  const sub = subscriptions.get(symbol);
  if (!sub) return;

  sub.refCount--;
  if (sub.refCount > 0) return;

  // 폴러 제거
  for (const rawId of sub.rawIds) {
    unregisterPoller(`${symbol}:${rawId}`);
  }
  subscriptions.delete(symbol);
}

/** 현재 구독 중인 심볼 목록 */
export function listSubscriptions(): Array<{ symbol: string; rawIds: string[]; refCount: number }> {
  return Array.from(subscriptions.values()).map(s => ({
    symbol: s.symbol,
    rawIds: s.rawIds,
    refCount: s.refCount,
  }));
}
