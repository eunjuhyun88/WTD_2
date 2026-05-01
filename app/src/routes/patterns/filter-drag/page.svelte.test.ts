/**
 * /patterns/filter-drag page DOM tests (W-0383).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Page from './+page.svelte';
import {
	FilterDragStateSchema,
	type FilterDragState,
} from '$lib/contracts/counterfactualReview';

const SAMPLE: FilterDragState = {
	slug: 'wyckoff-spring',
	since_days: 90,
	filters: [
		{ key: 'p_win_min', label: 'p_win min', type: 'number', range: [0.4, 0.7], current: 0.55, simulated: 0.55, pnl_delta_pct: 1.2, trade_count_delta: -34 },
		{ key: 'volume_floor', label: 'volume floor ($M)', type: 'number', range: [1, 20], current: 5, simulated: 5, pnl_delta_pct: 0.3, trade_count_delta: -52 },
		{ key: 'cooldown_min', label: 'cooldown (min)', type: 'duration', range: [15, 240], current: 60, simulated: 60, pnl_delta_pct: -0.8, trade_count_delta: 89 },
		{ key: 'regime_block', label: 'regime block', type: 'toggle', range: null, current: true, simulated: true, pnl_delta_pct: 0.5, trade_count_delta: -71 },
	],
	preview: {
		current: { equity: [0, 0.5, 1.2, 1.8, 2.5, 3.0], sharpe: 1.4 },
		simulated: { equity: [0, 0.6, 1.4, 2.1, 2.9, 3.6], sharpe: 1.6 },
		delta_pct: 0.6,
	},
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

describe('FilterDragStateSchema', () => {
	it('parses the canonical sample', () => {
		const parsed = FilterDragStateSchema.safeParse(SAMPLE);
		expect(parsed.success).toBe(true);
	});
});

describe('/patterns/filter-drag page', () => {
	it('renders the four filter sliders/toggles', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		expect(container.querySelector('[data-testid="slider-p_win_min"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="slider-volume_floor"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="slider-cooldown_min"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="slider-regime_block"]')).toBeTruthy();
	});

	it('renders an SVG path for both equity series', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const cur = container.querySelector('path.cur-line');
		const sim = container.querySelector('path.sim-line');
		expect(cur).toBeTruthy();
		expect(sim).toBeTruthy();
		// Both paths should have non-empty d attributes
		expect(cur?.getAttribute('d')?.startsWith('M')).toBe(true);
		expect(sim?.getAttribute('d')?.startsWith('M')).toBe(true);
	});

	it('exposes the apply-draft anchor with deep-link payload', async () => {
		const { container } = render(Page);
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const apply = container.querySelector('[data-testid="apply-draft"]') as HTMLAnchorElement | null;
		expect(apply).toBeTruthy();
		expect(apply?.href).toContain('/lab?draft=');
	});

	it('renders the paper-only disclaimer', () => {
		const { container } = render(Page);
		const note = container.querySelector('.paper-note');
		expect(note?.textContent).toContain('Simulation only');
	});
});
