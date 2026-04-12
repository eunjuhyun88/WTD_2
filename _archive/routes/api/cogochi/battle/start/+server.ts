import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getAgent, getScenario, setAgentStatus } from '$lib/server/cogochiBattleService';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const user = await getAuthUserFromCookies(cookies);
		if (!user) return json({ error: 'Authentication required' }, { status: 401 });

		const body = await request.json();
		const agentId = typeof body.agent_id === 'string' ? body.agent_id.trim() : '';
		const scenarioId = typeof body.scenario_id === 'string' ? body.scenario_id.trim() : '';

		if (!agentId || !scenarioId) {
			return json({ error: 'agent_id and scenario_id required' }, { status: 400 });
		}

		const agent = await getAgent(agentId, user.id);
		if (!agent) return json({ error: 'Agent not found' }, { status: 404 });
		if (agent.status !== 'READY') {
			return json({ error: `Agent status is ${agent.status}` }, { status: 409 });
		}

		const scenario = await getScenario(scenarioId);
		if (!scenario) return json({ error: 'Scenario not found' }, { status: 404 });

		const battleId = crypto.randomUUID();
		await setAgentStatus(agentId, 'IN_MATCH');

		return json({
			battle_id: battleId,
			stream_url: `/api/cogochi/battle/${battleId}/stream?agent_id=${agentId}&scenario_id=${scenarioId}`,
		});
	} catch (err) {
		if (err instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
		console.error('[cogochi/battle/start]', err);
		return json({ error: 'Failed to start battle' }, { status: 500 });
	}
};
