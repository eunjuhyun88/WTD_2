import { describe, expect, it, vi } from 'vitest';
import { getDefaultToolPolicyInput, getToolGuardrailMode } from './toolPolicyConfig';

describe('toolPolicyConfig', () => {
  it('defaults mode to shadow', () => {
    vi.stubEnv('DOUNI_TOOL_GUARDRAIL_MODE', '');
    expect(getToolGuardrailMode()).toBe('shadow');
    vi.unstubAllEnvs();
  });

  it('parses enforce mode', () => {
    vi.stubEnv('DOUNI_TOOL_GUARDRAIL_MODE', 'enforce');
    expect(getToolGuardrailMode()).toBe('enforce');
    vi.unstubAllEnvs();
  });

  it('returns default policy with approval-required tools', () => {
    const policy = getDefaultToolPolicyInput('save_pattern');
    expect(policy.allowlist).toContain('save_pattern');
    expect(policy.requiresApproval).toContain('save_pattern');
  });
});
