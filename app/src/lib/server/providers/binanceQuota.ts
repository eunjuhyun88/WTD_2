// ═══════════════════════════════════════════════════════════════
// Binance fapi/spot quota manager (provider-level)
// ═══════════════════════════════════════════════════════════════
//
// This module replaces the client-side `RateLimiter` that previously
// lived in `src/lib/server/marketDataService.ts`. Dissection §1.1
// (`docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md`)
// is explicit:
//
//   > Port: DROP. Server-side batching + Binance fapi quota manager
//   > replaces it; no client-side limiter.
//
// The limiter is intentionally owned by the provider layer — not the
// callers. `scanner.ts`, `toolExecutor.ts`, and any future raw consumer
// must stay ignorant of quota details. They call `readRaw(...)` and
// the adapter inside `rawSources.ts` transparently funnels every
// Binance-hitting fetch through `binanceQuota.execute(...)`.
//
// Configuration invariants
// ------------------------
// - maxConcurrent = 8
//     Binance fapi public endpoints allow up to 2400 weight/minute per
//     IP on the public bucket. At 8 in-flight requests we stay well
//     below the weight ceiling even when every slot runs the heaviest
//     endpoint (klines, weight 5).
// - minInterval = 80 ms
//     Smooths burst arrival so a single `Promise.all(...)` of 30+
//     symbols does not fire 30+ simultaneous TCP connections. Matches
//     the prior `RateLimiter(8, 80)` used across scan + douni tools.
//
// Weight-aware budgeting is deferred to a later slice. If a 429 surfaces
// in production logs, upgrade this module to track Binance's
// `X-MBX-USED-WEIGHT-*` response header per minute bucket.
//
// NOTE: Non-Binance raw sources (mempool.space, blockchain.info,
// upbit, bithumb, coingecko, feargreed) MUST NOT be wrapped by this
// limiter — they have independent upstream policies and some of them
// already have their own TTL cache layer.

interface QueueItem<T> {
	fn: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

class BinanceQuotaManager {
	private queue: Array<QueueItem<unknown>> = [];
	private running = 0;
	private lastRun = 0;

	constructor(
		private readonly maxConcurrent: number,
		private readonly minInterval: number
	) {}

	/** Enqueue a Binance-hitting fetch. Resolves with the fetcher's result. */
	execute<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				fn: fn as () => Promise<unknown>,
				resolve: resolve as (v: unknown) => void,
				reject
			});
			this.process();
		});
	}

	private process(): void {
		if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

		const wait = Math.max(0, this.minInterval - (Date.now() - this.lastRun));
		if (wait > 0) {
			setTimeout(() => this.process(), wait);
			return;
		}

		const item = this.queue.shift();
		if (!item) return;

		this.running++;
		this.lastRun = Date.now();

		(async () => {
			try {
				const result = await item.fn();
				item.resolve(result);
			} catch (err) {
				item.reject(err);
			} finally {
				this.running--;
				this.process();
			}
		})();
	}
}

/**
 * Singleton quota manager shared across every raw that hits a Binance
 * fapi or spot endpoint. Exported from `providers/binanceQuota.ts`
 * and wired inside `rawSources.ts`. Nothing outside the providers
 * barrel should import this directly.
 */
export const binanceQuota = new BinanceQuotaManager(8, 80);
