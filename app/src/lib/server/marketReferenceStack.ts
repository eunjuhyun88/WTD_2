import { env } from '$env/dynamic/private';
import type { ChainIntelPayload, ChainIntelProviderState } from '$lib/contracts/chainIntel';
import { fetchChainIntel } from '$lib/server/chainIntel';
import { fetchDefiLlamaStableMcap } from '$lib/server/defillama';
import {
	fetchActiveAddresses,
	fetchDexVolume24hUsd,
	fetchExchangeBalance,
	fetchWhaleActivity,
	hasDuneKey,
} from '$lib/server/dune';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchFredMacroData, hasFredKey } from '$lib/server/fred';
import { getHotCached } from '$lib/server/hotCache';
import { fetchCoinGeckoGlobal, fetchStablecoinMcap } from '$lib/server/providers/coingecko';
import { isPlaceholderSecret } from '$lib/server/runtimeSecurity';
import { fetchYahooSeries } from '$lib/server/yahooFinance';
import {
	getMarketReferenceSources,
	type MarketReferenceSource,
} from './marketReferenceSources';

const MARKET_REFERENCE_STACK_TTL_MS = 60_000;
const COINGLASS_BASE = 'https://open-api-v4.coinglass.com';
const ROOTDATA_BASE = 'https://api.rootdata.com';
const TOKENOMIST_BASE = 'https://api.unlocks.app';
const AIRDROPS_URL = 'https://airdrops.io';
const YAHOO_SPX_SYMBOL = '^GSPC';
const YAHOO_DXY_SYMBOL = 'DX-Y.NYB';
const BTC_LAST_HALVING_ISO = '2024-04-20';
const BTC_NEXT_HALVING_BLOCK = 1_050_000;

const DOCS = {
	macromicro: 'https://api.macromicro.me/v1/docs',
	coinglass: 'https://docs.coinglass.com',
	rootdata: 'https://docs.rootdata.com',
	tokenomist: 'https://docs.tokenomist.ai',
	arkham: 'https://docs.intel.arkm.com',
	airdrops: 'https://airdrops.io',
};

type ReferenceEntity = 'token' | 'account';
export type MarketReferenceStackStatus = 'live' | 'blocked' | 'reference_only';

export interface MarketReferenceStackQuery {
	symbol: string;
	baseAsset: string;
	coinId: string;
	exchange: string;
	chain: string;
	entity: ReferenceEntity;
	address: string | null;
	chainId: string | null;
	rootDataQuery: string;
	unlockWindowDays: number;
}

export interface MarketReferenceStackCollector {
	provider: string;
	docUrl?: string;
	requiresApiKey?: boolean;
	envKey?: string;
	usingFallback?: boolean;
}

export interface MarketReferenceStackEntry extends MarketReferenceSource {
	status: MarketReferenceStackStatus;
	collector: MarketReferenceStackCollector;
	updatedAt: number | null;
	detail: string;
	payload: unknown | null;
}

export interface MarketReferenceStackPayload {
	ok: true;
	at: number;
	query: MarketReferenceStackQuery;
	coverage: {
		total: number;
		live: number;
		blocked: number;
		referenceOnly: number;
	};
	entries: MarketReferenceStackEntry[];
}

export interface MarketReferenceStackAgentLine {
	id: string;
	name: string;
	status: MarketReferenceStackStatus;
	detail: string;
}

export interface MarketReferenceStackAgentContext {
	at: number;
	coverage: MarketReferenceStackPayload['coverage'];
	live: MarketReferenceStackAgentLine[];
	blocked: MarketReferenceStackAgentLine[];
	referenceOnly: MarketReferenceStackAgentLine[];
}

interface LoadMarketReferenceStackArgs {
	symbol?: string | null;
	coinId?: string | null;
	exchange?: string | null;
	chain?: string | null;
	entity?: ReferenceEntity | null;
	address?: string | null;
	chainId?: string | null;
	rootDataQuery?: string | null;
	unlockWindowDays?: number | null;
}

function isUsableApiKey(value: string | undefined, minLength = 8): boolean {
	const normalized = value?.trim() ?? '';
	return normalized.length >= minLength && !isPlaceholderSecret(normalized);
}

function normalizeSymbol(value: string | null | undefined): string {
	const raw = (value ?? 'BTCUSDT').trim().toUpperCase();
	if (!raw) return 'BTCUSDT';
	if (!/^[A-Z0-9]{2,20}$/.test(raw)) return raw;
	for (const quote of ['USDT', 'USDC', 'USD', 'BTC', 'ETH']) {
		if (raw.endsWith(quote) && raw.length > quote.length) return raw;
	}
	return `${raw}USDT`;
}

function baseAssetFromSymbol(symbol: string): string {
	for (const quote of ['USDT', 'USDC', 'USD', 'BTC', 'ETH']) {
		if (symbol.endsWith(quote) && symbol.length > quote.length) {
			return symbol.slice(0, -quote.length);
		}
	}
	return symbol;
}

function defaultCoinId(baseAsset: string): string {
	const known: Record<string, string> = {
		BTC: 'bitcoin',
		ETH: 'ethereum',
		SOL: 'solana',
		TRX: 'tron',
		BNB: 'binancecoin',
		XRP: 'ripple',
		ADA: 'cardano',
		AVAX: 'avalanche-2',
		DOGE: 'dogecoin',
		LINK: 'chainlink',
		ARB: 'arbitrum',
	};
	return known[baseAsset] ?? baseAsset.toLowerCase();
}

function defaultRootDataQuery(baseAsset: string, coinId: string): string {
	const known: Record<string, string> = {
		BTC: 'Bitcoin',
		ETH: 'Ethereum',
		SOL: 'Solana',
		TRX: 'Tron',
		BNB: 'BNB Chain',
		XRP: 'XRP',
	};
	return known[baseAsset] ?? coinId.replace(/-/g, ' ');
}

function defaultChain(baseAsset: string): string {
	if (baseAsset === 'SOL') return 'solana';
	if (baseAsset === 'TRX') return 'tron';
	return 'ethereum';
}

function defaultEntity(chain: string): ReferenceEntity {
	return chain === 'solana' ? 'token' : 'account';
}

function normalizeExchange(value: string | null | undefined): string {
	const raw = (value ?? '').trim().toLowerCase();
	const known: Record<string, string> = {
		binance: 'Binance',
		bybit: 'Bybit',
		okx: 'OKX',
		coinbase: 'Coinbase',
		deribit: 'Deribit',
	};
	return known[raw] ?? 'Binance';
}

function toBoundedDays(value: number | null | undefined, fallback = 30): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.min(90, Math.trunc(parsed)));
}

function normalizeQuery(args: LoadMarketReferenceStackArgs): MarketReferenceStackQuery {
	const symbol = normalizeSymbol(args.symbol);
	const baseAsset = baseAssetFromSymbol(symbol);
	const coinId = (args.coinId?.trim() || defaultCoinId(baseAsset)).toLowerCase();
	const chain = (args.chain?.trim() || defaultChain(baseAsset)).toLowerCase();
	return {
		symbol,
		baseAsset,
		coinId,
		exchange: normalizeExchange(args.exchange),
		chain,
		entity: args.entity ?? defaultEntity(chain),
		address: args.address?.trim() || null,
		chainId: args.chainId?.trim() || null,
		rootDataQuery: args.rootDataQuery?.trim() || defaultRootDataQuery(baseAsset, coinId),
		unlockWindowDays: toBoundedDays(args.unlockWindowDays),
	};
}

function cacheKeyForQuery(query: MarketReferenceStackQuery): string {
	return [
		query.symbol,
		query.coinId,
		query.exchange,
		query.chain,
		query.entity,
		query.address ?? 'default',
		query.chainId ?? 'default',
		query.rootDataQuery,
		query.unlockWindowDays,
	].join(':');
}

function buildEntry(
	source: MarketReferenceSource,
	overrides: Omit<MarketReferenceStackEntry, keyof MarketReferenceSource>,
): MarketReferenceStackEntry {
	return {
		...source,
		...overrides,
	};
}

function blockedEntry(
	source: MarketReferenceSource,
	detail: string,
	collector: MarketReferenceStackCollector,
	payload: unknown | null = null,
): MarketReferenceStackEntry {
	return buildEntry(source, {
		status: 'blocked',
		collector,
		updatedAt: null,
		detail,
		payload,
	});
}

function referenceOnlyEntry(source: MarketReferenceSource, detail: string): MarketReferenceStackEntry {
	return buildEntry(source, {
		status: 'reference_only',
		collector: {
			provider: 'manual_reference',
			docUrl: source.url,
		},
		updatedAt: null,
		detail,
		payload: null,
	});
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
	return result.status === 'fulfilled' ? result.value : null;
}

function latestUpdatedAt(values: Array<number | null | undefined>): number | null {
	const live = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
	return live.length ? Math.max(...live) : null;
}

function decodeHtml(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

function isoDateOffset(days: number): string {
	const at = new Date();
	at.setUTCDate(at.getUTCDate() + days);
	return at.toISOString().slice(0, 10);
}

function countCoverage(entries: MarketReferenceStackEntry[]) {
	return {
		total: entries.length,
		live: entries.filter((entry) => entry.status === 'live').length,
		blocked: entries.filter((entry) => entry.status === 'blocked').length,
		referenceOnly: entries.filter((entry) => entry.status === 'reference_only').length,
	};
}

function compactDetail(detail: string, limit = 120): string {
	const normalized = detail.replace(/\s+/g, ' ').trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function toAgentLine(entry: MarketReferenceStackEntry): MarketReferenceStackAgentLine {
	return {
		id: entry.id,
		name: entry.name,
		status: entry.status,
		detail: compactDetail(entry.detail),
	};
}

export function toMarketReferenceStackAgentContext(
	payload: MarketReferenceStackPayload,
	maxPerStatus = 4,
): MarketReferenceStackAgentContext {
	const limit = Math.max(1, Math.trunc(maxPerStatus));
	return {
		at: payload.at,
		coverage: payload.coverage,
		live: payload.entries.filter((entry) => entry.status === 'live').slice(0, limit).map(toAgentLine),
		blocked: payload.entries.filter((entry) => entry.status === 'blocked').slice(0, limit).map(toAgentLine),
		referenceOnly: payload.entries.filter((entry) => entry.status === 'reference_only').slice(0, limit).map(toAgentLine),
	};
}

export function formatMarketReferenceStackForPrompt(
	payload: MarketReferenceStackPayload,
	maxPerStatus = 3,
): string {
	const compact = toMarketReferenceStackAgentContext(payload, maxPerStatus);
	const lines: string[] = [
		`coverage: live ${compact.coverage.live}/${compact.coverage.total}, blocked ${compact.coverage.blocked}, manual ${compact.coverage.referenceOnly}`,
	];

	if (compact.live.length > 0) {
		lines.push('live:');
		for (const item of compact.live) {
			lines.push(`- ${item.name}: ${item.detail}`);
		}
	}
	if (compact.blocked.length > 0) {
		lines.push('blocked:');
		for (const item of compact.blocked) {
			lines.push(`- ${item.name}: ${item.detail}`);
		}
	}
	if (compact.referenceOnly.length > 0) {
		lines.push('manual_only:');
		for (const item of compact.referenceOnly) {
			lines.push(`- ${item.name}: ${item.detail}`);
		}
	}

	lines.push('Use live sources as evidence. Treat blocked/manual entries as missing coverage, not confirmed signal.');
	return lines.join('\n');
}

function providerStatesLive(providers: Record<string, ChainIntelProviderState> | undefined): boolean {
	if (!providers) return false;
	return Object.values(providers).some((provider) => provider?.status === 'live' || provider?.status === 'partial');
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<any | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			...init,
			signal: ctrl.signal,
			headers: {
				Accept: 'application/json',
				...(init?.headers ?? {}),
			},
		});
		if (!response.ok) return null;
		return response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			signal: ctrl.signal,
			headers: { Accept: 'text/html,application/xhtml+xml' },
		});
		if (!response.ok) return null;
		return response.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function fetchCoinGlassPack(query: MarketReferenceStackQuery): Promise<Record<string, unknown> | null> {
	const apiKey = env.COINGLASS_API_KEY?.trim() ?? '';
	if (!isUsableApiKey(apiKey, 12)) return null;

	const headers = { 'CG-API-KEY': apiKey };
	const encodedExchange = encodeURIComponent(query.exchange);
	const encodedSymbol = encodeURIComponent(query.symbol);
	const [liquidationHistory, liquidationMap, longShortRatio] = await Promise.allSettled([
		fetchJson(
			`${COINGLASS_BASE}/api/futures/liquidation/history?exchange=${encodedExchange}&symbol=${encodedSymbol}&interval=1d&limit=7`,
			{ headers },
		),
		fetchJson(
			`${COINGLASS_BASE}/api/futures/liquidation/map?exchange=${encodedExchange}&symbol=${encodedSymbol}&range=1d`,
			{ headers },
		),
		fetchJson(
			`${COINGLASS_BASE}/api/futures/global-long-short-account-ratio/history?exchange=${encodedExchange}&symbol=${encodedSymbol}&interval=4h&limit=12`,
			{ headers },
		),
	]);

	const payload = {
		exchange: query.exchange,
		symbol: query.symbol,
		liquidationHistory: settledValue(liquidationHistory)?.data ?? settledValue(liquidationHistory),
		liquidationMap: settledValue(liquidationMap)?.data ?? settledValue(liquidationMap),
		longShortRatio: settledValue(longShortRatio)?.data ?? settledValue(longShortRatio),
	};

	return payload.liquidationHistory || payload.liquidationMap || payload.longShortRatio ? payload : null;
}

async function postRootData(path: string, body: Record<string, unknown>): Promise<any | null> {
	const apiKey = env.ROOTDATA_API_KEY?.trim() ?? '';
	if (!isUsableApiKey(apiKey, 8)) return null;
	const payload = await fetchJson(`${ROOTDATA_BASE}${path}`, {
		method: 'POST',
		headers: {
			apikey: apiKey,
			'api-key': apiKey,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	if (!payload) return null;
	if (payload?.result != null && Number(payload.result) !== 200) return null;
	return payload?.data ?? null;
}

function pickRootDataProject(searchResults: unknown[]): Record<string, unknown> | null {
	const list = searchResults.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
	return list.find((row) => Number(row.type) === 1) ?? list[0] ?? null;
}

async function fetchRootDataPack(query: MarketReferenceStackQuery): Promise<Record<string, unknown> | null> {
	const searchResults = await postRootData('/open/ser_inv', {
		query: query.rootDataQuery,
		precise_x_search: false,
	});
	const matches = Array.isArray(searchResults) ? searchResults : [];
	const project = pickRootDataProject(matches);
	const projectId = project?.id;
	const projectDetail =
		projectId != null
			? await postRootData('/open/get_item', {
					project_id: projectId,
					include_team: false,
					include_investors: true,
				})
			: null;

	if (!matches.length && !projectDetail) return null;

	return {
		query: query.rootDataQuery,
		matches: matches.slice(0, 5),
		projectId: projectId ?? null,
		project: projectDetail,
	};
}

async function fetchTokenomistPack(query: MarketReferenceStackQuery): Promise<Record<string, unknown> | null> {
	const apiKey = env.TOKENOMIST_API_KEY?.trim() ?? '';
	if (!isUsableApiKey(apiKey, 12)) return null;

	const headers = { 'x-api-key': apiKey };
	const tokenList = await fetchJson(`${TOKENOMIST_BASE}/v1/token/list`, { headers });
	const listData: unknown[] = Array.isArray(tokenList?.data)
		? tokenList.data
		: Array.isArray(tokenList)
			? tokenList
			: [];
	const matchedToken =
		listData.find((row) => {
			if (!row || typeof row !== 'object') return false;
			const item = row as Record<string, unknown>;
			const symbol = String(item.symbol ?? item.tokenSymbol ?? '').toUpperCase();
			const slug = String(item.slug ?? item.token_slug ?? '').toLowerCase();
			const name = String(item.name ?? item.tokenName ?? '').toLowerCase();
			return symbol === query.baseAsset || slug === query.coinId || name === query.coinId;
		}) ?? null;

	const qs = new URLSearchParams({
		minUnlockDate: isoDateOffset(0),
		maxUnlockDate: isoDateOffset(query.unlockWindowDays),
		minMarketCap: '100000000',
		minTotalUnlockAmount: '1000000',
	});
	const upcoming = await fetchJson(`${TOKENOMIST_BASE}/v1/unlock/events/upcoming?${qs.toString()}`, {
		headers,
	});
	const upcomingData: unknown[] = Array.isArray(upcoming?.data)
		? upcoming.data
		: Array.isArray(upcoming)
			? upcoming
			: [];

	const matchedTokenId = matchedToken && typeof matchedToken === 'object'
		? (matchedToken as Record<string, unknown>).id ?? (matchedToken as Record<string, unknown>).tokenId ?? null
		: null;
	const fundraising = matchedTokenId
		? await fetchJson(`${TOKENOMIST_BASE}/v1/fundraising/token/${matchedTokenId}`, { headers })
		: null;

	const matchingAssetUnlocks = upcomingData.filter((row) => {
		if (!row || typeof row !== 'object') return false;
		const item = row as Record<string, unknown>;
		const symbol = String(item.symbol ?? item.tokenSymbol ?? '').toUpperCase();
		const tokenId = String(item.tokenId ?? item.id ?? '');
		return symbol === query.baseAsset || (matchedTokenId != null && tokenId === String(matchedTokenId));
	});

	if (!upcomingData.length && !matchedToken) return null;

	return {
		window: {
			from: isoDateOffset(0),
			to: isoDateOffset(query.unlockWindowDays),
		},
		token: matchedToken,
		marketWideTopUnlocks: upcomingData.slice(0, 10),
		matchingAssetUnlocks: matchingAssetUnlocks.slice(0, 5),
		fundraising: fundraising?.data ?? fundraising ?? null,
	};
}

async function fetchAirdropsPreview(): Promise<Record<string, unknown> | null> {
	const html = await fetchText(AIRDROPS_URL);
	if (!html) return null;

	const matches = [
		...html.matchAll(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis),
	];
	const campaigns = matches
		.map((match) => ({
			url: match[1],
			title: decodeHtml(match[2].replace(/<[^>]+>/g, '')),
		}))
		.filter((item) => item.url && item.title)
		.slice(0, 6);

	return campaigns.length ? { campaigns } : null;
}

function cycleClock() {
	const lastHalvingAt = Date.parse(`${BTC_LAST_HALVING_ISO}T00:00:00Z`);
	return {
		lastHalvingDate: BTC_LAST_HALVING_ISO,
		nextHalvingTargetBlock: BTC_NEXT_HALVING_BLOCK,
		daysSinceLastHalving: Math.max(0, Math.floor((Date.now() - lastHalvingAt) / 86_400_000)),
	};
}

async function loadMacroMicroEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	const [fred, spx, dxy] = await Promise.allSettled([
		hasFredKey() ? fetchFredMacroData() : Promise.resolve(null),
		fetchYahooSeries(YAHOO_SPX_SYMBOL, '1mo', '1d'),
		fetchYahooSeries(YAHOO_DXY_SYMBOL, '1mo', '1d'),
	]);

	const fredData = settledValue(fred);
	const spxData = settledValue(spx);
	const dxyData = settledValue(dxy);
	if (!fredData && !spxData && !dxyData) {
		return blockedEntry(
			source,
			'Macro proxy fetch failed. Configure FRED_API_KEY or restore Yahoo market access for the fallback pack.',
			{
				provider: 'fred+yahoo',
				docUrl: DOCS.macromicro,
				usingFallback: true,
				requiresApiKey: false,
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'fred+yahoo',
			docUrl: DOCS.macromicro,
			usingFallback: true,
			requiresApiKey: false,
		},
		updatedAt: latestUpdatedAt([fredData?.updatedAt, spxData?.updatedAt, dxyData?.updatedAt]),
		detail: hasFredKey()
			? `MacroMicro-equivalent regime pack is live for ${query.baseAsset} using FRED core series plus Yahoo benchmark markets.`
			: `MacroMicro-equivalent regime pack is live via Yahoo benchmarks. Add FRED_API_KEY for rate, CPI, and M2 context.`,
		payload: {
			fred: fredData,
			benchmarks: {
				spx: spxData,
				dxy: dxyData,
			},
		},
	});
}

async function loadFuckBtcEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	const [fearGreed, btcExchangeBalance, whaleActivity] = await Promise.allSettled([
		fetchFearGreed(30),
		hasDuneKey() ? fetchExchangeBalance('BTC') : Promise.resolve(null),
		hasDuneKey() ? fetchWhaleActivity() : Promise.resolve(null),
	]);
	const fearGreedData = settledValue(fearGreed);
	const current = fearGreedData?.current ?? null;
	const balance = settledValue(btcExchangeBalance);
	const whales = settledValue(whaleActivity);
	if (!current && balance == null && whales == null) {
		return blockedEntry(
			source,
			'Cycle pack fetch failed. Alternative fear/greed and Dune enrichment were both unavailable.',
			{
				provider: hasDuneKey() ? 'alternative_me+dune' : 'alternative_me',
				usingFallback: true,
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: hasDuneKey() ? 'alternative_me+dune' : 'alternative_me',
			usingFallback: true,
		},
		updatedAt: latestUpdatedAt([current?.timestampMs, Date.now()]),
		detail: hasDuneKey()
			? `BTC cycle pack is live for ${query.baseAsset}: fear/greed, post-halving clock, and Dune exchange-balance enrichment.`
			: `BTC cycle pack is live for ${query.baseAsset}: fear/greed and halving clock. Add DUNE_API_KEY for exchange-balance enrichment.`,
		payload: {
			fearGreed: fearGreedData,
			halving: cycleClock(),
			btcExchangeBalance: balance,
			whaleActivity24h: whales,
		},
	});
}

async function loadRootDataEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	if (!isUsableApiKey(env.ROOTDATA_API_KEY, 8)) {
		return blockedEntry(source, 'ROOTDATA_API_KEY is missing or placeholder-like.', {
			provider: 'rootdata',
			docUrl: DOCS.rootdata,
			requiresApiKey: true,
			envKey: 'ROOTDATA_API_KEY',
		});
	}

	const payload = await fetchRootDataPack(query);
	if (!payload) {
		return blockedEntry(
			source,
			`RootData fetch failed for "${query.rootDataQuery}". Verify the API key and query coverage.`,
			{
				provider: 'rootdata',
				docUrl: DOCS.rootdata,
				requiresApiKey: true,
				envKey: 'ROOTDATA_API_KEY',
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'rootdata',
			docUrl: DOCS.rootdata,
			requiresApiKey: true,
			envKey: 'ROOTDATA_API_KEY',
		},
		updatedAt: Date.now(),
		detail: `RootData venture and fundraising context is live for "${query.rootDataQuery}".`,
		payload,
	});
}

async function loadCoinGlassEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	if (!isUsableApiKey(env.COINGLASS_API_KEY, 12)) {
		return blockedEntry(source, 'COINGLASS_API_KEY is missing or placeholder-like.', {
			provider: 'coinglass',
			docUrl: DOCS.coinglass,
			requiresApiKey: true,
			envKey: 'COINGLASS_API_KEY',
		});
	}

	const payload = await fetchCoinGlassPack(query);
	if (!payload) {
		return blockedEntry(
			source,
			`CoinGlass fetch failed for ${query.exchange} ${query.symbol}. Verify the API key and pair support.`,
			{
				provider: 'coinglass',
				docUrl: DOCS.coinglass,
				requiresApiKey: true,
				envKey: 'COINGLASS_API_KEY',
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'coinglass',
			docUrl: DOCS.coinglass,
			requiresApiKey: true,
			envKey: 'COINGLASS_API_KEY',
		},
		updatedAt: Date.now(),
		detail: `CoinGlass derivatives crowding pack is live for ${query.exchange} ${query.symbol}.`,
		payload,
	});
}

async function loadDefiLlamaEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	const [stablecoinMcap, dexVolume24hUsd] = await Promise.allSettled([
		fetchDefiLlamaStableMcap(),
		hasDuneKey() ? fetchDexVolume24hUsd() : Promise.resolve(null),
	]);
	const stablecoinData = settledValue(stablecoinMcap);
	const dexVolume = settledValue(dexVolume24hUsd);
	if (!stablecoinData && dexVolume == null) {
		return blockedEntry(source, 'DeFiLlama fallback pack is unavailable.', {
			provider: hasDuneKey() ? 'defillama+dune' : 'defillama',
			docUrl: 'https://defillama.com',
		});
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: hasDuneKey() ? 'defillama+dune' : 'defillama',
			docUrl: 'https://defillama.com',
		},
		updatedAt: latestUpdatedAt([stablecoinData?.updatedAt, Date.now()]),
		detail: hasDuneKey()
			? `DeFiLlama liquidity baseline is live with Dune DEX-volume enrichment for ${query.baseAsset}.`
			: `DeFiLlama liquidity baseline is live. Add DUNE_API_KEY for DEX-volume enrichment.`,
		payload: {
			stablecoinMcap: stablecoinData,
			dexVolume24hUsd: dexVolume,
		},
	});
}

async function loadDuneEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	if (!hasDuneKey()) {
		return blockedEntry(source, 'DUNE_API_KEY is missing or placeholder-like.', {
			provider: 'dune',
			requiresApiKey: true,
			envKey: 'DUNE_API_KEY',
		});
	}

	const [btcExchangeBalance, ethExchangeBalance, whaleActivity, activeAddresses, dexVolume24hUsd] =
		await Promise.allSettled([
			fetchExchangeBalance('BTC'),
			fetchExchangeBalance('ETH'),
			fetchWhaleActivity(),
			fetchActiveAddresses(),
			fetchDexVolume24hUsd(),
		]);

	const payload = {
		btcExchangeBalance: settledValue(btcExchangeBalance),
		ethExchangeBalance: settledValue(ethExchangeBalance),
		whaleActivity24h: settledValue(whaleActivity),
		activeAddresses: settledValue(activeAddresses),
		dexVolume24hUsd: settledValue(dexVolume24hUsd),
	};
	if (
		payload.btcExchangeBalance == null &&
		payload.ethExchangeBalance == null &&
		payload.whaleActivity24h == null &&
		payload.activeAddresses == null &&
		payload.dexVolume24hUsd == null
	) {
		return blockedEntry(source, `Dune query pack returned no usable rows for ${query.baseAsset}.`, {
			provider: 'dune',
			requiresApiKey: true,
			envKey: 'DUNE_API_KEY',
		});
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'dune',
			requiresApiKey: true,
			envKey: 'DUNE_API_KEY',
		},
		updatedAt: Date.now(),
		detail: `Dune on-chain pack is live for ${query.baseAsset}.`,
		payload,
	});
}

async function loadTokenomistEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	if (!isUsableApiKey(env.TOKENOMIST_API_KEY, 12)) {
		return blockedEntry(source, 'TOKENOMIST_API_KEY is missing or placeholder-like.', {
			provider: 'tokenomist',
			docUrl: DOCS.tokenomist,
			requiresApiKey: true,
			envKey: 'TOKENOMIST_API_KEY',
		});
	}

	const payload = await fetchTokenomistPack(query);
	if (!payload) {
		return blockedEntry(
			source,
			`Tokenomist fetch failed for ${query.baseAsset}. Verify the API key and unlock coverage.`,
			{
				provider: 'tokenomist',
				docUrl: DOCS.tokenomist,
				requiresApiKey: true,
				envKey: 'TOKENOMIST_API_KEY',
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'tokenomist',
			docUrl: DOCS.tokenomist,
			requiresApiKey: true,
			envKey: 'TOKENOMIST_API_KEY',
		},
		updatedAt: Date.now(),
		detail: `Token unlock pack is live for ${query.baseAsset} over the next ${query.unlockWindowDays} days.`,
		payload,
	});
}

async function loadArkhamEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	let payload: ChainIntelPayload | null = null;
	try {
		payload = await fetchChainIntel({
			chain: query.chain,
			entity: query.entity,
			address: query.address,
			chainId: query.chainId,
		});
	} catch {
		payload = null;
	}

	if (!payload || !providerStatesLive(payload.providers as Record<string, ChainIntelProviderState> | undefined)) {
		return blockedEntry(
			source,
			`Smart-money fallback is unavailable for ${query.chain}/${query.entity}. Direct Arkham API remains gated and the canonical chain-intel fallback returned no live providers.`,
			{
				provider: 'chain-intel',
				docUrl: DOCS.arkham,
				usingFallback: true,
			},
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'chain-intel',
			docUrl: DOCS.arkham,
			usingFallback: true,
		},
		updatedAt: payload.at,
		detail: `Arkham-equivalent wallet lane is live via the canonical chain-intel fallback for ${query.chain}/${query.entity}.`,
		payload,
	});
}

async function loadAirdropsEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	const payload = await fetchAirdropsPreview();
	if (!payload) {
		return referenceOnlyEntry(
			source,
			`Airdrops.io has no stable official API. Homepage scrape is currently unavailable, so this source stays manual-only for ${query.baseAsset}.`,
		);
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'html_scrape',
			docUrl: DOCS.airdrops,
			usingFallback: true,
		},
		updatedAt: Date.now(),
		detail: `Airdrop opportunity preview is live via homepage scrape for ${query.baseAsset}.`,
		payload,
	});
}

async function loadCoinGeckoEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	const [global, stablecoinMcap] = await Promise.allSettled([
		fetchCoinGeckoGlobal(),
		fetchStablecoinMcap(),
	]);
	const globalData = settledValue(global);
	const stablecoinData = settledValue(stablecoinMcap);
	if (!globalData && !stablecoinData) {
		return blockedEntry(source, `CoinGecko market pack is unavailable for ${query.baseAsset}.`, {
			provider: 'coingecko',
			docUrl: 'https://coingecko.com',
		});
	}

	return buildEntry(source, {
		status: 'live',
		collector: {
			provider: 'coingecko',
			docUrl: 'https://coingecko.com',
		},
		updatedAt: latestUpdatedAt([globalData?.updatedAt, stablecoinData?.updatedAt]),
		detail: `CoinGecko market-cap and baseline pricing pack is live for ${query.baseAsset}.`,
		payload: {
			global: globalData,
			stablecoins: stablecoinData,
		},
	});
}

async function loadReferenceEntry(
	source: MarketReferenceSource,
	query: MarketReferenceStackQuery,
): Promise<MarketReferenceStackEntry> {
	try {
		switch (source.id) {
			case 'macromicro':
				return loadMacroMicroEntry(source, query);
			case 'fuckbtc':
				return loadFuckBtcEntry(source, query);
			case 'rootdata':
				return loadRootDataEntry(source, query);
			case 'coinglass':
				return loadCoinGlassEntry(source, query);
			case 'defillama':
				return loadDefiLlamaEntry(source, query);
			case 'dune':
				return loadDuneEntry(source, query);
			case 'tokenomist':
				return loadTokenomistEntry(source, query);
			case 'arkham-intel':
				return loadArkhamEntry(source, query);
			case 'airdrops-io':
				return loadAirdropsEntry(source, query);
			case 'coingecko':
				return loadCoinGeckoEntry(source, query);
			default:
				return referenceOnlyEntry(source, 'No live loader is configured for this reference source.');
		}
	} catch (error) {
		console.error(`[market/reference-stack/${source.id}]`, error);
		return blockedEntry(source, 'The reference-stack loader crashed for this source.', {
			provider: source.id,
			docUrl: source.url,
		});
	}
}

export async function loadMarketReferenceStack(
	args: LoadMarketReferenceStackArgs = {},
): Promise<MarketReferenceStackPayload> {
	const query = normalizeQuery(args);
	return getHotCached(`market-reference-stack:${cacheKeyForQuery(query)}`, MARKET_REFERENCE_STACK_TTL_MS, async () => {
		const sources = getMarketReferenceSources();
		const entries = await Promise.all(sources.map((source) => loadReferenceEntry(source, query)));
		return {
			ok: true as const,
			at: Date.now(),
			query,
			coverage: countCoverage(entries),
			entries,
		};
	});
}
