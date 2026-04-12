import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { query } from './db';
import { createRateLimiter } from './rateLimit';

let _infraReady = false;
let _redisWarned = false;

type LocalLimiterKey = `${string}:${number}:${number}`;
const _localFallback = new Map<LocalLimiterKey, ReturnType<typeof createRateLimiter>>();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

async function ensureRateLimitInfrastructure(): Promise<void> {
  if (_infraReady) return;
  const result = await query<{ exists: boolean }>(
    `SELECT to_regclass('public.request_rate_limits') IS NOT NULL AS exists`
  );
  if (!result.rows[0]?.exists) {
    const error: any = new Error('request_rate_limits table is missing. Run migration 0005 first.');
    error.code = '42P01';
    throw error;
  }
  _infraReady = true;
}

function getLocalFallback(scope: string, windowMs: number, max: number) {
  const key: LocalLimiterKey = `${scope}:${windowMs}:${max}`;
  let limiter = _localFallback.get(key);
  if (!limiter) {
    limiter = createRateLimiter({ windowMs, max });
    _localFallback.set(key, limiter);
  }
  return limiter;
}

function shouldCleanup(): boolean {
  return Math.random() < 0.02;
}

interface RedisRestConfig {
  url: string;
  token: string;
  keyPrefix: string;
  timeoutMs: number;
}

function getRedisRestConfig(): RedisRestConfig | null {
  const url = (
    env.RATE_LIMIT_REDIS_REST_URL?.trim()
    || env.UPSTASH_REDIS_REST_URL?.trim()
    || ''
  ).replace(/\/+$/, '');
  const token = env.RATE_LIMIT_REDIS_REST_TOKEN?.trim() || env.UPSTASH_REDIS_REST_TOKEN?.trim() || '';
  if (!url || !token) return null;

  const keyPrefix = env.RATE_LIMIT_REDIS_PREFIX?.trim() || 'stockclaw:rl';
  const timeoutRaw = env.RATE_LIMIT_REDIS_TIMEOUT_MS;
  const timeoutParsed = typeof timeoutRaw === 'string' ? Number.parseInt(timeoutRaw, 10) : Number.NaN;
  const timeoutMs = Number.isFinite(timeoutParsed) ? Math.max(500, Math.min(10_000, timeoutParsed)) : 3_000;

  return { url, token, keyPrefix, timeoutMs };
}

function parseRedisIncrResponse(payload: any): number | null {
  const value = Array.isArray(payload?.result) ? payload.result : payload;
  if (!Array.isArray(value) || value.length < 1) return null;
  const first = value[0];

  if (typeof first === 'number') return first;
  if (typeof first?.result === 'number') return first.result;
  if (typeof first?.result === 'string') {
    const parsed = Number.parseInt(first.result, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function checkRedisRateLimit(args: {
  scope: string;
  key: string;
  windowMs: number;
  max: number;
  windowStartMs: number;
}): Promise<boolean | null> {
  const config = getRedisRestConfig();
  if (!config) return null;

  const redisKey = `${config.keyPrefix}:${args.scope}:${hashKey(args.key)}:${args.windowStartMs}`;
  const body = JSON.stringify([
    ['INCR', redisKey],
    ['PEXPIRE', redisKey, args.windowMs, 'NX'],
  ]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Redis REST HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    const hitCount = parseRedisIncrResponse(payload);
    if (!Number.isFinite(hitCount)) {
      throw new Error('Redis response parse failed');
    }

    return Number(hitCount) <= args.max;
  } catch (error: any) {
    if (!_redisWarned) {
      _redisWarned = true;
      console.error('[distributedRateLimit] Redis backend unavailable, falling back to DB/local:', error?.message || error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkDistributedRateLimit(args: {
  scope: string;
  key: string;
  windowMs: number;
  max: number;
}): Promise<boolean> {
  const scope = args.scope.trim() || 'global';
  const key = args.key.trim() || 'unknown';
  const windowMs = Math.max(1_000, Math.min(3_600_000, Math.trunc(args.windowMs)));
  const max = Math.max(1, Math.min(10_000, Math.trunc(args.max)));

  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;

  const redisAllowed = await checkRedisRateLimit({
    scope,
    key,
    windowMs,
    max,
    windowStartMs,
  });
  if (typeof redisAllowed === 'boolean') {
    return redisAllowed;
  }

  try {
    await ensureRateLimitInfrastructure();

    const result = await query<{ hit_count: number }>(
      `
        INSERT INTO request_rate_limits (scope, key_hash, window_start_ms, hit_count, updated_at)
        VALUES ($1, $2, $3, 1, now())
        ON CONFLICT (scope, key_hash, window_start_ms)
        DO UPDATE SET
          hit_count = request_rate_limits.hit_count + 1,
          updated_at = now()
        RETURNING hit_count
      `,
      [scope, hashKey(key), windowStartMs]
    );

    if (shouldCleanup()) {
      const retentionMs = Math.max(windowMs * 20, 86_400_000);
      void query(
        `
          DELETE FROM request_rate_limits
          WHERE window_start_ms < $1
        `,
        [now - retentionMs]
      ).catch(() => undefined);
    }

    const hitCount = Number(result.rows[0]?.hit_count ?? 0);
    return hitCount <= max;
  } catch {
    // Fallback when DB is unavailable: still enforce per-instance protection.
    const local = getLocalFallback(scope, windowMs, max);
    return local.check(key);
  }
}
