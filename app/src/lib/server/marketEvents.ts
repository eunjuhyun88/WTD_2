import {
	fetchDexAdsLatest,
	fetchDexCommunityTakeoversLatest,
	fetchDexTokenBoostsLatest,
	fetchDexTokens,
} from '$lib/server/providers/dexscreener';
import {
	loadPerpContextBridge,
	summarizePerpContextBridge,
	type PerpContextBridgeHeaders,
	type PerpContextBridgeSnapshot,
} from '$lib/server/perpContextBridge';

type DexLikeRow = {
	chainId: string;
	tokenAddress: string;
};

type DexPairLike = {
	baseToken?: {
		address?: string;
		name?: string;
		symbol?: string;
	};
};

type DexTokenMeta = {
	symbol: string | null;
	name: string | null;
};

type EventDerivativesView = {
	funding: number | null;
	lsRatio: number | null;
	liqLong24h: number;
	liqShort24h: number;
	updatedAt: number;
	crowding: string | null;
};

type EventRecord = {
	id: string;
	tag: string;
	level: string;
	text: string;
	source: string;
	createdAt: number;
};

export interface MarketEventsPayload {
	pair: string;
	timeframe: string;
	records: EventRecord[];
}

export interface MarketEventsResult {
	data: MarketEventsPayload;
	headers: PerpContextBridgeHeaders;
}

function normalizeAddress(value: string): string {
	return value.trim().toLowerCase();
}

function splitChunks<T>(input: T[], size: number): T[][] {
	if (size <= 0 || input.length === 0) return [];
	const out: T[][] = [];
	for (let i = 0; i < input.length; i += size) out.push(input.slice(i, i + size));
	return out;
}

async function buildDexMetaMap(rows: DexLikeRow[]): Promise<Map<string, DexTokenMeta>> {
	const out = new Map<string, DexTokenMeta>();
	if (rows.length === 0) return out;

	const byChain = new Map<string, string[]>();
	for (const row of rows) {
		const chain = row.chainId.trim();
		if (!chain) continue;
		const bucket = byChain.get(chain) ?? [];
		if (!bucket.includes(row.tokenAddress)) bucket.push(row.tokenAddress);
		byChain.set(chain, bucket);
	}

	for (const [chainId, addresses] of byChain.entries()) {
		for (const chunk of splitChunks(addresses, 30)) {
			try {
				const payload = await fetchDexTokens(chainId, chunk.join(','));
				if (!Array.isArray(payload)) continue;
				for (const rec of payload as DexPairLike[]) {
					const tokenAddress = rec?.baseToken?.address;
					if (typeof tokenAddress !== 'string' || !tokenAddress.trim()) continue;
					const key = `${chainId}:${normalizeAddress(tokenAddress)}`;
					if (out.has(key)) continue;
					out.set(key, {
						symbol: rec?.baseToken?.symbol?.trim() || null,
						name: rec?.baseToken?.name?.trim() || null,
					});
				}
			} catch {
				// best-effort enrichment only
			}
		}
	}

	return out;
}

function compactAddress(address: string): string {
	return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function tokenLabel(chainId: string, tokenAddress: string, metaMap: Map<string, DexTokenMeta>): string {
	const meta = metaMap.get(`${chainId}:${normalizeAddress(tokenAddress)}`);
	const sym = meta?.symbol?.trim() || '';
	const name = meta?.name?.trim() || '';
	const addr = compactAddress(tokenAddress);
	const chain = chainId.toUpperCase();
	if (sym) return `${chain} ${sym} (${addr})`;
	if (name) return `${chain} ${name} (${addr})`;
	return `${chain} ${addr}`;
}

function buildDerivativesView(
	perpBridge: PerpContextBridgeSnapshot,
): EventDerivativesView | null {
	const { enginePerp, legacyDeriv } = perpBridge;
	if (!enginePerp && !legacyDeriv) return null;

	return {
		funding: enginePerp?.metrics.funding_rate ?? legacyDeriv?.funding ?? null,
		lsRatio: enginePerp?.metrics.long_short_ratio ?? legacyDeriv?.lsRatio ?? null,
		liqLong24h: legacyDeriv?.liqLong24h ?? 0,
		liqShort24h: legacyDeriv?.liqShort24h ?? 0,
		updatedAt: legacyDeriv?.updatedAt ?? Date.now(),
		crowding: enginePerp?.regime.crowding ?? null,
	};
}

export async function loadMarketEvents(
	fetchFn: typeof fetch,
	args: {
		pair: string;
		timeframe: string;
		perpBridge?: PerpContextBridgeSnapshot;
	},
): Promise<MarketEventsResult> {
	const perpBridge =
		args.perpBridge ?? (await loadPerpContextBridge(fetchFn, { pair: args.pair, timeframe: args.timeframe }));
	const [takeovers, boosts, ads] = await Promise.all([
		fetchDexCommunityTakeoversLatest(4).catch(() => []),
		fetchDexTokenBoostsLatest(4).catch(() => []),
		fetchDexAdsLatest(4).catch(() => []),
	]);
	const deriv = buildDerivativesView(perpBridge);

	const dynamic: EventRecord[] = deriv
		? [
				{
					id: `deriv-${args.pair}-${args.timeframe}`,
					tag: 'DERIV',
					level: 'warning',
					text:
						`Funding ${deriv.funding == null ? 'n/a' : (deriv.funding * 100).toFixed(4) + '%'} · ` +
						`L/S ${deriv.lsRatio == null ? 'n/a' : deriv.lsRatio.toFixed(2)} · ` +
						`Liq L/S ${Math.round(deriv.liqLong24h).toLocaleString()}/${Math.round(deriv.liqShort24h).toLocaleString()}` +
						`${deriv.crowding ? ` · ${deriv.crowding}` : ''}`,
					source: 'COINALYZE',
					createdAt: deriv.updatedAt,
				},
			]
		: [];

	const dexRows: DexLikeRow[] = [...takeovers, ...boosts, ...ads].map((row) => ({
		chainId: row.chainId,
		tokenAddress: row.tokenAddress,
	}));
	const metaMap = await buildDexMetaMap(dexRows);

	const mappedTakeovers: EventRecord[] = takeovers.map((row, idx) => ({
		id: `dex-takeover-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
		tag: 'TAKEOVER',
		level: 'warning',
		text: `${tokenLabel(row.chainId, row.tokenAddress, metaMap)} 커뮤니티 takeover 감지`,
		source: 'DEXSCREENER',
		createdAt: Date.parse(row.claimDate ?? '') || Date.now() - idx * 60_000,
	}));

	const mappedBoosts: EventRecord[] = boosts.map((row, idx) => ({
		id: `dex-boost-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
		tag: 'BOOST',
		level: 'info',
		text: `${tokenLabel(row.chainId, row.tokenAddress, metaMap)} 토큰 부스트 활동`,
		source: 'DEXSCREENER',
		createdAt: Date.now() - idx * 45_000,
	}));

	const mappedAds: EventRecord[] = ads.map((row, idx) => ({
		id: `dex-ad-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
		tag: 'ADS',
		level: 'info',
		text:
			`${tokenLabel(row.chainId, row.tokenAddress, metaMap)} ` +
			`광고 캠페인 ${row.type ?? 'unknown'}${row.impressions ? ` · imp ${Math.round(row.impressions).toLocaleString()}` : ''}`,
		source: 'DEXSCREENER',
		createdAt: Date.parse(row.date ?? '') || Date.now() - idx * 30_000,
	}));

	return {
		data: {
			pair: args.pair,
			timeframe: args.timeframe,
			records: [...dynamic, ...mappedTakeovers, ...mappedBoosts, ...mappedAds].slice(0, 24),
		},
		headers: summarizePerpContextBridge(perpBridge),
	};
}
