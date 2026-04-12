// ═══════════════════════════════════════════════════════════════
// Stockclaw — Match History API (B-08 하위호환 어댑터)
// GET /api/matches — legacy matches + arena_matches 병합 반환
// POST /api/matches — legacy matches 테이블 INSERT (v2 호환)
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

// ── Legacy v2 match row (matches 테이블) ──
interface MatchRow {
  id: string;
  user_id: string | null;
  match_n: number;
  win: boolean;
  lp: number;
  score: number;
  streak: number;
  agents: string[];
  agent_votes: unknown;
  hypothesis: unknown;
  battle_result: string | null;
  consensus_type: string | null;
  lp_mult: number;
  signals: unknown;
  created_at: string;
}

// ── Arena v3 match row (arena_matches 테이블) ──
interface ArenaRow {
  id: string;
  user_a_id: string;
  pair: string;
  timeframe: string;
  phase: string;
  user_a_draft: any;
  user_a_prediction: any;
  analysis_results: any;
  entry_price: string | null;
  exit_price: string | null;
  price_change: string | null;
  result: any;
  created_at: string;
}

function toSafeInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeLimit(value: string | null): number {
  const parsed = toSafeInt(value, 50);
  return Math.min(200, Math.max(1, parsed));
}

function normalizeOffset(value: string | null): number {
  const parsed = toSafeInt(value, 0);
  return Math.max(0, parsed);
}

// ── v2 매핑 (기존 matches 테이블) ──
function mapLegacyMatch(row: MatchRow) {
  return {
    id: row.id,
    userId: row.user_id,
    matchN: row.match_n,
    win: row.win,
    lp: Number(row.lp ?? 0),
    score: Number(row.score ?? 0),
    streak: Number(row.streak ?? 0),
    agents: Array.isArray(row.agents) ? row.agents : [],
    agentVotes: row.agent_votes ?? null,
    hypothesis: row.hypothesis ?? null,
    battleResult: row.battle_result,
    consensusType: row.consensus_type,
    lpMult: Number(row.lp_mult ?? 1),
    signals: row.signals ?? [],
    createdAt: new Date(row.created_at).getTime(),
    source: 'legacy' as const,
  };
}

// ── v3 → v2 매핑 (arena_matches → legacy 형식) ──
function mapArenaMatch(row: ArenaRow) {
  const result = typeof row.result === 'object' && row.result ? row.result : {};
  const draft = Array.isArray(row.user_a_draft) ? row.user_a_draft : [];
  const prediction = typeof row.user_a_prediction === 'object' && row.user_a_prediction
    ? row.user_a_prediction : null;
  const analysisResults = Array.isArray(row.analysis_results) ? row.analysis_results : [];

  const winnerId = result.winnerId ?? null;
  const userScore = result.userAScore ?? {};
  const lpDelta = Number(result.userALpDelta ?? 0);
  const win = winnerId === row.user_a_id;
  const fbs = Number(userScore.fbs ?? 0);

  // 에이전트 votes를 legacy 형식으로 변환
  const agentVotes = analysisResults.map((a: any) => ({
    agentId: a.agentId ?? '',
    name: a.agentId ?? '',
    icon: '',
    color: '',
    dir: a.direction ?? '',
    conf: Number(a.confidence ?? 0),
  }));

  // hypothesis를 legacy 형식으로
  const hypothesis = prediction ? {
    dir: prediction.direction ?? '',
    conf: Number(prediction.confidence ?? 0),
    tf: row.timeframe ?? '',
    entry: Number(row.entry_price ?? 0),
    tp: 0,
    sl: 0,
    rr: 0,
  } : null;

  return {
    id: row.id,
    userId: row.user_a_id,
    matchN: 0, // v3에는 matchN 없음 — FE에서 인덱싱
    win,
    lp: lpDelta,
    score: fbs,
    streak: 0,
    agents: draft.map((d: any) => d.agentId ?? ''),
    agentVotes,
    hypothesis,
    battleResult: result.resultType ?? null,
    consensusType: null,
    lpMult: 1,
    signals: analysisResults.map((a: any) =>
      `${a.agentId}: ${a.direction} ${a.confidence}%`
    ),
    createdAt: new Date(row.created_at).getTime(),
    source: 'arena' as const,
    // v3 추가 필드
    pair: row.pair,
    timeframe: row.timeframe,
    priceChange: row.price_change ? Number(row.price_change) : null,
    entryPrice: row.entry_price ? Number(row.entry_price) : null,
    exitPrice: row.exit_price ? Number(row.exit_price) : null,
    fbs,
  };
}

// ── GET: legacy + arena 병합 ──
export const GET: RequestHandler = async ({ cookies, url }) => {
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const offset = normalizeOffset(url.searchParams.get('offset'));
  const sourceFilter = url.searchParams.get('source'); // 'legacy' | 'arena' | null(=all)

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    // 병렬로 양쪽 테이블 조회
    const [legacyResult, arenaResult] = await Promise.allSettled([
      // legacy matches (sourceFilter가 'arena'이면 스킵)
      sourceFilter === 'arena'
        ? Promise.resolve({ rows: [] as MatchRow[] })
        : query<MatchRow>(
            `SELECT id, user_id, match_n, win, lp, score, streak,
                    agents, agent_votes, hypothesis, battle_result,
                    consensus_type, lp_mult, signals, created_at
             FROM matches WHERE user_id = $1
             ORDER BY created_at DESC LIMIT $2`,
            [user.id, limit + offset] // 병합 후 슬라이싱하므로 넉넉히
          ),

      // arena matches (RESULT 페이즈만, sourceFilter가 'legacy'이면 스킵)
      sourceFilter === 'legacy'
        ? Promise.resolve({ rows: [] as ArenaRow[] })
        : query<ArenaRow>(
            `SELECT id, user_a_id, pair, timeframe, phase,
                    user_a_draft, user_a_prediction, analysis_results,
                    entry_price, exit_price, price_change, result, created_at
             FROM arena_matches
             WHERE user_a_id = $1 AND phase = 'RESULT'
             ORDER BY created_at DESC LIMIT $2`,
            [user.id, limit + offset]
          ),
    ]);

    const legacyRows = legacyResult.status === 'fulfilled' ? legacyResult.value.rows : [];
    const arenaRows = arenaResult.status === 'fulfilled' ? arenaResult.value.rows : [];

    // 각각 매핑
    const legacyMapped = legacyRows.map(mapLegacyMatch);
    const arenaMapped = arenaRows.map(mapArenaMatch);

    // 병합 후 시간순 정렬 + 페이지네이션
    const merged = [...legacyMapped, ...arenaMapped]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit);

    const total = legacyRows.length + arenaRows.length;

    return json({
      success: true,
      total,
      records: merged,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[matches/get] unexpected error:', error);
    return json({ error: 'Failed to load matches' }, { status: 500 });
  }
};

// ── POST: legacy matches INSERT (v2 호환 유지) ──
export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const {
      matchN,
      win,
      lp,
      score,
      streak,
      agents,
      agentVotes,
      hypothesis,
      battleResult,
      consensusType,
      lpMult,
      signals,
    } = body;

    if (matchN === undefined || typeof win !== 'boolean') {
      return json({ error: 'matchN and win are required' }, { status: 400 });
    }
    if (!Number.isFinite(matchN) || Math.trunc(matchN) < 0) {
      return json({ error: 'matchN must be a non-negative number' }, { status: 400 });
    }
    const parsedLp = Number.isFinite(lp) ? Number(lp) : 0;
    const parsedScore = Number.isFinite(score) ? Math.trunc(score) : 0;
    const parsedStreak = Number.isFinite(streak) ? Math.trunc(streak) : 0;
    const parsedLpMult = Number.isFinite(lpMult) ? Number(lpMult) : 1;
    const parsedAgents = Array.isArray(agents) ? agents.filter((v: unknown) => typeof v === 'string') : [];

    const result = await query<MatchRow>(
      `
        INSERT INTO matches (
          user_id, match_n, win, lp, score, streak,
          agents, agent_votes, hypothesis, battle_result,
          consensus_type, lp_mult, signals
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9::jsonb, $10, $11, $12, $13::jsonb)
        RETURNING
          id, user_id, match_n, win, lp, score, streak,
          agents, agent_votes, hypothesis, battle_result,
          consensus_type, lp_mult, signals, created_at
      `,
      [
        user.id,
        Math.trunc(matchN),
        win,
        parsedLp,
        parsedScore,
        parsedStreak,
        parsedAgents,
        agentVotes ?? null,
        hypothesis ?? null,
        battleResult ?? null,
        consensusType ?? null,
        parsedLpMult,
        signals ?? [],
      ]
    );

    return json({
      success: true,
      record: mapLegacyMatch(result.rows[0]),
    });
  } catch (error: any) {
    if (error?.code === '23503') {
      return json({ error: 'User does not exist' }, { status: 409 });
    }
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
    console.error('[matches/post] unexpected error:', error);
    return json({ error: 'Failed to save match' }, { status: 500 });
  }
};
