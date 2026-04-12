import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listScenarios } from '$lib/server/cogochiBattleService';

export const GET: RequestHandler = async () => {
	try {
		const scenarios = await listScenarios();
		return json(scenarios);
	} catch (err) {
		console.error('[cogochi/battle/scenarios]', err);
		return json({ error: 'Failed to list scenarios' }, { status: 500 });
	}
};
