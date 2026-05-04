import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { routeAiAsk, pendingQuery, kindToTabId } from '../panelRouter';
import type { AiAskDetail } from '../panelRouter';
import type { RightPanelTab } from '$lib/hubs/terminal/shell.store';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a setTab spy that captures the resolved tab. */
function makeSetTab(): (tab: RightPanelTab) => void {
  return vi.fn();
}

beforeEach(() => {
  // Reset store between tests
  pendingQuery.set(null);
});

// ── kindToTabId mapping ────────────────────────────────────────────────────

describe('kindToTabId — static mapping', () => {
  it('scan → scan', () => {
    expect(kindToTabId['scan']).toBe('scan');
  });
  it('why → decision', () => {
    expect(kindToTabId['why']).toBe('decision');
  });
  it('judge → judge', () => {
    expect(kindToTabId['judge']).toBe('judge');
  });
  it('recall → pattern', () => {
    expect(kindToTabId['recall']).toBe('pattern');
  });
  it('inbox → verdict', () => {
    expect(kindToTabId['inbox']).toBe('verdict');
  });
});

// ── routeAiAsk — tab resolution ────────────────────────────────────────────

describe('routeAiAsk — routes each tab correctly', () => {
  it('/scan → scan tab', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'scan', tab: 'scan', query: 'funding<0' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('scan');
    const pq = get(pendingQuery);
    expect(pq?.tab).toBe('scan');
    expect(pq?.query).toBe('funding<0');
    expect(pq?.intent).toBe('scan');
  });

  it('/why → decision tab', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'why', tab: 'decision', query: 'BTC' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('decision');
    const pq = get(pendingQuery);
    expect(pq?.tab).toBe('decision');
    expect(pq?.query).toBe('BTC');
  });

  it('/judge → judge tab', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'judge', tab: 'judge', query: '최근 7일' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('judge');
    const pq = get(pendingQuery);
    expect(pq?.tab).toBe('judge');
  });

  it('/recall → pattern tab', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'recall', tab: 'pattern', query: 'double-bottom' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('pattern');
    const pq = get(pendingQuery);
    expect(pq?.tab).toBe('pattern');
    expect(pq?.query).toBe('double-bottom');
  });

  it('/inbox → verdict tab', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'inbox', tab: 'verdict', query: '' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('verdict');
    const pq = get(pendingQuery);
    expect(pq?.tab).toBe('verdict');
  });
});

// ── routeAiAsk — NLU fallback ──────────────────────────────────────────────

describe('routeAiAsk — NLU routes via tab field', () => {
  it('NLU with tab=pattern → pattern', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'nlu', tab: 'pattern', query: '비슷한 패턴' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('pattern');
    expect(get(pendingQuery)?.tab).toBe('pattern');
  });

  it('NLU with unknown tab falls back to kindToTabId[nlu]=research', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'nlu', tab: 'totally-unknown', query: 'hello' };
    routeAiAsk(detail, setTab);
    expect(setTab).toHaveBeenCalledWith('research');
    expect(get(pendingQuery)?.tab).toBe('research');
  });
});

// ── routeAiAsk — payload pass-through ─────────────────────────────────────

describe('routeAiAsk — payload pass-through', () => {
  it('stores query and intent unchanged in pendingQuery', () => {
    const setTab = makeSetTab();
    const detail: AiAskDetail = { intent: 'scan', tab: 'scan', query: 'rsi<30 AND vol>1M' };
    routeAiAsk(detail, setTab);
    const pq = get(pendingQuery);
    expect(pq?.intent).toBe('scan');
    expect(pq?.query).toBe('rsi<30 AND vol>1M');
  });

  it('sets a numeric ts in pendingQuery', () => {
    const setTab = makeSetTab();
    const before = Date.now();
    routeAiAsk({ intent: 'scan', tab: 'scan', query: '' }, setTab);
    const after = Date.now();
    const pq = get(pendingQuery);
    expect(pq?.ts).toBeGreaterThanOrEqual(before);
    expect(pq?.ts).toBeLessThanOrEqual(after);
  });

  it('consecutive calls produce distinct ts values', async () => {
    const setTab = makeSetTab();
    routeAiAsk({ intent: 'scan', tab: 'scan', query: 'a' }, setTab);
    const first = get(pendingQuery)?.ts;
    // Force a 1ms gap
    await new Promise(r => setTimeout(r, 2));
    routeAiAsk({ intent: 'scan', tab: 'scan', query: 'b' }, setTab);
    const second = get(pendingQuery)?.ts;
    expect(second).toBeGreaterThan(first!);
  });
});

// ── routeAiAsk — unknown intent ────────────────────────────────────────────

describe('routeAiAsk — unknown intent with valid tab', () => {
  it('uses detail.tab when intent is unknown', () => {
    const setTab = makeSetTab();
    routeAiAsk({ intent: 'unknown-future-intent', tab: 'verdict', query: 'x' }, setTab);
    expect(setTab).toHaveBeenCalledWith('verdict');
    expect(get(pendingQuery)?.tab).toBe('verdict');
  });

  it('falls back to research when both intent and tab are unknown', () => {
    const setTab = makeSetTab();
    routeAiAsk({ intent: 'bogus', tab: 'bogus', query: '' }, setTab);
    expect(setTab).toHaveBeenCalledWith('research');
    expect(get(pendingQuery)?.tab).toBe('research');
  });
});
