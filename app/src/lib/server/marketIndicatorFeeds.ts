import { getChartSeries } from '$lib/server/chart/chartSeriesService';

type FetchLike = typeof fetch;
type CacheStatus = 'hit' | 'miss';
type CacheStatusWithEmpty = CacheStatus | 'empty';

interface CachedEntry<T> {
	at: number;
	payload: T;
}

interface LoaderResult<T, S extends string = CacheStatus> {
	payload: T;
	cacheStatus: S;
}

async function fetchJson<T>(url: string, userAgent: string, timeoutMs: number): Promise<T | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
			headers: { 'User-Agent': userAgent },
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export interface VenueSeriesRowWire {
	venue: string;
	label: string;
	current: number;
	sparkline?: number[];
	highlight?: boolean;
}

export interface VenueDivergencePayload {
	symbol: string;
	at: number;
	oi: VenueSeriesRowWire[];
	funding: VenueSeriesRowWire[];
}

const VENUE_CACHE_TTL_MS = 30_000;
const venueCache = new Map<string, CachedEntry<VenueDivergencePayload>>();
const VENUE_TIMEOUT_MS = 5_000;

interface BinanceOIPoint {
	timestamp: number;
	sumOpenInterestValue: string;
	sumOpenInterest: string;
}

interface BinanceFunding {
	lastFundingRate: string;
}

interface BybitOIResp {
	result?: { list?: Array<{ timestamp: string; openInterest: string }> };
}

interface BybitTickerResp {
	result?: { list?: Array<{ fundingRate: string }> };
}

interface OkxOIResp {
	data?: Array<[string, string, string]>;
}

interface OkxFundingResp {
	data?: Array<{ fundingRate: string }>;
}

async function loadBinanceVenue(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
	const [oiHist, funding] = await Promise.all([
		fetchJson<BinanceOIPoint[]>(
			`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=12`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
		fetchJson<BinanceFunding>(
			`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
	]);

	const hist = Array.isArray(oiHist) ? oiHist : [];
	const vals = hist
		.map((point) => Number(point.sumOpenInterestValue || point.sumOpenInterest || 0))
		.filter((value) => Number.isFinite(value) && value > 0);
	const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
	const fundingRate = funding?.lastFundingRate ? Number(funding.lastFundingRate) : null;

	return {
		oiDelta,
		funding: Number.isFinite(fundingRate ?? NaN) ? fundingRate : null,
		oiSpark: vals,
	};
}

async function loadBybitVenue(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
	const [oiResp, tickerResp] = await Promise.all([
		fetchJson<BybitOIResp>(
			`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=12`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
		fetchJson<BybitTickerResp>(
			`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
	]);

	const list = oiResp?.result?.list ?? [];
	const vals = list
		.map((point) => Number(point.openInterest))
		.filter((value) => Number.isFinite(value) && value > 0)
		.reverse();
	const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
	const fundingRate = tickerResp?.result?.list?.[0]?.fundingRate
		? Number(tickerResp.result.list[0].fundingRate)
		: null;

	return {
		oiDelta,
		funding: Number.isFinite(fundingRate ?? NaN) ? fundingRate : null,
		oiSpark: vals,
	};
}

async function loadOkxVenue(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
	const base = symbol.replace(/USDT$/, '');
	const instId = `${base}-USDT-SWAP`;
	const [oiHist, funding] = await Promise.all([
		fetchJson<OkxOIResp>(
			`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1H&limit=12`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
		fetchJson<OkxFundingResp>(
			`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
			'cogochi-terminal/venue-divergence',
			VENUE_TIMEOUT_MS,
		),
	]);

	const rows = oiHist?.data ?? [];
	const vals = rows
		.map((row) => Number(row?.[1]))
		.filter((value) => Number.isFinite(value) && value > 0)
		.reverse();
	const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
	const fundingRate = funding?.data?.[0]?.fundingRate ? Number(funding.data[0].fundingRate) : null;

	return {
		oiDelta,
		funding: Number.isFinite(fundingRate ?? NaN) ? fundingRate : null,
		oiSpark: vals,
	};
}

async function buildVenueDivergencePayload(symbol: string): Promise<VenueDivergencePayload> {
	const [binance, bybit, okx] = await Promise.all([
		loadBinanceVenue(symbol),
		loadBybitVenue(symbol),
		loadOkxVenue(symbol),
	]);

	const oiRows: VenueSeriesRowWire[] = [];
	if (binance.oiDelta != null) {
		oiRows.push({ venue: 'binance', label: 'Binance', current: binance.oiDelta, sparkline: binance.oiSpark });
	}
	if (bybit.oiDelta != null) {
		oiRows.push({ venue: 'bybit', label: 'Bybit', current: bybit.oiDelta, sparkline: bybit.oiSpark });
	}
	if (okx.oiDelta != null) {
		oiRows.push({ venue: 'okx', label: 'OKX', current: okx.oiDelta, sparkline: okx.oiSpark });
	}

	if (oiRows.length >= 2) {
		const maxAbs = Math.max(...oiRows.map((row) => Math.abs(row.current)));
		const minAbs = Math.min(...oiRows.map((row) => Math.abs(row.current)));
		if (maxAbs - minAbs > 0.03) {
			const leader = oiRows.reduce((left, right) =>
				Math.abs(right.current) > Math.abs(left.current) ? right : left,
			);
			leader.highlight = true;
		}
	}

	const fundingRows: VenueSeriesRowWire[] = [];
	if (binance.funding != null) {
		fundingRows.push({ venue: 'binance', label: 'Binance', current: binance.funding });
	}
	if (bybit.funding != null) {
		fundingRows.push({ venue: 'bybit', label: 'Bybit', current: bybit.funding });
	}
	if (okx.funding != null) {
		fundingRows.push({ venue: 'okx', label: 'OKX', current: okx.funding });
	}

	if (fundingRows.length >= 2) {
		const sorted = [...fundingRows].sort((left, right) => left.current - right.current);
		const spread = sorted[sorted.length - 1].current - sorted[0].current;
		if (spread > 0.0003) {
			const leader = fundingRows.reduce((left, right) =>
				Math.abs(right.current) > Math.abs(left.current) ? right : left,
			);
			leader.highlight = true;
		}
	}

	return {
		symbol,
		at: Date.now(),
		oi: oiRows,
		funding: fundingRows,
	};
}

export async function loadVenueDivergence(symbol: string): Promise<LoaderResult<VenueDivergencePayload>> {
	const cached = venueCache.get(symbol);
	if (cached && Date.now() - cached.at < VENUE_CACHE_TTL_MS) {
		return { payload: cached.payload, cacheStatus: 'hit' };
	}

	const payload = await buildVenueDivergencePayload(symbol);
	venueCache.set(symbol, { at: Date.now(), payload });
	return { payload, cacheStatus: 'miss' };
}

export interface SsrPayload {
	at: number;
	current: number;
	percentile: number;
	sparkline: number[];
	regime: 'dry_powder_high' | 'dry_powder_low' | 'neutral';
}

const SSR_CACHE_TTL_MS = 30 * 60_000;
const SSR_TIMEOUT_MS = 10_000;
let ssrCache: CachedEntry<SsrPayload> | null = null;

interface LlamaPoint {
	date: number | string;
	totalCirculatingUSD?: { peggedUSD?: number };
}

interface CoinGeckoChart {
	market_caps?: Array<[number, number]>;
}

function percentileOf(value: number, series: number[]): number {
	const sorted = [...series].filter((entry) => Number.isFinite(entry)).sort((left, right) => left - right);
	if (!sorted.length) return 50;
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] <= value) lo = mid + 1;
		else hi = mid;
	}
	return Math.max(0, Math.min(100, (lo / sorted.length) * 100));
}

export async function loadStablecoinSsr(): Promise<LoaderResult<SsrPayload>> {
	if (ssrCache && Date.now() - ssrCache.at < SSR_CACHE_TTL_MS) {
		return { payload: ssrCache.payload, cacheStatus: 'hit' };
	}

	const [llamaHist, btcChart] = await Promise.all([
		fetchJson<LlamaPoint[]>(
			'https://stablecoins.llama.fi/stablecoincharts/all',
			'cogochi-terminal/ssr',
			SSR_TIMEOUT_MS,
		),
		fetchJson<CoinGeckoChart>(
			'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=180&interval=daily',
			'cogochi-terminal/ssr',
			SSR_TIMEOUT_MS,
		),
	]);

	if (!Array.isArray(llamaHist) || !btcChart?.market_caps?.length) {
		throw new Error('upstream_unavailable');
	}

	const stablecoinByDay = new Map<string, number>();
	for (const point of llamaHist) {
		const ts = typeof point.date === 'string' ? Number(point.date) : point.date;
		if (!Number.isFinite(ts)) continue;
		const marketCap = point.totalCirculatingUSD?.peggedUSD;
		if (!Number.isFinite(marketCap ?? NaN) || (marketCap ?? 0) <= 0) continue;
		const dayKey = new Date((ts as number) * 1000).toISOString().slice(0, 10);
		stablecoinByDay.set(dayKey, marketCap!);
	}

	const btcByDay = new Map<string, number>();
	for (const [ts, marketCap] of btcChart.market_caps) {
		if (!Number.isFinite(marketCap) || marketCap <= 0) continue;
		const dayKey = new Date(ts).toISOString().slice(0, 10);
		btcByDay.set(dayKey, marketCap);
	}

	const ssrSeries: Array<{ day: string; ssr: number }> = [];
	const sortedDays = [...btcByDay.keys()].sort();
	for (const day of sortedDays) {
		const btcMcap = btcByDay.get(day);
		const stableMcap = stablecoinByDay.get(day);
		if (btcMcap && stableMcap && stableMcap > 0) {
			ssrSeries.push({ day, ssr: btcMcap / stableMcap });
		}
	}

	if (ssrSeries.length < 30) {
		throw new Error('insufficient_history');
	}

	const current = ssrSeries[ssrSeries.length - 1].ssr;
	const last30 = ssrSeries.slice(-30).map((point) => point.ssr);
	const percentile = percentileOf(current, last30);
	const sparkline = ssrSeries.slice(-60).map((point) => point.ssr);

	let regime: SsrPayload['regime'];
	if (percentile <= 25) regime = 'dry_powder_high';
	else if (percentile >= 75) regime = 'dry_powder_low';
	else regime = 'neutral';

	const payload: SsrPayload = {
		at: Date.now(),
		current,
		percentile,
		sparkline,
		regime,
	};

	ssrCache = { at: Date.now(), payload };
	return { payload, cacheStatus: 'miss' };
}

export interface FundingFlipPayload {
	symbol: string;
	at: number;
	currentRate: number;
	previousRate: number;
	flippedAt: number | null;
	persistedHours: number;
	direction: 'pos_to_neg' | 'neg_to_pos' | 'persisted';
	consecutiveIntervals: number;
}

const FUNDING_FLIP_CACHE_TTL_MS = 10 * 60_000;
const FUNDING_FLIP_TIMEOUT_MS = 8_000;
const fundingFlipCache = new Map<string, CachedEntry<FundingFlipPayload>>();

interface BinanceFundingPoint {
	fundingTime: number;
	fundingRate: string;
}

function fundingSign(value: number): 1 | -1 | 0 {
	if (value > 0) return 1;
	if (value < 0) return -1;
	return 0;
}

export async function loadFundingFlip(symbol: string): Promise<LoaderResult<FundingFlipPayload>> {
	const cached = fundingFlipCache.get(symbol);
	if (cached && Date.now() - cached.at < FUNDING_FLIP_CACHE_TTL_MS) {
		return { payload: cached.payload, cacheStatus: 'hit' };
	}

	const hist = await fetchJson<BinanceFundingPoint[]>(
		`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=250`,
		'cogochi-terminal/funding-flip',
		FUNDING_FLIP_TIMEOUT_MS,
	);

	if (!Array.isArray(hist) || hist.length < 10) {
		throw new Error('upstream_unavailable');
	}

	const sorted = [...hist].sort((left, right) => left.fundingTime - right.fundingTime);
	const rates = sorted.map((point) => ({ ts: point.fundingTime, rate: Number(point.fundingRate) }));
	const currentRate = rates[rates.length - 1].rate;
	const currentSign = fundingSign(currentRate);

	let flipIdx = -1;
	for (let i = rates.length - 2; i >= 0; i -= 1) {
		const sign = fundingSign(rates[i].rate);
		if (sign !== 0 && currentSign !== 0 && sign !== currentSign) {
			flipIdx = i;
			break;
		}
	}

	let payload: FundingFlipPayload;
	if (flipIdx === -1 || currentSign === 0) {
		payload = {
			symbol,
			at: Date.now(),
			currentRate,
			previousRate: rates[0].rate,
			flippedAt: null,
			persistedHours: (rates[rates.length - 1].ts - rates[0].ts) / 3_600_000,
			direction: 'persisted',
			consecutiveIntervals: rates.length,
		};
	} else {
		const flipPoint = rates[flipIdx];
		const firstAfterFlipTs = rates[flipIdx + 1]?.ts ?? rates[rates.length - 1].ts;
		payload = {
			symbol,
			at: Date.now(),
			currentRate,
			previousRate: flipPoint.rate,
			flippedAt: firstAfterFlipTs,
			persistedHours: Math.max(0, (rates[rates.length - 1].ts - firstAfterFlipTs) / 3_600_000),
			direction: currentSign > 0 ? 'neg_to_pos' : 'pos_to_neg',
			consecutiveIntervals: rates.length - 1 - flipIdx,
		};
	}

	fundingFlipCache.set(symbol, { at: Date.now(), payload });
	return { payload, cacheStatus: 'miss' };
}

export interface RvConePayload {
	symbol: string;
	at: number;
	windows: number[];
	current: Record<string, number>;
	cone: Record<string, { min: number; p10: number; p50: number; p90: number; max: number }>;
	percentile: Record<string, number>;
}

const RV_CONE_CACHE_TTL_MS = 60 * 60_000;
const RV_CONE_TIMEOUT_MS = 10_000;
const RV_WINDOWS = [7, 14, 30, 60, 90];
const rvConeCache = new Map<string, CachedEntry<RvConePayload>>();

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

function annualizedRv(logReturns: number[]): number {
	if (logReturns.length < 2) return 0;
	const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
	const variance = logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logReturns.length - 1);
	return Math.sqrt(variance) * Math.sqrt(365);
}

function rollingRvSeries(logReturns: number[], window: number): number[] {
	const out: number[] = [];
	for (let i = window; i <= logReturns.length; i += 1) {
		out.push(annualizedRv(logReturns.slice(i - window, i)));
	}
	return out;
}

function quantile(sorted: number[], q: number): number {
	if (!sorted.length) return 0;
	const idx = Math.floor((sorted.length - 1) * q);
	return sorted[idx];
}

export async function loadRvCone(symbol: string): Promise<LoaderResult<RvConePayload>> {
	const cached = rvConeCache.get(symbol);
	if (cached && Date.now() - cached.at < RV_CONE_CACHE_TTL_MS) {
		return { payload: cached.payload, cacheStatus: 'hit' };
	}

	const klines = await fetchJson<BinanceKline[]>(
		`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=180`,
		'cogochi-terminal/rv-cone',
		RV_CONE_TIMEOUT_MS,
	);

	if (!Array.isArray(klines) || klines.length < 100) {
		throw new Error('upstream_unavailable');
	}

	const closes = klines.map((kline) => Number(kline[4])).filter((value) => Number.isFinite(value) && value > 0);
	const logReturns: number[] = [];
	for (let i = 1; i < closes.length; i += 1) {
		logReturns.push(Math.log(closes[i] / closes[i - 1]));
	}

	const current: Record<string, number> = {};
	const cone: RvConePayload['cone'] = {};
	const percentile: Record<string, number> = {};

	for (const window of RV_WINDOWS) {
		if (logReturns.length < window + 5) continue;
		const series = rollingRvSeries(logReturns, window);
		if (!series.length) continue;
		const currentValue = series[series.length - 1];
		const sorted = [...series].sort((left, right) => left - right);
		current[String(window)] = currentValue;
		cone[String(window)] = {
			min: sorted[0],
			p10: quantile(sorted, 0.1),
			p50: quantile(sorted, 0.5),
			p90: quantile(sorted, 0.9),
			max: sorted[sorted.length - 1],
		};
		let lo = 0;
		let hi = sorted.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sorted[mid] <= currentValue) lo = mid + 1;
			else hi = mid;
		}
		percentile[String(window)] = Math.max(0, Math.min(100, (lo / sorted.length) * 100));
	}

	const payload: RvConePayload = {
		symbol,
		at: Date.now(),
		windows: RV_WINDOWS,
		current,
		cone,
		percentile,
	};

	rvConeCache.set(symbol, { at: Date.now(), payload });
	return { payload, cacheStatus: 'miss' };
}

export interface HeatmapCellWire {
	priceBucket: number;
	timeBucket: number;
	intensity: number;
	side?: 'long' | 'short';
	venue?: string;
}

export interface LiqClusterPayload {
	symbol: string;
	at: number;
	window: string;
	cells: HeatmapCellWire[];
	bounds: { priceMin: number; priceMax: number; tMin: number; tMax: number };
	currentPrice: number | null;
}

const LIQ_CLUSTER_CACHE_TTL_MS = 30_000;
const liqClusterCache = new Map<string, CachedEntry<LiqClusterPayload>>();

export async function loadLiqClusters(args: {
	symbol: string;
	window: string;
	fetchImpl?: FetchLike;
}): Promise<LoaderResult<LiqClusterPayload, CacheStatusWithEmpty>> {
	const windowParam = args.window.toLowerCase();
	const cacheKey = `${args.symbol}|${windowParam}`;
	const cached = liqClusterCache.get(cacheKey);
	if (cached && Date.now() - cached.at < LIQ_CLUSTER_CACHE_TTL_MS) {
		return { payload: cached.payload, cacheStatus: 'hit' };
	}

	const tf = windowParam === '1h' ? '5m' : windowParam === '4h' ? '15m' : '1h';
	let feed: Awaited<ReturnType<typeof getChartSeries>>['payload'] | null = null;

	try {
		const result = await getChartSeries({
			symbol: args.symbol,
			tf,
			limit: 120,
			fetchImpl: args.fetchImpl,
		});
		feed = result.payload;
	} catch {
		feed = null;
	}

	const klines = feed?.klines ?? [];
	const liqBars = feed?.liqBars ?? [];
	const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : null;

	if (!klines.length || !liqBars.length) {
		return {
			payload: {
				symbol: args.symbol,
				at: Date.now(),
				window: windowParam,
				cells: [],
				bounds: { priceMin: 0, priceMax: 0, tMin: 0, tMax: 0 },
				currentPrice,
			},
			cacheStatus: 'empty',
		};
	}

	const klineByTime = new Map(klines.map((kline) => [kline.time, kline]));
	const cells: HeatmapCellWire[] = [];

	for (const liqBar of liqBars) {
		const kline = klineByTime.get(liqBar.time);
		if (!kline) continue;
		const range = kline.high - kline.low || kline.close * 0.001;
		const longPositions = [0.1, 0.25, 0.4];
		const shortPositions = [0.6, 0.75, 0.9];
		const longSplit = [0.5, 0.3, 0.2];
		const shortSplit = [0.2, 0.3, 0.5];

		longPositions.forEach((position, index) => {
			if (liqBar.longUsd <= 0) return;
			const price = kline.low + range * (position - 0.5) * 0.3;
			cells.push({
				priceBucket: Math.round(price),
				timeBucket: liqBar.time,
				intensity: liqBar.longUsd * longSplit[index],
				side: 'long',
				venue: 'binance',
			});
		});

		shortPositions.forEach((position, index) => {
			if (liqBar.shortUsd <= 0) return;
			const price = kline.high + range * (position - 0.5) * 0.3;
			cells.push({
				priceBucket: Math.round(price),
				timeBucket: liqBar.time,
				intensity: liqBar.shortUsd * shortSplit[index],
				side: 'short',
				venue: 'binance',
			});
		});
	}

	const payload: LiqClusterPayload = {
		symbol: args.symbol,
		at: Date.now(),
		window: windowParam,
		cells,
		bounds: {
			priceMin: cells.length ? Math.min(...cells.map((cell) => cell.priceBucket)) : 0,
			priceMax: cells.length ? Math.max(...cells.map((cell) => cell.priceBucket)) : 0,
			tMin: cells.length ? Math.min(...cells.map((cell) => cell.timeBucket)) : 0,
			tMax: cells.length ? Math.max(...cells.map((cell) => cell.timeBucket)) : 0,
		},
		currentPrice,
	};

	liqClusterCache.set(cacheKey, { at: Date.now(), payload });
	return { payload, cacheStatus: 'miss' };
}

export interface OptionsSnapshotPayload {
	currency: string;
	at: number;
	underlyingPrice: number;
	totalOI: { call: number; put: number; total: number };
	totalVolume24h: { call: number; put: number };
	putCallRatioOi: number;
	putCallRatioVol: number;
	skew25d: number;
	atmIvNearTerm: number;
	counts: {
		callStrikes: number;
		putStrikes: number;
		nearTermInstruments: number;
	};
	expiries: Array<{
		expiry: string;
		daysToExpiry: number;
		callOi: number;
		putOi: number;
		atmIv: number | null;
	}>;
	gamma: {
		pinLevel: number | null;
		pinDistancePct: number | null;
		maxPain: number | null;
		maxPainDistancePct: number | null;
		pinDirection: 'above' | 'below' | 'at' | null;
	};
}

const OPTIONS_CACHE_TTL_MS = 5 * 60_000;
const OPTIONS_TIMEOUT_MS = 10_000;
const optionsCache = new Map<string, CachedEntry<OptionsSnapshotPayload>>();

interface DeribitInstrument {
	instrument_name: string;
	mark_iv?: number | null;
	open_interest?: number | null;
	volume?: number | null;
	volume_usd?: number | null;
	underlying_price?: number | null;
	mark_price?: number | null;
}

interface DeribitResponse {
	result?: DeribitInstrument[];
}

function parseInstrument(name: string): {
	expiryStr: string;
	expiryTs: number;
	strike: number;
	type: 'C' | 'P';
} | null {
	const parts = name.split('-');
	if (parts.length !== 4) return null;
	const [, expiryStr, strikeStr, typeStr] = parts;
	const type = typeStr === 'C' || typeStr === 'P' ? typeStr : null;
	if (!type) return null;
	const strike = Number(strikeStr);
	if (!Number.isFinite(strike)) return null;

	const match = expiryStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
	if (!match) return null;

	const [, ddStr, monthText, yyStr] = match;
	const monthMap: Record<string, number> = {
		JAN: 0,
		FEB: 1,
		MAR: 2,
		APR: 3,
		MAY: 4,
		JUN: 5,
		JUL: 6,
		AUG: 7,
		SEP: 8,
		OCT: 9,
		NOV: 10,
		DEC: 11,
	};
	const month = monthMap[monthText];
	if (month == null) return null;

	const year = 2000 + Number(yyStr);
	const day = Number(ddStr);
	const expiryTs = Date.UTC(year, month, day, 8, 0, 0);
	return { expiryStr, expiryTs, strike, type };
}

export async function loadOptionsSnapshot(currency: string): Promise<LoaderResult<OptionsSnapshotPayload>> {
	const cached = optionsCache.get(currency);
	if (cached && Date.now() - cached.at < OPTIONS_CACHE_TTL_MS) {
		return { payload: cached.payload, cacheStatus: 'hit' };
	}

	const data = await fetchJson<DeribitResponse>(
		`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
		'cogochi-terminal/options',
		OPTIONS_TIMEOUT_MS,
	);
	const instruments = data?.result ?? [];
	if (!instruments.length) {
		throw new Error('upstream_unavailable');
	}

	const underlyingPrice = instruments.find((inst) => Number.isFinite(inst.underlying_price))?.underlying_price ?? 0;
	if (!underlyingPrice) {
		throw new Error('no_underlying');
	}

	const now = Date.now();
	let callOi = 0;
	let putOi = 0;
	let callVol = 0;
	let putVol = 0;
	let callStrikes = 0;
	let putStrikes = 0;

	const byExpiry = new Map<string, {
		expiryStr: string;
		expiryTs: number;
		callOi: number;
		putOi: number;
		atmIvSum: number;
		atmIvCount: number;
	}>();

	let nearTermPutIvSum = 0;
	let nearTermPutIvCount = 0;
	let nearTermCallIvSum = 0;
	let nearTermCallIvCount = 0;
	let atmIvSum = 0;
	let atmIvCount = 0;
	let nearTermInstruments = 0;

	const strikeAgg = new Map<number, { call: number; put: number }>();

	for (const inst of instruments) {
		const parsed = parseInstrument(inst.instrument_name);
		if (!parsed) continue;

		const oi = Number(inst.open_interest) || 0;
		const vol = Number(inst.volume) || 0;
		const iv = Number(inst.mark_iv);

		if (parsed.type === 'C') {
			callOi += oi;
			callVol += vol;
			if (oi > 0) callStrikes += 1;
		} else {
			putOi += oi;
			putVol += vol;
			if (oi > 0) putStrikes += 1;
		}

		const expiryKey = parsed.expiryStr;
		if (!byExpiry.has(expiryKey)) {
			byExpiry.set(expiryKey, {
				expiryStr: parsed.expiryStr,
				expiryTs: parsed.expiryTs,
				callOi: 0,
				putOi: 0,
				atmIvSum: 0,
				atmIvCount: 0,
			});
		}

		const expiry = byExpiry.get(expiryKey)!;
		if (parsed.type === 'C') expiry.callOi += oi;
		else expiry.putOi += oi;

		const daysToExpiry = (parsed.expiryTs - now) / 86_400_000;
		if (daysToExpiry < 1) continue;

		const moneyness = parsed.strike / underlyingPrice;
		const isAtm = moneyness >= 0.95 && moneyness <= 1.05;
		if (isAtm && Number.isFinite(iv) && iv > 0) {
			expiry.atmIvSum += iv;
			expiry.atmIvCount += 1;
			if (daysToExpiry < 60) {
				atmIvSum += iv;
				atmIvCount += 1;
			}
		}

		if (daysToExpiry < 60 && daysToExpiry > 3 && Number.isFinite(iv) && iv > 0) {
			nearTermInstruments += 1;
			if (parsed.type === 'P' && moneyness >= 0.87 && moneyness <= 0.93) {
				nearTermPutIvSum += iv;
				nearTermPutIvCount += 1;
			}
			if (parsed.type === 'C' && moneyness >= 1.07 && moneyness <= 1.13) {
				nearTermCallIvSum += iv;
				nearTermCallIvCount += 1;
			}
		}

		if (daysToExpiry <= 45 && moneyness >= 0.8 && moneyness <= 1.2 && oi > 0) {
			const strike = strikeAgg.get(parsed.strike) ?? { call: 0, put: 0 };
			if (parsed.type === 'C') strike.call += oi;
			else strike.put += oi;
			strikeAgg.set(parsed.strike, strike);
		}
	}

	const putCallRatioOi = callOi > 0 ? putOi / callOi : 0;
	const putCallRatioVol = callVol > 0 ? putVol / callVol : 0;
	const avgPutIv = nearTermPutIvCount > 0 ? nearTermPutIvSum / nearTermPutIvCount : 0;
	const avgCallIv = nearTermCallIvCount > 0 ? nearTermCallIvSum / nearTermCallIvCount : 0;
	const skew25d = avgPutIv && avgCallIv ? avgPutIv - avgCallIv : 0;
	const atmIvNearTerm = atmIvCount > 0 ? atmIvSum / atmIvCount : 0;

	let pinLevel: number | null = null;
	let maxCombinedOi = 0;
	for (const [strike, values] of strikeAgg) {
		const combined = values.call + values.put;
		const moneyness = strike / underlyingPrice;
		const centeringWeight = 1 - Math.min(0.5, Math.abs(moneyness - 1));
		const weighted = combined * centeringWeight;
		if (weighted > maxCombinedOi) {
			maxCombinedOi = weighted;
			pinLevel = strike;
		}
	}

	let maxPain: number | null = null;
	let minPainValue = Infinity;
	const strikes = [...strikeAgg.keys()].sort((left, right) => left - right);
	for (const candidate of strikes) {
		let totalPayout = 0;
		for (const [strike, values] of strikeAgg) {
			if (candidate > strike) totalPayout += (candidate - strike) * values.call;
			if (candidate < strike) totalPayout += (strike - candidate) * values.put;
		}
		if (totalPayout < minPainValue) {
			minPainValue = totalPayout;
			maxPain = candidate;
		}
	}

	const pinDistancePct = pinLevel != null
		? ((pinLevel - underlyingPrice) / underlyingPrice) * 100
		: null;
	const maxPainDistancePct = maxPain != null
		? ((maxPain - underlyingPrice) / underlyingPrice) * 100
		: null;
	const pinDirection: 'above' | 'below' | 'at' | null = pinLevel == null
		? null
		: Math.abs(pinDistancePct!) < 0.1
			? 'at'
			: pinDistancePct! > 0
				? 'above'
				: 'below';

	const expiries = [...byExpiry.values()]
		.filter((bucket) => bucket.expiryTs > now)
		.sort((left, right) => left.expiryTs - right.expiryTs)
		.slice(0, 3)
		.map((bucket) => ({
			expiry: bucket.expiryStr,
			daysToExpiry: Math.max(0, (bucket.expiryTs - now) / 86_400_000),
			callOi: bucket.callOi,
			putOi: bucket.putOi,
			atmIv: bucket.atmIvCount ? bucket.atmIvSum / bucket.atmIvCount : null,
		}));

	const payload: OptionsSnapshotPayload = {
		currency,
		at: now,
		underlyingPrice,
		totalOI: { call: callOi, put: putOi, total: callOi + putOi },
		totalVolume24h: { call: callVol, put: putVol },
		putCallRatioOi,
		putCallRatioVol,
		skew25d,
		atmIvNearTerm,
		counts: { callStrikes, putStrikes, nearTermInstruments },
		gamma: {
			pinLevel,
			pinDistancePct,
			maxPain,
			maxPainDistancePct,
			pinDirection,
		},
		expiries,
	};

	optionsCache.set(currency, { at: now, payload });
	return { payload, cacheStatus: 'miss' };
}
