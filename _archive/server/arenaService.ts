// Stockclaw — Arena Service (B-01)
// Server-side match lifecycle management

import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '$lib/server/db';
import { validateDraft } from '$lib/engine/constants';
import { computeExitStrategy, applyExitToPrediction } from '$lib/engine/exitOptimizer';
import type {
  DraftSelection,
  MatchState,
  MatchPrediction,
  AgentOutput,
  Direction,
  FBScore,
  MatchResult,
  MatchResultType,
  MarketRegime,
  AgentId,
} from '$lib/engine/types';
import {
  FBS_WEIGHT_DS, FBS_WEIGHT_RE, FBS_WEIGHT_CI,
  CLUTCH_FBS_THRESHOLD, LP_REWARDS,
} from '$lib/engine/constants';

// ── Types ──
export interface CreateMatchInput {
  pair: string;
  timeframe: string;
}

export interface SubmitDraftInput {
  matchId: string;
  draft: DraftSelection[];
}

export interface SubmitHypothesisInput {
  matchId: string;
  direction: Direction;
  confidence: number;
  exitStrategy?: 'conservative' | 'balanced' | 'aggressive';
}

export interface ResolveMatchInput {
  matchId: string;
  exitPrice: number;
}

// ── DB persistence helpers ──
const TABLE_UNAVAILABLE = new Set(['42P01', '42703', '23503']);
function isTableError(err: unknown): boolean {
  const errObj = err as Record<string, unknown> | null | undefined;
  const code = typeof errObj?.code === 'string' ? errObj.code : '';
  return TABLE_UNAVAILABLE.has(code) || (typeof errObj?.message === 'string' && (errObj.message as string).includes('DATABASE_URL is not set'));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Create Match ──
export async function createMatch(userId: string, input: CreateMatchInput): Promise<{ matchId: string; state: Partial<MatchState> }> {
  const matchId = randomUUID();
  const pair = (input.pair || 'BTC/USDT').toUpperCase().trim();
  const timeframe = (input.timeframe || '4h').toLowerCase().trim();
  const now = new Date().toISOString();

  try {
    await query(
      `INSERT INTO arena_matches (id, user_a_id, pair, timeframe, phase, created_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5)`,
      [matchId, userId, pair, timeframe, now]
    );
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
    // DB unavailable - continue with in-memory match
  }

  return {
    matchId,
    state: {
      id: matchId,
      pair,
      timeframe,
      phase: 'DRAFT',
      userAId: userId,
      userBId: null,
      userADraft: null,
      userBDraft: null,
      userAPrediction: null,
      userBPrediction: null,
      analysisResults: [],
      entryPrice: null,
      exitPrice: null,
      priceChange: null,
      marketRegime: null,
      createdAt: now,
      startedAt: null,
      endedAt: null,
    },
  };
}

// ── Submit Draft ──
export async function submitDraft(userId: string, input: SubmitDraftInput): Promise<{ valid: boolean; errors: string[] }> {
  const validation = validateDraft(input.draft);
  if (!validation.valid) return validation;

  try {
    await query(
      `UPDATE arena_matches
       SET user_a_draft = $1::jsonb, phase = 'ANALYSIS', started_at = now()
       WHERE id = $2 AND user_a_id = $3 AND phase = 'DRAFT'`,
      [JSON.stringify(input.draft), input.matchId, userId]
    );
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
  }

  return { valid: true, errors: [] };
}

// ── Store Analysis Results ──
export async function storeAnalysisResults(
  matchId: string,
  agentOutputs: AgentOutput[],
  entryPrice: number,
  regime: MarketRegime | null,
): Promise<void> {
  try {
    await query(
      `UPDATE arena_matches
       SET analysis_results = $1::jsonb, entry_price = $2, market_regime = $3, phase = 'HYPOTHESIS'
       WHERE id = $4`,
      [JSON.stringify(agentOutputs), entryPrice, regime, matchId]
    );
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
  }
}

// ── Submit Hypothesis ──
export async function submitHypothesis(
  userId: string,
  input: SubmitHypothesisInput,
): Promise<{ prediction: MatchPrediction }> {
  const direction = input.direction;
  const confidence = clamp(input.confidence, 0, 100);
  const exitStrategy = input.exitStrategy || 'balanced';

  const prediction: MatchPrediction = {
    direction,
    confidence,
    isOverride: false,
    exitStrategy,
  };

  try {
    await query(
      `UPDATE arena_matches
       SET user_a_prediction = $1::jsonb, phase = 'BATTLE'
       WHERE id = $2 AND user_a_id = $3 AND phase = 'HYPOTHESIS'`,
      [JSON.stringify(prediction), input.matchId, userId]
    );
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
  }

  return { prediction };
}

// ── Scoring ──
function computeFBS(
  prediction: MatchPrediction,
  agentOutputs: AgentOutput[],
  priceChange: number,
): FBScore {
  const correct = (prediction.direction === 'LONG' && priceChange > 0) ||
                  (prediction.direction === 'SHORT' && priceChange < 0);

  // DS: Direction Score (was the direction right?)
  const ds = correct ? clamp(50 + Math.abs(priceChange) * 500, 50, 100) : clamp(50 - Math.abs(priceChange) * 500, 0, 50);

  // RE: Risk/Execution (how well did agents align?)
  const agentCorrect = agentOutputs.filter(a =>
    (a.direction === 'LONG' && priceChange > 0) || (a.direction === 'SHORT' && priceChange < 0)
  ).length;
  const re = clamp((agentCorrect / Math.max(agentOutputs.length, 1)) * 100, 0, 100);

  // CI: Confidence Index (was confidence calibrated?)
  const actualMove = Math.abs(priceChange) * 100; // as percentage
  const confDiff = Math.abs(prediction.confidence - actualMove * 10);
  const ci = clamp(100 - confDiff, 0, 100);

  const fbs = Math.round(FBS_WEIGHT_DS * ds + FBS_WEIGHT_RE * re + FBS_WEIGHT_CI * ci);

  return {
    ds: Math.round(ds),
    re: Math.round(re),
    ci: Math.round(ci),
    fbs: clamp(fbs, 0, 100),
  };
}

// ── Resolve Match ──
export async function resolveMatch(
  userId: string,
  input: ResolveMatchInput,
  entryPrice: number,
  prediction: MatchPrediction,
  agentOutputs: AgentOutput[],
): Promise<MatchResult> {
  const exitPrice = input.exitPrice;
  const priceChange = entryPrice > 0 ? (exitPrice - entryPrice) / entryPrice : 0;

  const userCorrect =
    (prediction.direction === 'LONG' && priceChange > 0) ||
    (prediction.direction === 'SHORT' && priceChange < 0);

  const userScore = computeFBS(prediction, agentOutputs, priceChange);

  // AI opponent (simple: opposite direction, fixed confidence)
  const aiPrediction: MatchPrediction = {
    direction: prediction.direction === 'LONG' ? 'SHORT' : 'LONG',
    confidence: 60,
    isOverride: false,
  };
  const aiScore = computeFBS(aiPrediction, agentOutputs, priceChange);

  const resultType: MatchResultType =
    userScore.fbs === aiScore.fbs ? 'draw' :
    userScore.fbs >= CLUTCH_FBS_THRESHOLD ? 'clutch_win' : 'normal_win';

  const winnerId = resultType === 'draw' ? null : (userScore.fbs > aiScore.fbs ? userId : null);

  const userLpDelta = winnerId === userId
    ? LP_REWARDS[resultType === 'clutch_win' ? 'clutch_win' : 'normal_win']
    : resultType === 'draw'
    ? LP_REWARDS.draw
    : LP_REWARDS.loss;

  const agentBreakdown = agentOutputs.map(a => ({
    agentId: a.agentId,
    specId: a.specId,
    direction: a.direction,
    correct: (a.direction === 'LONG' && priceChange > 0) || (a.direction === 'SHORT' && priceChange < 0),
  }));

  const result: MatchResult = {
    winnerId,
    resultType,
    userAScore: userScore,
    userBScore: aiScore,
    userALpDelta: userLpDelta,
    userBLpDelta: -userLpDelta,
    agentBreakdown,
  };

  try {
    await query(
      `UPDATE arena_matches
       SET exit_price = $1, price_change = $2, phase = 'RESULT',
           result = $3::jsonb, ended_at = now()
       WHERE id = $4`,
      [exitPrice, priceChange, JSON.stringify(result), input.matchId]
    );
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
  }

  return result;
}

// ── Get Match ──
export async function getMatch(userId: string, matchId: string): Promise<Partial<MatchState> | null> {
  try {
    const res = await query<any>(
      `SELECT * FROM arena_matches WHERE id = $1 AND user_a_id = $2 LIMIT 1`,
      [matchId, userId]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      pair: row.pair,
      timeframe: row.timeframe,
      phase: row.phase,
      userAId: row.user_a_id,
      userBId: row.user_b_id,
      userADraft: row.user_a_draft,
      userBDraft: row.user_b_draft,
      userAPrediction: row.user_a_prediction,
      userBPrediction: row.user_b_prediction,
      analysisResults: row.analysis_results ?? [],
      entryPrice: row.entry_price ? Number(row.entry_price) : null,
      exitPrice: row.exit_price ? Number(row.exit_price) : null,
      priceChange: row.price_change ? Number(row.price_change) : null,
      marketRegime: row.market_regime,
      createdAt: row.created_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    };
  } catch (err: unknown) {
    if (isTableError(err)) return null;
    throw err;
  }
}

// ── List Matches ──
export async function listMatches(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ records: Partial<MatchState>[]; total: number }> {
  try {
    const countRes = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM arena_matches WHERE user_a_id = $1`,
      [userId]
    );
    const total = Number(countRes.rows[0]?.total ?? '0');

    const rows = await query<any>(
      `SELECT id, pair, timeframe, phase, entry_price, exit_price, price_change,
              market_regime, created_at, ended_at
       FROM arena_matches WHERE user_a_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      total,
      records: rows.rows.map((row: any) => ({
        id: row.id,
        pair: row.pair,
        timeframe: row.timeframe,
        phase: row.phase,
        entryPrice: row.entry_price ? Number(row.entry_price) : null,
        exitPrice: row.exit_price ? Number(row.exit_price) : null,
        priceChange: row.price_change ? Number(row.price_change) : null,
        marketRegime: row.market_regime,
        createdAt: row.created_at,
        endedAt: row.ended_at,
      })),
    };
  } catch (err: unknown) {
    if (isTableError(err)) return { records: [], total: 0 };
    throw err;
  }
}
