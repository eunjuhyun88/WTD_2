/**
 * cogochi-ai-ask-event.test.ts
 *
 * Unit tests for cogochi:ai-ask event payload schema and
 * intent → drawerTab mapping via mapAskToDrawerTab().
 *
 * Does NOT mount TradeMode — tests the pure helper only.
 */
import { describe, it, expect } from 'vitest';
import { mapAskToDrawerTab, type AiAskEvent } from '../aiAskRouter';

// ── Payload schema tests ─────────────────────────────────────────────────────

describe('AiAskEvent payload shape', () => {
  it('has required intent, query, ts fields', () => {
    const event: AiAskEvent = { intent: 'scan', query: 'show me hot setups', ts: Date.now() };
    expect(event.intent).toBe('scan');
    expect(typeof event.query).toBe('string');
    expect(typeof event.ts).toBe('number');
  });

  it('accepts all valid intent values', () => {
    const intents: AiAskEvent['intent'][] = ['scan', 'why', 'judge', 'recall', 'inbox', 'unknown'];
    for (const intent of intents) {
      const e: AiAskEvent = { intent, query: 'q', ts: 1 };
      expect(e.intent).toBe(intent);
    }
  });
});

// ── mapAskToDrawerTab — table-driven ─────────────────────────────────────────

describe('mapAskToDrawerTab', () => {
  const cases: [string, 'verdict' | 'research' | 'judge' | null][] = [
    ['scan',    'research'],
    ['why',     'verdict'],
    ['judge',   'judge'],
    ['recall',  null],
    ['inbox',   null],
    ['unknown', null],
  ];

  it.each(cases)('intent "%s" → drawerTab %s', (intent, expected) => {
    expect(mapAskToDrawerTab(intent)).toBe(expected);
  });

  it('returns null for arbitrary unknown strings', () => {
    expect(mapAskToDrawerTab('anything-else')).toBe(null);
    expect(mapAskToDrawerTab('')).toBe(null);
  });
});
