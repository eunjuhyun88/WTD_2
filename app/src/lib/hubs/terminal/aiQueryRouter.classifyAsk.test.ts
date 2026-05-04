import { describe, it, expect } from 'vitest';
import { classifyAsk } from './aiQueryRouter';

describe('classifyAsk', () => {
  // Slash commands — deterministic branch
  it('/scan funding<0 → research + scan + slash', () => {
    const r = classifyAsk('/scan funding<0');
    expect(r.intent).toBe('scan');
    expect(r.source).toBe('slash');
    expect(r.tab).toBe('research');
    expect(r.query).toBe('funding<0');
  });

  it('/why BTC → decision + why + slash', () => {
    const r = classifyAsk('/why BTC');
    expect(r.intent).toBe('why');
    expect(r.source).toBe('slash');
    expect(r.tab).toBe('decision');
    expect(r.query).toBe('BTC');
  });

  it('/judge → judge + slash + empty query', () => {
    const r = classifyAsk('/judge');
    expect(r.intent).toBe('judge');
    expect(r.source).toBe('slash');
    expect(r.tab).toBe('judge');
    expect(r.query).toBe('');
  });

  it('/recall double-bottom → pattern + recall + slash', () => {
    const r = classifyAsk('/recall double-bottom');
    expect(r.intent).toBe('recall');
    expect(r.source).toBe('slash');
    expect(r.tab).toBe('pattern');
    expect(r.query).toBe('double-bottom');
  });

  it('/inbox → verdict + inbox + slash', () => {
    const r = classifyAsk('/inbox');
    expect(r.intent).toBe('inbox');
    expect(r.source).toBe('slash');
    expect(r.tab).toBe('verdict');
  });

  // NL fallback
  it('NL "비슷한 패턴" → pattern + recall + nl', () => {
    const r = classifyAsk('비슷한 패턴 찾아줘');
    expect(r.intent).toBe('recall');
    expect(r.source).toBe('nl');
    expect(r.tab).toBe('pattern');
  });

  it('NL "왜 빠져" → decision + why + nl', () => {
    const r = classifyAsk('왜 빠졌어');
    expect(r.intent).toBe('why');
    expect(r.source).toBe('nl');
    expect(r.tab).toBe('decision');
  });

  it('empty input → unknown + research tab', () => {
    const r = classifyAsk('');
    expect(r.intent).toBe('unknown');
    expect(r.tab).toBe('research');
  });

  // Case insensitivity
  it('/SCAN uppercase → treated as scan', () => {
    const r = classifyAsk('/SCAN ETH funding');
    expect(r.intent).toBe('scan');
    expect(r.source).toBe('slash');
    expect(r.query).toBe('ETH funding');
  });
});
