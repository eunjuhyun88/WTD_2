import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function envBool(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof typeof env];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = env[name as keyof typeof env];
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export interface TurnstileVerification {
  ok: boolean;
  skipped: boolean;
  reason?: string;
}

export async function verifyTurnstile(args: {
  token: string | null | undefined;
  remoteIp?: string | null;
}): Promise<TurnstileVerification> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim() || '';
  const allowBypass = envBool('TURNSTILE_ALLOW_BYPASS', dev);
  if (!secret) {
    if (allowBypass) {
      return { ok: true, skipped: true, reason: 'not_configured_bypass' };
    }
    return { ok: false, skipped: false, reason: 'not_configured' };
  }

  const token = args.token?.trim() || '';
  if (!token) {
    return { ok: false, skipped: false, reason: 'missing_token' };
  }

  const timeoutMs = envInt('TURNSTILE_TIMEOUT_MS', 4000, 1000, 15000);
  const failOpen = envBool('TURNSTILE_FAIL_OPEN', false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    body.set('idempotency_key', crypto.randomUUID());
    if (args.remoteIp?.trim()) {
      body.set('remoteip', args.remoteIp.trim());
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (failOpen) return { ok: true, skipped: false, reason: 'http_error_fail_open' };
      return { ok: false, skipped: false, reason: 'http_error' };
    }

    const payload = await response.json().catch(() => null);
    if (!payload?.success) {
      const firstCode = Array.isArray(payload?.['error-codes']) ? payload['error-codes'][0] : null;
      return { ok: false, skipped: false, reason: firstCode || 'invalid_token' };
    }

    return { ok: true, skipped: false };
  } catch {
    if (failOpen) return { ok: true, skipped: false, reason: 'network_error_fail_open' };
    return { ok: false, skipped: false, reason: 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}
