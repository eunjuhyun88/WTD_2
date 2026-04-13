import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';

type SharedCacheEntry = {
  expiresAt: number;
  value: unknown;
};

interface RedisRestConfig {
  url: string;
  token: string;
  keyPrefix: string;
  timeoutMs: number;
}

const localCache = new Map<string, SharedCacheEntry>();
let redisWarned = false;

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function getRedisRestConfig(): RedisRestConfig | null {
  const url = (
    env.SHARED_CACHE_REDIS_REST_URL?.trim()
    || env.RATE_LIMIT_REDIS_REST_URL?.trim()
    || env.UPSTASH_REDIS_REST_URL?.trim()
    || ''
  ).replace(/\/+$/, '');
  const token = (
    env.SHARED_CACHE_REDIS_REST_TOKEN?.trim()
    || env.RATE_LIMIT_REDIS_REST_TOKEN?.trim()
    || env.UPSTASH_REDIS_REST_TOKEN?.trim()
    || ''
  );
  if (!url || !token) return null;

  const keyPrefix = env.SHARED_CACHE_REDIS_PREFIX?.trim() || 'wtd:cache';
  const timeoutRaw = env.SHARED_CACHE_REDIS_TIMEOUT_MS;
  const timeoutParsed = typeof timeoutRaw === 'string' ? Number.parseInt(timeoutRaw, 10) : Number.NaN;
  const timeoutMs = Number.isFinite(timeoutParsed) ? Math.max(500, Math.min(10_000, timeoutParsed)) : 3_000;

  return { url, token, keyPrefix, timeoutMs };
}

function getLocal<T>(key: string): T | null {
  const cached = localCache.get(key);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    localCache.delete(key);
    return null;
  }
  return cached.value as T;
}

function setLocal<T>(key: string, value: T, ttlMs: number): void {
  localCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function buildPipelineBody(commands: Array<Array<string | number>>) {
  return JSON.stringify(commands);
}

async function runRedisPipeline(commands: Array<Array<string | number>>): Promise<any[] | null> {
  const config = getRedisRestConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: buildPipelineBody(commands),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Redis REST HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    const result = Array.isArray(payload?.result) ? payload.result : payload;
    return Array.isArray(result) ? result : null;
  } catch (error: any) {
    if (!redisWarned) {
      redisWarned = true;
      console.error('[sharedCache] Redis backend unavailable, falling back to local cache:', error?.message || error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSharedCache<T>(scope: string, key: string): Promise<T | null> {
  const normalizedScope = scope.trim() || 'global';
  const normalizedKey = key.trim() || 'unknown';
  const localKey = `${normalizedScope}:${normalizedKey}`;
  const localValue = getLocal<T>(localKey);
  if (localValue !== null) return localValue;

  const config = getRedisRestConfig();
  if (!config) return null;

  const redisKey = `${config.keyPrefix}:${normalizedScope}:${hashKey(normalizedKey)}`;
  const result = await runRedisPipeline([['GET', redisKey]]);
  const raw = result?.[0]?.result;
  if (typeof raw !== 'string' || !raw) return null;

  try {
    const parsed = JSON.parse(raw) as T;
    setLocal(localKey, parsed, 5_000);
    return parsed;
  } catch {
    return null;
  }
}

export async function setSharedCache<T>(scope: string, key: string, value: T, ttlMs: number): Promise<void> {
  const normalizedScope = scope.trim() || 'global';
  const normalizedKey = key.trim() || 'unknown';
  const boundedTtlMs = Math.max(1_000, Math.min(3_600_000, Math.trunc(ttlMs)));
  const localKey = `${normalizedScope}:${normalizedKey}`;
  setLocal(localKey, value, boundedTtlMs);

  const config = getRedisRestConfig();
  if (!config) return;

  const redisKey = `${config.keyPrefix}:${normalizedScope}:${hashKey(normalizedKey)}`;
  await runRedisPipeline([['SET', redisKey, JSON.stringify(value), 'PX', boundedTtlMs]]);
}
