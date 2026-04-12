import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { registerTrainerAction } from '$lib/engine/cogochiBattleFSM';
import type { TrainerAction } from '$lib/engine/cogochiTypes';

const VALID_ACTIONS = new Set<string>(['APPROVE', 'OVERRIDE_LONG', 'OVERRIDE_SHORT', 'OVERRIDE_FLAT']);

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	try {
		const user = await getAuthUserFromCookies(cookies);
		if (!user) return json({ error: 'Authentication required' }, { status: 401 });

		const body = await request.json();
		const action = typeof body.action === 'string' ? body.action.trim() : '';

		if (!VALID_ACTIONS.has(action)) {
			return json({ error: `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(', ')}` }, { status: 400 });
		}

		const found = registerTrainerAction(params.battleId, action as TrainerAction);
		if (!found) {
			return json({ error: 'Battle not found or already decided' }, { status: 404 });
		}

		return json({ ok: true, action });
	} catch (err) {
		if (err instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
		console.error(`[cogochi/battle/${params.battleId}/action]`, err);
		return json({ error: 'Failed to submit action' }, { status: 500 });
	}
};
