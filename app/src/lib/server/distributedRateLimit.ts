// ═══════════════════════════════════════════════════════════════
// Distributed Rate Limiter (Upstash Redis)
// ═══════════════════════════════════════════════════════════════
// Sliding-window rate limiter backed by Upstash Redis.
// Fallback to in-memory limiter if Redis unavailable.

import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$env/static/private';
import { createRateLimiter } from './rateLimit';

interface DistributedConfig {
  windowMs?: number;
  max?: number;
}

const fallbackLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

class UpstashDistributedLimiter {
  private windowMs: number;
  private max: number;
  private url: string;
  private token: string;
  private redisAvailable: boolean = false;

  constructor(config: DistributedConfig = {}) {
    this.windowMs = config.windowMs ?? 60_000;
    this.max = config.max ?? 60;
    this.url = UPSTASH_REDIS_REST_URL ?? '';
    this.token = UPSTASH_REDIS_REST_TOKEN ?? '';
    this.redisAvailable = !!this.url && !!this.token;
  }

  async check(key: string): Promise<boolean> {
    if (!this.redisAvailable) {
      return fallbackLimiter.check(key);
    }

    try {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const redisKey = `ratelimit:${key}`;

      await this.redisCall('ZREMRANGEBYSCORE', [
        redisKey,
        '-inf',
        String(windowStart),
      ]);

      const count = await this.redisCall('ZCARD', [redisKey]);

      if (typeof count === 'number' && count >= this.max) {
        return false;
      }

      await this.redisCall('ZADD', [redisKey, String(now), `${now}`]);
      await this.redisCall('EXPIRE', [redisKey, String(Math.ceil(this.windowMs / 1000) + 10)]);

      return true;
    } catch (err) {
      console.error('[distributedLimiter] Redis error, falling back:', err);
      return fallbackLimiter.check(key);
    }
  }

  async remaining(key: string): Promise<number> {
    if (!this.redisAvailable) {
      return fallbackLimiter.remaining(key);
    }

    try {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const redisKey = `ratelimit:${key}`;

      const count = await this.redisCall('ZCOUNT', [redisKey, String(windowStart), String(now)]);
      return typeof count === 'number' ? Math.max(0, this.max - count) : this.max;
    } catch (err) {
      console.error('[distributedLimiter] Redis error in remaining():', err);
      return fallbackLimiter.remaining(key);
    }
  }

  private async redisCall(command: string, args: string[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, args }),
    });

    if (!response.ok) {
      throw new Error(`Redis call failed: ${response.status}`);
    }

    const data = (await response.json()) as { result?: unknown };
    return data.result;
  }
}

export const distributedLimiter = new UpstashDistributedLimiter({
  windowMs: 60_000,
  max: 60,
});

export function createDistributedLimiter(config: DistributedConfig = {}) {
  return new UpstashDistributedLimiter(config);
}

export const scanLimiterDistributed = createDistributedLimiter({
  windowMs: 60_000,
  max: 6,
});

export const engineProxyLimiterDistributed = createDistributedLimiter({
  windowMs: 60_000,
  max: 60,
});

export const analyzeLimiterDistributed = createDistributedLimiter({
  windowMs: 60_000,
  max: 18,
});

export const marketMicrostructureLimiterDistributed = createDistributedLimiter({
  windowMs: 60_000,
  max: 90,
});
