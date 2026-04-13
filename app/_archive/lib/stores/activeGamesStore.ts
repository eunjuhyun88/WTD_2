// ═══════════════════════════════════════════════════════════════
// WTD — Active Games Store (Concurrent Match Manager)
// ═══════════════════════════════════════════════════════════════
//
// Manages up to 3 simultaneous Living Arena games.
// Persists to localStorage for STANDARD/MARATHON games that
// survive page refreshes.

import { writable, derived, get } from 'svelte/store';
import type {
  ActiveGame,
  BattleResolution,
  Checkpoint,
  DecisionAction,
  BinanceKline,
} from '$lib/engine/types';
import {
  startBattle,
  applyDWAction,
  type BattleControls,
  MAX_CONCURRENT_GAMES,
} from '$lib/engine/battleEngine';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';

// ─── Store ───────────────────────────────────────────────────

export const activeGames = writable<ActiveGame[]>(loadGames());

// Active battle controls (not persisted — runtime only)
const battleControls = new Map<string, BattleControls>();

// ─── Derived Stores ─────────────────────────────────────────

export const activeGameCount = derived(activeGames, $g => $g.length);

export const hasActiveGames = derived(activeGames, $g => $g.length > 0);

export const canStartGame = derived(activeGames, $g => $g.length < MAX_CONCURRENT_GAMES);

export const sprintGames = derived(activeGames, $g =>
  $g.filter(g => g.battleMode === 'SPRINT')
);

export const backgroundGames = derived(activeGames, $g =>
  $g.filter(g => g.battleMode !== 'SPRINT')
);

export const pendingCheckpoints = derived(activeGames, $g =>
  $g.flatMap(g =>
    g.checkpoints
      .filter(cp => !cp.resolved)
      .map(cp => ({ matchId: g.matchId, pair: g.pair, checkpoint: cp }))
  )
);

// ─── Load / Save ────────────────────────────────────────────

function loadGames(): ActiveGame[] {
  const parsed = loadFromStorage<ActiveGame[]>(STORAGE_KEYS.activeGames, []);
  const now = Date.now();
  return parsed.filter(g => g.resolution === null && g.expiresAt > now);
}

// Only persist non-SPRINT games (SPRINT lives only in memory)
autoSave(activeGames, STORAGE_KEYS.activeGames, (games) =>
  games.filter(g => g.battleMode !== 'SPRINT'), 500
);

// ─── Actions ────────────────────────────────────────────────

/**
 * Add a new game and start its battle engine.
 */
export function addGame(
  game: ActiveGame,
  callbacks: {
    onPriceUpdate?: (game: ActiveGame, candle?: BinanceKline) => void;
    onCheckpoint?: (game: ActiveGame, checkpoint: Checkpoint) => void;
    onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  }
): boolean {
  const current = get(activeGames);
  if (current.length >= MAX_CONCURRENT_GAMES) return false;
  if (current.some(g => g.matchId === game.matchId)) return false;

  // Start the battle engine
  const controls = startBattle(game, {
    onPriceUpdate: (updatedGame, candle) => {
      // Update store with new price
      updateGame(updatedGame.matchId, updatedGame);
      callbacks.onPriceUpdate?.(updatedGame, candle);
    },
    onCheckpoint: (updatedGame, checkpoint) => {
      updateGame(updatedGame.matchId, updatedGame);
      callbacks.onCheckpoint?.(updatedGame, checkpoint);
    },
    onResolution: (finalGame, resolution) => {
      updateGame(finalGame.matchId, finalGame);
      battleControls.delete(finalGame.matchId);
      callbacks.onResolution(finalGame, resolution);
    },
  });

  battleControls.set(game.matchId, controls);
  activeGames.update(games => [...games, game]);
  return true;
}

/**
 * Update a game's state in the store.
 */
export function updateGame(matchId: string, updates: Partial<ActiveGame>) {
  activeGames.update(games =>
    games.map(g => g.matchId === matchId ? { ...g, ...updates } : g)
  );
}

/**
 * Remove a game from active tracking (after resolution or cancel).
 */
export function removeGame(matchId: string) {
  // Cleanup battle controls
  const controls = battleControls.get(matchId);
  if (controls) {
    controls.unsub();
    battleControls.delete(matchId);
  }

  activeGames.update(games => games.filter(g => g.matchId !== matchId));
}

/**
 * Submit a Decision Window action for a specific game.
 */
export function submitGameDW(matchId: string, action: DecisionAction) {
  const controls = battleControls.get(matchId);
  if (controls?.submitDW) {
    controls.submitDW(action);
  }
}

/**
 * Get the current state of a specific game.
 */
export function getGame(matchId: string): ActiveGame | undefined {
  const controls = battleControls.get(matchId);
  if (controls) {
    return controls.getGame();
  }
  return get(activeGames).find(g => g.matchId === matchId);
}

/**
 * Get the latest unresolved checkpoint for a game.
 */
export function getLatestCheckpoint(matchId: string): Checkpoint | null {
  const game = getGame(matchId);
  if (!game) return null;
  return game.checkpoints.find(cp => !cp.resolved) ?? null;
}

/**
 * Cancel/stop all active games (cleanup on page destroy).
 */
export function stopAllGames() {
  for (const [matchId, controls] of battleControls) {
    controls.unsub();
  }
  battleControls.clear();
}

/**
 * Resume background games after page reload.
 * Restarts battle engines for persisted STANDARD/MARATHON games.
 */
export function resumeBackgroundGames(
  callbacks: {
    onPriceUpdate?: (game: ActiveGame, candle?: BinanceKline) => void;
    onCheckpoint?: (game: ActiveGame, checkpoint: Checkpoint) => void;
    onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  }
) {
  const games = get(activeGames);

  for (const game of games) {
    if (game.resolution !== null) continue;  // Already resolved
    if (Date.now() >= game.expiresAt) {
      // Expired while offline — resolve as TIME_EXPIRY
      const resolvedGame: ActiveGame = {
        ...game,
        resolution: 'TIME_EXPIRY',
        exitPrice: game.currentPrice,
      };
      updateGame(game.matchId, resolvedGame);
      callbacks.onResolution(resolvedGame, 'TIME_EXPIRY');
      continue;
    }

    // Restart battle engine for active games
    const controls = startBattle(game, {
      onPriceUpdate: (updatedGame, candle) => {
        updateGame(updatedGame.matchId, updatedGame);
        callbacks.onPriceUpdate?.(updatedGame, candle);
      },
      onCheckpoint: (updatedGame, checkpoint) => {
        updateGame(updatedGame.matchId, updatedGame);
        callbacks.onCheckpoint?.(updatedGame, checkpoint);
      },
      onResolution: (finalGame, resolution) => {
        updateGame(finalGame.matchId, finalGame);
        battleControls.delete(finalGame.matchId);
        callbacks.onResolution(finalGame, resolution);
      },
    });

    battleControls.set(game.matchId, controls);
  }
}
