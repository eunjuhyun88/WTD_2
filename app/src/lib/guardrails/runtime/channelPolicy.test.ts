import { describe, expect, it } from 'vitest';
import { evaluateChannelPolicy } from './channelPolicy';

describe('evaluateChannelPolicy', () => {
  it('denies explicitly denied channels', () => {
    const result = evaluateChannelPolicy({
      channelName: 'terminal.intel-shadow.execute',
      denylist: ['terminal.intel-shadow.execute'],
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('channel_denied');
  });

  it('asks when channel requires approval', () => {
    const result = evaluateChannelPolicy({
      channelName: 'terminal.douni.tools',
      allowlist: ['terminal.douni.tools'],
      requiresApproval: ['terminal.douni.tools'],
    });
    expect(result.decision).toBe('ask');
  });
});

