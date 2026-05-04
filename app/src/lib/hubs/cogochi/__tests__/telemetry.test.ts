import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AiAskEventSchema,
  TabSwitchEventSchema,
  track,
  trackAiAsk,
  trackTabSwitch,
} from '../telemetry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDataLayer(): Array<Record<string, unknown>> {
  const layer: Array<Record<string, unknown>> = [];
  // Use a real EventTarget so addEventListener/dispatchEvent work correctly.
  const et = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    value: Object.assign(et, { dataLayer: layer }),
    writable: true,
    configurable: true,
  });
  return layer;
}

// ── Schema: AiAskEvent ────────────────────────────────────────────────────────

describe('AiAskEventSchema', () => {
  it('accepts a valid wave6.ai_ask event', () => {
    const result = AiAskEventSchema.safeParse({
      event: 'wave6.ai_ask',
      intent: 'scan',
      query_len: 42,
      ts: 1700000000000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event containing a user_id field (PII guard)', () => {
    // user_id must not be accepted — the schema uses strict parsing
    const result = AiAskEventSchema.strict().safeParse({
      event: 'wave6.ai_ask',
      intent: 'nlu',
      query_len: 10,
      ts: 1700000000000,
      user_id: 'abc123', // PII — must be rejected
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event with an unknown intent value', () => {
    const result = AiAskEventSchema.safeParse({
      event: 'wave6.ai_ask',
      intent: 'delete_account', // not in enum
      query_len: 5,
      ts: 1700000000000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative query_len', () => {
    const result = AiAskEventSchema.safeParse({
      event: 'wave6.ai_ask',
      intent: 'why',
      query_len: -1,
      ts: 1700000000000,
    });
    expect(result.success).toBe(false);
  });
});

// ── Schema: TabSwitchEvent ────────────────────────────────────────────────────

describe('TabSwitchEventSchema', () => {
  it('accepts a valid wave6.tab_switch event', () => {
    const result = TabSwitchEventSchema.safeParse({
      event: 'wave6.tab_switch',
      from: 'home',
      to: 'decision',
      source: 'click',
      ts: 1700000000001,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event with a disallowed "to" tab name', () => {
    const result = TabSwitchEventSchema.safeParse({
      event: 'wave6.tab_switch',
      from: 'home',
      to: 'settings', // not in enum
      source: 'click',
      ts: 1700000000001,
    });
    expect(result.success).toBe(false);
  });
});

// ── track(): dataLayer push ───────────────────────────────────────────────────

describe('track()', () => {
  beforeEach(() => {
    makeDataLayer();
  });

  it('pushes the event object to window.dataLayer', () => {
    const event = {
      event: 'wave6.ai_ask' as const,
      intent: 'recall' as const,
      query_len: 20,
      ts: 1700000000002,
    };
    track(event);
    const layer = (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
    expect(layer).toHaveLength(1);
    expect(layer[0]).toMatchObject({ event: 'wave6.ai_ask', intent: 'recall', query_len: 20 });
  });

  it('dispatches a cogochi:telemetry CustomEvent with the event as detail', () => {
    const spy = vi.fn();
    window.addEventListener('cogochi:telemetry', spy);

    const event = {
      event: 'wave6.tab_switch' as const,
      from: 'pattern',
      to: 'verdict' as const,
      source: 'slash' as const,
      ts: 1700000000003,
    };
    track(event);

    expect(spy).toHaveBeenCalledOnce();
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ event: 'wave6.tab_switch', from: 'pattern', to: 'verdict' });

    window.removeEventListener('cogochi:telemetry', spy);
  });
});

// ── Typed helpers ─────────────────────────────────────────────────────────────

describe('trackAiAsk()', () => {
  beforeEach(() => {
    makeDataLayer();
  });

  it('pushes a wave6.ai_ask event with correct shape', () => {
    trackAiAsk('judge', 33);
    const layer = (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
    expect(layer[0]).toMatchObject({ event: 'wave6.ai_ask', intent: 'judge', query_len: 33 });
    expect(typeof layer[0].ts).toBe('number');
  });
});

describe('trackTabSwitch()', () => {
  beforeEach(() => {
    makeDataLayer();
  });

  it('pushes a wave6.tab_switch event with correct shape', () => {
    trackTabSwitch('decision', 'research', 'nlu');
    const layer = (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
    expect(layer[0]).toMatchObject({
      event: 'wave6.tab_switch',
      from: 'decision',
      to: 'research',
      source: 'nlu',
    });
  });
});
