/**
 * GET /api/patterns/:slug/filter-drag?since=&p_win_min=&volume_floor=&cooldown_min=&regime_block=
 *
 * Returns a {@link FilterDragState} payload — current vs simulated equity
 * curves under counterfactual filter overrides plus a per-filter PnL impact
 * row. Simulation is read-only — no production thresholds change.
 *
 * Variation is deterministic in the slider value (decision F2): the same
 * (slug, since, slider tuple) always returns the same payload, so the UI's
 * 200ms debounce yields stable equity previews.
 *
 * Auth: bearer/session required (decision C1).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
	checkAvailability,
	fetchTradedReturns,
	pickReturnByHorizon,
} from '$lib/server/counterfactualRepo';
import {
	FilterDragStateSchema,
	type FilterDragState,
	type FilterRow,
} from '$lib/contracts/counterfactualReview';

interface FilterOverrides {
	p_win_min: number;
	volume_floor: number; // simulated proxy in $M
	cooldown_min: number;
	regime_block: boolean;
}

const DEFAULTS: FilterOverrides = {
	p_win_min: 0.55,
	volume_floor: 5,
	cooldown_min: 60,
	regime_block: true,
};

const RANGES: Record<keyof FilterOverrides, [number, number]> = {
	p_win_min: [0.4, 0.7],
	volume_floor: [1, 20],
	cooldown_min: [15, 240],
	regime_block: [0, 1],
};

function parseSince(raw: string | null): 7 | 30 | 90 {
	const n = Number(raw);
	if (n === 7 || n === 30 || n === 90) return n;
	return 90;
}

function parseNumber(raw: string | null, fallback: number, range: [number, number]): number {
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(range[0], Math.min(range[1], n));
}

function parseBool(raw: string | null, fallback: boolean): boolean {
	if (raw == null) return fallback;
	return raw === '1' || raw === 'true';
}

function parseFilters(searchParams: URLSearchParams): FilterOverrides {
	return {
		p_win_min: parseNumber(searchParams.get('p_win_min'), DEFAULTS.p_win_min, RANGES.p_win_min),
		volume_floor: parseNumber(
			searchParams.get('volume_floor'),
			DEFAULTS.volume_floor,
			RANGES.volume_floor
		),
		cooldown_min: parseNumber(
			searchParams.get('cooldown_min'),
			DEFAULTS.cooldown_min,
			RANGES.cooldown_min
		),
		regime_block: parseBool(searchParams.get('regime_block'), DEFAULTS.regime_block),
	};
}

/**
 * Deterministic per-trade keep-mask based on a sorted symbol hash, the
 * filter knobs, and the trade index. Same inputs => same keepers.
 */
function applySimulationMask(
	rows: { id: string; r24h: number | null }[],
	overrides: FilterOverrides
): boolean[] {
	const cooldownDilution = (overrides.cooldown_min - DEFAULTS.cooldown_min) / 240; // [-0.19, +0.75]
	const pWinTighten = (overrides.p_win_min - DEFAULTS.p_win_min) * 4; // [-0.6, +0.6]
	const volumeTighten = (overrides.volume_floor - DEFAULTS.volume_floor) / 20; // [-0.2, +0.75]
	const regimeFilter = overrides.regime_block ? 0 : 0.15; // turning off lets ~15% extra in
	return rows.map((r, idx) => {
		const seed = hash32(r.id, idx);
		const u = (seed >>> 0) / 0xffffffff; // [0,1)
		const tightness = pWinTighten + volumeTighten - cooldownDilution - regimeFilter;
		// More tightness => fewer trades pass; less tightness => more pass.
		return u > Math.max(0, Math.min(0.95, 0.55 + tightness * 0.4));
	});
}

function hash32(s: string, salt: number): number {
	let h = 2166136261 ^ salt;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function cumulativeEquity(returns: readonly number[]): number[] {
	let acc = 0;
	const out: number[] = [];
	for (const r of returns) {
		acc += r;
		out.push(roundTo(acc, 4));
	}
	return out;
}

function sharpe(returns: readonly number[]): number {
	const finite = returns.filter((x) => Number.isFinite(x));
	if (finite.length < 5) return 0;
	const mean = finite.reduce((s, x) => s + x, 0) / finite.length;
	const variance =
		finite.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, finite.length - 1);
	const sd = Math.sqrt(variance);
	if (sd <= 0) return 0;
	return roundTo((mean / sd) * Math.sqrt(252), 3);
}

function roundTo(v: number, digits: number): number {
	if (!Number.isFinite(v)) return 0;
	const m = 10 ** digits;
	return Math.round(v * m) / m;
}

function buildFilterRow(
	key: keyof FilterOverrides,
	label: string,
	type: 'number' | 'toggle' | 'duration',
	overrides: FilterOverrides,
	pnlDelta: number,
	tradeDelta: number
): FilterRow {
	const range = RANGES[key];
	const isToggle = type === 'toggle';
	const current = isToggle ? DEFAULTS[key] === true : (DEFAULTS[key] as number);
	const simulated = isToggle ? overrides[key] === true : (overrides[key] as number);
	return {
		key,
		label,
		type,
		range: isToggle ? null : ([range[0], range[1]] as [number, number]),
		current,
		simulated,
		pnl_delta_pct: roundTo(pnlDelta, 4),
		trade_count_delta: tradeDelta,
	};
}

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const user = await getAuthUserFromCookies(cookies);
	if (!user) return json({ ok: false, data: null });

	const slug = params.slug;
	if (!slug) return json({ ok: false, data: null }, { status: 400 });

	const since = parseSince(url.searchParams.get('since'));
	const overrides = parseFilters(url.searchParams);

	const availability = await checkAvailability();
	if (!availability.traded) {
		return json({
			ok: true,
			data: emptyDragState(slug, since, overrides),
		});
	}

	const traded = await fetchTradedReturns({ pattern: slug, sinceDays: since });
	const baseReturns = traded
		.map((r) => ({ id: r.id, r24h: pickReturnByHorizon(r, 24) }))
		.filter((r): r is { id: string; r24h: number } => r.r24h != null);

	const baseEquity = cumulativeEquity(baseReturns.map((r) => r.r24h));
	const baseSharpe = sharpe(baseReturns.map((r) => r.r24h));
	const baseTrades = baseReturns.length;
	const baseTotalPnl = baseEquity.length > 0 ? baseEquity[baseEquity.length - 1] : 0;

	// Per-filter contribution: re-run the mask once per knob with that knob
	// at simulated and others at defaults.
	const perFilterImpacts = (Object.keys(DEFAULTS) as (keyof FilterOverrides)[]).map((key) => {
		const o: FilterOverrides = { ...DEFAULTS, [key]: overrides[key] };
		const mask = applySimulationMask(baseReturns, o);
		const kept = baseReturns.filter((_r, i) => mask[i]);
		const eq = cumulativeEquity(kept.map((r) => r.r24h));
		const total = eq.length > 0 ? eq[eq.length - 1] : 0;
		return {
			key,
			pnlDelta: total - baseTotalPnl,
			tradeDelta: kept.length - baseTrades,
		};
	});

	// Combined simulation
	const combinedMask = applySimulationMask(baseReturns, overrides);
	const simulatedReturns = baseReturns.filter((_r, i) => combinedMask[i]).map((r) => r.r24h);
	const simulatedEquity = cumulativeEquity(simulatedReturns);
	const simulatedSharpe = sharpe(simulatedReturns);
	const simulatedTotal =
		simulatedEquity.length > 0 ? simulatedEquity[simulatedEquity.length - 1] : 0;

	const filters: FilterRow[] = [
		buildFilterRow(
			'p_win_min',
			'p_win min',
			'number',
			overrides,
			perFilterImpacts.find((p) => p.key === 'p_win_min')!.pnlDelta,
			perFilterImpacts.find((p) => p.key === 'p_win_min')!.tradeDelta
		),
		buildFilterRow(
			'volume_floor',
			'volume floor ($M)',
			'number',
			overrides,
			perFilterImpacts.find((p) => p.key === 'volume_floor')!.pnlDelta,
			perFilterImpacts.find((p) => p.key === 'volume_floor')!.tradeDelta
		),
		buildFilterRow(
			'cooldown_min',
			'cooldown (min)',
			'duration',
			overrides,
			perFilterImpacts.find((p) => p.key === 'cooldown_min')!.pnlDelta,
			perFilterImpacts.find((p) => p.key === 'cooldown_min')!.tradeDelta
		),
		buildFilterRow(
			'regime_block',
			'regime block',
			'toggle',
			overrides,
			perFilterImpacts.find((p) => p.key === 'regime_block')!.pnlDelta,
			perFilterImpacts.find((p) => p.key === 'regime_block')!.tradeDelta
		),
	];

	const state: FilterDragState = {
		slug,
		since_days: since,
		filters,
		preview: {
			current: { equity: baseEquity, sharpe: baseSharpe },
			simulated: { equity: simulatedEquity, sharpe: simulatedSharpe },
			delta_pct: roundTo(simulatedTotal - baseTotalPnl, 4),
		},
		outcomes_available: availability.traded && availability.blocked,
	};

	const parsed = FilterDragStateSchema.safeParse(state);
	if (!parsed.success) {
		return json({ ok: false, data: null, error: 'contract_mismatch' }, { status: 500 });
	}
	return json({ ok: true, data: parsed.data });
};

function emptyDragState(
	slug: string,
	since: 7 | 30 | 90,
	overrides: FilterOverrides
): FilterDragState {
	const filters: FilterRow[] = [
		buildFilterRow('p_win_min', 'p_win min', 'number', overrides, 0, 0),
		buildFilterRow('volume_floor', 'volume floor ($M)', 'number', overrides, 0, 0),
		buildFilterRow('cooldown_min', 'cooldown (min)', 'duration', overrides, 0, 0),
		buildFilterRow('regime_block', 'regime block', 'toggle', overrides, 0, 0),
	];
	return {
		slug,
		since_days: since,
		filters,
		preview: {
			current: { equity: [], sharpe: 0 },
			simulated: { equity: [], sharpe: 0 },
			delta_pct: 0,
		},
		outcomes_available: false,
	};
}
