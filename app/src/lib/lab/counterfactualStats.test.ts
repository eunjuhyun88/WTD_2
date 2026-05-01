/**
 * W-0383 — Welch t-test, summary, and histogram unit tests.
 *
 * Exit Criteria reference: ≥ 5 known-distribution Welch cases.
 */

import { describe, expect, it } from 'vitest';
import {
	bootstrapMedianDeltaCi,
	histogramOf,
	quantile,
	summarize,
	welchTTest,
	_internal,
} from './counterfactualStats';

function gaussian(n: number, mean: number, sd: number, seed: number): number[] {
	const rng = _internal.mulberry32(seed);
	const out: number[] = [];
	while (out.length < n) {
		// Box–Muller; emit two per iteration.
		const u1 = Math.max(rng(), 1e-12);
		const u2 = rng();
		const r = Math.sqrt(-2 * Math.log(u1));
		out.push(mean + sd * r * Math.cos(2 * Math.PI * u2));
		if (out.length < n) out.push(mean + sd * r * Math.sin(2 * Math.PI * u2));
	}
	return out;
}

describe('quantile', () => {
	it('linear-interpolates between adjacent points', () => {
		expect(quantile([0, 1, 2, 3, 4], 0.5)).toBe(2);
		expect(quantile([0, 1, 2, 3], 0.5)).toBeCloseTo(1.5, 6);
	});
	it('handles empty and single-element inputs', () => {
		expect(quantile([], 0.5)).toBe(0);
		expect(quantile([42], 0.5)).toBe(42);
	});
});

describe('histogramOf', () => {
	it('places values into evenly spaced bins', () => {
		const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
		const h = histogramOf(sorted, 5, [0, 10]);
		expect(h.length).toBe(5);
		expect(h.reduce((s, v) => s + v, 0)).toBe(10);
	});
	it('returns zeros for empty input', () => {
		const h = histogramOf([], 4);
		expect(h).toEqual([0, 0, 0, 0]);
	});
});

describe('summarize', () => {
	it('computes median, IQR, and p_win on a known sample', () => {
		const xs = [-2, -1, 0, 1, 2, 3];
		const s = summarize(xs, 6, [-3, 4]);
		expect(s.n).toBe(6);
		expect(s.median).toBeCloseTo(0.5, 6);
		expect(s.iqr[0]).toBeCloseTo(-0.75, 6);
		expect(s.iqr[1]).toBeCloseTo(1.75, 6);
		expect(s.p_win).toBeCloseTo(3 / 6, 6);
	});
	it('returns a zero summary for empty input', () => {
		const s = summarize([], 10);
		expect(s.n).toBe(0);
		expect(s.median).toBe(0);
		expect(s.histogram).toHaveLength(10);
	});
});

describe('welchTTest', () => {
	it('flags insufficient_data when n < 30', () => {
		const r = welchTTest([1, 2, 3], [4, 5, 6]);
		expect(r.insufficient_data).toBe(true);
		expect(r.p).toBe(1);
	});

	it('returns ~0 t-stat when both samples come from the same distribution', () => {
		const a = gaussian(200, 0, 1, 11);
		const b = gaussian(200, 0, 1, 22);
		const r = welchTTest(a, b);
		expect(r.insufficient_data).toBe(false);
		expect(Math.abs(r.t)).toBeLessThan(2.5);
		expect(r.p).toBeGreaterThan(0.01);
	});

	it('detects a clear positive shift (mean +0.5σ, n=400)', () => {
		const a = gaussian(400, 0.5, 1, 33);
		const b = gaussian(400, 0.0, 1, 44);
		const r = welchTTest(a, b);
		expect(r.insufficient_data).toBe(false);
		expect(r.t).toBeGreaterThan(3);
		expect(r.p).toBeLessThan(0.01);
	});

	it('detects a clear negative shift (mean -0.5σ)', () => {
		const a = gaussian(400, 0.0, 1, 55);
		const b = gaussian(400, 0.5, 1, 66);
		const r = welchTTest(a, b);
		expect(r.t).toBeLessThan(-3);
		expect(r.p).toBeLessThan(0.01);
	});

	it('handles unequal variances (Behrens–Fisher case)', () => {
		const a = gaussian(120, 0, 3, 77);
		const b = gaussian(300, 0, 1, 88);
		const r = welchTTest(a, b);
		expect(r.insufficient_data).toBe(false);
		expect(r.df).toBeLessThan(a.length + b.length - 2);
		expect(r.p).toBeGreaterThan(0.01);
	});

	it('flags zero-variance inputs as insufficient_data', () => {
		const a = new Array(60).fill(1.5);
		const b = gaussian(60, 1.5, 1, 99);
		const r = welchTTest(a, b);
		expect(r.insufficient_data).toBe(true);
	});
});

describe('bootstrapMedianDeltaCi', () => {
	it('produces a CI that contains the true delta in expectation', () => {
		const a = gaussian(200, 1.0, 1, 13);
		const b = gaussian(200, 0.0, 1, 17);
		const ci = bootstrapMedianDeltaCi(a, b, { resamples: 200, seed: 1234 });
		expect(ci[0]).toBeLessThan(ci[1]);
		expect(ci[1] - ci[0]).toBeGreaterThan(0);
	});
	it('returns [0,0] when one sample is too small', () => {
		expect(bootstrapMedianDeltaCi([1], [1, 2, 3])).toEqual([0, 0]);
	});
});
