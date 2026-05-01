// ═══════════════════════════════════════════════════════════════
// Engine Response Cache (Upstash Redis SWR)
// ═══════════════════════════════════════════════════════════════
// Stale-While-Revalidate cache for engine read-path responses.
// Fallback to no caching if Redis unavailable.

import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$env/static/private';

interface CacheEntry {
  value: unknown;
  ts: number;
}

interface EngineCapacheConfig {
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

  constructor(config: EngineCapacheConfig = {}) {
    this.ttlSecs = config.ttlSecs ?? 60;
    this.swrSecs = config.swrSecs ?? 120;
    this.url = UPSTASH_REDIS_REST_URL ?? '';
    this.token = UPSTASH_REDIS_REST_TOKEN ?? '';
    this.redisAvailable = !!this.url && !!this.token;
  }

  async get(key: string): Promise<unknown | null> {
    // Try local cache first
    const local = this.localCache.get(key);
    if (local && Date.now() - local.ts < this.ttlSecs * 1000) {
      return local.value;
    }

    if (!this.redisAvailable) {
      return null;
    }

    try {
      const result = await this.redisCall('GET', [key]);
      if (result) {
        const parsed = JSON.parse(String(result)) as unknown;
        // Store in local cache
        this.localCache.set(key, { value: parsed, ts: Date.now() });
        return parsed;
      }
    } catch (err) {
      console.error('[engineCache] Redis GET error:', err);
    }

    return null;
  }

  async set(key: string, value: unknown): Promise<void> {
    // Store in local cache
    this.localCache.set(key, { value, ts: Date.now() });

    if (!this.redisAvailable) {
      return;
    }

    try {
      const json = JSON.stringify(value);
      await this.redisCall('SET', [key, json, 'EX', String(this.ttlSecs + this.swrSecs)]);
    } catch (err) {
      console.error('[engineCache] Redis SET error:', err);
    }
  }

  async invalidate(keyPattern: string): Promise<void> {
    // Clear local cache entries matching pattern
    for (const key of this.localCache.keys()) {
      if (key.includes(keyPattern)) {
        this.localCache.delete(key);
      }
    }

    if (!this.redisAvailable) {
      return;
    }

    try {
      // SCAN + DEL pattern-based keys
      const cursor = '0';
      const keys: string[] = [];
      const result = await this.redisCall('SCAN', [
        cursor,
        'MATCH',
        `${keyPattern}*`,
        'COUNT',
        '100',
      ]) as [string, string[]];

      if (result && result[1]) {
        keys.push(...result[1]);
      }

      if (keys.length > 0) {
        await this.redisCall('DEL', keys);
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

    if (!response.ok) {
      throw new Error(`Redis call failed: ${response.status}`);
    }

    const data = (await response.json()) as { result?: unknown };
    return data.result;
  }
}

export const engineCache = new UpstashEngineCache({
  ttlSecs: 60,
  swrSecs: 120,
});
