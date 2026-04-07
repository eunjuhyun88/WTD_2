/**
 * Cogochi Skills Registry
 * 1:1 port of cogochi/skill_registry.py
 * CoinGecko, Binance, Coinglass, Nansen 병렬 호출 + 타임아웃.
 */

import { env } from '$env/dynamic/private';
import type { SignalSnapshot, SkillLoadout, SkillResult, SkillCatalogItem } from '$lib/engine/cogochiTypes';

// ─── Registry Config ───

interface SkillConfig {
	type: string;
	baseUrl: string;
	timeoutMs: number;
	phase: number;
	auth: 'none' | 'api_key';
	envKey?: string;
	headerName?: string;
}

const SKILL_REGISTRY: Record<string, SkillConfig> = {
	coingecko_price: {
		type: 'rest',
		baseUrl: 'https://api.coingecko.com/api/v3',
		timeoutMs: 2000,
		phase: 1,
		auth: 'api_key',
		envKey: 'COINGECKO_API_KEY',
		headerName: 'x-cg-demo-api-key',
	},
	binance_market: {
		type: 'rest',
		baseUrl: 'https://fapi.binance.com',
		timeoutMs: 1500,
		phase: 1,
		auth: 'none',
	},
	coinglass_liquidation: {
		type: 'rest',
		baseUrl: 'https://open-api.coinglass.com/public/v2',
		timeoutMs: 2000,
		phase: 1,
		auth: 'api_key',
		envKey: 'COINGLASS_API_KEY',
		headerName: 'coinglassSecret',
	},
	nansen_smartmoney: {
		type: 'rest',
		baseUrl: 'https://api.nansen.ai/v1',
		timeoutMs: 3000,
		phase: 1,
		auth: 'api_key',
		envKey: 'NANSEN_API_KEY',
		headerName: 'Authorization',
	},
};

// ─── Individual Skill Callers ───

type SkillCaller = (baseUrl: string, headers: Record<string, string>, snapshot: SignalSnapshot) => Promise<Record<string, unknown>>;

async function callCoingecko(baseUrl: string, headers: Record<string, string>, snapshot: SignalSnapshot): Promise<Record<string, unknown>> {
	const symbol = (snapshot as Record<string, unknown>).symbol as string ?? 'bitcoin';
	const priceRes = await fetch(`${baseUrl}/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`, { headers });
	const priceData = await priceRes.json();

	const globalRes = await fetch(`${baseUrl}/global`, { headers });
	const globalData = (await globalRes.json()).data ?? {};

	return {
		btc_price: priceData[symbol.toLowerCase()]?.usd,
		btc_24h_change: priceData[symbol.toLowerCase()]?.usd_24h_change,
		btc_dominance: Math.round((globalData.market_cap_percentage?.btc ?? 0) * 10) / 10,
		total_market_cap_usd: globalData.total_market_cap?.usd,
	};
}

async function callBinanceMarket(baseUrl: string, _headers: Record<string, string>, snapshot: SignalSnapshot): Promise<Record<string, unknown>> {
	const symbol = (snapshot as Record<string, unknown>).symbol as string ?? 'BTCUSDT';
	const res = await fetch(`${baseUrl}/fapi/v1/depth?symbol=${symbol}&limit=20`);
	const depth = await res.json();

	const bids = (depth.bids ?? []).slice(0, 5).map((e: string[]) => [parseFloat(e[0]), parseFloat(e[1])]);
	const asks = (depth.asks ?? []).slice(0, 5).map((e: string[]) => [parseFloat(e[0]), parseFloat(e[1])]);

	const bidVol = bids.reduce((s: number, [, q]: number[]) => s + q, 0);
	const askVol = asks.reduce((s: number, [, q]: number[]) => s + q, 0);
	const depthRatio = askVol > 0 ? Math.round((bidVol / askVol) * 1000) / 1000 : 1.0;

	return {
		top_bid_price: bids[0]?.[0] ?? null,
		top_ask_price: asks[0]?.[0] ?? null,
		depth_ratio: depthRatio,
		bid_volume_5: Math.round(bidVol * 100) / 100,
		ask_volume_5: Math.round(askVol * 100) / 100,
	};
}

async function callCoinglass(baseUrl: string, headers: Record<string, string>, snapshot: SignalSnapshot): Promise<Record<string, unknown>> {
	const symbol = ((snapshot as Record<string, unknown>).symbol as string ?? 'BTCUSDT').replace('USDT', '');
	const price = snapshot.currentPrice;

	const res = await fetch(`${baseUrl}/liquidation_map?symbol=${symbol}&range=3`, { headers });
	const data = (await res.json()).data ?? {};

	const liq24h = data.liquidation24H ?? {};
	const liqMap: Array<{ price: string | number }> = data.liquidationMap ?? [];

	let nearestPct = 99.0;
	if (price && liqMap.length > 0) {
		for (const item of liqMap) {
			const itemPrice = parseFloat(String(item.price));
			if (itemPrice > 0) {
				const distPct = Math.abs(itemPrice - price) / price * 100;
				if (distPct < nearestPct) nearestPct = Math.round(distPct * 100) / 100;
			}
		}
	}

	return {
		liq_24h_long_usd: liq24h.longLiquidationUsd ?? 0,
		liq_24h_short_usd: liq24h.shortLiquidationUsd ?? 0,
		nearest_cluster_pct: nearestPct,
	};
}

async function callNansen(baseUrl: string, headers: Record<string, string>, snapshot: SignalSnapshot): Promise<Record<string, unknown>> {
	const symbol = ((snapshot as Record<string, unknown>).symbol as string ?? 'BTCUSDT').replace('USDT', '');
	const res = await fetch(`${baseUrl}/smart-money/flow?token=${symbol}&hours=24`, { headers });
	const data = (await res.json()).data ?? {};

	const netFlow = data.netFlowUsd ?? 0;
	return {
		net_flow_usd: netFlow,
		inflow_usd: data.inflowUsd ?? 0,
		outflow_usd: data.outflowUsd ?? 0,
		whale_wallets: data.activeWhaleCount ?? 0,
		direction: netFlow > 0 ? 'inflow' : 'outflow',
	};
}

const CALLERS: Record<string, SkillCaller> = {
	coingecko_price: callCoingecko,
	binance_market: callBinanceMarket,
	coinglass_liquidation: callCoinglass,
	nansen_smartmoney: callNansen,
};

// ─── Safe call with timeout (failure → null) ───

export async function callSkillSafe(
	skillId: string,
	snapshot: SignalSnapshot,
	timeoutMs?: number,
): Promise<SkillResult> {
	const config = SKILL_REGISTRY[skillId];
	if (!config) return { skillId, data: null, latencyMs: 0 };

	const caller = CALLERS[skillId];
	if (!caller) return { skillId, data: null, latencyMs: 0 };

	const effectiveTimeout = timeoutMs ?? config.timeoutMs;
	const headers: Record<string, string> = {};

	if (config.auth === 'api_key' && config.envKey) {
		const key = env[config.envKey] ?? '';
		if (key && config.headerName) {
			headers[config.headerName] = config.headerName === 'Authorization' ? `Bearer ${key}` : key;
		}
	}

	const t0 = performance.now();

	try {
		const result = await Promise.race([
			caller(config.baseUrl, headers, snapshot),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), effectiveTimeout)),
		]);
		return { skillId, data: result, latencyMs: Math.round(performance.now() - t0) };
	} catch {
		return { skillId, data: null, latencyMs: Math.round(performance.now() - t0) };
	}
}

// ─── Parallel call (battle REASON state) ───

export async function callAllParallel(
	loadout: SkillLoadout,
	snapshot: SignalSnapshot,
	budgetMs: number = 6000,
): Promise<Record<string, Record<string, unknown> | null>> {
	const enabled = getEnabledSkillIds(loadout);
	const selected = enabled.slice(0, loadout.maxSkillCallsPerTick || 3);

	if (selected.length === 0) return {};

	const tasks = selected
		.filter((id) => SKILL_REGISTRY[id])
		.map((id) => callSkillSafe(id, snapshot, SKILL_REGISTRY[id].timeoutMs));

	const results = await Promise.race([
		Promise.allSettled(tasks),
		new Promise<PromiseSettledResult<SkillResult>[]>((resolve) =>
			setTimeout(() => resolve(tasks.map(() => ({ status: 'rejected' as const, reason: 'budget_timeout' }))), budgetMs),
		),
	]);

	const out: Record<string, Record<string, unknown> | null> = {};
	results.forEach((r, i) => {
		const id = selected[i];
		if (r.status === 'fulfilled') {
			out[id] = r.value.data;
		} else {
			out[id] = null;
		}
	});
	return out;
}

function getEnabledSkillIds(loadout: SkillLoadout): string[] {
	const ds = loadout.dataSkills;
	const result: string[] = [];
	if (ds.binanceMarket) result.push('binance_market');
	if (ds.coingecko) result.push('coingecko_price');
	if (ds.coinglassLiquidation) result.push('coinglass_liquidation');
	if (ds.nansenSmartMoney) result.push('nansen_smartmoney');
	return result;
}

// ─── Skill result summarizer (for LLM context) ───

export function formatSkillResults(results: Record<string, Record<string, unknown> | null>): string {
	const lines: string[] = [];

	for (const [skillId, data] of Object.entries(results)) {
		if (!data) continue;
		lines.push(summarizeSkill(skillId, data));
	}

	return lines.length > 0 ? lines.join('\n') : '';
}

function summarizeSkill(skillId: string, data: Record<string, unknown>): string {
	if (skillId === 'coingecko_price') {
		return `coingecko: BTC $${(data.btc_price as number)?.toLocaleString()} | dom ${data.btc_dominance}% | 24h ${(data.btc_24h_change as number)?.toFixed?.(1) ?? '?'}%`;
	}
	if (skillId === 'coinglass_liquidation') {
		return `coinglass: nearest liq cluster ${(data.nearest_cluster_pct as number)?.toFixed(1)}% away | 24h long liq $${Math.round((data.liq_24h_long_usd as number ?? 0) / 1e6)}M`;
	}
	if (skillId === 'nansen_smartmoney') {
		const flow = data.net_flow_usd as number ?? 0;
		return `nansen: smart money net ${flow > 0 ? 'inflow' : 'outflow'} $${Math.round(Math.abs(flow) / 1e6)}M last 24h`;
	}
	if (skillId === 'binance_market') {
		const ratio = data.depth_ratio as number ?? 1;
		const pressure = ratio > 1.2 ? 'bid-heavy' : ratio < 0.8 ? 'ask-heavy' : 'balanced';
		return `binance: orderbook ${pressure} (ratio ${ratio.toFixed(2)}) | top ask $${(data.top_ask_price as number)?.toLocaleString()}`;
	}
	return `${skillId}: data available`;
}

// ─── Catalog (for API response) ───

const SKILL_NAMES: Record<string, string> = {
	coingecko_price: 'CoinGecko Price & Dominance',
	binance_market: 'Binance Market Intelligence',
	coinglass_liquidation: 'Coinglass Liquidation Heatmap',
	nansen_smartmoney: 'Nansen Smart Money Flow',
};

const SKILL_DESCRIPTIONS: Record<string, string> = {
	coingecko_price: 'BTC/ETH price, 24h change, market dominance',
	binance_market: 'Real-time orderbook depth, bid/ask ratio',
	coinglass_liquidation: 'Liquidation clusters, nearest level distance',
	nansen_smartmoney: 'Whale wallet flows, net inflow/outflow last 24h',
};

export function getSkillCatalog(): SkillCatalogItem[] {
	return Object.entries(SKILL_REGISTRY).map(([id, config]) => ({
		id,
		name: SKILL_NAMES[id] ?? id,
		description: SKILL_DESCRIPTIONS[id] ?? '',
		layer: 'DATA' as const,
		phase: config.phase,
		timeout_ms: config.timeoutMs,
		auth_type: config.auth.toUpperCase(),
		cost_per_call: null,
	}));
}
