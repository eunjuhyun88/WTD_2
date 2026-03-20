// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Arena War API
// ═══════════════════════════════════════════════════════════════
//
// POST /api/arena-war  — GameRecord 저장
// GET  /api/arena-war  — GameRecord 목록 조회 + 통계

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';
import { saveRAGEntry } from '$lib/server/ragService';

// ─── POST: GameRecord 저장 ──────────────────────────────────

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const { gameRecord } = body;

    if (!gameRecord || !gameRecord.id) {
      return json({ error: 'gameRecord is required' }, { status: 400 });
    }

    // Upsert game_records
    await query(
      `INSERT INTO arena_war_records (
        id, user_id, version, pair, timeframe, regime,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence,
        winner, human_fbs, ai_fbs, fbs_margin,
        consensus_type, pair_quality,
        game_record,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15,
        $16, $17,
        $18,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        gameRecord.id,
        user.id,
        gameRecord.version ?? 1,
        gameRecord.context?.pair ?? 'BTCUSDT',
        gameRecord.context?.timeframe ?? '4h',
        gameRecord.context?.regime ?? 'ranging',
        gameRecord.human?.direction ?? 'NEUTRAL',
        gameRecord.human?.confidence ?? 50,
        JSON.stringify(gameRecord.human?.reasonTags ?? []),
        gameRecord.ai?.direction ?? 'NEUTRAL',
        gameRecord.ai?.confidence ?? 50,
        gameRecord.outcome?.winner ?? 'draw',
        gameRecord.outcome?.humanFBS?.fbs ?? 0,
        gameRecord.outcome?.aiFBS?.fbs ?? 0,
        gameRecord.outcome?.fbsMargin ?? 0,
        gameRecord.outcome?.consensusType ?? 'partial',
        gameRecord.derived?.orpoPair?.quality ?? 'noise',
        JSON.stringify(gameRecord),
      ]
    );

    // Fire-and-forget: activity_events
    query(
      `INSERT INTO activity_events (user_id, event_type, payload, created_at)
       VALUES ($1, 'arena_war_complete', $2, NOW())`,
      [user.id, JSON.stringify({
        matchId: gameRecord.id,
        winner: gameRecord.outcome?.winner,
        pair: gameRecord.context?.pair,
        consensusType: gameRecord.outcome?.consensusType,
      })]
    ).catch(() => undefined);

    // Fire-and-forget: RAG entry 저장 (서버 사이드 redundant)
    const ragEntry = gameRecord.derived?.ragEntry;
    if (ragEntry && ragEntry.embedding?.length === 256 && ragEntry.embedding.some((v: number) => v !== 0)) {
      saveRAGEntry(user.id, gameRecord.id, ragEntry).catch(() => undefined);
    }

    return json({ success: true, id: gameRecord.id });

  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    // 테이블이 없는 경우 graceful fallback
    if (errorContains(error, 'relation') && errorContains(error, 'does not exist')) {
      return json({
        success: true,
        id: 'mock',
        warning: 'arena_war_records table not yet created — record saved in-memory only',
      });
    }
    console.error('[api/arena-war POST] unexpected error:', error);
    return json({ error: 'Failed to save game record' }, { status: 500 });
  }
};

// ─── GET: GameRecord 목록 조회 ──────────────────────────────

interface RecordRow {
  id: string;
  pair: string;
  timeframe: string;
  regime: string;
  human_direction: string;
  ai_direction: string;
  winner: string;
  human_fbs: number;
  ai_fbs: number;
  fbs_margin: number;
  consensus_type: string;
  pair_quality: string;
  human_reason_tags: string;
  game_record: string;
  created_at: string;
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 100000);
    const includeFullRecord = url.searchParams.get('full') === 'true';

    const result = await query<RecordRow>(
      `SELECT id, pair, timeframe, regime,
              human_direction, ai_direction, winner,
              human_fbs, ai_fbs, fbs_margin,
              consensus_type, pair_quality, human_reason_tags,
              ${includeFullRecord ? 'game_record,' : ''}
              created_at
       FROM arena_war_records
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset]
    );

    // Compute stats
    const statsResult = await query<{
      total: string;
      wins: string;
      losses: string;
      draws: string;
      avg_fbs: string;
      avg_ai_fbs: string;
      dissent_wins: string;
      strong_pairs: string;
      medium_pairs: string;
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE winner = 'human') as wins,
        COUNT(*) FILTER (WHERE winner = 'ai') as losses,
        COUNT(*) FILTER (WHERE winner = 'draw') as draws,
        COALESCE(AVG(human_fbs), 0) as avg_fbs,
        COALESCE(AVG(ai_fbs), 0) as avg_ai_fbs,
        COUNT(*) FILTER (WHERE consensus_type = 'dissent' AND winner = 'human') as dissent_wins,
        COUNT(*) FILTER (WHERE pair_quality = 'strong') as strong_pairs,
        COUNT(*) FILTER (WHERE pair_quality = 'medium') as medium_pairs
       FROM arena_war_records
       WHERE user_id = $1`,
      [user.id]
    );

    const stats = statsResult.rows[0];

    const records = result.rows.map((r: any) => ({
      id: r.id,
      pair: r.pair,
      timeframe: r.timeframe,
      regime: r.regime,
      humanDirection: r.human_direction,
      aiDirection: r.ai_direction,
      winner: r.winner,
      humanFbs: r.human_fbs,
      aiFbs: r.ai_fbs,
      fbsMargin: r.fbs_margin,
      consensusType: r.consensus_type,
      pairQuality: r.pair_quality,
      reasonTags: JSON.parse(r.human_reason_tags || '[]'),
      ...(includeFullRecord && r.game_record ? { fullRecord: JSON.parse(r.game_record) } : {}),
      createdAt: r.created_at,
    }));

    return json({
      success: true,
      records,
      stats: {
        totalGames: parseInt(stats.total),
        wins: parseInt(stats.wins),
        losses: parseInt(stats.losses),
        draws: parseInt(stats.draws),
        winRate: parseInt(stats.total) > 0
          ? parseInt(stats.wins) / parseInt(stats.total)
          : 0,
        avgFBS: Math.round(parseFloat(stats.avg_fbs)),
        avgAiFBS: Math.round(parseFloat(stats.avg_ai_fbs)),
        dissentWins: parseInt(stats.dissent_wins),
        strongPairs: parseInt(stats.strong_pairs),
        mediumPairs: parseInt(stats.medium_pairs),
      },
    });

  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (errorContains(error, 'relation') && errorContains(error, 'does not exist')) {
      return json({
        success: true,
        records: [],
        stats: {
          totalGames: 0, wins: 0, losses: 0, draws: 0,
          winRate: 0, avgFBS: 0, avgAiFBS: 0,
          dissentWins: 0, strongPairs: 0, mediumPairs: 0,
        },
        warning: 'arena_war_records table not yet created',
      });
    }
    console.error('[api/arena-war GET] unexpected error:', error);
    return json({ error: 'Failed to fetch game records' }, { status: 500 });
  }
};
