// Engine Response Cache (Upstash Redis SWR)
// Stale-While-Revalidate cache for engine read-path responses.
// Fallback to local in-memory if Redis unavailable.

import { env } from '$env/dynamic/private';

interface CacheEntry {
  value: unknown;
  ts: number;
}

interface EngineCacheConfig {
  ttlSecs?: number;
  swrSecs?: number;
}

class UpstashEngineCache {
  private ttlSecs: number;
  private swrSecs: number;
  private url: string;
  private token: string;
  private redisAvailable: boolean = false;
  private localCache = new Map<string, CacheEntry>();

  constructor(config: EngineCacheConfig = {}) {
    this.ttlSecs = config.ttlSecs ?? 60;
    this.swrSecs = config.swrSecs ?? 120;
    this.url = env.UPSTASH_REDIS_REST_URL ?? '';
    this.token = env.UPSTASH_REDIS_REST_TOKEN ?? '';
    this.redisAvailable = !!this.url && !!this.token;
  }

  async get(key: string): Promise<unknown | null> {
    const local = this.localCache.get(key);
    if (local && Date.now() - local.ts < this.ttlSecs * 1000) {
      return local.value;
    }

    if (!this.redisAvailable) return null;

    try {
      const result = await this.redisCall('GET', [key]);
      if (result) {
        const parsed = JSON.parse(String(result)) as unknown;
        this.localCache.set(key, { value: parsed, ts: Date.now() });
        return parsed;
      }
    } catch (err) {
      console.error('[engineCache] Redis GET error:', err);
    }

    return null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.localCache.set(key, { value, ts: Date.now() });

    if (!this.redisAvailable) return;

    try {
      const json = JSON.stringify(value);
      await this.redisCall('SET', [key, json, 'EX', String(this.ttlSecs + this.swrSecs)]);
    } catch (err) {
      console.error('[engineCache] Redis SET error:', err);
    }
  }

  async invalidate(keyPattern: string): Promise<void> {
    for (const key of this.localCache.keys()) {
      if (key.includes(keyPattern)) this.localCache.delete(key);
    }

    if (!this.redisAvailable) return;

    try {
      const result = await this.redisCall('SCAN', [
        '0', 'MATCH', `${keyPattern}*`, 'COUNT', '100',
      ]) as [string, string[]];

      if (result?.[1]?.length) {
        await this.redisCall('DEL', result[1]);
      }
    } catch (err) {
      console.error('[engineCache] Redis INVALIDATE error:', err);
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

    if (!response.ok) throw new Error(`Redis call failed: ${response.status}`);

    const data = (await response.json()) as { result?: unknown };
    return data.result;
  }
}

export const engineCache = new UpstashEngineCache({ ttlSecs: 60, swrSecs: 120 });
