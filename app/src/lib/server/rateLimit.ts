// ═══════════════════════════════════════════════════════════════
// Server-side Rate Limiter (in-memory)
// ═══════════════════════════════════════════════════════════════
// Sliding-window token bucket per IP.
// Lightweight, no external deps, safe for 1000+ concurrent users.
//
// Usage in SvelteKit endpoints:
//   import { createRateLimiter } from '$lib/server/rateLimit';
//   const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
//   // In handler:
//   const ip = getClientAddress();
//   if (!limiter.check(ip)) return json({ error: 'Too many requests' }, { status: 429 });

// ── Types ─────────────────────────────────────────────────────

interface RateLimitConfig {
  /** Time window in ms (default: 60s) */
  windowMs?: number;
  /** Max requests per window per key (default: 20) */
  max?: number;
}

interface BucketEntry {
  tokens: number[];    // timestamps of recent requests
  lastSeen: number;    // for LRU eviction
}

// ── Rate Limiter Factory ─────────────────────────────────────

export function createRateLimiter(config: RateLimitConfig = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const max = config.max ?? 20;

  const buckets = new Map<string, BucketEntry>();

  // Periodic cleanup: remove stale entries every 2 minutes
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - windowMs;
    for (const [key, entry] of buckets.entries()) {
      entry.tokens = entry.tokens.filter(t => t > cutoff);
      if (entry.tokens.length === 0) buckets.delete(key);
    }
    // Hard cap: if too many unique IPs tracked, evict least-recently-seen
    if (buckets.size > 10_000) {
      const sorted = [...buckets.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toEvict = buckets.size - 5_000; // drop to 5k
      for (let i = 0; i < toEvict; i++) {
        buckets.delete(sorted[i][0]);
      }
    }
  }, 120_000);

  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }

  return {
    /**
     * Check if a request should be allowed.
     * Returns true if allowed, false if rate limited.
     */
    check(key: string): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = buckets.get(key);
      if (!entry) {
        entry = { tokens: [], lastSeen: now };
        buckets.set(key, entry);
      }

      // Update LRU timestamp
      entry.lastSeen = now;

      // Remove tokens outside the window
      entry.tokens = entry.tokens.filter(t => t > cutoff);

      if (entry.tokens.length >= max) {
        return false; // rate limited
      }

      entry.tokens.push(now);
      return true;
    },

    /** Get remaining requests for a key */
    remaining(key: string): number {
      const now = Date.now();
      const cutoff = now - windowMs;
      const entry = buckets.get(key);
      if (!entry) return max;
      const active = entry.tokens.filter(t => t > cutoff).length;
      return Math.max(0, max - active);
    },

    /** Get stats */
    stats(): { trackedKeys: number; windowMs: number; max: number } {
      return { trackedKeys: buckets.size, windowMs, max };
    },
  };
}

// ── Pre-configured limiters for expensive endpoints ──────────

/** Terminal scan: 6 scans per minute per IP */
export const scanLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });

/** Comparison: 3 comparisons per minute per IP */
export const compareLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });

/** Opportunity scan: 12 per minute per IP (clients poll every 5min, but allow bursts) */
export const opportunityScanLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

/** Polymarket order preparation: 10 per minute per IP */
export const polymarketOrderLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Polymarket status polling: 30 per minute per IP */
export const polymarketStatusLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

/** GMX order preparation: 10 per minute per IP */
export const gmxOrderLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** GMX read operations (positions, balance, markets): 60 per minute per IP */
export const gmxReadLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

/** Auth nonce issue: 8 per minute per IP */
export const authNonceLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });

/** Auth register: 8 per minute per IP */
export const authRegisterLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });

/** Auth login: 10 per minute per IP */
export const authLoginLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Auth verify wallet: 10 per minute per IP */
export const authVerifyLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Market snapshot (heavy fan-out): 20 per minute per IP */
export const marketSnapshotLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/** Terminal read-path parity routes: 20 per minute per IP */
export const terminalReadLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/** Market microstructure routes: 20 per minute per IP */
export const marketMicroLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/** Analyze route (engine + fan-out): 18 per minute per IP */
export const analyzeLimiter = createRateLimiter({ windowMs: 60_000, max: 18 });

/** Wallet intel (public heavy read): 12 per minute per IP */
export const walletIntelLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

/** Intel shadow (public heavy read): 12 per minute per IP */
export const intelShadowLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

/** Intel shadow forced refresh: 4 per minute per IP */
export const intelShadowRefreshLimiter = createRateLimiter({ windowMs: 60_000, max: 4 });

/** Wizard challenge composition: 10 per minute per IP */
export const wizardLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Lab autorun launch: 2 per minute per IP */
export const autorunLimiter = createRateLimiter({ windowMs: 60_000, max: 2 });

/** Exchange credential connect/list: 10 per minute per IP */
export const exchangeConnectionLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Exchange trade import: 6 per minute per IP */
export const exchangeImportLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });

/** Passport worker trigger: 2 per minute per IP */
export const passportWorkerRunLimiter = createRateLimiter({ windowMs: 60_000, max: 2 });

/** Passport report generation trigger: 2 per minute per IP */
export const passportReportGenerateLimiter = createRateLimiter({ windowMs: 60_000, max: 2 });

/** Passport train-job reads: 20 per minute per IP */
export const passportTrainJobReadLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/** Passport train-job creation trigger: 2 per minute per IP */
export const passportTrainJobCreateLimiter = createRateLimiter({ windowMs: 60_000, max: 2 });

// War Room
export const emergencyMeetingLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

// ── W-0098: 500-user safety ───────────────────────────────────────────────────
/** Chart klines poll: 120 per minute per IP (15s interval × 4 tabs + burst headroom) */
export const chartKlinesLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

/** Heavy engine paths (score, deep, backtest, train): 60 per minute per IP */
export const engineProxyLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

/** DOUNI terminal message (server-side LLM key): 15 per minute per IP */
export const douniMessageLimiter = createRateLimiter({ windowMs: 60_000, max: 15 });
