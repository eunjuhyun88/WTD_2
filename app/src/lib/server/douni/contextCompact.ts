// ═══════════════════════════════════════════════════════════════
// contextCompact.ts — DOUNI Auto-compact + Market Data Clearing
// ═══════════════════════════════════════════════════════════════
//
// Claude Code autoCompact.ts + clear_tool_uses 패턴 적용.
//
// 1. Auto-compact: 히스토리가 COMPACT_THRESHOLD 초과 시
//    오래된 턴을 세션 요약 1개로 압축 → 토큰 절약
//
// 2. Market data clearing: 분석 결과가 messages에 쌓이는 것 방지
//    최신 snapshot만 컨텍스트에 유지, 이전 것은 compressed summary로 교체
//
// 토큰 절감 효과:
//   히스토리 20턴 (~8K tok) → compact 후 ~1K tok
//   분석 10회 누적 (~25K tok) → 최신만 유지 → ~3K tok

import type { CompressedHistoryEntry } from './contextBuilder';

// ─── Constants ───────────────────────────────────────────────

/** 이 수 초과 시 auto-compact 발동 */
export const COMPACT_THRESHOLD = 20;

/** compact 후 유지할 최근 턴 수 */
export const COMPACT_KEEP_RECENT = 8;

/** snapshot이 이 시간(ms) 이상 지났으면 stale */
export const SNAPSHOT_STALE_MS = 30 * 60 * 1000; // 30분

// ─── Auto-compact ─────────────────────────────────────────────

export interface CompactResult {
  compacted: boolean;
  summary: string | null;
  recentHistory: CompressedHistoryEntry[];
}

/**
 * Claude Code autoCompact.ts 패턴 적용.
 * 히스토리가 COMPACT_THRESHOLD 초과 시:
 *   - 오래된 턴 → 결정론적 요약 (LLM 없이)
 *   - 최근 COMPACT_KEEP_RECENT 턴만 유지
 *
 * ⚠ Market snapshot 보존 규칙:
 *   마지막 analysis 턴(meta.kind === 'analysis')은 KEEP_RECENT 윈도우
 *   밖에 있어도 반드시 recentHistory 앞에 pinning.
 *   → compact 직후 "OI 어때?" 질문 시 market data 없는 상황 방지.
 */
export function maybeCompactHistory(
  history: CompressedHistoryEntry[],
): CompactResult {
  if (history.length < COMPACT_THRESHOLD) {
    return { compacted: false, summary: null, recentHistory: history };
  }

  const recentWindow = history.slice(-COMPACT_KEEP_RECENT);
  const toCompress   = history.slice(0, -COMPACT_KEEP_RECENT);

  // 마지막 analysis 턴이 이미 recentWindow 안에 있는지 확인
  const lastAnalysisInWindow = recentWindow.some(
    h => h.role === 'assistant' && h.meta?.kind === 'analysis',
  );

  // recentWindow 밖에 있으면 toCompress에서 찾아서 pinning
  let pinnedAnalysis: CompressedHistoryEntry | null = null;
  if (!lastAnalysisInWindow) {
    for (let i = toCompress.length - 1; i >= 0; i--) {
      const h = toCompress[i];
      if (h.role === 'assistant' && h.meta?.kind === 'analysis') {
        pinnedAnalysis = h;
        break;
      }
    }
  }

  const summary = buildSessionSummary(toCompress);

  // pinned analysis를 recentHistory 맨 앞에 붙여 시장 맥락 유지
  const recentHistory: CompressedHistoryEntry[] = pinnedAnalysis
    ? [pinnedAnalysis, ...recentWindow]
    : recentWindow;

  return { compacted: true, summary, recentHistory };
}

/**
 * 압축 대상 히스토리 → 세션 요약 문자열.
 * LLM 없이 결정론적으로 생성.
 * Claude Code의 compact summary를 규칙 기반으로 재현.
 */
function buildSessionSummary(history: CompressedHistoryEntry[]): string {
  const analyzed: string[] = [];
  const userTopics: string[] = [];

  for (const h of history) {
    if (h.role === 'assistant' && h.meta) {
      const { symbol, tf, direction, alphaScore, kind } = h.meta;
      if (kind === 'analysis' && symbol) {
        const score = alphaScore != null
          ? (alphaScore > 0 ? `+${alphaScore}` : `${alphaScore}`)
          : '';
        analyzed.push(`${symbol}${tf ? ` ${tf}` : ''} ${direction ?? '?'}${score}`);
      } else if (kind === 'scan') {
        analyzed.push('SCAN');
      }
    }
    if (h.role === 'user' && h.content.length > 3) {
      userTopics.push(h.content.slice(0, 50).replace(/\n/g, ' '));
    }
  }

  const parts: string[] = [];
  if (analyzed.length > 0)
    parts.push(`Analyzed: ${[...new Set(analyzed)].join(', ')}`);
  if (userTopics.length > 0)
    parts.push(`Topics: ${userTopics.slice(-3).join(' / ')}`);

  return parts.length > 0 ? parts.join(' | ') : 'Earlier conversation compressed.';
}

// ─── Market data clearing ────────────────────────────────────

/**
 * Claude Code clear_tool_uses 패턴 적용.
 * messages 배열에서 stale한 시장 데이터 섹션을 제거.
 *
 * 현재 컨텍스트에는 snapshot이 system prompt 섹션으로 주입되므로
 * messages 레벨에서는 중복 snapshot을 감지해 제거.
 */
export function clearStaleMarketData(
  messages: Array<{ role: string; content: string }>,
  currentSymbol?: string,
): Array<{ role: string; content: string }> {
  return messages.map(msg => {
    if (msg.role !== 'system') return msg;

    // [Current Analysis] 섹션이 있는 시스템 메시지에서
    // 현재 심볼과 다른 분석 결과 제거
    if (msg.content.includes('[Current Analysis]') && currentSymbol) {
      const hasCurrentSymbol = msg.content.includes(currentSymbol);
      if (!hasCurrentSymbol) {
        // 다른 심볼의 분석 → 섹션 제거, 나머지 유지
        return {
          ...msg,
          content: msg.content
            .replace(/\n\n\[Current Analysis\][\s\S]*?(?=\n\n##|\n\n\[|$)/g, '')
            .trim(),
        };
      }
    }

    return msg;
  });
}

// ─── Token budget estimation ─────────────────────────────────

/**
 * 히스토리의 추정 토큰 수 계산.
 * Claude Code의 tokenCountWithEstimation() 근사치.
 * 4자 ≈ 1 토큰 (영어 기준), 2자 ≈ 1 토큰 (한국어/일어 기준)
 */
export function estimateHistoryTokens(
  history: CompressedHistoryEntry[],
): number {
  const totalChars = history.reduce(
    (sum, h) => sum + h.content.length,
    0,
  );
  // 보수적 추정: 2자 = 1 토큰 (CJK 고려)
  return Math.ceil(totalChars / 2);
}

/** 컨텍스트 버짓 경고 임계값 */
export const CONTEXT_WARN_TOKENS  = 60_000;
export const CONTEXT_COMPACT_TOKENS = 80_000;

export function shouldCompactByTokens(
  history: CompressedHistoryEntry[],
): boolean {
  return estimateHistoryTokens(history) >= CONTEXT_COMPACT_TOKENS;
}
