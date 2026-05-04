import { describe, it, expect } from 'vitest';
import { parseQuery } from '../slashParser';
import type { ParsedQuery } from '../slashParser';

// ── Slash commands ─────────────────────────────────────────────────────────────

describe('parseQuery — slash /scan', () => {
  it('/scan with args → research tab, intent=scan', () => {
    const result = parseQuery('/scan funding<0');
    expect(result).toMatchObject<ParsedQuery>({
      intent: 'scan',
      tab: 'research',
      query: 'funding<0',
    });
  });

  it('/scan with no args → research tab, intent=scan, empty query', () => {
    const result = parseQuery('/scan');
    expect(result).toMatchObject({ intent: 'scan', tab: 'research', query: '' });
  });
});

describe('parseQuery — slash /why', () => {
  it('/why BTC → decision tab, intent=why, query=BTC', () => {
    const result = parseQuery('/why BTC');
    expect(result).toMatchObject({ intent: 'why', tab: 'decision', query: 'BTC' });
  });
});

describe('parseQuery — slash /judge', () => {
  it('/judge 최근 7일 → judge tab, intent=judge', () => {
    const result = parseQuery('/judge 최근 7일');
    expect(result).toMatchObject({ intent: 'judge', tab: 'judge', query: '최근 7일' });
  });
});

describe('parseQuery — slash /recall', () => {
  it('/recall double-bottom → pattern tab, intent=recall', () => {
    const result = parseQuery('/recall double-bottom');
    expect(result).toMatchObject({ intent: 'recall', tab: 'pattern', query: 'double-bottom' });
  });
});

describe('parseQuery — slash /inbox', () => {
  it('/inbox alone → verdict tab, intent=inbox, empty query', () => {
    const result = parseQuery('/inbox');
    expect(result).toMatchObject({ intent: 'inbox', tab: 'verdict', query: '' });
  });
});

// ── NLU heuristics ─────────────────────────────────────────────────────────────

describe('parseQuery — NLU heuristic: pattern', () => {
  it('"비슷한 패턴 찾아줘" → pattern tab, intent=nlu', () => {
    const result = parseQuery('비슷한 패턴 찾아줘');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'pattern' });
  });

  it('"show similar patterns" → pattern tab (english)', () => {
    const result = parseQuery('show similar patterns');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'pattern' });
  });
});

describe('parseQuery — NLU heuristic: decision', () => {
  it('"왜 BTC가 떨어졌어" → decision tab, intent=nlu', () => {
    const result = parseQuery('왜 BTC가 떨어졌어');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'decision' });
  });

  it('"why did ETH drop" → decision tab', () => {
    const result = parseQuery('why did ETH drop');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'decision' });
  });
});

describe('parseQuery — NLU heuristic: verdict', () => {
  it('"최근 7일 실적" → verdict tab, intent=nlu', () => {
    const result = parseQuery('최근 7일 실적');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'verdict' });
  });

  it('"recent trades" → verdict tab', () => {
    const result = parseQuery('recent trades');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'verdict' });
  });
});

// ── Default / edge cases ──────────────────────────────────────────────────────

describe('parseQuery — default fallback', () => {
  it('unrecognised plain text → research tab, intent=nlu', () => {
    const result = parseQuery('BTC funding rate analysis');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'research' });
  });

  it('empty string → research tab, intent=nlu, empty query', () => {
    const result = parseQuery('');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'research', query: '' });
  });

  it('whitespace only → research tab, empty query', () => {
    const result = parseQuery('   ');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'research', query: '' });
  });

  it('unknown slash command → NLU fallback, research tab', () => {
    const result = parseQuery('/unknown command');
    expect(result).toMatchObject({ intent: 'nlu', tab: 'research' });
  });
});
