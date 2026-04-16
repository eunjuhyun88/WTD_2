import { describe, expect, it } from 'vitest';
import { rankSimilarPatternCaptures } from '$lib/terminal/patternCaptureSimilarity';
import type { PatternCaptureRecord, PatternCaptureSimilarityDraft } from '$lib/contracts/terminalPersistence';

function makeRecord(args: Partial<PatternCaptureRecord> = {}): PatternCaptureRecord {
  return {
    id: args.id ?? 'pcap-1',
    symbol: args.symbol ?? 'UBUSDT',
    timeframe: args.timeframe ?? '4h',
    contextKind: args.contextKind ?? 'symbol',
    triggerOrigin: args.triggerOrigin ?? 'manual',
    patternSlug: args.patternSlug,
    reason: args.reason ?? 'REAL_DUMP',
    note: args.note,
    snapshot: args.snapshot ?? {},
    decision: args.decision ?? {},
    evidenceHash: args.evidenceHash,
    sourceFreshness: args.sourceFreshness ?? {},
    createdAt: args.createdAt ?? '2026-04-16T00:00:00.000Z',
    updatedAt: args.updatedAt ?? '2026-04-16T00:00:00.000Z',
  };
}

function makeDraft(args: Partial<PatternCaptureSimilarityDraft> = {}): PatternCaptureSimilarityDraft {
  return {
    symbol: args.symbol ?? 'TESTUSDT',
    timeframe: args.timeframe ?? '4h',
    triggerOrigin: args.triggerOrigin ?? 'manual',
    patternSlug: args.patternSlug,
    reason: args.reason ?? 'REAL_DUMP',
    note: args.note ?? '저점 mc 100m 이하 sns 활동 유지 락업 소각 이벤트',
    snapshot: args.snapshot ?? {},
    excludeId: args.excludeId,
    limit: args.limit ?? 5,
  };
}

describe('rankSimilarPatternCaptures', () => {
  it('prefers records with stronger text overlap', () => {
    const draft = makeDraft();
    const matches = rankSimilarPatternCaptures({
      draft,
      records: [
        makeRecord({
          id: 'text-strong',
          note: '저점 mc 100m 이하 sns 활동 유지 락업 이벤트',
        }),
        makeRecord({
          id: 'text-weak',
          note: '완전 다른 기준과 잡음만 있음',
        }),
      ],
    });

    expect(matches[0]?.record.id).toBe('text-strong');
    expect(matches[0]?.breakdown.text).toBeGreaterThan(matches[1]?.breakdown.text ?? 0);
  });

  it('uses viewport structure when both captures carry chart slices', () => {
    const sharedViewport = {
      timeFrom: 1,
      timeTo: 4,
      tf: '4h',
      barCount: 4,
      klines: [
        { time: 1, open: 100, high: 102, low: 99, close: 101, volume: 1_000 },
        { time: 2, open: 101, high: 103, low: 100, close: 102, volume: 1_200 },
        { time: 3, open: 102, high: 104, low: 101, close: 103, volume: 1_500 },
        { time: 4, open: 103, high: 106, low: 102, close: 105, volume: 2_000 },
      ],
      indicators: {},
    };

    const draft = makeDraft({ snapshot: { viewport: sharedViewport } });
    const matches = rankSimilarPatternCaptures({
      draft,
      records: [
        makeRecord({
          id: 'chart-close',
          snapshot: { viewport: sharedViewport },
          note: '다른 텍스트라도 구조는 비슷함',
        }),
        makeRecord({
          id: 'chart-far',
          snapshot: {
            viewport: {
              ...sharedViewport,
              klines: [
                { time: 1, open: 100, high: 101, low: 92, close: 94, volume: 2_500 },
                { time: 2, open: 94, high: 95, low: 88, close: 89, volume: 2_800 },
                { time: 3, open: 89, high: 90, low: 84, close: 85, volume: 3_100 },
                { time: 4, open: 85, high: 86, low: 80, close: 81, volume: 3_500 },
              ],
            },
          },
        }),
      ],
    });

    expect(matches[0]?.record.id).toBe('chart-close');
    expect(matches[0]?.breakdown.chart).toBeGreaterThan(matches[1]?.breakdown.chart ?? 0);
  });
});
