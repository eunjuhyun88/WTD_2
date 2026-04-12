// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Unified Price Contract (S-03)
// ═══════════════════════════════════════════════════════════════
//
// 단일 소스: 모든 컴포넌트(Header, Chart, Terminal, QuickTrade)는
// livePrice 계약을 통해 가격을 구독한다.
// 외부 소스(Binance WS/REST)는 이 스토어에 쓴다.
//
// FE(F-03)에서 Header/Chart/Terminal의 개별 WS/interval을 제거하고
// 이 단일 스토어를 구독하도록 교체 예정.

import { writable, derived, get, type Readable } from 'svelte/store';
import { normalizeSymbol } from '$lib/utils/price';

// ─── Types ───────────────────────────────────────────────────

export type LivePriceSource = 'ws' | 'rest';

export interface LivePriceEntry {
  price: number;
  ts: number; // Unix ms timestamp
  source: LivePriceSource;
}

export type LivePriceMap = Record<string, LivePriceEntry>;

export interface PriceEntry extends LivePriceEntry {
  change24h?: number;      // 24h 변동 % (optional)
  high24h?: number;
  low24h?: number;
  volume24h?: number;
}

export type PriceMap = Record<string, PriceEntry>;

// ─── Default symbols ─────────────────────────────────────────

const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;
const WS_FRESH_GUARD_MS = 10_000;

function createDefaults(): PriceMap {
  const now = Date.now();
  // 초기값 0 — REST/WS에서 실제 가격 들어올 때까지 "로딩" 상태
  return Object.fromEntries(
    DEFAULT_SYMBOLS.map((sym) => [sym, { price: 0, ts: now, source: 'rest' as const }])
  ) as PriceMap;
}

// ─── Store ───────────────────────────────────────────────────

export const priceStore = writable<PriceMap>(createDefaults());

// S-03 canonical contract:
// Record<symbol, { price, ts, source }>
export const livePrice = derived(priceStore, ($p): LivePriceMap => {
  const next: LivePriceMap = {};
  for (const [sym, entry] of Object.entries($p)) {
    next[sym] = {
      price: entry.price,
      ts: entry.ts,
      source: entry.source,
    };
  }
  return next;
});

// ─── Derived: 레거시 호환 ────────────────────────────────────

export const livePrices = derived(livePrice, ($p) => {
  const result: Record<string, number> = {};
  for (const [sym, entry] of Object.entries($p)) {
    result[sym] = entry.price;
  }
  return result;
});

export const priceChanges = derived(priceStore, ($p) => {
  const result: Record<string, number> = {};
  for (const [sym, entry] of Object.entries($p)) {
    result[sym] = entry.change24h ?? 0;
  }
  return result;
});

export const btcPrice = derived(livePrice, ($p) => $p.BTC?.price ?? 0);
export const ethPrice = derived(livePrice, ($p) => $p.ETH?.price ?? 0);
export const solPrice = derived(livePrice, ($p) => $p.SOL?.price ?? 0);

// ─── Actions ─────────────────────────────────────────────────

function normalizePrice(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function shouldSkipRestFallback(prev: PriceEntry | undefined, incomingSource: LivePriceSource): boolean {
  if (!prev) return false;
  if (incomingSource !== 'rest') return false;
  if (prev.source !== 'ws') return false;
  return Date.now() - prev.ts < WS_FRESH_GUARD_MS;
}

/** 단일 심볼 가격 업데이트 */
export function updatePrice(symbol: string, price: number, source: LivePriceSource = 'ws') {
  const sym = normalizeSymbol(symbol);
  const normalized = normalizePrice(price);
  if (!sym || normalized === null) return;

  priceStore.update(($p) => {
    const prev = $p[sym];
    if (shouldSkipRestFallback(prev, source)) return $p;
    if (prev && prev.price === normalized) return $p;  // 가격 동일하면 소스 무관 스킵 (리렌더 방지)

    return {
      ...$p,
      [sym]: {
        ...prev,
        price: normalized,
        ts: Date.now(),
        source,
      },
    };
  });
}

/** 여러 심볼 한꺼번에 업데이트 */
export function updatePrices(updates: Record<string, number>, source: LivePriceSource = 'ws') {
  priceStore.update(($p) => {
    const next = { ...$p };
    const ts = Date.now();
    let changed = false;

    for (const [rawSym, rawPrice] of Object.entries(updates)) {
      const sym = normalizeSymbol(rawSym);
      const normalized = normalizePrice(rawPrice);
      if (!sym || normalized === null) continue;

      const prev = $p[sym];
      if (shouldSkipRestFallback(prev, source)) continue;
      if (prev && prev.price === normalized) continue;  // 가격 동일하면 소스 무관 스킵

      next[sym] = { ...prev, price: normalized, ts, source };
      changed = true;
    }

    return changed ? next : $p;
  });
}

/** 24h 통계 포함 업데이트 */
export function updatePriceFull(symbol: string, entry: PriceEntry) {
  const sym = normalizeSymbol(symbol);
  const normalizedPrice = normalizePrice(entry.price);
  if (!sym || normalizedPrice === null) return;

  const nextEntry: PriceEntry = {
    ...entry,
    price: normalizedPrice,
    ts: Number.isFinite(entry.ts) ? entry.ts : Date.now(),
    source: entry.source ?? 'rest',
  };

  priceStore.update(($p) => {
    const prev = $p[sym];
    if (shouldSkipRestFallback(prev, nextEntry.source)) return $p;
    if (
      prev &&
      prev.price === nextEntry.price &&
      prev.ts === nextEntry.ts &&
      prev.source === nextEntry.source &&
      prev.change24h === nextEntry.change24h &&
      prev.high24h === nextEntry.high24h &&
      prev.low24h === nextEntry.low24h &&
      prev.volume24h === nextEntry.volume24h
    ) {
      return $p;
    }

    return {
      ...$p,
      [sym]: {
        ...prev,
        ...nextEntry,
      },
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────

/** 단일 심볼 구독용 selector (Header/Chart/Terminal 공통 소비용) */
export function selectLivePrice(symbol: string): Readable<LivePriceEntry | null> {
  const sym = normalizeSymbol(symbol);
  return derived(livePrice, ($p) => $p[sym] ?? null);
}

/** 다중 심볼 구독용 selector */
export function selectLivePriceMap(symbols: string[]): Readable<LivePriceMap> {
  const normalized = symbols.map(normalizeSymbol).filter(Boolean);
  return derived(livePrice, ($p) => {
    const result: LivePriceMap = {};
    for (const sym of normalized) {
      if ($p[sym]) result[sym] = $p[sym];
    }
    return result;
  });
}

/** 현재 livePrice 스냅샷 */
export function getLivePriceSnapshot(symbols?: string[]): LivePriceMap {
  const snapshot = get(livePrice);
  if (!symbols || symbols.length === 0) return snapshot;

  const normalized = symbols.map(normalizeSymbol).filter(Boolean);
  const result: LivePriceMap = {};
  for (const sym of normalized) {
    if (snapshot[sym]) result[sym] = snapshot[sym];
  }
  return result;
}

/** 심볼의 최신 가격 (동기적) */
export function getPrice(symbol: string): number {
  const sym = normalizeSymbol(symbol);
  return get(livePrice)[sym]?.price ?? 0;
}

/** 가격 데이터 신선도 확인 (ms) */
export function getPriceAge(symbol: string): number {
  const sym = normalizeSymbol(symbol);
  const entry = get(livePrice)[sym];
  return entry ? Date.now() - entry.ts : Infinity;
}
