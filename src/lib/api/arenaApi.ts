// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Arena API Client (browser-side)
// ═══════════════════════════════════════════════════════════════
//
// Wraps /api/arena/* endpoints for the Arena page to call.
// All functions return typed results or throw on error.

import type {
  Direction,
  DraftSelection,
  MatchPrediction,
  MatchState,
  MatchResult,
  AgentOutput,
  ExitRecommendation,
  MarketRegime,
} from '$lib/engine/types';

// ─── Response Types ─────────────────────────────────────────

export interface CreateMatchResponse {
  success: boolean;
  matchId: string;
  state: Partial<MatchState>;
}

export interface ListMatchesResponse {
  success: boolean;
  total: number;
  records: Partial<MatchState>[];
  pagination: { limit: number; offset: number };
}

export interface SubmitDraftResponse {
  success: boolean;
  phase: string;
  errors?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  agentOutputs: Pick<AgentOutput, 'agentId' | 'specId' | 'direction' | 'confidence' | 'thesis' | 'bullScore' | 'bearScore'>[];
  prediction: MatchPrediction;
  exitRecommendation: ExitRecommendation;
  entryPrice: number;
  regime: MarketRegime;
  meta: {
    totalLatencyMs: number;
    factorsComputed: number;
    factorsAvailable: number;
    dataCompleteness: number;
  };
}

export interface SubmitHypothesisResponse {
  success: boolean;
  prediction: MatchPrediction;
  phase: string;
}

export interface ResolveResponse {
  success: boolean;
  result: MatchResult;
  priceChange: string;
}

export type TournamentType = 'DAILY_SPRINT' | 'WEEKLY_CUP' | 'SEASON_CHAMPIONSHIP';
export type TournamentStatus = 'REG_OPEN' | 'REG_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface TournamentActiveRecord {
  tournamentId: string;
  type: TournamentType;
  pair: string;
  status: TournamentStatus;
  maxPlayers: number;
  registeredPlayers: number;
  entryFeeLp: number;
  startAt: string;
}

export interface ListActiveTournamentsResponse {
  success: boolean;
  records: TournamentActiveRecord[];
}

export interface RegisterTournamentResponse {
  success: boolean;
  tournamentId: string;
  registered: boolean;
  seed: number;
  lpDelta: number;
}

export interface TournamentBracketMatch {
  matchIndex: number;
  userA: { userId: string; nickname: string } | null;
  userB: { userId: string; nickname: string } | null;
  winnerId: string | null;
  matchId: string | null;
}

export interface TournamentBracketResponse {
  success: boolean;
  tournamentId: string;
  round: number;
  matches: TournamentBracketMatch[];
}

// ─── Helper ─────────────────────────────────────────────────

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.errors?.join(', ') || `API error ${res.status}`);
  }
  return data as T;
}

// ─── Arena API Functions ────────────────────────────────────

/** Create a new arena match */
export async function createArenaMatch(
  pair = 'BTC/USDT',
  timeframe = '4h',
): Promise<CreateMatchResponse> {
  return apiCall<CreateMatchResponse>('/api/arena/match', {
    method: 'POST',
    body: JSON.stringify({ pair, timeframe }),
  });
}

/** List user's arena matches */
export async function listArenaMatches(
  limit = 20,
  offset = 0,
): Promise<ListMatchesResponse> {
  return apiCall<ListMatchesResponse>(`/api/arena/match?limit=${limit}&offset=${offset}`);
}

/** Get a single match by ID */
export async function getArenaMatch(matchId: string): Promise<{ success: boolean; match: Partial<MatchState> }> {
  return apiCall(`/api/arena/match/${matchId}`);
}

/** Submit agent draft for a match */
export async function submitArenaDraft(
  matchId: string,
  draft: DraftSelection[],
): Promise<SubmitDraftResponse> {
  return apiCall<SubmitDraftResponse>('/api/arena/draft', {
    method: 'POST',
    body: JSON.stringify({ matchId, draft }),
  });
}

/** Run analysis pipeline (agents + exitOptimizer) */
export async function runArenaAnalysis(matchId: string): Promise<AnalyzeResponse> {
  return apiCall<AnalyzeResponse>('/api/arena/analyze', {
    method: 'POST',
    body: JSON.stringify({ matchId }),
  });
}

/** Submit user hypothesis (direction + confidence) */
export async function submitArenaHypothesis(
  matchId: string,
  direction: Direction,
  confidence: number,
  exitStrategy: 'conservative' | 'balanced' | 'aggressive' = 'balanced',
): Promise<SubmitHypothesisResponse> {
  return apiCall<SubmitHypothesisResponse>('/api/arena/hypothesis', {
    method: 'POST',
    body: JSON.stringify({ matchId, direction, confidence, exitStrategy }),
  });
}

/** Resolve match with exit price */
export async function resolveArenaMatch(
  matchId: string,
  exitPrice: number,
): Promise<ResolveResponse> {
  return apiCall<ResolveResponse>('/api/arena/resolve', {
    method: 'POST',
    body: JSON.stringify({ matchId, exitPrice }),
  });
}

/** List active tournaments (lobby widget) */
export async function listActiveTournaments(
  limit = 20,
): Promise<ListActiveTournamentsResponse> {
  return apiCall<ListActiveTournamentsResponse>(`/api/tournaments/active?limit=${limit}`);
}

/** Register current user for a tournament */
export async function registerTournament(
  tournamentId: string,
): Promise<RegisterTournamentResponse> {
  return apiCall<RegisterTournamentResponse>(`/api/tournaments/${tournamentId}/register`, {
    method: 'POST',
  });
}

/** Fetch bracket for tournament */
export async function getTournamentBracket(
  tournamentId: string,
): Promise<TournamentBracketResponse> {
  return apiCall<TournamentBracketResponse>(`/api/tournaments/${tournamentId}/bracket`);
}
