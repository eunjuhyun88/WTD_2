import { describe, expect, it, vi } from 'vitest';
import { runRequestGuardChain } from './requestGuardChain';

describe('runRequestGuardChain', () => {
  it('stops at first deny result', async () => {
    const afterDeny = vi.fn();
    const result = await runRequestGuardChain(
      {
        request: new Request('https://example.test'),
        ip: '127.0.0.1',
      },
      [
        () => ({ decision: 'allow', reasons: ['ip_ok'], riskTier: 'low' as const }),
        () => ({ decision: 'deny', reasons: ['rate_limited'], riskTier: 'high' as const }),
        () => {
          afterDeny();
          return { decision: 'allow', reasons: ['should_not_run'], riskTier: 'low' as const };
        },
      ],
    );

    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('rate_limited');
    expect(afterDeny).not.toHaveBeenCalled();
  });
});

