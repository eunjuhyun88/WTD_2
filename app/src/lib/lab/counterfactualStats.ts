/**
 * Counterfactual statistics helpers (W-0383)
 *
 * Pure, side-effect-free helpers used by both the API server and Vitest:
 *   - Welch's t-test (unequal variances) with finite-sample df.
 *   - Histogram bucketing for forward-return distributions.
 *   - Median, IQR, and P(return > 0) ("p_win") summaries.
 *
 * All functions tolerate empty input and `n < MIN_N` cases by flagging
 * `insufficient_data: true` instead of dividing by zero. The API treats this
 * as a soft "no verdict" state and the UI renders a muted badge.
 */

const MIN_N_FOR_WELCH = 30;

export interface DistributionSummary {
	n: number;
	median: number;
	iqr: [number, number];
	p_win: number;
	histogram: number[];
	mean: number;
	variance: number;
}

export interface WelchResult {
	t: number;
	p: number;
	df: number;
	insufficient_data: boolean;
}

/** Sort ascending without mutating the input. */
function sortedCopy(xs: readonly number[]): number[] {
	return xs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
}

/** Linear-interpolation quantile (NumPy `linear` method). */
export function quantile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const pos = q * (sorted.length - 1);
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo];
	const w = pos - lo;
	return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function summarize(
	values: readonly number[],
	histogramBins = 20,
	rangeOverride?: [number, number]
): DistributionSummary {
	const sorted = sortedCopy(values);
	const n = sorted.length;
	if (n === 0) {
		return {
			n: 0,
			median: 0,
			iqr: [0, 0],
			p_win: 0,
			histogram: new Array(histogramBins).fill(0),
			mean: 0,
			variance: 0,
		};
	}
	const median = quantile(sorted, 0.5);
	const iqr: [number, number] = [quantile(sorted, 0.25), quantile(sorted, 0.75)];
	const wins = sorted.filter((x) => x > 0).length;
	const p_win = wins / n;
	const mean = sorted.reduce((s, x) => s + x, 0) / n;
	const variance =
		n > 1
			? sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)
			: 0;

	const histogram = histogramOf(sorted, histogramBins, rangeOverride);
	return { n, median, iqr, p_win, histogram, mean, variance };
}

export function histogramOf(
	sortedValues: readonly number[],
	bins: number,
	rangeOverride?: [number, number]
): number[] {
	const out = new Array(Math.max(1, bins)).fill(0) as number[];
	if (sortedValues.length === 0) return out;
	const min = rangeOverride?.[0] ?? sortedValues[0];
	const max = rangeOverride?.[1] ?? sortedValues[sortedValues.length - 1];
	if (max <= min) {
		out[0] = sortedValues.length;
		return out;
	}
	const width = (max - min) / out.length;
	for (const v of sortedValues) {
		if (v < min || v > max) continue;
		const idx = Math.min(out.length - 1, Math.floor((v - min) / width));
		out[idx] += 1;
	}
	return out;
}

/**
 * Welch's t-test for difference of means with unequal variances.
 *
 * Returns NaN-safe values; if either sample has n < {@link MIN_N_FOR_WELCH}
 * or variance == 0, returns `insufficient_data: true` and t/p set to 0/1.
 *
 * The two-tailed p-value is approximated via the survival function of the
 * standard normal — adequate for df > 30 (our minimum) and avoids depending
 * on a full t-distribution implementation.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchResult {
	const aFin = a.filter((x) => Number.isFinite(x));
	const bFin = b.filter((x) => Number.isFinite(x));
	const na = aFin.length;
	const nb = bFin.length;
	if (na < MIN_N_FOR_WELCH || nb < MIN_N_FOR_WELCH) {
		return { t: 0, p: 1, df: 0, insufficient_data: true };
	}
	const meanA = aFin.reduce((s, x) => s + x, 0) / na;
	const meanB = bFin.reduce((s, x) => s + x, 0) / nb;
	const varA = aFin.reduce((s, x) => s + (x - meanA) ** 2, 0) / (na - 1);
	const varB = bFin.reduce((s, x) => s + (x - meanB) ** 2, 0) / (nb - 1);
	if (varA <= 0 || varB <= 0) {
		return { t: 0, p: 1, df: na + nb - 2, insufficient_data: true };
	}
	const se = Math.sqrt(varA / na + varB / nb);
	const t = (meanA - meanB) / se;
	const num = (varA / na + varB / nb) ** 2;
	const den = (varA / na) ** 2 / (na - 1) + (varB / nb) ** 2 / (nb - 1);
	const df = den > 0 ? num / den : na + nb - 2;
	const p = 2 * (1 - normalCdf(Math.abs(t)));
	return { t, p, df, insufficient_data: false };
}

/** Approximate Φ(z) via Abramowitz & Stegun 7.1.26 (max abs error ≈ 7.5e-8). */
function normalCdf(z: number): number {
	if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
	const sign = z < 0 ? -1 : 1;
	const x = Math.abs(z) / Math.sqrt(2);
	const t = 1 / (1 + 0.3275911 * x);
	const y =
		1 -
		(((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
			0.254829592) *
			t *
			Math.exp(-x * x);
	return 0.5 * (1 + sign * y);
}

/**
 * 95% CI of difference of medians via percentile bootstrap (R = 200).
 *
 * Bootstrap is deterministic given the seed so it is reproducible across
 * server and test runs. The seed defaults to a stable int derived from the
 * combined sample sizes — overridable for unit tests.
 */
export function bootstrapMedianDeltaCi(
	a: readonly number[],
	b: readonly number[],
	{ resamples = 200, seed }: { resamples?: number; seed?: number } = {}
): [number, number] {
	const aFin = a.filter((x) => Number.isFinite(x));
	const bFin = b.filter((x) => Number.isFinite(x));
	if (aFin.length < 2 || bFin.length < 2) return [0, 0];

	const rng = mulberry32(seed ?? aFin.length * 1009 + bFin.length * 13);
	const deltas: number[] = new Array(resamples);
	for (let r = 0; r < resamples; r += 1) {
		const sa = resample(aFin, rng);
		const sb = resample(bFin, rng);
		deltas[r] = quantile(sortedCopy(sa), 0.5) - quantile(sortedCopy(sb), 0.5);
	}
	deltas.sort((x, y) => x - y);
	return [quantile(deltas, 0.025), quantile(deltas, 0.975)];
}

function resample(xs: readonly number[], rng: () => number): number[] {
	const out = new Array(xs.length) as number[];
	for (let i = 0; i < xs.length; i += 1) {
		out[i] = xs[Math.floor(rng() * xs.length)];
	}
	return out;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const _internal = { normalCdf, mulberry32, MIN_N_FOR_WELCH };
