import { describe, expect, it } from 'vitest';
import { classifyIntent } from './intentClassifier';

describe('classifyIntent', () => {
  it('routes similar-pattern retrieval prompts to the dedicated pattern search tool', () => {
    const budget = classifyIntent('OI 급등 후 저갱하고 횡보한 패턴이랑 비슷한 거 찾아줘');

    expect(budget.intent).toBe('pattern_search');
    expect(budget.tools).toEqual(['find_similar_patterns', 'check_pattern_status']);
  });

  it('keeps pattern state questions on the status-oriented tool set', () => {
    const budget = classifyIntent('지금 축적 구간 entry 후보 뭐 있어?');

    expect(budget.intent).toBe('pattern_check');
    expect(budget.tools).toEqual(['check_pattern_status', 'find_similar_patterns']);
  });
});
