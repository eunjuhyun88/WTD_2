/**
 * /lab/counterfactual page DOM tests (W-0383).
 *
 * Renders the page with a mocked fetch and asserts:
 *   - controls render with expected defaults
 *   - histogram bins render based on data
 *   - by-reason and signal tables render rows
 *   - outcome banner appears when outcomes_available=false
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';
import {
	CounterfactualReviewSchema,
	type CounterfactualReview,
} from '$lib/contracts/counterfactualReview';

const SAMPLE: CounterfactualReview = {
	pattern: 'wyckoff-spring',
	horizon: 24,
	since_days: 30,
	traded: { n: 100, median: 0.42, iqr: [-0.5, 1.5], p_win: 0.61, histogram: [1, 5, 12, 30, 25, 15, 8, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	blocked: { n: 200, median: 0.11, iqr: [-1.0, 2.0], p_win: 0.51, histogram: [3, 10, 22, 40, 50, 35, 22, 12, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	delta_median: 0.31,
	ci_95: [0.18, 0.44],
	welch: { t: 4.2, p: 0.0001, df: 250, insufficient_data: false },
	by_reason: [
		{ reason: 'threshold_unmet', n: 80, median: 0.05, p_win: 0.49, delta: -0.37, verdict: 'keep' },
		{ reason: 'cooldown', n: 30, median: 0.81, p_win: 0.63, delta: 0.39, verdict: 'relax' },
	],
	table: [
		{ id: 't1', time: '2026-05-01T14:02:00Z', symbol: 'BTC', pattern: 'wyckoff-spring', direction: 'long', status: 'traded', reason: null, r1h: 0.4, r4h: 0.9, r24h: 1.6 },
		{ id: 'b1', time: '2026-05-01T13:58:00Z', symbol: 'SOL', pattern: 'wyckoff-spring', direction: 'long', status: 'blocked', reason: 'cooldown', r1h: 0.3, r4h: 0.7, r24h: 1.4 },
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

describe('CounterfactualReviewSchema', () => {
	it('parses the canonical sample', () => {
		const parsed = CounterfactualReviewSchema.safeParse(SAMPLE);
		expect(parsed.success).toBe(true);
	});
});

describe('/lab/counterfactual page', () => {
	it('renders the three control selects with defaults', async () => {
		const { container } = render(Page);
		expect(container.querySelector('[data-testid="pattern-select"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="horizon-select"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="since-select"]')).toBeTruthy();
	});

	it('renders distribution stats and signal table after fetch resolves', async () => {
		const { container } = render(Page);
		// Wait a microtask for fetch promise to resolve.
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const distros = container.querySelector('[data-testid="cfx-distros"]');
		expect(distros).toBeTruthy();
		// Both histogram blocks render 20 bins each.
		const bins = container.querySelectorAll('.bin');
		expect(bins.length).toBe(40);
		const reasons = container.querySelector('[data-testid="cfx-reasons"]');
		expect(reasons?.querySelectorAll('tbody tr').length).toBe(2);
		const signals = container.querySelector('[data-testid="cfx-signals"]');
		expect(signals?.querySelectorAll('tbody tr').length).toBe(2);
	});

	it('shows outcomes banner when outcomes_available is false', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({ ok: true, data: { ...SAMPLE, outcomes_available: false } }),
						{ status: 200 }
					)
				)
			)
		);
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		expect(container.querySelector('[data-testid="cfx-no-outcomes"]')).toBeTruthy();
	});

	it('shows the welch verdict block', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		const welch = container.querySelector('[data-testid="cfx-welch"]');
		expect(welch?.textContent).toContain('Welch');
		expect(welch?.textContent).toContain('+0.31%');
	});
});
