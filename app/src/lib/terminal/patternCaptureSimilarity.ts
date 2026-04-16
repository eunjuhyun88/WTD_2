import type {
  ChartViewportSnapshot,
  PatternCaptureRecord,
  PatternCaptureSimilarityBreakdown,
  PatternCaptureSimilarityDraft,
  PatternCaptureSimilarityMatch,
} from '$lib/contracts/terminalPersistence';

const PATH_SAMPLE_SIZE = 24;
const TOKEN_SPLIT_RE = /[^\p{L}\p{N}$#@._-]+/u;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sampleSeries(values: number[], size = PATH_SAMPLE_SIZE): number[] {
  if (values.length === 0) return Array.from({ length: size }, () => 0);
  if (values.length === 1) return Array.from({ length: size }, () => values[0] ?? 0);
  return Array.from({ length: size }, (_, index) => {
    const position = (index * (values.length - 1)) / Math.max(size - 1, 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, Math.ceil(position));
    if (left === right) return values[left] ?? 0;
    const ratio = position - left;
    const leftValue = values[left] ?? 0;
    const rightValue = values[right] ?? 0;
    return leftValue + (rightValue - leftValue) * ratio;
  });
}

function normalizePath(klines: ChartViewportSnapshot['klines']): number[] {
  if (klines.length === 0) return Array.from({ length: PATH_SAMPLE_SIZE }, () => 0);
  const closes = klines.map((bar) => bar.close);
  const base = closes[0] || 1;
  const relative = closes.map((close) => (close - base) / base);
  return sampleSeries(relative);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const size = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < size; index += 1) {
    const va = a[index] ?? 0;
    const vb = b[index] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return clamp01((dot / (Math.sqrt(normA) * Math.sqrt(normB)) + 1) / 2);
}

function tokenSet(input: string | null | undefined): Set<string> {
  if (!input) return new Set<string>();
  return new Set(
    input
      .split(TOKEN_SPLIT_RE)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length >= 2),
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  if (union <= 0) return 0;
  return clamp01(intersection / union);
}

function buildDraftTokens(draft: PatternCaptureSimilarityDraft): Set<string> {
  return tokenSet([draft.note, draft.reason, draft.patternSlug].filter(Boolean).join(' '));
}

function buildRecordTokens(record: PatternCaptureRecord): Set<string> {
  return tokenSet([record.note, record.reason, record.patternSlug].filter(Boolean).join(' '));
}

function viewportSimilarity(
  left: ChartViewportSnapshot | undefined,
  right: ChartViewportSnapshot | undefined,
): number {
  if (!left || !right || left.klines.length === 0 || right.klines.length === 0) return 0;
  const pathScore = cosineSimilarity(normalizePath(left.klines), normalizePath(right.klines));
  const rangeLeft = safeNumber((left.klines.at(-1)?.close ?? 0) / Math.max(left.klines[0]?.open ?? 1, 1e-9) - 1);
  const rangeRight = safeNumber((right.klines.at(-1)?.close ?? 0) / Math.max(right.klines[0]?.open ?? 1, 1e-9) - 1);
  const magnitudeScore =
    rangeLeft == null || rangeRight == null
      ? 0
      : clamp01(1 - Math.min(1, Math.abs(rangeLeft - rangeRight) / 0.25));
  return roundScore(pathScore * 0.75 + magnitudeScore * 0.25);
}

function timeframeSimilarity(left: string, right: string): number {
  return left === right ? 1 : 0;
}

function reasonSimilarity(left: string | undefined, right: string | undefined): number {
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

function patternSimilarity(left: string | undefined, right: string | undefined): number {
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

function triggerSimilarity(left: string | undefined, right: string | undefined): number {
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

export function scorePatternCaptureSimilarity(
  draft: PatternCaptureSimilarityDraft,
  record: PatternCaptureRecord,
): PatternCaptureSimilarityMatch {
  const textScore = roundScore(jaccardSimilarity(buildDraftTokens(draft), buildRecordTokens(record)));
  const chartScore = viewportSimilarity(draft.snapshot.viewport, record.snapshot.viewport);
  const phaseScore = reasonSimilarity(draft.reason, record.reason);
  const timeframeScore = timeframeSimilarity(draft.timeframe, record.timeframe);
  const patternScore = patternSimilarity(draft.patternSlug, record.patternSlug);
  const triggerScore = triggerSimilarity(draft.triggerOrigin, record.triggerOrigin);

  const breakdown: PatternCaptureSimilarityBreakdown = {
    chart: chartScore,
    text: textScore,
    phase: phaseScore,
    timeframe: timeframeScore,
    pattern: patternScore,
    trigger: triggerScore,
  };

  const score = roundScore(
    chartScore * 0.55
    + textScore * 0.2
    + phaseScore * 0.1
    + timeframeScore * 0.05
    + patternScore * 0.05
    + triggerScore * 0.05,
  );

  return {
    record,
    score,
    breakdown,
  };
}

export function rankSimilarPatternCaptures(args: {
  draft: PatternCaptureSimilarityDraft;
  records: PatternCaptureRecord[];
  limit?: number;
  minScore?: number;
}): PatternCaptureSimilarityMatch[] {
  const { draft, records, limit = 5, minScore = 0.35 } = args;
  return records
    .filter((record) => !draft.excludeId || record.id !== draft.excludeId)
    .map((record) => scorePatternCaptureSimilarity(draft, record))
    .filter((match) => match.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
