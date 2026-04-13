// ═══════════════════════════════════════════════════════════════
// tradeMemory.ts — DOUNI Trade Memory System
// ═══════════════════════════════════════════════════════════════
//
// Claude Code memdir/MEMORY.md 패턴 적용.
// 4가지 메모리 타입:
//   user     — 유저의 트레이딩 스타일 선호
//   feedback — 유저의 교정/확인 사항
//   patterns — 성공/실패 패턴 + 백테스트 통계
//   market   — 진행 중인 시장 상태 메모
//
// 저장: localStorage (클라이언트) + Supabase preferences (서버)
// 로드: 세션 시작 시 1회, buildContext()에 주입
// 한계: 200줄 / 4KB (Claude Code MAX_ENTRYPOINT 패턴)

export interface TradeMemory {
  user:     string[];  // "breakout 진입 선호, 역추세 기피"
  feedback: string[];  // "funding > 0.015% 시 롱 비추 (유저 교정 2회)"
  patterns: string[];  // "BTC breakout+CVD: 90d WR 71% (n=28)"
  market:   string[];  // "BTC $95K 저항 유효, 주간 레인지 $88-95K"
}

export type MemoryType = keyof TradeMemory;

const MAX_LINES_PER_TYPE = 8;
const MAX_TOTAL_CHARS    = 4_000;  // Claude Code MAX_ENTRYPOINT_BYTES 패턴

// ─── Serialize / Deserialize ─────────────────────────────────

export function serializeMemory(mem: TradeMemory): string {
  const lines: string[] = [];
  if (mem.user.length)     lines.push('[user]',     ...mem.user,     '');
  if (mem.feedback.length) lines.push('[feedback]', ...mem.feedback, '');
  if (mem.patterns.length) lines.push('[patterns]', ...mem.patterns, '');
  if (mem.market.length)   lines.push('[market]',   ...mem.market,   '');
  return lines.join('\n').trim();
}

export function deserializeMemory(raw: string): TradeMemory {
  const mem: TradeMemory = { user: [], feedback: [], patterns: [], market: [] };
  let current: MemoryType | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === '[user]')     { current = 'user';     continue; }
    if (trimmed === '[feedback]') { current = 'feedback'; continue; }
    if (trimmed === '[patterns]') { current = 'patterns'; continue; }
    if (trimmed === '[market]')   { current = 'market';   continue; }
    if (current) mem[current].push(trimmed);
  }

  return mem;
}

// ─── Memory operations ───────────────────────────────────────

export function emptyMemory(): TradeMemory {
  return { user: [], feedback: [], patterns: [], market: [] };
}

/**
 * 메모리에 항목 추가. 타입별 MAX_LINES_PER_TYPE 초과 시 오래된 것 제거.
 * Claude Code feedback memory 패턴: 오래된 것은 최신 것으로 교체.
 */
export function addMemoryItem(
  mem: TradeMemory,
  type: MemoryType,
  item: string,
): TradeMemory {
  const updated = [...mem[type], item];
  // 초과 시 가장 오래된 항목 제거 (FIFO)
  const trimmed = updated.length > MAX_LINES_PER_TYPE
    ? updated.slice(-MAX_LINES_PER_TYPE)
    : updated;

  return { ...mem, [type]: trimmed };
}

/**
 * 전체 메모리를 MAX_TOTAL_CHARS 이내로 truncate.
 * Claude Code truncateEntrypointContent() 패턴.
 */
export function truncateMemory(mem: TradeMemory): TradeMemory {
  const serialized = serializeMemory(mem);
  if (serialized.length <= MAX_TOTAL_CHARS) return mem;

  // 초과 시 각 타입에서 절반씩 줄임
  return {
    user:     mem.user.slice(-4),
    feedback: mem.feedback.slice(-4),
    patterns: mem.patterns.slice(-4),
    market:   mem.market.slice(-4),
  };
}

/**
 * 분석 결과에서 패턴 통계 자동 추출.
 * backtest signal_stats 결과 → patterns 메모리에 저장.
 */
export function buildPatternMemoryItem(
  symbol: string,
  activeBlocks: string[],
  winRate: number,
  nOccurrences: number,
  lookbackDays: number,
): string {
  const blocks = activeBlocks.slice(0, 3).join('+');
  const pct = Math.round(winRate * 100);
  return `${symbol} ${blocks}: ${lookbackDays}d WR ${pct}% (n=${nOccurrences})`;
}

/**
 * 유저 교정 감지 → feedback 메모리 자동 생성.
 * 유저가 "아니야", "틀렸어", "그게 아니라" 등의 교정 발화 시 호출.
 */
export function buildFeedbackMemoryItem(
  correction: string,
  context: string,
  timestamp?: number,
): string {
  const date = new Date(timestamp ?? Date.now())
    .toISOString().slice(0, 10);
  return `[${date}] ${correction} (ctx: ${context.slice(0, 60)})`;
}

// ─── System prompt 섹션 포맷 ─────────────────────────────────

/**
 * TradeMemory → LLM 주입용 섹션 문자열.
 * buildDouniSystemPrompt()의 _getMemorySection()에 전달.
 */
export function formatMemoryForPrompt(mem: TradeMemory): string {
  const parts: string[] = [];

  if (mem.user.length)
    parts.push(`User style: ${mem.user.join(' | ')}`);
  if (mem.feedback.length)
    parts.push(`Feedback (apply always): ${mem.feedback.join(' | ')}`);
  if (mem.patterns.length)
    parts.push(`Backtested patterns: ${mem.patterns.join(' | ')}`);
  if (mem.market.length)
    parts.push(`Market notes: ${mem.market.join(' | ')}`);

  return parts.join('\n');
}

// ─── localStorage key (클라이언트 전용) ──────────────────────

export const TRADE_MEMORY_STORAGE_KEY = 'cogochi.douni.memory.v1';
