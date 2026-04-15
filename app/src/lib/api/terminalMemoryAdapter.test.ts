import { describe, expect, it } from 'vitest';
import {
  fromEngineMemoryQueryWire,
  toEngineMemoryDebugSessionWire,
  toEngineMemoryFeedbackWire,
  toEngineMemoryQueryWire,
} from './terminalMemoryAdapter';

describe('terminalMemoryAdapter', () => {
  it('round-trips memory query shape between camelCase and snake_case', () => {
    const wire = toEngineMemoryQueryWire({
      query: 'btc invalidation',
      context: {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        intent: 'risk',
        challengeSlug: 'memkraft',
      },
      topK: 3,
      includeRejected: false,
      includeSnapshots: false,
      candidates: [
        {
          id: 'cvd',
          kind: 'fact',
          text: 'CVD is rolling over',
          baseScore: 1.2,
          confidence: 'verified',
          accessCount: 2,
          tags: ['cvd'],
          conditions: {},
        },
      ],
    });

    expect(wire.top_k).toBe(3);
    expect(wire.context.challenge_slug).toBe('memkraft');
    expect(wire.candidates[0]?.base_score).toBe(1.2);

    const parsed = fromEngineMemoryQueryWire({
      ok: true,
      schema_version: 1,
      query_id: 'mq-1',
      records: [
        {
          id: 'cvd',
          kind: 'fact',
          text: 'CVD is rolling over',
          score: 2.4,
          base_score: 1.2,
          confidence: 'verified',
          access_count: 3,
          tags: ['cvd'],
          reasons: ['symbol match'],
        },
      ],
      debug: {
        rerank_applied: true,
        base_result_count: 1,
        elapsed_ms: 7,
      },
    });

    expect(parsed.queryId).toBe('mq-1');
    expect(parsed.records[0]?.baseScore).toBe(1.2);
    expect(parsed.debug.elapsedMs).toBe(7);
  });

  it('maps feedback and debug-session wire shapes', () => {
    const feedback = toEngineMemoryFeedbackWire({
      queryId: 'q-1',
      memoryId: 'm-1',
      event: 'used',
      context: { symbol: 'ETHUSDT', timeframe: '4h' },
      occurredAt: '2026-04-15T10:00:00+00:00',
    });
    expect(feedback.query_id).toBe('q-1');
    expect(feedback.memory_id).toBe('m-1');

    const debugSession = toEngineMemoryDebugSessionWire({
      sessionId: 'dbg-1',
      context: { symbol: 'ETHUSDT', intent: 'pin' },
      hypotheses: [
        {
          id: 'h-1',
          text: 'Breakout failed',
          status: 'rejected',
          evidence: ['funding normalized'],
          rejectionReason: 'No expansion',
        },
      ],
      startedAt: '2026-04-15T10:00:00+00:00',
      endedAt: '2026-04-15T10:10:00+00:00',
    });
    expect(debugSession.session_id).toBe('dbg-1');
    expect(debugSession.hypotheses[0]?.rejection_reason).toBe('No expansion');
  });
});
