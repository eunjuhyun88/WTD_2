import { describe, expect, it } from 'vitest';
import {
  parseMemoryDebugSessionRequest,
  parseMemoryFeedbackRequest,
  parseMemoryQueryRequest,
  parseMemorySnapshotDiffRequest,
  safeParseMemoryQueryRequest
} from './terminalMemory';

describe('terminalMemory contract', () => {
  it('parses memory query request with defaults', () => {
    const parsed = parseMemoryQueryRequest({
      query: 'btc breakout invalidation',
      context: { symbol: 'BTCUSDT', timeframe: '1h', intent: 'risk_review' }
    });

    expect(parsed.query).toBe('btc breakout invalidation');
    expect(parsed.topK).toBe(8);
    expect(parsed.includeRejected).toBe(false);
    expect(parsed.includeSnapshots).toBe(false);
    expect(parsed.context.symbol).toBe('BTCUSDT');
  });

  it('rejects invalid query payload via safeParse', () => {
    const invalid = safeParseMemoryQueryRequest({
      query: '',
      topK: 999
    });

    expect(invalid.success).toBe(false);
  });

  it('parses feedback request', () => {
    const parsed = parseMemoryFeedbackRequest({
      queryId: 'q-1',
      memoryId: 'm-1',
      event: 'used',
      context: { mode: 'terminal', symbol: 'ETHUSDT' },
      occurredAt: '2026-04-15T10:00:00+00:00'
    });

    expect(parsed.event).toBe('used');
    expect(parsed.context.symbol).toBe('ETHUSDT');
  });

  it('parses debug session request with rejected hypothesis', () => {
    const parsed = parseMemoryDebugSessionRequest({
      sessionId: 'dbg-1',
      context: { symbol: 'SOLUSDT', intent: 'debug' },
      hypotheses: [
        {
          id: 'h-1',
          text: 'Funding spike caused liquidation cascade',
          status: 'rejected',
          evidence: ['funding normalized within 10m'],
          rejectionReason: 'No matching liquidation cluster expansion'
        }
      ],
      startedAt: '2026-04-15T10:00:00+00:00',
      endedAt: '2026-04-15T10:12:00+00:00'
    });

    expect(parsed.hypotheses[0]?.status).toBe('rejected');
    expect(parsed.hypotheses[0]?.rejectionReason).toContain('liquidation');
  });

  it('parses snapshot diff request', () => {
    const parsed = parseMemorySnapshotDiffRequest({
      fromSnapshotId: 'snap-a',
      toSnapshotId: 'snap-b'
    });

    expect(parsed.fromSnapshotId).toBe('snap-a');
    expect(parsed.toSnapshotId).toBe('snap-b');
    expect(parsed.includeUnchanged).toBe(false);
  });
});
