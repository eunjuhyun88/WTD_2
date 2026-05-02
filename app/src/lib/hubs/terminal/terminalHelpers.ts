// ═══════════════════════════════════════════════════════════════
//  WTD — Terminal Pure Helper Functions
//  Extracted from terminal/+page.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

import { AGDEFS } from '$lib/data/agents';

// ─── Types ────────────────────────────────────────────────────

export type ChatTradeDirection = 'LONG' | 'SHORT';

export type PatternScanScope = 'visible' | 'full';

export interface PatternScanReport {
  ok: boolean;
  scope: PatternScanScope;
  candleCount: number;
  patternCount: number;
  patterns: Array<{
    kind: 'head_and_shoulders' | 'falling_wedge';
    shortName: string;
    direction: 'BULLISH' | 'BEARISH';
    status: 'FORMING' | 'CONFIRMED';
    confidence: number;
    startTime: number;
    endTime: number;
  }>;
  message: string;
}

export type ChatErrorKind = 'network' | 'timeout' | 'llm_unavailable' | 'server_error' | 'unknown';

export const ERROR_MESSAGES: Record<ChatErrorKind, string> = {
  network: '네트워크 연결이 끊어졌습니다. Wi-Fi/인터넷 상태를 확인해주세요.',
  timeout: 'LLM 응답이 20초를 초과했습니다. 서버 부하가 높거나 프롬프트가 길 수 있습니다. 잠시 후 다시 시도해주세요.',
  llm_unavailable: 'LLM 프로바이더에 연결할 수 없습니다. Settings에서 API 키(Groq/Gemini/DeepSeek)가 설정되어 있는지 확인해주세요.',
  server_error: '서버 내부 오류가 발생했습니다. 잠시 후 재시도해주세요.',
  unknown: '알 수 없는 오류가 발생했습니다.',
};

// ─── Agent Detection ──────────────────────────────────────────

/** Build agent icon/color lookup from AGDEFS */
export function buildAgentMeta(): Record<string, { icon: string; color: string }> {
  const meta: Record<string, { icon: string; color: string }> = {};
  for (const ag of AGDEFS) meta[ag.name] = { icon: ag.icon, color: ag.color };
  meta['ORCHESTRATOR'] = { icon: '🧠', color: '#ff2d9b' };
  meta['COMMANDER'] = { icon: '🧠', color: '#ff2d9b' };
  return meta;
}

/** Detect @mentioned agent in chat text */
export function detectMentionedAgent(text: string): string | null {
  const mention = text.match(/@([a-z0-9_]+)/i);
  if (!mention) return null;
  const token = String(mention[1] || '').toUpperCase();
  const exact = AGDEFS.find((ag) => ag.name.toUpperCase() === token);
  if (exact) return exact.name;
  if (token === 'ORCHESTRATOR' || token === 'SYSTEM' || token === 'AGENT') return 'ORCHESTRATOR';
  if (token === 'SENTIMENT') return 'SENTI';
  if (token === 'VALUE') return 'VALUATION';
  return null;
}

/** Infer best-fit agent from user intent via keywords */
export function inferAgentFromIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/차트|candle|캔들|패턴|pattern|bos|choch|ob|fvg|support|resist|지지|저항|추세|trend|구조|structure/.test(lower)) return 'STRUCTURE';
  if (/파생|deriv|펀딩|funding|oi|open.?interest|청산|liquid|옵션|option|선물|futures|숏|롱|레버/.test(lower)) return 'DERIV';
  if (/온체인|on.?chain|mvrv|nupl|sopr|nvt|valuation|밸류|네트워크|network|active.?addr|whale|고래/.test(lower)) return 'VALUATION';
  if (/자금|flow|플로우|넷플로우|netflow|거래소|exchange|inflow|outflow|유입|유출|이동/.test(lower)) return 'FLOW';
  if (/거래량|volume|볼륨|cvd|delta|vwap|profile|흡수|absorption/.test(lower)) return 'VPA';
  if (/스마트.?머니|smart.?money|ict|유동성|imbalance|breaker|mitigation/.test(lower)) return 'ICT';
  if (/센티|senti|감정|공포|탐욕|fear|greed|소셜|social|여론|분위기/.test(lower)) return 'SENTI';
  if (/매크로|macro|경제|금리|interest.?rate|연준|fed|cpi|gdp|달러|dollar|dxy|국채/.test(lower)) return 'MACRO';
  return 'ORCHESTRATOR';
}

// ─── Direction Inference ──────────────────────────────────────

/** Infer suggested trade direction from user message text */
export function inferSuggestedDirection(text: string): ChatTradeDirection | null {
  const lower = text.toLowerCase();
  let longScore = 0;
  let shortScore = 0;
  if (/\b(long|bull|bullish|breakout|uptrend|매수|롱|상승)\b/.test(lower)) longScore += 2;
  if (/\b(short|bear|bearish|breakdown|downtrend|매도|숏|하락)\b/.test(lower)) shortScore += 2;
  if (/\b(tp up|target up|higher high|support hold)\b/.test(lower)) longScore += 1;
  if (/\b(tp down|target down|lower low|resistance reject)\b/.test(lower)) shortScore += 1;
  if (longScore === shortScore) return null;
  return longScore > shortScore ? 'LONG' : 'SHORT';
}

// ─── Error Classification ─────────────────────────────────────

/** Classify chat error by status label into actionable category */
export function classifyError(statusLabel: string, err?: unknown): ChatErrorKind {
  const label = statusLabel.toLowerCase();
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'timeout';
  if (label === 'network' || label.includes('failed to fetch') || label.includes('networkerror')) return 'network';
  if (label.startsWith('503') || label.includes('llm') || label.includes('provider')) return 'llm_unavailable';
  if (label.startsWith('5')) return 'server_error';
  if (label === 'timeout' || label.includes('timeout') || label.includes('abort')) return 'timeout';
  return 'unknown';
}

// ─── Pattern Scan Helpers ─────────────────────────────────────

/** Check if user chat text indicates a pattern scan request */
export function isPatternScanIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const compact = lower.replace(/\s+/g, '');
  if (compact.includes('차트패턴찾아봐')) return true;
  const hasPatternKeyword =
    /(차트패턴|패턴|헤드앤숄더|헤드숄더|하락쐐기|headandshoulders|fallingwedge|wedge|pattern)/.test(compact);
  const hasActionKeyword = /(찾|분석|스캔|봐|보여|detect|scan|find|show|draw)/.test(compact);
  return hasPatternKeyword && hasActionKeyword;
}

/** Convert pattern kind to Korean label */
export function patternKindLabel(kind: PatternScanReport['patterns'][number]['kind']): string {
  return kind === 'head_and_shoulders' ? '헤드앤숄더' : '하락쐐기';
}

/** Convert pattern status to Korean label */
export function patternStatusLabel(status: PatternScanReport['patterns'][number]['status']): string {
  return status === 'CONFIRMED' ? '확정' : '형성중';
}

/** Format pattern scan results into chat reply text */
export function formatPatternChatReply(report: PatternScanReport): string {
  const scopeLabel = report.scope === 'visible' ? '보이는 구간' : '전체 구간';
  if (report.patternCount === 0) {
    return `패턴 스캔 완료 (${scopeLabel}, ${report.candleCount}봉)\n결과: 조건에 맞는 패턴이 없습니다. 줌아웃 후 다시 시도해보세요.`;
  }
  const top = report.patterns
    .slice(0, 2)
    .map((p) => `• ${patternKindLabel(p.kind)} ${patternStatusLabel(p.status)} ${(p.confidence * 100).toFixed(0)}%`)
    .join('\n');
  return `패턴 스캔 완료 (${scopeLabel}, ${report.candleCount}봉)\n${top}\n차트에 가이드 라인을 표시했습니다.`;
}

// ─── Layout Utilities ─────────────────────────────────────────

/** Clamp a numeric value between min and max */
export function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Detect horizontal resize gesture from wheel event */
export function isHorizontalResizeGesture(e: WheelEvent): boolean {
  const absX = Math.abs(e.deltaX);
  const absY = Math.abs(e.deltaY);
  return absX >= 10 && absX > absY * 1.2;
}
