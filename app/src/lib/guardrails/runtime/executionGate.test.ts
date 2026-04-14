import { describe, expect, it } from 'vitest';
import { evaluateRuntimeExecutionGate } from './executionGate';

describe('evaluateRuntimeExecutionGate', () => {
  it('blocks in enforce mode when tool requires approval', () => {
    const gate = evaluateRuntimeExecutionGate({
      mode: 'enforce',
      toolPolicy: {
        toolName: 'save_pattern',
        allowlist: ['save_pattern'],
        requiresApproval: ['save_pattern'],
      },
      channelPolicy: {
        channelName: 'terminal.douni.tools',
        allowlist: ['terminal.douni.tools'],
      },
    });
    expect(gate.blocked).toBe(true);
    expect(gate.result.decision).toBe('ask');
  });

  it('allows in shadow mode with ask decisions', () => {
    const gate = evaluateRuntimeExecutionGate({
      mode: 'shadow',
      toolPolicy: {
        toolName: 'save_pattern',
        allowlist: ['save_pattern'],
        requiresApproval: ['save_pattern'],
      },
      channelPolicy: {
        channelName: 'terminal.douni.tools',
        allowlist: ['terminal.douni.tools'],
      },
    });
    expect(gate.blocked).toBe(false);
    expect(gate.effectiveDecision).toBe('allow');
  });
});

