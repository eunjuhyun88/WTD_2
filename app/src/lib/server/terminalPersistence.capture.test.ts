import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatternCaptureCreateRequest } from '$lib/contracts/terminalPersistence';

const { MockEngineError } = vi.hoisted(() => {
  class HoistedMockEngineError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'EngineError';
      this.status = status;
    }
  }

  return { MockEngineError: HoistedMockEngineError };
});

vi.mock('$lib/server/db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('$lib/server/engineClient', () => ({
  EngineError: MockEngineError,
  engine: {
    createCapture: vi.fn(),
    listCaptures: vi.fn(),
  },
}));

import { query } from '$lib/server/db';
import { engine } from '$lib/server/engineClient';
import { createPatternCapture } from './terminalPersistence';

const baseInput: PatternCaptureCreateRequest = {
  symbol: 'BTCUSDT',
  timeframe: '4h',
  contextKind: 'symbol',
  triggerOrigin: 'manual',
  snapshot: {
    viewport: {
      timeFrom: 1713312000,
      timeTo: 1713326400,
      tf: '4h',
      barCount: 4,
      klines: [
        { time: 1713312000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        { time: 1713326400, open: 1.5, high: 2.1, low: 1.2, close: 1.8, volume: 9 },
      ],
      indicators: {},
    },
  },
  decision: { verdict: 'bullish' },
  sourceFreshness: { source: 'range_mode_save' },
};

function mockInsertedRow() {
  return {
    id: 'pcap-1',
    symbol: 'BTCUSDT',
    timeframe: '4h',
    context_kind: 'symbol',
    trigger_origin: 'manual',
    pattern_slug: null,
    reason: null,
    note: null,
    snapshot: baseInput.snapshot,
    decision: baseInput.decision,
    evidence_hash: null,
    source_freshness: baseInput.sourceFreshness,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  };
}

describe('createPatternCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [mockInsertedRow()] });
  });

  it('writes through to app DB after a successful engine capture', async () => {
    (engine.createCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      capture: { capture_id: 'cap-1' },
    });

    const record = await createPatternCapture('user-1', baseInput);

    expect(engine.createCapture).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(record.symbol).toBe('BTCUSDT');
  });

  it('translates researchContext into the engine capture payload', async () => {
    (engine.createCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      capture: { capture_id: 'cap-1' },
    });

    const input: PatternCaptureCreateRequest = {
      ...baseInput,
      researchContext: {
        patternFamily: 'tradoor_ptb_oi_reversal',
        thesis: ['second dump + oi spike'],
        phaseAnnotations: [
          {
            phaseId: 'real_dump',
            label: 'second dump',
            timeframe: '15m',
            signalsRequired: ['price_dump', 'oi_spike_with_dump'],
          },
        ],
        researchTags: ['second_dump', 'oi_reexpand'],
      },
    };

    const record = await createPatternCapture('user-1', input);

    expect(engine.createCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        research_context: expect.objectContaining({
          pattern_family: 'tradoor_ptb_oi_reversal',
          thesis: ['second dump + oi spike'],
          research_tags: ['second_dump', 'oi_reexpand'],
        }),
      }),
    );
    expect(record.researchContext?.patternFamily).toBe('tradoor_ptb_oi_reversal');
  });

  it('falls back to the app DB when engine capture is forbidden', async () => {
    (engine.createCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MockEngineError(403, 'Engine /captures failed: Forbidden'),
    );

    const record = await createPatternCapture('user-1', baseInput);

    expect(engine.createCapture).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(record.timeframe).toBe('4h');
  });

  it('does not swallow non-degraded engine failures', async () => {
    (engine.createCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MockEngineError(500, 'Engine /captures failed: Internal Server Error'),
    );

    await expect(createPatternCapture('user-1', baseInput)).rejects.toThrow('Internal Server Error');
    expect(query).not.toHaveBeenCalled();
  });
});
