/**
 * Statistics primitives for the CHATBATTLE research spine.
 *
 * Pure TypeScript, zero runtime dependencies, deterministic given the same
 * input. Every function is a total function over its documented domain —
 * callers get a numeric `NaN` or a thrown error for empty inputs, never
 * undefined / silent wrong answers.
 *
 * Scope (Phase 0.5 R2):
 *   - Basic descriptive statistics
 *   - Rolling-window operations on number series
 *   - Paired bootstrap confidence intervals and effect sizes
 *   - Distribution comparison (KS, KL)
 *   - Trading-specific metrics (Sharpe, Sortino, Calmar, max drawdown)
 *
 * Out of scope: matrix ops, optimization, spectral methods, HMM/GARCH.
 * Those live in a Python worker if and when the project needs them.
 *
 * References:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R2
 */

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireNonEmpty(xs: readonly number[], label: string): void {
	if (xs.length === 0) {
		throw new Error(`${label}: input array must be non-empty`);
	}
}

function requireFinite(x: number, label: string): void {
	if (!Number.isFinite(x)) {
		throw new Error(`${label}: expected finite number, got ${x}`);
	}
}

function requireSameLength(a: readonly number[], b: readonly number[], label: string): void {
	if (a.length !== b.length) {
		throw new Error(`${label}: arrays must have the same length (got ${a.length} and ${b.length})`);
	}
}

// ---------------------------------------------------------------------------
// Basic descriptive statistics
// ---------------------------------------------------------------------------

/** Arithmetic mean. Throws on empty input. */
export function mean(xs: readonly number[]): number {
	requireNonEmpty(xs, 'mean');
	let sum = 0;
	for (const x of xs) sum += x;
	return sum / xs.length;
}

/**
 * Sample variance (Bessel-corrected, divides by n-1).
 * Returns 0 for single-element inputs by convention (not NaN).
 */
export function variance(xs: readonly number[]): number {
	requireNonEmpty(xs, 'variance');
	if (xs.length === 1) return 0;
	const m = mean(xs);
	let acc = 0;
	for (const x of xs) {
		const d = x - m;
		acc += d * d;
	}
	return acc / (xs.length - 1);
}

/** Sample standard deviation. */
export function std(xs: readonly number[]): number {
	return Math.sqrt(variance(xs));
}

/**
 * Linear-interpolation quantile (R's type 7, NumPy default).
 * `p` is a probability in [0, 1].
 */
export function quantile(xs: readonly number[], p: number): number {
	requireNonEmpty(xs, 'quantile');
	if (p < 0 || p > 1 || !Number.isFinite(p)) {
		throw new Error(`quantile: p must be in [0,1], got ${p}`);
	}
	const sorted = [...xs].sort((a, b) => a - b);
	if (sorted.length === 1) return sorted[0]!;
	const idx = p * (sorted.length - 1);
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo]!;
	const frac = idx - lo;
	return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** Median (50th percentile). */
export function median(xs: readonly number[]): number {
	return quantile(xs, 0.5);
}

/** Sum. Throws on empty input. */
export function sum(xs: readonly number[]): number {
	requireNonEmpty(xs, 'sum');
	let s = 0;
	for (const x of xs) s += x;
	return s;
}

/** Min. Throws on empty input. */
export function min(xs: readonly number[]): number {
	requireNonEmpty(xs, 'min');
	let m = Number.POSITIVE_INFINITY;
	for (const x of xs) if (x < m) m = x;
	return m;
}

/** Max. Throws on empty input. */
export function max(xs: readonly number[]): number {
	requireNonEmpty(xs, 'max');
	let m = Number.NEGATIVE_INFINITY;
	for (const x of xs) if (x > m) m = x;
	return m;
}

// ---------------------------------------------------------------------------
// Rolling-window operations
// ---------------------------------------------------------------------------
//
// All rolling ops are LEFT-ALIGNED: result[i] summarizes xs[i-w+1 .. i]. The
// first `window - 1` positions are filled with NaN so callers can slice
// them off. This keeps array indices aligned with the source series.

function validateWindow(xs: readonly number[], window: number, label: string): void {
	if (!Number.isInteger(window) || window <= 0) {
		throw new Error(`${label}: window must be a positive integer, got ${window}`);
	}
	if (window > xs.length) {
		throw new Error(
			`${label}: window (${window}) larger than input length (${xs.length})`
		);
	}
}

/** Rolling mean with left-alignment. First `window - 1` entries are NaN. */
export function rollingMean(xs: readonly number[], window: number): number[] {
	validateWindow(xs, window, 'rollingMean');
	const out = new Array<number>(xs.length);
	let acc = 0;
	for (let i = 0; i < xs.length; i++) {
		acc += xs[i]!;
		if (i >= window) acc -= xs[i - window]!;
		out[i] = i >= window - 1 ? acc / window : Number.NaN;
	}
	return out;
}

/** Rolling sample standard deviation with left-alignment. */
export function rollingStd(xs: readonly number[], window: number): number[] {
	validateWindow(xs, window, 'rollingStd');
	const out = new Array<number>(xs.length);
	// Naive O(n * w) implementation — w is small in practice
	for (let i = 0; i < xs.length; i++) {
		if (i < window - 1) {
			out[i] = Number.NaN;
			continue;
		}
		const slice = xs.slice(i - window + 1, i + 1);
		out[i] = std(slice);
	}
	return out;
}

/** Rolling quantile with left-alignment. */
export function rollingQuantile(xs: readonly number[], window: number, p: number): number[] {
	validateWindow(xs, window, 'rollingQuantile');
	const out = new Array<number>(xs.length);
	for (let i = 0; i < xs.length; i++) {
		if (i < window - 1) {
			out[i] = Number.NaN;
			continue;
		}
		const slice = xs.slice(i - window + 1, i + 1);
		out[i] = quantile(slice, p);
	}
	return out;
}

/**
 * Percentile rank of a single value against a reference distribution.
 * Returns a number in [0, 1]. Uses the "strict less than" convention —
 * the fraction of reference points strictly less than `value`.
 */
export function pctRank(reference: readonly number[], value: number): number {
	requireNonEmpty(reference, 'pctRank');
	requireFinite(value, 'pctRank');
	let less = 0;
	for (const r of reference) if (r < value) less++;
	return less / reference.length;
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random for reproducible bootstrap
// ---------------------------------------------------------------------------
//
// Mulberry32 — 32-bit state, seedable, fast, deterministic. NOT cryptographic.
// Good enough for bootstrap resampling where reproducibility matters.

export function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return function () {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------------------
// Paired bootstrap confidence intervals and effect size
// ---------------------------------------------------------------------------

export interface BootstrapResult {
	/** Point estimate of mean(a) - mean(b). */
	diffMean: number;
	/** Paired-bootstrap percentile-method 95% CI for the difference. */
	ci95: [number, number];
	/** Two-sided p-value estimate via bootstrap sign test. */
	pValue: number;
	/** Number of bootstrap resamples used. */
	iterations: number;
}

/**
 * Paired bootstrap CI for the mean difference (a - b). `a` and `b` must be
 * paired (same length, position-aligned). Seed is optional for reproducibility.
 *
 * This is the statistical primitive for "agent A vs agent B on the same
 * trajectory slice" comparisons throughout the research spine.
 */
export function pairedBootstrapCI(
	a: readonly number[],
	b: readonly number[],
	options: { iterations?: number; seed?: number; confidence?: number } = {}
): BootstrapResult {
	requireSameLength(a, b, 'pairedBootstrapCI');
	requireNonEmpty(a, 'pairedBootstrapCI');
	const n = a.length;
	const iters = options.iterations ?? 2000;
	const seed = options.seed ?? 0x9e3779b9;
	const confidence = options.confidence ?? 0.95;
	if (confidence <= 0 || confidence >= 1) {
		throw new Error(`pairedBootstrapCI: confidence must be in (0,1), got ${confidence}`);
	}

	const rng = mulberry32(seed);

	// Point estimate
	const diffs = new Array<number>(n);
	for (let i = 0; i < n; i++) diffs[i] = a[i]! - b[i]!;
	const pointEstimate = mean(diffs);

	// Resample paired differences
	const samples = new Array<number>(iters);
	let positive = 0;
	let negative = 0;
	for (let k = 0; k < iters; k++) {
		let acc = 0;
		for (let i = 0; i < n; i++) {
			const idx = Math.floor(rng() * n);
			acc += diffs[idx]!;
		}
		const m = acc / n;
		samples[k] = m;
		if (m > 0) positive++;
		else if (m < 0) negative++;
	}

	samples.sort((x, y) => x - y);
	const alpha = 1 - confidence;
	const loIdx = Math.floor((alpha / 2) * iters);
	const hiIdx = Math.min(iters - 1, Math.floor((1 - alpha / 2) * iters));
	const ci95: [number, number] = [samples[loIdx]!, samples[hiIdx]!];

	// Two-sided p-value: 2 * min(fraction > 0, fraction < 0)
	const pValue = Math.min(1, 2 * Math.min(positive / iters, negative / iters));

	return { diffMean: pointEstimate, ci95, pValue, iterations: iters };
}

/**
 * Cohen's d effect size for two independent samples. Uses the pooled
 * standard deviation. Unitless.
 *
 *   |d| ≈ 0.2 → small, 0.5 → medium, 0.8 → large (Cohen 1988).
 */
export function cohenD(a: readonly number[], b: readonly number[]): number {
	requireNonEmpty(a, 'cohenD');
	requireNonEmpty(b, 'cohenD');
	const ma = mean(a);
	const mb = mean(b);
	const va = variance(a);
	const vb = variance(b);
	const na = a.length;
	const nb = b.length;
	const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
	if (pooled === 0) return 0;
	return (ma - mb) / pooled;
}

// ---------------------------------------------------------------------------
// Distribution comparison (regime shift, pair coverage)
// ---------------------------------------------------------------------------

/**
 * Two-sample Kolmogorov-Smirnov statistic. Returns the maximum absolute
 * difference between the two empirical CDFs. Use as a distribution-shift
 * detector — larger D means more divergent distributions.
 */
export function ksStatistic(a: readonly number[], b: readonly number[]): number {
	requireNonEmpty(a, 'ksStatistic');
	requireNonEmpty(b, 'ksStatistic');
	const sa = [...a].sort((x, y) => x - y);
	const sb = [...b].sort((x, y) => x - y);
	let i = 0;
	let j = 0;
	let d = 0;
	while (i < sa.length && j < sb.length) {
		const va = sa[i]!;
		const vb = sb[j]!;
		if (va <= vb) i++;
		if (vb <= va) j++;
		const cdfA = i / sa.length;
		const cdfB = j / sb.length;
		const gap = Math.abs(cdfA - cdfB);
		if (gap > d) d = gap;
	}
	return d;
}

/**
 * Kullback-Leibler divergence KL(p || q) for two discrete distributions
 * over the same support. Both inputs should sum to ~1 and have the same
 * length. Returns the information-theoretic divergence in nats.
 *
 * Zeros in `q` corresponding to nonzero entries in `p` yield +Infinity
 * (KL convention). Zeros in `p` contribute 0 (0 · log 0 = 0 by limit).
 */
export function klDivergence(p: readonly number[], q: readonly number[]): number {
	requireSameLength(p, q, 'klDivergence');
	requireNonEmpty(p, 'klDivergence');
	let acc = 0;
	for (let i = 0; i < p.length; i++) {
		const pi = p[i]!;
		const qi = q[i]!;
		if (pi < 0 || qi < 0) {
			throw new Error('klDivergence: distributions must be non-negative');
		}
		if (pi === 0) continue;
		if (qi === 0) return Number.POSITIVE_INFINITY;
		acc += pi * Math.log(pi / qi);
	}
	return acc;
}

// ---------------------------------------------------------------------------
// Trading-specific metrics
// ---------------------------------------------------------------------------
//
// Every metric takes a `returns` series (per-period returns as fractions,
// e.g. 0.01 = 1% return). None of these annualize automatically — callers
// multiply / divide by the appropriate period factor when they know the
// series cadence.

/**
 * Sharpe ratio of a return series. Unitless. Uses sample std in the
 * denominator. Returns `0` when std is zero (no variance = no risk,
 * no defined ratio; treat as "no signal").
 */
export function sharpeRatio(returns: readonly number[], riskFreeRate = 0): number {
	requireNonEmpty(returns, 'sharpeRatio');
	const excess = returns.map((r) => r - riskFreeRate);
	const s = std(excess);
	if (s === 0) return 0;
	return mean(excess) / s;
}

/**
 * Sortino ratio — like Sharpe but only penalizes downside deviation.
 * Returns `0` when there is no downside variance (no downside risk).
 */
export function sortinoRatio(returns: readonly number[], target = 0): number {
	requireNonEmpty(returns, 'sortinoRatio');
	const excess = returns.map((r) => r - target);
	const downside = excess.filter((r) => r < 0);
	if (downside.length === 0) return 0;
	// Downside deviation: sqrt(mean(min(0, r)^2)) over ALL periods
	let sqSum = 0;
	for (const r of excess) {
		if (r < 0) sqSum += r * r;
	}
	const dd = Math.sqrt(sqSum / excess.length);
	if (dd === 0) return 0;
	return mean(excess) / dd;
}

/**
 * Max drawdown of an equity curve. Returns a non-negative number — the
 * worst peak-to-trough decline expressed as a fraction of the peak.
 *
 *   0.25 means the worst drawdown was -25% from peak.
 */
export function maxDrawdown(equityCurve: readonly number[]): number {
	requireNonEmpty(equityCurve, 'maxDrawdown');
	let peak = equityCurve[0]!;
	let maxDd = 0;
	for (const v of equityCurve) {
		if (v > peak) peak = v;
		if (peak > 0) {
			const dd = (peak - v) / peak;
			if (dd > maxDd) maxDd = dd;
		}
	}
	return maxDd;
}

/**
 * Calmar ratio — mean return divided by max drawdown. Handles the
 * `max drawdown == 0` edge case by returning `0`.
 */
export function calmarRatio(returns: readonly number[], equityCurve: readonly number[]): number {
	requireNonEmpty(returns, 'calmarRatio');
	const dd = maxDrawdown(equityCurve);
	if (dd === 0) return 0;
	return mean(returns) / dd;
}

/** Hit rate — fraction of returns strictly greater than zero. */
export function hitRate(returns: readonly number[]): number {
	requireNonEmpty(returns, 'hitRate');
	let hits = 0;
	for (const r of returns) if (r > 0) hits++;
	return hits / returns.length;
}
