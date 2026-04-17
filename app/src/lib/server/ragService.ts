// ═══════════════════════════════════════════════════════════════
// WTD — RAG Service: Decision Memory Save, Search, Analyze
// ═══════════════════════════════════════════════════════════════
//
// 모든 의사결정 활동을 256d 벡터로 저장/검색.
// pgvector 코사인 거리(<=>)로 similarity 측정.
//
// Sources (DecisionMemorySource):
//   - arena_war: Arena War 게임 결과
//   - terminal_scan: Terminal 8-agent 스캔 결과
//   - opportunity_scan: Opportunity Scanner 결과
//   - quick_trade_open: QuickTrade 진입 (chain_step=1)
//   - quick_trade_close: QuickTrade 청산 + chain maturation (chain_step=2)
//   - signal_action: Signal tracking 액션 (chain_step=0)
//
// Decision Chain (Paper 2: 계층적 구조):
//   scan(step=0) → trade_open(step=1) → trade_close(step=2)
//   Close 시 matureDecisionChain()으로 체인 전체 outcome 확정
//
// Graceful Degradation:
//   - 테이블 미존재: warning 반환, 크래시 없음
//   - 0 유사 게임: ragRecall null 반환
//   - 1-4 게임: recall 생성, confidenceAdj = 0
//   - 5+ 게임: 의미 있는 통계 기반 recall
//
// 비용: $0 (LLM 미사용, 순수 DB 쿼리)

import { query } from './db';
import type {
  RAGEntry,
  RAGRecall,
  AgentSignal,
  ChainMatureResult,
  QuickTradeRAGInput,
  SignalActionRAGInput,
} from '$lib/contracts/rag';
import type { Direction } from '$lib/contracts/game';
import {
  computeQuickTradeEmbedding,
  computeSignalActionEmbedding,
  computeDedupeHash,
} from '$lib/server/rag/embedding';

// ─── Types ──────────────────────────────────────────────────

/** DB에서 반환되는 유사 게임 row */
export interface SimilarGame {
  id: string;
  pair: string;
  timeframe: string;
  regime: string;
  pattern_signature: string;
  human_direction: string;
  human_confidence: number;
  ai_direction: string;
  ai_confidence: number;
  winner: string;
  human_fbs: number;
  ai_fbs: number;
  price_change: number;
  quality: string;
  lesson: string;
  created_at: Date;
  similarity: number;
  outcome_type?: string;
  outcome_value?: number;
  agent_signals?: Record<string, { vote: string; confidence: number }>;
  source?: string;
}

/** RAG 검색 옵션 */
export interface RAGSearchOptions {
  pair?: string;
  regime?: string;
  limit?: number;
  minQuality?: 'strong' | 'medium' | 'boundary' | 'weak';
  /** Paper 1: confirmed outcome에 2x 가중 (search_arena_war_rag_v2) */
  preferConfirmedOutcomes?: boolean;
}

/** RAG 저장 결과 */
export interface RAGSaveResult {
  success: boolean;
  warning?: string;
}

/** RAG 검색 + 분석 결과 */
export interface RAGSearchResult {
  games: SimilarGame[];
  recall: RAGRecall | null;
}

// ─── Error Detection ────────────────────────────────────────

function isTableMissing(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    return msg.includes('does not exist') ||
           msg.includes('relation') ||
           msg.includes('undefined_table');
  }
  return false;
}

function isFunctionMissing(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    return msg.includes('function') && msg.includes('does not exist');
  }
  return false;
}

// ─── Save ──────────────────────────────────────────────────

/** RAG source type (DecisionMemorySource와 동일) */
export type RAGSource =
  | 'arena_war'
  | 'terminal_scan'
  | 'opportunity_scan'
  | 'quick_trade_open'
  | 'quick_trade_close'
  | 'signal_action';

/**
 * RAG 엔트리를 arena_war_rag 테이블에 저장.
 * embedding을 pgvector 포맷 ([1,2,3,...]) 문자열로 변환.
 */
export async function saveRAGEntry(
  userId: string,
  gameRecordId: string,
  entry: RAGEntry,
  source: RAGSource = 'arena_war'
): Promise<RAGSaveResult> {
  try {
    // pgvector는 '[1,2,3]' 문자열 포맷으로 입력
    const embeddingStr = `[${entry.embedding.join(',')}]`;

    await query(
      `INSERT INTO arena_war_rag (
        id, user_id, source, pair, timeframe, regime, pattern_signature,
        embedding,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence, ai_top_factors,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::vector,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, to_timestamp($21 / 1000.0)
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        quality = EXCLUDED.quality,
        lesson = EXCLUDED.lesson`,
      [
        gameRecordId,
        userId,
        source,
        entry.pair,
        entry.timeframe,
        entry.regime,
        entry.patternSignature,
        embeddingStr,
        entry.humanDecision.direction,
        entry.humanDecision.confidence,
        JSON.stringify(entry.humanDecision.reasonTags),
        entry.aiDecision.direction,
        entry.aiDecision.confidence,
        JSON.stringify(entry.aiDecision.topFactors),
        entry.outcome.winner,
        entry.outcome.humanFBS,
        entry.outcome.aiFBS,
        entry.outcome.priceChange,
        entry.quality,
        entry.lesson,
        entry.timestamp,
      ]
    );

    return { success: true };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping save');
      return { success: false, warning: 'arena_war_rag table not found. Run 002_arena_war_rag.sql migration.' };
    }
    console.error('[ragService] Failed to save RAG entry:', e);
    return { success: false, warning: String(e) };
  }
}

// ─── Terminal Scan RAG Save ─────────────────────────────────

/** Terminal 스캔 결과를 RAG 엔트리로 변환/저장하기 위한 입력 */
export interface TerminalScanRAGInput {
  scanId: string;
  pair: string;
  timeframe: string;
  consensus: string;          // long | short | neutral
  avgConfidence: number;
  highlights: Array<{
    agent: string;
    vote: string;
    conf: number;
    note: string;
  }>;
  embedding: number[];
  /** Paper 2: 에이전트별 세분화 시그널 */
  agentSignals?: Record<string, AgentSignal>;
}

/**
 * Terminal 스캔 결과를 RAG에 저장.
 * Arena War와 같은 테이블, source='terminal_scan'.
 *
 * Terminal 스캔은 outcome이 없으므로 winner='pending'.
 * 나중에 가격 변동이 확인되면 업데이트 가능.
 */
export async function saveTerminalScanRAG(
  userId: string,
  input: TerminalScanRAGInput
): Promise<RAGSaveResult> {
  try {
    const embeddingStr = `[${input.embedding.join(',')}]`;

    // 에이전트 투표에서 top factors 추출
    const topFactors = input.highlights
      .filter(h => h.vote !== 'neutral')
      .sort((a, b) => b.conf - a.conf)
      .slice(0, 5)
      .map(h => h.agent.toUpperCase());

    // 레짐 추정: 에이전트 투표 패턴으로 간이 판별
    const longVotes = input.highlights.filter(h => h.vote === 'long').length;
    const shortVotes = input.highlights.filter(h => h.vote === 'short').length;
    const confSpread = Math.max(...input.highlights.map(h => h.conf)) -
                       Math.min(...input.highlights.map(h => h.conf));
    let regime = 'ranging';
    if (longVotes >= 5 && input.avgConfidence >= 65) regime = 'trending_up';
    else if (shortVotes >= 5 && input.avgConfidence >= 65) regime = 'trending_down';
    else if (confSpread > 40) regime = 'volatile';

    // Paper 2: agent_signals JSONB — 에이전트별 세분화
    const agentSignals = input.agentSignals ?? Object.fromEntries(
      input.highlights.map(h => [
        h.agent.toUpperCase(),
        { vote: h.vote, confidence: h.conf, note: h.note },
      ])
    );

    // Decision Chain: chain_id = 'scan-{scanId}'
    const chainId = `scan-${input.scanId}`;

    // Paper 1: Semantic dedup 해시
    const dedupeHash = await computeDedupeHash({
      pair: input.pair,
      timeframe: input.timeframe,
      direction: input.consensus.toUpperCase(),
      regime,
      source: 'terminal_scan',
    });

    // Paper 1: 중복 체크
    const isDuplicate = await checkDedupe(userId, dedupeHash);
    if (isDuplicate) {
      return { success: true, warning: 'Duplicate scan detected — skipped' };
    }

    await query(
      `INSERT INTO arena_war_rag (
        id, user_id, source, pair, timeframe, regime, pattern_signature,
        embedding,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence, ai_top_factors,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson,
        chain_id, chain_step, agent_signals, dedupe_hash,
        created_at
      ) VALUES (
        $1, $2, 'terminal_scan', $3, $4, $5, $6,
        $7::vector,
        $8, $9, '[]'::jsonb,
        $10, $11, $12,
        'pending', 0, 0, 0,
        $13, $14,
        $15, 0, $16::jsonb, $17,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        ai_confidence = EXCLUDED.ai_confidence,
        agent_signals = EXCLUDED.agent_signals`,
      [
        chainId,
        userId,
        input.pair,
        input.timeframe,
        regime,
        `SCAN:${input.consensus.toUpperCase()}:${topFactors.slice(0, 3).join('+')}`,
        embeddingStr,
        // Human direction = consensus (유저가 이 스캔을 요청한 것 자체가 관심 표현)
        input.consensus.toUpperCase(),
        input.avgConfidence,
        // AI direction = consensus
        input.consensus.toUpperCase(),
        input.avgConfidence,
        JSON.stringify(topFactors),
        // quality: confidence 기반 자동 분류
        input.avgConfidence >= 70 ? 'medium' :
        input.avgConfidence >= 55 ? 'boundary' : 'weak',
        `Terminal scan: ${input.pair} ${input.timeframe} → ${input.consensus} ${input.avgConfidence}%`,
        chainId,
        JSON.stringify(agentSignals),
        dedupeHash,
      ]
    );

    return { success: true };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping terminal scan save');
      return { success: false, warning: 'arena_war_rag table not found' };
    }
    console.error('[ragService] Failed to save terminal scan RAG:', e);
    return { success: false, warning: String(e) };
  }
}

// ─── Search ─────────────────────────────────────────────────

/**
 * pgvector 코사인 거리로 유사 게임 검색.
 * SQL 함수 search_arena_war_rag() 사용 시도 → 실패 시 직접 쿼리 fallback.
 */
export async function searchSimilarGames(
  embedding: number[],
  userId: string,
  options: RAGSearchOptions = {}
): Promise<SimilarGame[]> {
  const { pair, regime, limit = 5, minQuality = 'weak', preferConfirmedOutcomes } = options;
  const embeddingStr = `[${embedding.join(',')}]`;

  try {
    // Paper 1: preferConfirmedOutcomes → v2 함수 사용 (outcome-weighted scoring)
    if (preferConfirmedOutcomes) {
      try {
        const result = await query<SimilarGame>(
          `SELECT * FROM search_arena_war_rag_v2($1::vector, $2::uuid, $3, $4, $5, $6, $7)`,
          [embeddingStr, userId, pair ?? null, regime ?? null, minQuality, limit, true]
        );
        return result.rows;
      } catch (e2) {
        if (isFunctionMissing(e2)) {
          console.warn('[ragService] search_arena_war_rag_v2() not found — falling back to v1');
          // fall through to v1
        } else {
          throw e2;
        }
      }
    }

    // SQL 함수 v1 사용 시도
    const result = await query<SimilarGame>(
      `SELECT * FROM search_arena_war_rag($1::vector, $2::uuid, $3, $4, $5, $6)`,
      [embeddingStr, userId, pair ?? null, regime ?? null, minQuality, limit]
    );
    return result.rows;
  } catch (e) {
    if (isFunctionMissing(e)) {
      // 함수 미존재 → 직접 쿼리 fallback
      console.warn('[ragService] search_arena_war_rag() not found — using direct query');
      return searchSimilarGamesDirect(embedding, userId, options);
    }
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — returning empty');
      return [];
    }
    console.error('[ragService] RAG search failed:', e);
    return [];
  }
}

/**
 * SQL 함수 없이 직접 쿼리 (fallback).
 */
async function searchSimilarGamesDirect(
  embedding: number[],
  userId: string,
  options: RAGSearchOptions = {}
): Promise<SimilarGame[]> {
  const { pair, regime, limit = 5, minQuality = 'weak' } = options;
  const embeddingStr = `[${embedding.join(',')}]`;

  const qualityRanks: Record<string, number> = {
    strong: 1, medium: 2, boundary: 3, weak: 4,
  };
  const maxRank = qualityRanks[minQuality] ?? 4;
  const allowedQualities = Object.entries(qualityRanks)
    .filter(([, rank]) => rank <= maxRank)
    .map(([q]) => q);

  const conditions = [
    'user_id = $2',
    'embedding IS NOT NULL',
    `quality = ANY($3)`,
  ];
  const params: unknown[] = [embeddingStr, userId, allowedQualities];
  let paramIdx = 4;

  if (pair) {
    conditions.push(`pair = $${paramIdx}`);
    params.push(pair);
    paramIdx++;
  }
  if (regime) {
    conditions.push(`regime = $${paramIdx}`);
    params.push(regime);
    paramIdx++;
  }

  params.push(limit);

  try {
    const result = await query<SimilarGame>(
      `SELECT
        id, pair, timeframe, regime, pattern_signature,
        human_direction, human_confidence,
        ai_direction, ai_confidence,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson, created_at,
        1.0 - (embedding <=> $1::vector)::DOUBLE PRECISION AS similarity
      FROM arena_war_rag
      WHERE ${conditions.join(' AND ')}
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIdx}`,
      params
    );
    return result.rows;
  } catch (e) {
    if (isTableMissing(e)) {
      return [];
    }
    console.error('[ragService] Direct RAG search failed:', e);
    return [];
  }
}

// ─── Analyze (Compute RAGRecall) ────────────────────────────

/**
 * 유사 게임들로부터 RAGRecall 통계 계산.
 *
 * - 5+ 게임: 통계적으로 의미 있는 recall
 * - 1-4 게임: recall 생성하되 confidenceAdj = 0
 * - 0 게임: null 반환
 */
export function computeRAGRecall(
  similarGames: SimilarGame[],
  currentDirection: Direction,
  currentConfidence: number
): RAGRecall | null {
  if (similarGames.length === 0) return null;

  // 패턴 시그니처 수집
  const queriedPatterns = [
    ...new Set(similarGames.map(g => g.pattern_signature).filter(Boolean)),
  ];

  // 같은 방향을 택한 과거 게임들의 승률
  const sameDirectionGames = similarGames.filter(
    g => g.ai_direction === currentDirection
  );
  const sameDirectionWins = sameDirectionGames.filter(
    g => g.winner === 'ai'
  ).length;
  const historicalWinRate = sameDirectionGames.length > 0
    ? sameDirectionWins / sameDirectionGames.length
    : 0.5;

  // 가장 많이 승리한 방향 추천
  const directionWins: Record<string, number> = {};
  for (const g of similarGames) {
    const winDir = g.winner === 'ai' ? g.ai_direction : g.human_direction;
    directionWins[winDir] = (directionWins[winDir] ?? 0) + 1;
  }
  const suggestedDirection = (
    Object.entries(directionWins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? currentDirection
  ) as Direction;

  // Confidence 조정 (5+ 게임부터 의미 있음)
  let confidenceAdjustment = 0;
  if (similarGames.length >= 5) {
    // winRate가 0.7 이상이면 confidence 증가, 0.3 이하면 감소
    if (historicalWinRate >= 0.7) {
      confidenceAdjustment = Math.min(10, Math.round((historicalWinRate - 0.5) * 20));
    } else if (historicalWinRate <= 0.3) {
      confidenceAdjustment = Math.max(-10, Math.round((historicalWinRate - 0.5) * 20));
    }
    // 방향이 다르면 경고성 감소
    if (suggestedDirection !== currentDirection && historicalWinRate < 0.4) {
      confidenceAdjustment = Math.min(confidenceAdjustment, -5);
    }
  }

  return {
    queriedPatterns,
    similarGamesFound: similarGames.length,
    historicalWinRate: Math.round(historicalWinRate * 100) / 100,
    suggestedDirection,
    confidenceAdjustment,
  };
}

// ─── RAG Recall V2 (Paper 1 + Paper 2 가중) ────────────────

/** Paper 2: Agent retrieval weights (ablation 기반) */
const AGENT_WEIGHTS: Record<string, number> = {
  STRUCTURE: 1.3, VPA: 1.2, ICT: 1.2, DERIV: 1.1,
  FLOW: 1.0, SENTI: 0.8, MACRO: 0.7,
};

/**
 * RAGRecall v2: confirmed outcome 2x 가중, Paper 2 에이전트 가중치 적용.
 *
 * Paper 1: outcome_type != 'pending' → 2x 신뢰 가중
 * Paper 2: agent_signals에서 STRUCTURE/VPA/ICT 높은 에이전트의 방향 추천
 */
export function computeRAGRecallV2(
  similarGames: SimilarGame[],
  currentDirection: Direction,
  currentConfidence: number
): RAGRecall | null {
  if (similarGames.length === 0) return null;

  const queriedPatterns = [
    ...new Set(similarGames.map(g => g.pattern_signature).filter(Boolean)),
  ];

  // 방향별 가중 점수 (confirmed outcomes 2x, agent weights 적용)
  const directionScores: Record<string, number> = {};
  let totalWeight = 0;
  let successWeight = 0;

  for (const g of similarGames) {
    const outcomeType = g.outcome_type ?? 'pending';
    const outcomeBonus = outcomeType !== 'pending' ? 2.0 : 1.0;
    const agentSignals = g.agent_signals;

    // 기본 weight
    let weight = outcomeBonus * g.similarity;

    // Paper 2: agent_signals 가중치 (있으면 적용)
    if (agentSignals && Object.keys(agentSignals).length > 0) {
      let agentScore = 0;
      let agentTotal = 0;
      for (const [agent, sig] of Object.entries(agentSignals)) {
        const w = AGENT_WEIGHTS[agent] ?? 0.5;
        const dirMatch = sig.vote?.toUpperCase() === currentDirection ? 1 : 0;
        agentScore += w * dirMatch * (sig.confidence / 100);
        agentTotal += w;
      }
      if (agentTotal > 0) {
        weight *= (0.7 + 0.3 * (agentScore / agentTotal)); // agent alignment bonus
      }
    }

    // 승리 방향 집계
    const isSuccess = g.winner === 'ai' ||
      (g.outcome_type === 'pnl' && Number(g.outcome_value ?? 0) > 0);
    const winDir = isSuccess ? g.ai_direction : g.human_direction;
    directionScores[winDir] = (directionScores[winDir] ?? 0) + weight;

    // 같은 방향 성공률 계산
    if (g.ai_direction === currentDirection) {
      totalWeight += weight;
      if (isSuccess) successWeight += weight;
    }
  }

  const historicalWinRate = totalWeight > 0 ? successWeight / totalWeight : 0.5;

  const suggestedDirection = (
    Object.entries(directionScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? currentDirection
  ) as Direction;

  // Confidence adjustment (5+ 게임부터)
  let confidenceAdjustment = 0;
  if (similarGames.length >= 5) {
    if (historicalWinRate >= 0.7) {
      confidenceAdjustment = Math.min(10, Math.round((historicalWinRate - 0.5) * 20));
    } else if (historicalWinRate <= 0.3) {
      confidenceAdjustment = Math.max(-10, Math.round((historicalWinRate - 0.5) * 20));
    }
    if (suggestedDirection !== currentDirection && historicalWinRate < 0.4) {
      confidenceAdjustment = Math.min(confidenceAdjustment, -5);
    }
  }

  return {
    queriedPatterns,
    similarGamesFound: similarGames.length,
    historicalWinRate: Math.round(historicalWinRate * 100) / 100,
    suggestedDirection,
    confidenceAdjustment,
  };
}

// ─── Combined Search + Analyze ──────────────────────────────

/**
 * 임베딩으로 유사 게임 검색 + RAGRecall 생성.
 * 원스톱 API — gameRecordStore에서 호출.
 */
export async function searchAndAnalyze(
  embedding: number[],
  userId: string,
  currentDirection: Direction,
  currentConfidence: number,
  options: RAGSearchOptions = {}
): Promise<RAGSearchResult> {
  const games = await searchSimilarGames(embedding, userId, options);
  // Paper 1+2: preferConfirmedOutcomes 시 v2 recall 사용
  const recall = options.preferConfirmedOutcomes
    ? computeRAGRecallV2(games, currentDirection, currentConfidence)
    : computeRAGRecall(games, currentDirection, currentConfidence);

  return { games, recall };
}

// ─── Decision Memory: Dedup Check ───────────────────────────

/**
 * Paper 1: Semantic deduplication 체크.
 * 같은 user + dedupe_hash 존재 여부 확인.
 */
export async function checkDedupe(
  userId: string,
  dedupeHash: string
): Promise<boolean> {
  try {
    // SQL 함수 시도
    const result = await query<{ check_rag_dedupe: boolean }>(
      `SELECT check_rag_dedupe($1::uuid, $2)`,
      [userId, dedupeHash]
    );
    return result.rows[0]?.check_rag_dedupe ?? false;
  } catch (e) {
    if (isFunctionMissing(e)) {
      // fallback: 직접 쿼리
      try {
        const result = await query<{ exists: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM arena_war_rag
            WHERE user_id = $1 AND dedupe_hash = $2
          ) AS exists`,
          [userId, dedupeHash]
        );
        return result.rows[0]?.exists ?? false;
      } catch (e2) {
        if (isTableMissing(e2)) return false;
        throw e2;
      }
    }
    if (isTableMissing(e)) return false;
    console.error('[ragService] Dedupe check failed:', e);
    return false;
  }
}

// ─── Decision Memory: QuickTrade Open ───────────────────────

/**
 * QuickTrade 진입을 RAG에 저장.
 * chain_step=1, outcome='pending', quality='boundary'.
 *
 * chainId: scan에서 유래 시 'scan-{scanId}', 직접 개설 시 'trade-{tradeId}'.
 */
export async function saveQuickTradeOpenRAG(
  userId: string,
  input: QuickTradeRAGInput,
  chainId: string
): Promise<RAGSaveResult> {
  try {
    const embedding = await computeQuickTradeEmbedding({
      pair: input.pair,
      direction: input.dir,
      entryPrice: input.entry,
      currentPrice: input.currentPrice,
      tp: input.tp,
      sl: input.sl,
      source: input.source,
    });
    const embeddingStr = `[${embedding.join(',')}]`;

    const dedupeHash = await computeDedupeHash({
      pair: input.pair,
      timeframe: '1h', // trade는 기본 1h window
      direction: input.dir,
      regime: 'unknown',
      source: 'quick_trade_open',
      windowMinutes: 30, // 30분 내 동일 trade dedup
    });

    const isDuplicate = await checkDedupe(userId, dedupeHash);
    if (isDuplicate) {
      return { success: true, warning: 'Duplicate trade open detected — skipped' };
    }

    await query(
      `INSERT INTO arena_war_rag (
        id, user_id, source, pair, timeframe, regime, pattern_signature,
        embedding,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence, ai_top_factors,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson,
        chain_id, chain_step, outcome_type, dedupe_hash,
        created_at
      ) VALUES (
        $1, $2, 'quick_trade_open', $3, '1h', 'unknown', $4,
        $5::vector,
        $6, 50, '[]'::jsonb,
        $6, 50, '[]'::jsonb,
        'pending', 0, 0, 0,
        'boundary', $7,
        $8, 1, 'pending', $9,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding`,
      [
        `trade-open-${input.tradeId}`,
        userId,
        input.pair,
        `TRADE:OPEN:${input.dir}:${input.source}`,
        embeddingStr,
        input.dir,
        `QuickTrade open: ${input.pair} ${input.dir} @ ${input.entry}${input.note ? ` — ${input.note}` : ''}`,
        chainId,
        dedupeHash,
      ]
    );

    return { success: true };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping trade open save');
      return { success: false, warning: 'arena_war_rag table not found' };
    }
    console.error('[ragService] Failed to save trade open RAG:', e);
    return { success: false, warning: String(e) };
  }
}

// ─── Decision Memory: QuickTrade Close ──────────────────────

/**
 * QuickTrade 청산을 RAG에 저장.
 * chain_step=2, outcome_type='pnl', outcome_value=PnL%.
 *
 * ⭐ 가장 높은 가치의 훅: PnL이 체인 전체를 성숙시킴.
 * 저장 후 matureDecisionChain() 호출 → 체인 내 모든 pending 엔트리 업데이트.
 */
export async function saveQuickTradeCloseRAG(
  userId: string,
  input: QuickTradeRAGInput & { pnlPercent: number; exitPrice: number },
  chainId: string
): Promise<RAGSaveResult> {
  try {
    const embedding = await computeQuickTradeEmbedding({
      pair: input.pair,
      direction: input.dir,
      entryPrice: input.entry,
      currentPrice: input.exitPrice,
      tp: input.tp,
      sl: input.sl,
      source: input.source,
    });
    const embeddingStr = `[${embedding.join(',')}]`;

    // PnL 기반 quality 분류 (Paper 1: outcome quality)
    const absPnl = Math.abs(input.pnlPercent);
    const quality = absPnl >= 5 ? 'strong'
      : absPnl >= 2 ? 'medium'
      : absPnl >= 0.5 ? 'boundary'
      : 'weak';

    await query(
      `INSERT INTO arena_war_rag (
        id, user_id, source, pair, timeframe, regime, pattern_signature,
        embedding,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence, ai_top_factors,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson,
        chain_id, chain_step,
        outcome_type, outcome_value, outcome_at,
        created_at
      ) VALUES (
        $1, $2, 'quick_trade_close', $3, '1h', 'unknown', $4,
        $5::vector,
        $6, 50, '[]'::jsonb,
        $6, 50, '[]'::jsonb,
        'pending', 0, 0, $7,
        $8, $9,
        $10, 2,
        'pnl', $11, NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        outcome_type = 'pnl',
        outcome_value = EXCLUDED.outcome_value,
        outcome_at = NOW(),
        quality = EXCLUDED.quality`,
      [
        `trade-close-${input.tradeId}`,
        userId,
        input.pair,
        `TRADE:CLOSE:${input.dir}:${input.pnlPercent > 0 ? 'PROFIT' : 'LOSS'}`,
        embeddingStr,
        input.dir,
        input.pnlPercent,
        quality,
        `QuickTrade close: ${input.pair} ${input.dir} PnL ${input.pnlPercent > 0 ? '+' : ''}${input.pnlPercent.toFixed(2)}%`,
        chainId,
        input.pnlPercent,
      ]
    );

    // ⭐ Decision Chain Maturation — 체인 전체 outcome 확정
    await matureDecisionChain(chainId, 'pnl', input.pnlPercent).catch(err => {
      console.warn('[ragService] Chain maturation failed (non-fatal):', err);
    });

    return { success: true };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping trade close save');
      return { success: false, warning: 'arena_war_rag table not found' };
    }
    console.error('[ragService] Failed to save trade close RAG:', e);
    return { success: false, warning: String(e) };
  }
}

// ─── Decision Memory: Signal Action ─────────────────────────

/**
 * Signal tracking 액션(convert_to_trade, track, dismiss 등)을 RAG에 저장.
 * chain_step=0, quality='weak' (가장 약한 신호).
 */
export async function saveSignalActionRAG(
  userId: string,
  input: SignalActionRAGInput
): Promise<RAGSaveResult> {
  try {
    const embedding = await computeSignalActionEmbedding({
      pair: input.pair,
      direction: input.dir,
      actionType: input.actionType,
      confidence: input.confidence ?? 50,
      source: input.source,
    });
    const embeddingStr = `[${embedding.join(',')}]`;

    const dedupeHash = await computeDedupeHash({
      pair: input.pair,
      timeframe: '1h',
      direction: input.dir,
      regime: 'unknown',
      source: 'signal_action',
      windowMinutes: 60,
    });

    const isDuplicate = await checkDedupe(userId, dedupeHash);
    if (isDuplicate) {
      return { success: true, warning: 'Duplicate signal action detected — skipped' };
    }

    await query(
      `INSERT INTO arena_war_rag (
        id, user_id, source, pair, timeframe, regime, pattern_signature,
        embedding,
        human_direction, human_confidence, human_reason_tags,
        ai_direction, ai_confidence, ai_top_factors,
        winner, human_fbs, ai_fbs, price_change,
        quality, lesson,
        chain_id, chain_step, outcome_type, dedupe_hash,
        created_at
      ) VALUES (
        $1, $2, 'signal_action', $3, '1h', 'unknown', $4,
        $5::vector,
        $6, $7, '[]'::jsonb,
        $6, $7, '[]'::jsonb,
        'pending', 0, 0, 0,
        'weak', $8,
        $9, 0, 'pending', $10,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding`,
      [
        `signal-${input.actionId}`,
        userId,
        input.pair,
        `SIGNAL:${input.actionType.toUpperCase()}:${input.dir}`,
        embeddingStr,
        input.dir,
        input.confidence ?? 50,
        `Signal ${input.actionType}: ${input.pair} ${input.dir} from ${input.source}`,
        `signal-${input.actionId}`, // chainId = self
        dedupeHash,
      ]
    );

    return { success: true };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping signal action save');
      return { success: false, warning: 'arena_war_rag table not found' };
    }
    console.error('[ragService] Failed to save signal action RAG:', e);
    return { success: false, warning: String(e) };
  }
}

// ─── Decision Chain Maturation ──────────────────────────────

/**
 * Decision Chain 전체를 성숙시킴.
 *
 * Paper 1: pending → confirmed. KB 품질 1순위.
 * Paper 2: 계층적 구조 — chain 전체가 하나의 의사결정 흐름.
 *
 * PnL 기반 quality 재분류:
 *   |PnL| >= 5% → 'strong'
 *   |PnL| >= 2% → 'medium'
 *   |PnL| >= 0.5% → 'boundary'
 *   else → 'weak'
 */
export async function matureDecisionChain(
  chainId: string,
  outcomeType: string,
  outcomeValue: number
): Promise<ChainMatureResult> {
  const absPnl = Math.abs(outcomeValue);
  const quality = absPnl >= 5 ? 'strong'
    : absPnl >= 2 ? 'medium'
    : absPnl >= 0.5 ? 'boundary'
    : 'weak';

  try {
    const result = await query(
      `UPDATE arena_war_rag
       SET
         outcome_type = $2,
         outcome_value = $3,
         outcome_at = NOW(),
         quality = CASE
           WHEN quality = 'strong' THEN quality  -- 이미 strong이면 유지
           ELSE $4
         END
       WHERE chain_id = $1 AND outcome_type = 'pending'`,
      [chainId, outcomeType, outcomeValue, quality]
    );

    const updatedCount = result.rowCount ?? 0;
    if (updatedCount > 0) {
      console.log(`[ragService] Chain ${chainId} matured: ${updatedCount} entries → ${outcomeType}=${outcomeValue}, quality=${quality}`);
    }

    return { updatedCount, chainId, outcomeType, outcomeValue };
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn('[ragService] arena_war_rag table does not exist — skipping maturation');
      return { updatedCount: 0, chainId, outcomeType, outcomeValue };
    }
    console.error('[ragService] Chain maturation failed:', e);
    return { updatedCount: 0, chainId, outcomeType, outcomeValue };
  }
}
