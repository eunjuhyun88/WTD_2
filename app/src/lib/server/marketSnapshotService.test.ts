import { describe, expect, it } from 'vitest';

import { buildPublicSnapshotFromEngineFact } from './marketSnapshotService';

describe('buildPublicSnapshotFromEngineFact', () => {
	it('prefers canonical provider_state over transitional sources', () => {
		const payload = {
			ok: true,
			owner: 'engine',
			plane: 'fact',
			status: 'transitional',
			generated_at: '2026-04-24T00:00:00Z',
			provider_state: {
				klines: { status: 'live', summary: '600 rows', updated_at: '2026-04-24T00:00:00Z' },
				perp: { status: 'blocked', summary: 'no rows', updated_at: null },
			},
			sources: {
				klines: { status: 'missing', summary: 'stale transitional source', updated_at: null },
				perp: { status: 'ok', summary: 'stale transitional source', updated_at: '2026-04-24T00:00:00Z' },
			},
		} as const;

		const snapshot = buildPublicSnapshotFromEngineFact('BTCUSDT', '1h', payload);

		expect(snapshot.updated).toEqual(['klines']);
		expect(snapshot.sources).toEqual({
			klines: true,
			perp: false,
		});
	});

	it('falls back to transitional sources when provider_state is absent', () => {
		const payload = {
			ok: true,
			owner: 'engine',
			plane: 'fact',
			status: 'transitional',
			generated_at: '2026-04-24T00:00:00Z',
			sources: {
				klines: { status: 'ok', summary: '600 rows', updated_at: '2026-04-24T00:00:00Z' },
				perp: { status: 'missing', summary: 'no rows', updated_at: null },
			},
		} as const;

		const snapshot = buildPublicSnapshotFromEngineFact('BTCUSDT', '1h', payload);

		expect(snapshot.updated).toEqual(['klines']);
		expect(snapshot.sources).toEqual({
			klines: true,
			perp: false,
		});
	});
});
