import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getAgent, getScenario, setAgentStatus } from '$lib/server/cogochiBattleService';
import { runBattleFSM } from '$lib/engine/cogochiBattleFSM';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const user = await getAuthUserFromCookies(cookies);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const agentId = url.searchParams.get('agent_id') ?? '';
	const scenarioId = url.searchParams.get('scenario_id') ?? '';

	if (!agentId || !scenarioId) {
		return json({ error: 'agent_id and scenario_id query params required' }, { status: 400 });
	}

	const agent = await getAgent(agentId);
	const scenario = await getScenario(scenarioId);

	if (!agent || !scenario) {
		return json({ error: 'Agent or scenario not found' }, { status: 404 });
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				for await (const chunk of runBattleFSM({
					battleId: params.battleId,
					agent,
					scenario: {
						id: scenario.id,
						symbol: scenario.symbol,
						interval: scenario.interval,
						snapshot: scenario.snapshot,
						candles: scenario.candles as Array<Record<string, number>>,
						futureCandles: scenario.futureCandles as Array<Record<string, number>>,
					},
				})) {
					controller.enqueue(encoder.encode(chunk));
				}
			} catch (err) {
				console.error(`[cogochi/battle/${params.battleId}/stream]`, err);
				controller.enqueue(
					encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'internal' })}\n\n`),
				);
			} finally {
				await setAgentStatus(agentId, 'READY');
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
