import { json } from '@sveltejs/kit';
import { checkDistributedRateLimit } from './distributedRateLimit';
import { evaluateIpReputation } from './ipReputation';
import { isRequestBodyTooLargeError, readJsonBody, readTurnstileToken } from './requestGuards';
import { verifyTurnstile } from './turnstile';

interface LimiterLike {
  check(key: string): boolean;
}

type GuardPass = {
  ok: true;
  ip: string;
  remoteIp: string | null;
};

type GuardBlocked = {
  ok: false;
  response: Response;
};

export async function runIpRateLimitGuard(args: {
  request: Request;
  fallbackIp: string;
  limiter: LimiterLike;
  scope: string;
  max: number;
  tooManyMessage: string;
  windowMs?: number;
}): Promise<GuardPass | GuardBlocked> {
  const reputation = evaluateIpReputation(args.request, args.fallbackIp);
  if (!reputation.allowed) {
    return {
      ok: false,
      response: json({ error: 'Request blocked by security policy' }, { status: 403 }),
    };
  }

  const ip = reputation.clientIp || args.fallbackIp || 'unknown';
  if (!args.limiter.check(ip)) {
    return {
      ok: false,
      response: json({ error: args.tooManyMessage }, { status: 429 }),
    };
  }

  const distributedAllowed = await checkDistributedRateLimit({
    scope: args.scope,
    key: ip,
    windowMs: args.windowMs ?? 60_000,
    max: args.max,
  });
  if (!distributedAllowed) {
    return {
      ok: false,
      response: json({ error: args.tooManyMessage }, { status: 429 }),
    };
  }

  return {
    ok: true,
    ip,
    remoteIp: reputation.clientIp || args.fallbackIp || null,
  };
}

export async function runAuthAbuseGuard(args: {
  request: Request;
  fallbackIp: string;
  limiter: LimiterLike;
  scope: string;
  max: number;
  tooManyMessage: string;
}): Promise<GuardPass | GuardBlocked> {
  return runIpRateLimitGuard(args);
}

type BodyPass = {
  ok: true;
  body: Record<string, unknown>;
};

export async function readAuthBodyWithTurnstile(args: {
  request: Request;
  remoteIp: string | null;
  maxBytes: number;
}): Promise<BodyPass | GuardBlocked> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody<Record<string, unknown>>(args.request, args.maxBytes);
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return {
        ok: false,
        response: json({ error: 'Request body too large' }, { status: 413 }),
      };
    }
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: json({ error: 'Invalid request body' }, { status: 400 }),
      };
    }
    throw error;
  }

  const turnstile = await verifyTurnstile({
    token: readTurnstileToken(body),
    remoteIp: args.remoteIp,
  });
  if (!turnstile.ok) {
    return {
      ok: false,
      response: json({ error: 'Bot verification failed' }, { status: 403 }),
    };
  }

  return { ok: true, body };
}
