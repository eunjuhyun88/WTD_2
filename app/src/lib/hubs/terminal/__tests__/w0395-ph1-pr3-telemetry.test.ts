/**
 * W-0395 Ph1 PR3 — GTM 이벤트 3종 vitest
 * AC1: 6 케이스 (각 이벤트 2: 정상 발화 / PII 없음 검증)
 * AC3: window.gtag 없는 환경에서 에러 없음 (console.debug fallback)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackWorkmodeSwitch,
  trackTrainSessionComplete,
  trackRightpanelTabSwitch,
  WorkmodeSwitchSchema,
  TrainSessionCompleteSchema,
  RightpanelTabSwitchSchema,
} from '../telemetry';

// ── Setup: stub window with a spy gtag ─────────────────────────────────────

let gtagCalls: Array<[string, string, Record<string, unknown>]> = [];

beforeEach(() => {
  gtagCalls = [];
  vi.stubGlobal('window', {
    gtag: (...args: [string, string, Record<string, unknown>]) => {
      gtagCalls.push(args);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 1. workmode_switch ─────────────────────────────────────────────────────

describe('workmode_switch', () => {
  it('fires gtag with correct event name and payload', () => {
    trackWorkmodeSwitch('TRADE', 'TRAIN');

    expect(gtagCalls).toHaveLength(1);
    const [method, eventName, params] = gtagCalls[0];
    expect(method).toBe('event');
    expect(eventName).toBe('workmode_switch');
    expect(params.from).toBe('TRADE');
    expect(params.to).toBe('TRAIN');
    expect(typeof params.timestamp).toBe('number');
    expect((params.timestamp as number)).toBeGreaterThan(0);
  });

  it('payload contains 0 PII fields', () => {
    trackWorkmodeSwitch('FLYWHEEL', 'TRADE');

    expect(gtagCalls).toHaveLength(1);
    const params = gtagCalls[0][2];
    expect(params).not.toHaveProperty('user_id');
    expect(params).not.toHaveProperty('email');
    expect(params).not.toHaveProperty('ip');
    expect(params).not.toHaveProperty('userId');
    expect(params).not.toHaveProperty('user_email');
  });
});

// ── 2. train_session_complete ──────────────────────────────────────────────

describe('train_session_complete', () => {
  it('fires gtag with correct session stats', () => {
    const sessionId = 'sess-abc-123';
    // 3 answered (UP/DOWN counts), 1 skip → correct = 3
    const answers = ['UP', 'DOWN', 'SKIP', 'UP'];
    trackTrainSessionComplete(sessionId, answers, 5, 42000);

    expect(gtagCalls).toHaveLength(1);
    const [method, eventName, params] = gtagCalls[0];
    expect(method).toBe('event');
    expect(eventName).toBe('train_session_complete');
    expect(params.session_id).toBe(sessionId);
    expect(params.correct).toBe(3); // UP + DOWN + UP; SKIP excluded
    expect(params.total).toBe(5);
    expect(params.duration_ms).toBe(42000);
  });

  it('payload contains 0 PII fields', () => {
    trackTrainSessionComplete('sess-xyz', ['UP', 'DOWN'], 2, 5000);

    expect(gtagCalls).toHaveLength(1);
    const params = gtagCalls[0][2];
    expect(params).not.toHaveProperty('user_id');
    expect(params).not.toHaveProperty('email');
    expect(params).not.toHaveProperty('ip');
    expect(params).not.toHaveProperty('userId');
    expect(params).not.toHaveProperty('user_email');
  });
});

// ── 3. rightpanel_tab_switch ───────────────────────────────────────────────

describe('rightpanel_tab_switch', () => {
  it('fires gtag with from_tab and to_tab', () => {
    trackRightpanelTabSwitch('research', 'pattern');

    expect(gtagCalls).toHaveLength(1);
    const [method, eventName, params] = gtagCalls[0];
    expect(method).toBe('event');
    expect(eventName).toBe('rightpanel_tab_switch');
    expect(params.from_tab).toBe('research');
    expect(params.to_tab).toBe('pattern');
  });

  it('payload contains 0 PII fields', () => {
    trackRightpanelTabSwitch('verdict', 'judge');

    expect(gtagCalls).toHaveLength(1);
    const params = gtagCalls[0][2];
    expect(params).not.toHaveProperty('user_id');
    expect(params).not.toHaveProperty('email');
    expect(params).not.toHaveProperty('ip');
    expect(params).not.toHaveProperty('userId');
    expect(params).not.toHaveProperty('user_email');
  });
});

// ── AC3: no-gtag environment — must not throw ──────────────────────────────

describe('no-gtag environment (AC3)', () => {
  it('all three events are silent (console.debug only) when gtag is absent', () => {
    // Remove gtag from window stub
    vi.stubGlobal('window', {
      // no gtag property
    });

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    expect(() => trackWorkmodeSwitch('TRADE', 'FLYWHEEL')).not.toThrow();
    expect(() => trackTrainSessionComplete('s1', ['UP'], 1, 1000)).not.toThrow();
    expect(() => trackRightpanelTabSwitch('research', 'verdict')).not.toThrow();

    expect(debugSpy).toHaveBeenCalledTimes(3);
    debugSpy.mockRestore();
  });
});

// ── Schema self-test ───────────────────────────────────────────────────────

describe('zod schema validation', () => {
  it('WorkmodeSwitchSchema rejects invalid mode', () => {
    const result = WorkmodeSwitchSchema.safeParse({ from: 'INVALID', to: 'TRADE', timestamp: 1 });
    expect(result.success).toBe(false);
  });

  it('TrainSessionCompleteSchema rejects empty session_id', () => {
    const result = TrainSessionCompleteSchema.safeParse({ session_id: '', correct: 5, total: 10, duration_ms: 3000 });
    expect(result.success).toBe(false);
  });

  it('RightpanelTabSwitchSchema rejects empty tab names', () => {
    const result = RightpanelTabSwitchSchema.safeParse({ from_tab: '', to_tab: 'pattern' });
    expect(result.success).toBe(false);
  });
});
