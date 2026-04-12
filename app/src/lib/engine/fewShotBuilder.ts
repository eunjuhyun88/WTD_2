// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Few-Shot Builder: RAG → Commander Prompt
// ═══════════════════════════════════════════════════════════════
//
// 유사 게임 top-3을 Few-Shot 예시로 포맷팅.
// Commander LLM이 과거 유사 상황의 결과를 참고하여 더 나은 판단.
//
// 예시당 ~100 토큰 → 3개 = ~300 토큰
// 전체 Commander 프롬프트: ~500-800 토큰 → 비용 ~$0.003-0.008

import type { SimilarGame } from '$lib/server/ragService';
import type {
  OrpoOutput,
  CtxBelief,
  GuardianCheck,
  Direction,
} from './types';
import type { RAGRecall } from './arenaWarTypes';

// ─── Few-Shot Example Formatting ──────────────────────────

/**
 * 유사 게임 top-N을 Few-Shot 예시 문자열로 포맷팅.
 * quality가 높은 게임 우선 선택.
 */
export function buildFewShotExamples(
  similarGames: SimilarGame[],
  maxExamples: number = 3
): string {
  if (similarGames.length === 0) return '';

  // quality 우선 정렬: strong > medium > boundary > weak
  const qualityOrder: Record<string, number> = {
    strong: 0, medium: 1, boundary: 2, weak: 3,
  };

  const sorted = [...similarGames]
    .sort((a, b) => {
      const qa = qualityOrder[a.quality] ?? 4;
      const qb = qualityOrder[b.quality] ?? 4;
      if (qa !== qb) return qa - qb;
      return b.similarity - a.similarity; // 유사도 높은 순
    })
    .slice(0, maxExamples);

  const examples = sorted.map((g, i) => {
    const similarity = (g.similarity * 100).toFixed(0);
    const winLabel = g.winner === 'ai' ? 'AI won' :
                     g.winner === 'human' ? 'Human won' : 'Draw';

    return [
      `Example ${i + 1} (${similarity}% similar, ${g.quality} quality):`,
      `  Pair: ${g.pair} | TF: ${g.timeframe} | Regime: ${g.regime}`,
      `  AI: ${g.ai_direction} ${g.ai_confidence}% | Human: ${g.human_direction} ${g.human_confidence}%`,
      `  Result: ${winLabel} (AI FBS: ${g.ai_fbs.toFixed(1)}, Human FBS: ${g.human_fbs.toFixed(1)}, ΔP: ${g.price_change.toFixed(2)}%)`,
      g.lesson ? `  Lesson: ${g.lesson}` : null,
    ].filter(Boolean).join('\n');
  });

  return [
    '--- Past Similar Games ---',
    ...examples,
    '--- End Past Games ---',
  ].join('\n');
}

// ─── Paper 2: Agent Retrieval Weights (Ablation Study) ──────
// STRUCTURE(Technical) 가장 높은 가치, MACRO/NEWS는 노이즈 경향.
// 검색 결과 가중 및 few-shot 예시 우선순위에 사용.

export const AGENT_RETRIEVAL_WEIGHTS: Record<string, number> = {
  STRUCTURE: 1.3,
  VPA: 1.2,
  ICT: 1.2,
  DERIV: 1.1,
  FLOW: 1.0,
  SENTI: 0.8,
  MACRO: 0.7,
};

// ─── Multi-Source Few-Shot Builder (Paper 1 + 2) ────────────

/**
 * Decision Memory 멀티소스 few-shot 예시 생성.
 *
 * Paper 1: confirmed outcome 우선, quality 기반 선택.
 * Paper 2: 소스 다양성 (같은 source 최대 2개), agent_signals 포함.
 *
 * trade outcome은 "LONG closed +3.5% PnL" 형식으로 포맷.
 */
export function buildMultiSourceFewShotExamples(
  similarGames: SimilarGame[],
  maxExamples: number = 3
): string {
  if (similarGames.length === 0) return '';

  const qualityOrder: Record<string, number> = {
    strong: 0, medium: 1, boundary: 2, weak: 3,
  };

  // 1. Quality + similarity 정렬
  const sorted = [...similarGames].sort((a, b) => {
    const qa = qualityOrder[a.quality] ?? 4;
    const qb = qualityOrder[b.quality] ?? 4;
    if (qa !== qb) return qa - qb;
    return b.similarity - a.similarity;
  });

  // 2. Source diversity: 같은 source에서 최대 2개
  const selected: SimilarGame[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const g of sorted) {
    if (selected.length >= maxExamples) break;
    const src = g.source ?? 'arena_war';
    const count = sourceCounts[src] ?? 0;
    if (count >= 2) continue;
    selected.push(g);
    sourceCounts[src] = count + 1;
  }

  // 3. 각 예시 포맷팅
  const examples = selected.map((g, i) => {
    const similarity = (g.similarity * 100).toFixed(0);
    const src = g.source ?? 'arena_war';
    const outcomeType = g.outcome_type ?? '';
    const outcomeValue = g.outcome_value ?? 0;
    const agentSignals = g.agent_signals;

    // Source 라벨
    const sourceLabel = src === 'arena_war' ? 'Game'
      : src === 'terminal_scan' ? 'Scan'
      : src === 'quick_trade_open' ? 'TradeOpen'
      : src === 'quick_trade_close' ? 'TradeClose'
      : src === 'signal_action' ? 'Signal'
      : src;

    // Outcome 포맷
    let resultLine: string;
    if (outcomeType === 'pnl') {
      const pnl = Number(outcomeValue);
      resultLine = `${g.ai_direction} closed ${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}% PnL`;
    } else if (g.winner && g.winner !== 'pending') {
      const winLabel = g.winner === 'ai' ? 'AI won' :
                       g.winner === 'human' ? 'Human won' : 'Draw';
      resultLine = `${winLabel} (AI FBS: ${g.ai_fbs.toFixed(1)}, ΔP: ${g.price_change.toFixed(2)}%)`;
    } else {
      resultLine = 'Pending';
    }

    const lines = [
      `Example ${i + 1} [${sourceLabel}] (${similarity}% sim, ${g.quality}):`,
      `  ${g.pair} ${g.timeframe} ${g.regime} → ${g.ai_direction} ${g.ai_confidence}%`,
      `  Result: ${resultLine}`,
    ];

    // Paper 2: agent_signals 상세 (있을 때만, 가중치 높은 에이전트 우선)
    if (agentSignals && Object.keys(agentSignals).length > 0) {
      const agentSummary = Object.entries(agentSignals)
        .sort(([a], [b]) =>
          (AGENT_RETRIEVAL_WEIGHTS[b] ?? 0.5) - (AGENT_RETRIEVAL_WEIGHTS[a] ?? 0.5)
        )
        .slice(0, 4) // top 4 agents only
        .map(([agent, sig]) => `${agent}:${sig.vote}(${sig.confidence}%)`)
        .join(' ');
      lines.push(`  Agents: ${agentSummary}`);
    }

    if (g.lesson) lines.push(`  Lesson: ${g.lesson}`);

    return lines.join('\n');
  });

  return [
    '--- Past Decision Memory ---',
    ...examples,
    '--- End Decision Memory ---',
  ].join('\n');
}

// ─── Commander LLM Message Builder ──────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Commander LLM 호출용 메시지 배열 생성.
 * ORPO vs CTX 충돌 시에만 호출됨.
 */
export function buildCommanderMessages(
  orpo: OrpoOutput,
  ctx: CtxBelief[],
  guardian: GuardianCheck,
  ragRecall: RAGRecall | null,
  fewShotExamples: string,
  pair: string,
  regime: string,
  timeframe: string
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // System prompt
  messages.push({
    role: 'system',
    content: [
      'You are a trading decision Commander. Your job is to resolve conflicts between OFFENSE (ORPO) and DEFENSE/CONTEXT (CTX) signals.',
      'Output format: {"direction":"LONG"|"SHORT"|"NEUTRAL","confidence":0-100,"reasoning":"brief explanation"}',
      'Rules:',
      '- If Guardian issued a BLOCK, output NEUTRAL with confidence 0.',
      '- Consider historical win rates from RAG recall when available.',
      '- Be concise. Max 2 sentences for reasoning.',
    ].join('\n'),
  });

  // User message with all context
  const ctxSummary = ctx.map(c =>
    `${c.agentId}: ${c.flag} (${c.confidence}%) — ${c.headline}`
  ).join('\n');

  const guardianSummary = guardian.violations.length > 0
    ? guardian.violations.map(v => `[${v.severity}] ${v.rule}: ${v.detail}`).join('\n')
    : 'No violations';

  const ragSummary = ragRecall
    ? [
      `Similar games found: ${ragRecall.similarGamesFound}`,
      `Historical win rate: ${(ragRecall.historicalWinRate * 100).toFixed(0)}%`,
      `Suggested direction: ${ragRecall.suggestedDirection}`,
      `Confidence adjustment: ${ragRecall.confidenceAdjustment > 0 ? '+' : ''}${ragRecall.confidenceAdjustment}`,
    ].join('\n')
    : 'No historical data available';

  const userContent = [
    `Market: ${pair} | ${timeframe} | Regime: ${regime}`,
    '',
    `ORPO (OFFENSE): ${orpo.direction} ${orpo.confidence}%`,
    `Pattern: ${orpo.pattern}`,
    `Thesis: ${orpo.thesis}`,
    '',
    'CTX (DEFENSE/CONTEXT):',
    ctxSummary,
    '',
    'Guardian:',
    guardianSummary,
    '',
    'RAG Recall:',
    ragSummary,
  ];

  if (fewShotExamples) {
    userContent.push('', fewShotExamples);
  }

  userContent.push('', 'Resolve the ORPO vs CTX conflict. Output JSON only.');

  messages.push({
    role: 'user',
    content: userContent.join('\n'),
  });

  return messages;
}

// ─── Commander Response Parser ──────────────────────────────

export interface CommanderLLMResponse {
  direction: Direction;
  confidence: number;
  reasoning: string;
}

/**
 * Commander LLM 응답 파싱.
 * JSON 추출 → fallback 값 반환.
 */
export function parseCommanderResponse(
  text: string,
  fallbackDirection: Direction,
  fallbackConfidence: number
): CommanderLLMResponse {
  try {
    // JSON 블록 추출 (```json ... ``` 또는 { ... })
    const jsonMatch = text.match(/\{[^{}]*"direction"[^{}]*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const direction = validateDirection(parsed.direction) ?? fallbackDirection;
      const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
        : fallbackConfidence;
      const reasoning = typeof parsed.reasoning === 'string'
        ? parsed.reasoning.slice(0, 200)
        : 'LLM response parsed.';

      return { direction, confidence, reasoning };
    }
  } catch {
    // JSON 파싱 실패 → fallback
  }

  // Fallback: 텍스트에서 방향 추출 시도
  const upperText = text.toUpperCase();
  let direction = fallbackDirection;
  if (upperText.includes('LONG') && !upperText.includes('SHORT')) direction = 'LONG';
  else if (upperText.includes('SHORT') && !upperText.includes('LONG')) direction = 'SHORT';
  else if (upperText.includes('NEUTRAL')) direction = 'NEUTRAL';

  return {
    direction,
    confidence: fallbackConfidence,
    reasoning: 'Parsed from LLM text (no JSON found).',
  };
}

// ─── Helpers ───────────────────────────────────────────────

function validateDirection(d: unknown): Direction | null {
  if (typeof d !== 'string') return null;
  const upper = d.toUpperCase();
  if (upper === 'LONG' || upper === 'SHORT' || upper === 'NEUTRAL') {
    return upper as Direction;
  }
  return null;
}
