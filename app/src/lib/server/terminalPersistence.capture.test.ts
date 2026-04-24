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
    createRuntimeCapture: vi.fn(),
    listRuntimeCaptures: vi.fn(),
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

  it('returns the runtime capture without writing duplicate app DB rows', async () => {
    (engine.createRuntimeCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      capture: {
        capture_id: 'cap-1',
        symbol: 'BTCUSDT',
        timeframe: '4h',
        captured_at_ms: 1_776_566_400_000,
        chart_context: {
          contextKind: 'symbol',
          triggerOrigin: 'manual',
          snapshot: baseInput.snapshot,
          decision: baseInput.decision,
          sourceFreshness: baseInput.sourceFreshness,
        },
        block_scores: {},
      },
    });

    const record = await createPatternCapture('user-1', baseInput);

    expect(engine.createRuntimeCapture).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(record.id).toBe('cap-1');
    expect(record.symbol).toBe('BTCUSDT');
  });

  it('translates researchContext into the engine capture payload', async () => {
    (engine.createRuntimeCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      capture: {
        capture_id: 'cap-1',
        symbol: 'BTCUSDT',
        timeframe: '4h',
        captured_at_ms: 1_776_566_400_000,
        chart_context: {},
        research_context: {
          pattern_family: 'tradoor_ptb_oi_reversal',
          thesis: ['second dump + oi spike'],
          phase_annotations: [],
          research_tags: ['second_dump', 'oi_reexpand'],
        },
        block_scores: {},
      },
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
            signalsPreferred: [],
            signalsForbidden: [],
          },
        ],
        researchTags: ['second_dump', 'oi_reexpand'],
        patternDraft: {
          schemaVersion: 1,
          patternFamily: 'tradoor_ptb_oi_reversal',
          patternLabel: 'Second dump reclaim',
          sourceType: 'terminal_capture',
          sourceText: 'second dump + oi spike',
          symbolCandidates: ['TRADOORUSDT'],
          timeframe: '15m',
          thesis: ['second dump + oi spike'],
          phases: [
            {
              phaseId: 'real_dump',
              label: 'second dump',
              sequenceOrder: 0,
              description: 'price dump with oi expansion',
              timeframe: '15m',
              signalsRequired: ['oi_spike'],
              signalsPreferred: ['volume_breakout'],
              signalsForbidden: [],
              directionalBelief: 'event_confirmed',
              timeHint: 'event',
            },
          ],
          tradePlan: { entry: 'accumulation reclaim' },
          searchHints: {
            mustHaveSignals: ['oi_spike'],
            preferredTimeframes: ['15m', '1h'],
            excludePatterns: ['continued_dump_after_low_oi'],
            similarityFocus: ['phase_path', 'oi'],
            symbolScope: ['TRADOORUSDT'],
          },
          confidence: 0.72,
          ambiguities: ['breakout threshold unspecified'],
        },
        parserMeta: {
          parserRole: 'pattern_parser',
          parserModel: 'gpt-5.4',
          parserPromptVersion: 'pattern-draft-v1',
          patternDraftSchemaVersion: 1,
          signalVocabVersion: 'signal-vocab-v1',
          confidence: 0.72,
          ambiguityCount: 1,
        },
      },
    };

    const record = await createPatternCapture('user-1', input);

    expect(engine.createRuntimeCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        research_context: expect.objectContaining({
          pattern_family: 'tradoor_ptb_oi_reversal',
          thesis: ['second dump + oi spike'],
          research_tags: ['second_dump', 'oi_reexpand'],
          pattern_draft: expect.objectContaining({
            pattern_family: 'tradoor_ptb_oi_reversal',
            source_type: 'terminal_capture',
          }),
          parser_meta: expect.objectContaining({
            parser_role: 'pattern_parser',
            signal_vocab_version: 'signal-vocab-v1',
          }),
        }),
      }),
    );
    expect(record.researchContext?.patternFamily).toBe('tradoor_ptb_oi_reversal');
    expect(record.researchContext?.patternDraft?.patternFamily).toBe('tradoor_ptb_oi_reversal');
    expect(record.researchContext?.parserMeta?.parserRole).toBe('pattern_parser');
  });

  it('allows draft-only researchContext when parser output is present', async () => {
    (engine.createCapture as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      capture: { capture_id: 'cap-1' },
    });

    const input: PatternCaptureCreateRequest = {
      ...baseInput,
      researchContext: {
        thesis: [],
        phaseAnnotations: [],
        researchTags: [],
        patternDraft: {
          schemaVersion: 1,
          patternFamily: 'tradoor_ptb_oi_reversal',
          sourceType: 'manual_note',
          sourceText: 'OI spike then reclaim',
          symbolCandidates: ['TRADOORUSDT'],
          thesis: [],
          phases: [],
          tradePlan: {},
          searchHints: {
            mustHaveSignals: [],
            preferredTimeframes: [],
            excludePatterns: [],
            similarityFocus: [],
            symbolScope: [],
          },
          ambiguities: [],
        },
        parserMeta: {
          parserRole: 'pattern_parser',
          parserModel: 'gpt-5.4',
          parserPromptVersion: 'pattern-draft-v1',
          patternDraftSchemaVersion: 1,
          signalVocabVersion: 'signal-vocab-v1',
          ambiguityCount: 0,
        },
      },
    };

    await createPatternCapture('user-1', input);

    expect(engine.createCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        research_context: expect.objectContaining({
          pattern_family: 'tradoor_ptb_oi_reversal',
          pattern_draft: expect.objectContaining({
            pattern_family: 'tradoor_ptb_oi_reversal',
          }),
        }),
      }),
    );
  });

  it('falls back to the app DB when engine capture is forbidden', async () => {
    (engine.createRuntimeCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MockEngineError(403, 'Engine /runtime/captures failed: Forbidden'),
    );

    const record = await createPatternCapture('user-1', baseInput);

    expect(engine.createRuntimeCapture).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(record.timeframe).toBe('4h');
  });

  it('does not swallow non-degraded engine failures', async () => {
    (engine.createRuntimeCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MockEngineError(500, 'Engine /runtime/captures failed: Internal Server Error'),
    );

    await expect(createPatternCapture('user-1', baseInput)).rejects.toThrow('Internal Server Error');
    expect(query).not.toHaveBeenCalled();
  });
});
