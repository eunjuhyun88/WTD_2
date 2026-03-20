// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — War Room Store (Client-side State)
// ═══════════════════════════════════════════════════════════════
//
// Manages the 3-round War Room debate UI state.
// Calls the server-side API for each round's LLM generation.

import { writable, derived, get } from 'svelte/store';
import type {
  WarRoomRound,
  WarRoomRoundResult,
  WarRoomDialogue,
  WarRoomConfidenceShift,
  WarRoomUserInteraction,
  UserInteractionType,
  AgentVote,
} from '$lib/engine/types';

// ─── State ──────────────────────────────────────────────────

export type WarRoomPhase = 'IDLE' | 'ROUND_1' | 'ROUND_1_INTERACT' | 'ROUND_2' | 'ROUND_2_INTERACT' | 'ROUND_3' | 'VOTING' | 'COMPLETE';

export interface WarRoomState {
  phase: WarRoomPhase;
  matchId: string | null;
  loading: boolean;
  error: string | null;
  rounds: WarRoomRoundResult[];
  userInteractions: WarRoomUserInteraction[];
  vote: AgentVote | null;
}

const defaultState: WarRoomState = {
  phase: 'IDLE',
  matchId: null,
  loading: false,
  error: null,
  rounds: [],
  userInteractions: [],
  vote: null,
};

export const warRoom = writable<WarRoomState>(defaultState);

// ─── Derived Stores ─────────────────────────────────────────

export const warRoomPhase = derived(warRoom, $s => $s.phase);
export const warRoomLoading = derived(warRoom, $s => $s.loading);
export const warRoomRounds = derived(warRoom, $s => $s.rounds);

export const currentRoundDialogues = derived(warRoom, $s => {
  if ($s.rounds.length === 0) return [];
  return $s.rounds[$s.rounds.length - 1].dialogues;
});

export const allDialogues = derived(warRoom, $s =>
  $s.rounds.flatMap(r => r.dialogues)
);

export const allConfidenceShifts = derived(warRoom, $s =>
  $s.rounds.flatMap(r => r.confidenceShifts)
);

export const canInteract = derived(warRoom, $s =>
  $s.phase === 'ROUND_1_INTERACT' || $s.phase === 'ROUND_2_INTERACT'
);

// ─── Actions ────────────────────────────────────────────────

/**
 * Start War Room for a match. Kicks off Round 1.
 */
export async function startWarRoom(matchId: string): Promise<boolean> {
  warRoom.set({
    ...defaultState,
    phase: 'ROUND_1',
    matchId,
    loading: true,
  });

  const result = await callWarRoomAPI(matchId, 1, [], []);
  if (!result) return false;

  warRoom.update(s => ({
    ...s,
    phase: 'ROUND_1_INTERACT',
    loading: false,
    rounds: [result],
  }));

  return true;
}

/**
 * Add a user interaction (agree/challenge/question) for an agent in the current round.
 */
export function addUserInteraction(agentId: string, type: UserInteractionType) {
  warRoom.update(s => {
    const currentRound: WarRoomRound =
      s.phase === 'ROUND_1_INTERACT' ? 1 :
      s.phase === 'ROUND_2_INTERACT' ? 2 : 1;

    // Check if already interacted with this agent in this round
    const existing = s.userInteractions.find(
      i => i.agentId === agentId && i.round === currentRound
    );
    if (existing) {
      // Replace existing interaction
      return {
        ...s,
        userInteractions: s.userInteractions.map(i =>
          i.agentId === agentId && i.round === currentRound
            ? { agentId, type, round: currentRound }
            : i
        ),
      };
    }

    return {
      ...s,
      userInteractions: [...s.userInteractions, { agentId, type, round: currentRound }],
    };
  });
}

/**
 * Advance to the next round after user has interacted.
 */
export async function advanceWarRoom(): Promise<boolean> {
  const state = get(warRoom);

  if (state.phase === 'ROUND_1_INTERACT') {
    // → Round 2
    warRoom.update(s => ({ ...s, phase: 'ROUND_2', loading: true }));
    const result = await callWarRoomAPI(
      state.matchId!,
      2,
      state.rounds,
      state.userInteractions
    );
    if (!result) return false;

    warRoom.update(s => ({
      ...s,
      phase: 'ROUND_2_INTERACT',
      loading: false,
      rounds: [...s.rounds, result],
    }));
    return true;
  }

  if (state.phase === 'ROUND_2_INTERACT') {
    // → Round 3
    warRoom.update(s => ({ ...s, phase: 'ROUND_3', loading: true }));
    const result = await callWarRoomAPI(
      state.matchId!,
      3,
      state.rounds,
      state.userInteractions
    );
    if (!result) return false;

    warRoom.update(s => ({
      ...s,
      phase: 'VOTING',
      loading: false,
      rounds: [...s.rounds, result],
    }));
    return true;
  }

  return false;
}

/**
 * Submit MVP/Traitor vote after Round 3.
 */
export function submitVote(mvpAgentId: string | null, traitorAgentId: string | null) {
  warRoom.update(s => ({
    ...s,
    phase: 'COMPLETE',
    vote: { mvpAgentId, traitorAgentId },
  }));
}

/**
 * Reset War Room state.
 */
export function resetWarRoom() {
  warRoom.set(defaultState);
}

/**
 * Get War Room result for scoring purposes.
 */
export function getWarRoomResult(): {
  rounds: WarRoomRoundResult[];
  vote: AgentVote | null;
  userInteractions: WarRoomUserInteraction[];
} {
  const state = get(warRoom);
  return {
    rounds: state.rounds,
    vote: state.vote,
    userInteractions: state.userInteractions,
  };
}

// ─── API Call ───────────────────────────────────────────────

async function callWarRoomAPI(
  matchId: string,
  round: WarRoomRound,
  previousRounds: WarRoomRoundResult[],
  userInteractions: WarRoomUserInteraction[]
): Promise<WarRoomRoundResult | null> {
  try {
    const res = await fetch(`/api/arena/match/${matchId}/warroom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round, previousRounds, userInteractions }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[warRoom] API error:', err);
      warRoom.update(s => ({
        ...s,
        loading: false,
        error: err.error || `Round ${round} failed`,
      }));
      return null;
    }

    const data = await res.json();
    return data.round as WarRoomRoundResult;
  } catch (err) {
    console.error('[warRoom] fetch error:', err);
    warRoom.update(s => ({
      ...s,
      loading: false,
      error: 'Network error — could not reach War Room server',
    }));
    return null;
  }
}
