export type PublicRouteCacheStatus = 'hit' | 'miss' | 'coalesced';

export type PublicRouteCacheEntry<T> = {
	cachedAt: number;
	payload: T;
};

export function createSharedPublicRouteCache<T>(args: {
	scope: string;
	ttlMs: number;
	now?: () => number;
	getShared?: (scope: string, key: string) => Promise<PublicRouteCacheEntry<T> | null>;
	setShared?: (scope: string, key: string, value: PublicRouteCacheEntry<T>, ttlMs: number) => Promise<void>;
}) {
	const ttlMs = Math.max(1_000, Math.min(3_600_000, Math.trunc(args.ttlMs)));
	const now = args.now ?? (() => Date.now());
	const getSharedValue = args.getShared ?? (async (scope: string, key: string) => {
		const { getSharedCache } = await import('./sharedCache');
		return getSharedCache<PublicRouteCacheEntry<T>>(scope, key);
	});
	const setSharedValue = args.setShared ?? (async (scope: string, key: string, value: PublicRouteCacheEntry<T>, entryTtlMs: number) => {
		const { setSharedCache } = await import('./sharedCache');
		return setSharedCache(scope, key, value, entryTtlMs);
	});

	const localCache = new Map<string, PublicRouteCacheEntry<T>>();
	const inflight = new Map<string, Promise<T>>();

	function isFresh(entry: PublicRouteCacheEntry<T> | null | undefined): entry is PublicRouteCacheEntry<T> {
		if (!entry) return false;
		return now() - entry.cachedAt < ttlMs;
	}

	async function readFresh(key: string): Promise<PublicRouteCacheEntry<T> | null> {
		const local = localCache.get(key);
		if (isFresh(local)) return local;
		if (local) localCache.delete(key);

		const shared = await getSharedValue(args.scope, key);
		if (!isFresh(shared)) return null;
		localCache.set(key, shared);
		return shared;
	}

	async function write(key: string, payload: T): Promise<void> {
		const entry: PublicRouteCacheEntry<T> = {
			cachedAt: now(),
			payload,
		};
		localCache.set(key, entry);
		await setSharedValue(args.scope, key, entry, ttlMs);
	}

	async function run(
		key: string,
		builder: () => Promise<T>,
		options?: { bypassCache?: boolean },
	): Promise<{ payload: T; cacheStatus: PublicRouteCacheStatus }> {
		if (!options?.bypassCache) {
			const cached = await readFresh(key);
			if (cached) {
				return { payload: cached.payload, cacheStatus: 'hit' };
			}
		}

		const pending = inflight.get(key);
		if (pending) {
			return { payload: await pending, cacheStatus: 'coalesced' };
		}

		const job = (async () => {
			const payload = await builder();
			await write(key, payload);
			return payload;
		})().finally(() => {
			inflight.delete(key);
		});

		inflight.set(key, job);
		return { payload: await job, cacheStatus: 'miss' };
	}

	return {
		run,
		async get(key: string): Promise<T | null> {
			const entry = await readFresh(key);
			return entry?.payload ?? null;
		},
	};
}
