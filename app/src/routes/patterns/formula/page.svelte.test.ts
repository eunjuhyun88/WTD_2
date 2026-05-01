/**
 * /patterns/formula page DOM tests (W-0383).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Page from './+page.svelte';
import {
	PatternFormulaSchema,
	type PatternFormula,
} from '$lib/contracts/patternFormula';

const REGIMES = ['bull', 'neutral', 'bear'];
const QUANTILES = ['0.55-0.60', '0.60-0.65', '0.65-0.70', '0.70+'];

function makeBuckets() {
	const out = [];
	for (const r of REGIMES) {
		for (const q of QUANTILES) {
			out.push({ regime: r, quantile: q, n: 10, pnl: 0.5 });
		}
	}
	return out;
}

const SAMPLE: PatternFormula = {
	slug: 'wyckoff-spring',
	settings: { p_win_min: 0.55, tp_pct: 0.6, sl_pct: 0.3, cooldown_min: 60, regime_allow: ['bull', 'neutral'] },
	calibrated_at: '2026-04-22T00:00:00Z',
	variables: ['atr_pct', 'bb_width', 'vol_ratio_3', 'obv_slope'],
	buckets: makeBuckets(),
	evidence: [
		{ id: 'e1', fired_at: '2026-05-01T14:02:00Z', symbol: 'BTC', direction: 'long', pnl_24h: 1.6, evidence_hash: 'a7f3' },
	],
	suspects: [
		{ candidate_id: 'c1', blocked_at: '2026-04-30T11:15:00Z', symbol: 'SOL', blocked_reason: 'cooldown', cf_24h: 2.1, weight: 'high' },
	],
	outcomes_available: true,
};

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() =>
			Promise.resolve(
				new Response(JSON.stringify({ ok: true, data: SAMPLE }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			)
		)
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PatternFormulaSchema', () => {
	it('parses the canonical sample', () => {
		const parsed = PatternFormulaSchema.safeParse(SAMPLE);
		expect(parsed.success).toBe(true);
	});

	it('rejects negative bucket counts', () => {
		const bad = { ...SAMPLE, buckets: [{ ...SAMPLE.buckets[0], n: -1 }] };
		expect(PatternFormulaSchema.safeParse(bad).success).toBe(false);
	});
});

describe('/patterns/formula page', () => {
	it('renders the five card sections', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		expect(container.querySelector('[data-testid="formula-settings"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="formula-variables"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="formula-buckets"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="formula-evidence"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="formula-suspects"]')).toBeTruthy();
	});

	it('renders a 3×4 bucket grid (12 data cells)', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const buckets = container.querySelector('[data-testid="formula-buckets"]');
		// 3 regimes x 4 quantiles = 12 td cells (excluding row headers)
		const cells = buckets?.querySelectorAll('tbody td');
		expect(cells?.length).toBe(12);
	});

	it('renders the suspect with weight badge', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const suspects = container.querySelector('[data-testid="formula-suspects"]');
		const weight = suspects?.querySelector('.weight.high');
		expect(weight).toBeTruthy();
		expect(weight?.textContent?.trim()).toBe('high');
	});

	it('lists each variable from the response', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const items = container.querySelectorAll('.vars li');
		expect(items.length).toBe(SAMPLE.variables.length);
	});
});
