import type { PatternCaptureProjectionSnap, PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

function toEpochMs(value: number): number {
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function compactLabel(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' · ')
    .slice(0, 160);
}

export function buildChallengeSnapFromPatternCapture(
  record: PatternCaptureRecord,
): PatternCaptureProjectionSnap | null {
  const viewport = record.snapshot.viewport;
  if (!viewport || viewport.klines.length === 0) return null;

  const lastBar = viewport.klines.at(-1);
  const anchor = viewport.anchorTime ?? lastBar?.time ?? viewport.timeTo;
  if (!Number.isFinite(anchor)) return null;

  return {
    symbol: record.symbol,
    timestamp: new Date(toEpochMs(anchor)).toISOString(),
    label: compactLabel([record.reason, record.patternSlug, record.note]),
  };
}
