import { describe, expect, it } from 'vitest';
import { evaluateToolPolicy } from './toolPolicy';

describe('evaluateToolPolicy', () => {
  it('denies tools in denylist', () => {
    const result = evaluateToolPolicy({
      toolName: 'bash',
      denylist: ['bash'],
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('tool_denied');
  });

  it('denies tools not in allowlist', () => {
    const result = evaluateToolPolicy({
      toolName: 'webfetch',
      allowlist: ['readfile', 'shell'],
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('tool_not_allowlisted');
  });

  it('asks when tool requires approval', () => {
    const result = evaluateToolPolicy({
      toolName: 'shell',
      allowlist: ['shell'],
      requiresApproval: ['shell'],
    });
    expect(result.decision).toBe('ask');
    expect(result.reasons).toContain('tool_requires_approval');
  });

  it('allows allowlisted tools without approval requirement', () => {
    const result = evaluateToolPolicy({
      toolName: 'readfile',
      allowlist: ['readfile', 'shell'],
    });
    expect(result.decision).toBe('allow');
  });
});
