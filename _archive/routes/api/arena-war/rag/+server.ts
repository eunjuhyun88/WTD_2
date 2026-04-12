// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Arena War RAG API
// ═══════════════════════════════════════════════════════════════
//
// POST /api/arena-war/rag?action=search — 유사 게임 검색 + RAGRecall
// POST /api/arena-war/rag?action=save   — RAGEntry 저장

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  saveRAGEntry,
  searchAndAnalyze,
  type RAGSearchOptions,
} from '$lib/server/ragService';
import type { RAGEntry } from '$lib/engine/arenaWarTypes';
import type { Direction } from '$lib/engine/types';

// ─── POST: RAG Search or Save ────────────────────────────────

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const action = url.searchParams.get('action') ?? 'search';
    const body = await request.json();

    if (action === 'search') {
      return handleSearch(user.id, body);
    } else if (action === 'save') {
      return handleSave(user.id, body);
    } else {
      return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[api/arena-war/rag POST] unexpected error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

// ─── Search Handler ─────────────────────────────────────────

async function handleSearch(userId: string, body: {
  embedding: number[];
  currentDirection: Direction;
  currentConfidence: number;
  pair?: string;
  regime?: string;
  limit?: number;
  minQuality?: 'strong' | 'medium' | 'boundary' | 'weak';
}) {
  const { embedding, currentDirection, currentConfidence } = body;

  if (!embedding || !Array.isArray(embedding) || embedding.length !== 256) {
    return json({ error: 'embedding must be a 256-element number array' }, { status: 400 });
  }
  if (!currentDirection) {
    return json({ error: 'currentDirection is required' }, { status: 400 });
  }

  const options: RAGSearchOptions = {
    pair: body.pair,
    regime: body.regime,
    limit: body.limit,
    minQuality: body.minQuality,
  };

  const result = await searchAndAnalyze(
    embedding,
    userId,
    currentDirection,
    currentConfidence ?? 50,
    options
  );

  return json({
    success: true,
    games: result.games,
    recall: result.recall,
  });
}

// ─── Save Handler ───────────────────────────────────────────

async function handleSave(userId: string, body: {
  gameRecordId: string;
  ragEntry: RAGEntry;
}) {
  const { gameRecordId, ragEntry } = body;

  if (!gameRecordId || !ragEntry) {
    return json({ error: 'gameRecordId and ragEntry are required' }, { status: 400 });
  }

  // 임베딩이 all-zeros면 저장하지 않음 (의미 없음)
  const hasValidEmbedding = ragEntry.embedding &&
    ragEntry.embedding.length === 256 &&
    ragEntry.embedding.some((v: number) => v !== 0);

  if (!hasValidEmbedding) {
    return json({
      success: false,
      warning: 'Embedding is all zeros or invalid — skipping save',
    });
  }

  const result = await saveRAGEntry(userId, gameRecordId, ragEntry);
  return json(result);
}
