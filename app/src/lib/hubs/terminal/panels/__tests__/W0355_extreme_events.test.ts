import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PANEL_SRC = readFileSync(
	resolve(__dirname, '../IntelPanel.svelte'),
	'utf-8',
);

/**
 * W-0355: Extreme Events API + IntelPanel 24h section
 * Structural tests via readFileSync — verifies source without DOM.
 */
describe('IntelPanel — W-0355 Extreme Events section', () => {
	it('AC2: extreme-events-section data-testid present', () => {
		expect(PANEL_SRC).toContain('data-testid="extreme-events-section"');
	});

	it('AC3: empty state text present', () => {
		expect(PANEL_SRC).toContain('최근 24h 이벤트 없음');
	});

	it('AC3: empty state has data-testid', () => {
		expect(PANEL_SRC).toContain('data-testid="extreme-events-empty"');
	});

	it('AC4: max 5 cap — slice(0, 5) present', () => {
		expect(PANEL_SRC).toContain('extremeEvents.slice(0, 5)');
	});

	it('AC2: fetchExtremeEvents function declared', () => {
		expect(PANEL_SRC).toContain('async function fetchExtremeEvents()');
	});

	it('AC2: fetches /api/terminal/extreme-events', () => {
		expect(PANEL_SRC).toContain('/api/terminal/extreme-events');
	});

	it('AC2: event row renders kind badge', () => {
		expect(PANEL_SRC).toContain('fmtKindBadge(ev.kind)');
	});

	it('AC2: event row renders symbol', () => {
		expect(PANEL_SRC).toContain('xev-sym');
	});

	it('AC2: event row renders magnitude', () => {
		expect(PANEL_SRC).toContain('ev.magnitude');
	});

	it('AC2: event row renders time ago', () => {
		expect(PANEL_SRC).toContain('xev-time');
	});

	it('section shown under events feed filter', () => {
		// Section must appear within a feedFilter events block
		expect(PANEL_SRC).toMatch(/feedFilter === 'events'[\s\S]{1,200}extreme-events-section/);
	});

	it('no hardcoded font-size below 11px in xev CSS', () => {
		// Extract xev CSS lines and check for tiny px values
		const xevLines = PANEL_SRC
			.split('\n')
			.filter((l) => l.includes('.xev-'));
		const tiny = xevLines.filter((l) => /font-size:\s*([0-9]+)px/.test(l)).filter((l) => {
			const m = l.match(/font-size:\s*([0-9]+)px/);
			return m ? parseInt(m[1], 10) < 11 : false;
		});
		expect(tiny).toHaveLength(0);
	});
});
