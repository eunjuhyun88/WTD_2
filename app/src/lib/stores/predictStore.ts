// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Predict Store (Polymarket state)
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import { fetchPolymarkets, parseOutcomePrices, type PolyMarket } from '$lib/api/polymarket';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import {
  fetchPredictionPositionsApi,
  votePredictionApi,
  openPredictionPositionApi,
  closePredictionPositionApi,
  type ApiPredictionPosition,
} from '$lib/api/predictionsApi';

export interface PredictPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  direction: 'YES' | 'NO';
  entryOdds: number;
  amount: number;
  currentOdds: number;
  settled: boolean;
  pnl: number | null;
  timestamp: number;
}

interface PredictState {
  markets: PolyMarket[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
  categoryFilter: string;
  userVotes: Record<string, 'YES' | 'NO'>;
  positions: PredictPosition[];
  positionsHydrated: boolean;
}

export const predictStore = writable<PredictState>({
  markets: [],
  loading: false,
  error: null,
  lastFetch: 0,
  categoryFilter: '',
  userVotes: {},
  positions: loadFromStorage<PredictPosition[]>(STORAGE_KEYS.predictPositions, []),
  positionsHydrated: false,
});

autoSave(predictStore, STORAGE_KEYS.predictPositions, (s) => s.positions);

export const predictMarkets = derived(predictStore, $s => {
  if (!$s.categoryFilter) return $s.markets;
  return $s.markets.filter(m =>
    m.category.toLowerCase().includes($s.categoryFilter.toLowerCase()) ||
    m.question.toLowerCase().includes($s.categoryFilter.toLowerCase())
  );
});

export const predictLoading = derived(predictStore, $s => $s.loading);

function mapApiPosition(position: ApiPredictionPosition): PredictPosition {
  return {
    id: position.id,
    marketId: position.marketId,
    marketTitle: position.marketTitle || '',
    direction: position.direction,
    entryOdds: Number(position.entryOdds ?? 0),
    amount: Number(position.amount ?? 0),
    currentOdds: Number(position.currentOdds ?? position.entryOdds ?? 0),
    settled: Boolean(position.settled),
    pnl: position.pnl == null ? null : Number(position.pnl),
    timestamp: Number(position.createdAt ?? Date.now()),
  };
}

async function hydratePredictionPositions(force = false): Promise<void> {
  if (typeof window === 'undefined') return;

  let shouldLoad = force;
  predictStore.update((s) => {
    shouldLoad = shouldLoad || !s.positionsHydrated;
    return s;
  });
  if (!shouldLoad) return;

  const records = await fetchPredictionPositionsApi({ limit: 200, offset: 0 });
  if (!records) return;

  const mapped = records.map(mapApiPosition);
  const votes = mapped
    .filter((p) => p.amount === 0)
    .reduce<Record<string, 'YES' | 'NO'>>((acc, p) => {
      if (!acc[p.marketId]) acc[p.marketId] = p.direction;
      return acc;
    }, {});

  predictStore.update((s) => ({
    ...s,
    positions: mapped.length > 0 ? mapped : s.positions,
    userVotes: Object.keys(votes).length > 0 ? { ...s.userVotes, ...votes } : s.userVotes,
    positionsHydrated: true,
  }));
}

export async function loadPolymarkets() {
  predictStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await hydratePredictionPositions();
    const markets = await fetchPolymarkets(50);
    predictStore.update(s => ({
      ...s,
      markets,
      loading: false,
      lastFetch: Date.now()
    }));
  } catch (err) {
    predictStore.update(s => ({
      ...s,
      loading: false,
      error: 'Failed to load prediction markets'
    }));
  }
}

export function setCategoryFilter(cat: string) {
  predictStore.update(s => ({ ...s, categoryFilter: cat }));
}

export async function voteMarket(marketId: string, vote: 'YES' | 'NO') {
  let marketTitle = '';
  let entryOdds = 0;

  predictStore.update((s) => {
    const market = s.markets.find((m) => m.id === marketId);
    if (market) {
      marketTitle = market.question || '';
      const prices = parseOutcomePrices(market.outcomePrices);
      entryOdds = vote === 'YES' ? Number(prices.yes ?? 0) : Number(prices.no ?? 0);
    }
    return {
      ...s,
      userVotes: { ...s.userVotes, [marketId]: vote },
    };
  });

  const ok = await votePredictionApi({
    marketId,
    marketTitle,
    direction: vote,
    entryOdds,
  });

  if (!ok) {
    predictStore.update((s) => {
      const nextVotes = { ...s.userVotes };
      delete nextVotes[marketId];
      return {
        ...s,
        userVotes: nextVotes,
      };
    });
  }
}

function calculatePositionPnL(position: PredictPosition, exitOdds: number): number {
  const oddsChange = position.direction === 'YES'
    ? (exitOdds - position.entryOdds)
    : (position.entryOdds - exitOdds);
  return +(oddsChange * position.amount).toFixed(2);
}

function settleByOutcome(position: PredictPosition, won: boolean): number {
  if (!Number.isFinite(position.entryOdds) || position.entryOdds <= 0) {
    return won ? position.amount : -position.amount;
  }
  return won ? +(position.amount * (1 / position.entryOdds - 1)).toFixed(2) : -position.amount;
}

export function replacePredictionId(tempId: string, serverId: string) {
  predictStore.update(s => ({
    ...s,
    positions: s.positions.map((p) => p.id === tempId ? { ...p, id: serverId } : p),
  }));
}

// ═══ Position System ═══

export const openPositions = derived(predictStore, $s =>
  $s.positions.filter(p => !p.settled)
);

export const settledPositions = derived(predictStore, $s =>
  $s.positions.filter(p => p.settled)
);

export const totalPositionPnL = derived(predictStore, $s =>
  $s.positions.filter(p => p.settled && p.pnl !== null).reduce((sum, p) => sum + (p.pnl || 0), 0)
);

export async function openPosition(
  marketId: string,
  marketTitle: string,
  direction: 'YES' | 'NO',
  entryOdds: number,
  amount: number
) {
  const tempId = `tmp-${crypto.randomUUID()}`;
  const pos: PredictPosition = {
    id: tempId,
    marketId,
    marketTitle,
    direction,
    entryOdds,
    amount,
    currentOdds: entryOdds,
    settled: false,
    pnl: null,
    timestamp: Date.now()
  };

  predictStore.update(s => ({
    ...s,
    positions: [pos, ...s.positions].slice(0, 100)
  }));

  const saved = await openPredictionPositionApi({
    marketId,
    marketTitle,
    direction,
    entryOdds,
    currentOdds: entryOdds,
    amount,
  });

  if (!saved) return;

  const mapped = mapApiPosition(saved);
  predictStore.update((s) => ({
    ...s,
    positions: s.positions.map((p) => p.id === tempId ? mapped : p),
  }));
}

export async function closePosition(positionId: string, exitOdds: number) {
  let found = false;
  predictStore.update(s => ({
    ...s,
    positions: s.positions.map(p => {
      if (p.id !== positionId || p.settled) return p;
      found = true;
      const pnl = calculatePositionPnL(p, exitOdds);
      return { ...p, settled: true, currentOdds: exitOdds, pnl };
    })
  }));

  if (!found || positionId.startsWith('tmp-')) return;

  const updated = await closePredictionPositionApi(positionId, { closeOdds: exitOdds });
  if (!updated) return;

  const mapped = mapApiPosition(updated);
  predictStore.update((s) => ({
    ...s,
    positions: s.positions.map((p) => p.id === positionId ? mapped : p),
  }));
}

export async function settlePosition(positionId: string, won: boolean) {
  let direction: 'YES' | 'NO' | null = null;
  let found = false;
  predictStore.update(s => ({
    ...s,
    positions: s.positions.map(p => {
      if (p.id !== positionId || p.settled) return p;
      found = true;
      direction = won ? p.direction : (p.direction === 'YES' ? 'NO' : 'YES');
      const pnl = settleByOutcome(p, won);
      return { ...p, settled: true, pnl };
    })
  }));

  if (!found || positionId.startsWith('tmp-') || !direction) return;

  const updated = await closePredictionPositionApi(positionId, { outcome: direction });
  if (!updated) return;

  const mapped = mapApiPosition(updated);
  predictStore.update((s) => ({
    ...s,
    positions: s.positions.map((p) => p.id === positionId ? mapped : p),
  }));
}
