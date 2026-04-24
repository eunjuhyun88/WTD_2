import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$env/dynamic/private', () => ({
  env: {
    INTEL_SHADOW_EXECUTION_ENABLED: 'true',
  },
}));

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));

vi.mock('$lib/guardrails/runtime/executionGate', () => ({
  evaluateRuntimeExecutionGate: vi.fn(),
}));

vi.mock('$lib/guardrails/decision/shadowExecutionGate', () => ({
  evaluateShadowExecutionGovernance: vi.fn(),
}));

vi.mock('$lib/guardrails/runtime/toolPolicyConfig', () => ({
  getDefaultChannelPolicyInput: vi.fn().mockReturnValue({
    channelName: 'terminal.intel-shadow.execute',
    allowlist: ['terminal.intel-shadow.execute'],
  }),
}));

vi.mock('$lib/server/quickTradeOpen', () => ({
  openQuickTrade: vi.fn(),
}));

import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { evaluateRuntimeExecutionGate } from '$lib/guardrails/runtime/executionGate';
import { evaluateShadowExecutionGovernance } from '$lib/guardrails/decision/shadowExecutionGate';
import { openQuickTrade } from '$lib/server/quickTradeOpen';

function mockEventRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/terminal/intel-agent-shadow/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/terminal/intel-agent-shadow/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthUserFromCookies as any).mockResolvedValue({ id: 'u-1' });
  });

  it('returns 403 when runtime channel gate blocks execution', async () => {
    (evaluateRuntimeExecutionGate as any).mockReturnValue({
      blocked: true,
      mode: 'enforce',
      effectiveDecision: 'deny',
      result: { decision: 'deny', reasons: ['channel_denied'], riskTier: 'high' },
    });

    const res = await POST({
      cookies: {} as any,
      request: mockEventRequest({ pair: 'BTC/USDT', timeframe: '4h', entry: 100 }),
      fetch: vi.fn(),
    } as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('Runtime channel policy blocked');
  });

  it('returns 409 when decision governance blocks execution', async () => {
    (evaluateRuntimeExecutionGate as any).mockReturnValue({
      blocked: false,
      mode: 'enforce',
      effectiveDecision: 'allow',
      result: { decision: 'allow', reasons: ['channel_allowed'], riskTier: 'low' },
    });
    (evaluateShadowExecutionGovernance as any).mockReturnValue({
      mode: 'enforce',
      blocked: true,
      effectiveDecision: 'deny',
      result: { decision: 'deny', reasons: ['policy_coverage_low'], riskTier: 'high' },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            pair: 'BTC/USDT',
            timeframe: '4h',
            shadow: {
              source: 'fallback',
              provider: null,
              model: null,
              enforced: { bias: 'long', wouldTrade: true, shouldExecute: true, reasons: ['ok'] },
            },
            policy: {
              decision: { bias: 'long', blockers: [] },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const res = await POST({
      cookies: {} as any,
      request: mockEventRequest({ pair: 'BTC/USDT', timeframe: '4h', entry: 100 }),
      fetch: fetchMock,
    } as any);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.details.mode).toBe('enforce');
  });

  it('opens trade when runtime and decision gates pass', async () => {
    (evaluateRuntimeExecutionGate as any).mockReturnValue({
      blocked: false,
      mode: 'enforce',
      effectiveDecision: 'allow',
      result: { decision: 'allow', reasons: ['channel_allowed'], riskTier: 'low' },
    });
    (evaluateShadowExecutionGovernance as any).mockReturnValue({
      mode: 'enforce',
      blocked: false,
      effectiveDecision: 'allow',
      result: { decision: 'allow', reasons: ['execution_gate_passed'], riskTier: 'high' },
    });
    (openQuickTrade as any).mockResolvedValue({
      id: 'qt-1',
      userId: 'u-1',
      pair: 'BTC/USDT',
      dir: 'LONG',
      entry: 100,
      tp: null,
      sl: null,
      currentPrice: 100,
      pnlPercent: 0,
      status: 'open',
      source: 'intel-shadow-agent',
      note: 'shadow:fallback',
      openedAt: 0,
      closedAt: null,
      closePnl: null,
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            pair: 'BTC/USDT',
            timeframe: '4h',
            shadow: {
              source: 'fallback',
              provider: null,
              model: null,
              enforced: { bias: 'long', wouldTrade: true, shouldExecute: true, reasons: ['ok'] },
            },
            policy: {
              decision: { bias: 'long', blockers: [] },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const res = await POST({
      cookies: {} as any,
      request: mockEventRequest({ pair: 'BTC/USDT', timeframe: '4h', entry: 100 }),
      fetch: fetchMock,
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.shadow.governance.effectiveDecision).toBe('allow');
    expect(body.data.trade.id).toBe('qt-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(openQuickTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        pair: 'BTC/USDT',
        dir: 'LONG',
        entry: 100,
        source: 'intel-shadow-agent',
      }),
    );
  });
});
