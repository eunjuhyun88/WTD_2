import { describe, expect, it } from 'vitest';
import { mergeGuardrailResults } from './policy';

describe('mergeGuardrailResults', () => {
  it('returns deny when any policy denies', () => {
    const result = mergeGuardrailResults([
      { decision: 'allow', reasons: ['a'], riskTier: 'low' },
      { decision: 'ask', reasons: ['b'], riskTier: 'medium' },
      { decision: 'deny', reasons: ['c'], riskTier: 'high' },
    ]);

    expect(result.decision).toBe('deny');
    expect(result.riskTier).toBe('high');
    expect(result.reasons).toEqual(['a', 'b', 'c']);
  });

  it('returns ask when no deny exists and ask exists', () => {
    const result = mergeGuardrailResults([
      { decision: 'allow', reasons: ['allowed'], riskTier: 'low' },
      { decision: 'ask', reasons: ['approval'], riskTier: 'medium' },
    ]);

    expect(result.decision).toBe('ask');
    expect(result.riskTier).toBe('medium');
  });
});

