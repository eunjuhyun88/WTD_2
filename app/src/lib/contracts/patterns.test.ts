import { describe, expect, it } from 'vitest';
import {
  adaptPatternCandidates,
  flattenPatternStates,
  isBreakoutPhase,
  patternCapturePayload,
} from './patterns';

describe('patterns contract adapters', () => {
  it('preserves engine candidate linkage and phase strings', () => {
    const [candidate] = adaptPatternCandidates({
      candidate_records: [
        {
          symbol: 'BTCUSDT',
          pattern_slug: 'fake_dump_breakout',
          pattern_version: 2,
          phase: 'ACCUMULATION',
          phase_label: 'Accumulation',
          timeframe: '1h',
          candidate_transition_id: 'tr-123',
          transition_id: 'tr-legacy',
          scan_id: 'scan-9',
          entered_at: '2026-04-30T01:23:45+00:00',
          block_scores: { reclaim: { passed: true, score: 0.9 } },
          feature_snapshot: { oi_change_1h: 0.18 },
          alert_visible: true,
        },
      ],
    });

    expect(candidate?.phaseId).toBe('ACCUMULATION');
    expect(Number.isNaN(Number(candidate?.phaseId))).toBe(true);
    expect(candidate?.enteredAt).toBe('2026-04-30T01:23:45+00:00');
    expect(candidate?.candidateTransitionId).toBe('tr-123');
    expect(candidate?.scanId).toBe('scan-9');
    expect(candidate?.blockScores).toEqual({ reclaim: { passed: true, score: 0.9 } });
    expect(candidate?.featureSnapshot).toEqual({ oi_change_1h: 0.18 });
  });

  it('does not fabricate candidate timestamps from state rows', () => {
    const candidates = adaptPatternCandidates({
      candidate_records: [
        {
          symbol: 'ETHUSDT',
          pattern_slug: 'fake_dump_breakout',
          phase: 'ACCUMULATION',
          phase_label: 'Accumulation',
          candidate_transition_id: 'tr-eth',
          alert_visible: true,
        },
      ],
    });
    const states = flattenPatternStates({
      patterns: {
        fake_dump_breakout: {
          ETHUSDT: {
            phase_id: 'ACCUMULATION',
            phase_idx: 3,
            entered_at: '2026-04-30T02:00:00+00:00',
          },
        },
      },
    });

    expect(states[0]?.enteredAt).toBe('2026-04-30T02:00:00+00:00');
    expect(candidates[0]?.enteredAt).toBeNull();
  });

  it('flattens rich state rows with engine phase ids', () => {
    const [state] = flattenPatternStates({
      patterns: {
        fake_dump_breakout: {
          SOLUSDT: {
            phase_id: 'BREAKOUT',
            phase_idx: 4,
            phase_label: 'Breakout',
            entered_at: '2026-04-30T03:00:00+00:00',
            bars_in_phase: 5,
            max_bars: 12,
            progress_pct: 41.7,
            total_phases: 5,
          },
        },
      },
    });

    expect(state).toMatchObject({
      symbol: 'SOLUSDT',
      patternSlug: 'fake_dump_breakout',
      phaseId: 'BREAKOUT',
      phaseIdx: 4,
      phaseLabel: 'Breakout',
      barsInPhase: 5,
      maxBars: 12,
      progressPct: 41.7,
      totalPhases: 5,
    });
    expect(state && isBreakoutPhase(state)).toBe(true);
  });

  it('builds capture payload from canonical candidate fields', () => {
    const [candidate] = adaptPatternCandidates({
      candidate_records: [
        {
          symbol: 'BTCUSDT',
          pattern_slug: 'fake_dump_breakout',
          phase: 'ACCUMULATION',
          timeframe: '1h',
          candidate_transition_id: 'tr-123',
          scan_id: 'scan-9',
          feature_snapshot: { price: 100 },
          block_scores: { reclaim: { score: 1 } },
        },
      ],
    });

    expect(candidate && patternCapturePayload(candidate)).toEqual({
      capture_kind: 'pattern_candidate',
      symbol: 'BTCUSDT',
      pattern_slug: 'fake_dump_breakout',
      pattern_version: 1,
      phase: 'ACCUMULATION',
      timeframe: '1h',
      candidate_transition_id: 'tr-123',
      scan_id: 'scan-9',
      feature_snapshot: { price: 100 },
      block_scores: { reclaim: { score: 1 } },
    });
  });
});
