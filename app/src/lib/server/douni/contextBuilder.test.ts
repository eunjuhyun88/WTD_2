import { describe, expect, it } from 'vitest';
import { buildContext, formatAgentContextPackForPrompt } from './contextBuilder';
import type { AgentContextPack } from '$lib/contracts/agent/agentContext';

const agentPack: AgentContextPack = {
	symbol: 'BTCUSDT',
	timeframe: '1h',
	facts: {
		ok: true,
		owner: 'engine',
		plane: 'fact',
		status: 'live',
		generated_at: '2026-04-23T00:00:00Z',
		fact_id: 'fact_1',
		symbol: 'BTCUSDT',
		timeframe: '1h',
		confluence: {
			score: 72,
			verdict: 'constructive',
			confidence: 0.68,
			regime: 'trend',
		},
		provider_state: {
			binance: { status: 'live' },
			coingecko: { status: 'reference_only' },
		},
	},
	scan: {
		ok: true,
		owner: 'engine',
		plane: 'search',
		status: 'fact_only',
		generated_at: '2026-04-23T00:00:00Z',
		scan_id: 'scan_1',
		request: { symbol: 'BTCUSDT', timeframe: '1h' },
		candidates: [
			{
				candidate_id: 'candidate_1',
				symbol: 'ETHUSDT',
				timeframe: '1h',
				score: 0.82,
				payload: {
					summary: 'compact',
					klines: [{ open: 1, high: 2, low: 0.5, close: 1.5 }],
				},
			},
		],
	},
	seed_search: null,
	runtime: {
		status: 'fallback_local',
		generated_at: '2026-04-23T00:00:00Z',
		captures: [
			{
				id: 'cap_1',
				kind: 'manual_hypothesis',
				symbol: 'BTCUSDT',
				timeframe: '1h',
				status: 'pending_outcome',
				captured_at_ms: 1_776_566_400_000,
				phase: 'BREAKOUT',
				user_note: 'watch reclaim',
			},
		],
	},
	evidence: [
		{ metric: 'fact_state', value: 'live', state: 'live' },
		{ metric: 'runtime_captures', value: '1', state: 'fallback_local' },
	],
};

describe('AgentContextPack prompt integration', () => {
	it('formats a compact prompt section without raw candidate payloads', () => {
		const formatted = formatAgentContextPackForPrompt(agentPack);

		expect(formatted).toContain('symbol=BTCUSDT timeframe=1h');
		expect(formatted).toContain('facts=live');
		expect(formatted).toContain('providers=binance:live, coingecko:reference_only');
		expect(formatted).toContain('scan=fact_only candidates=1');
		expect(formatted).toContain('capture=cap_1');
		expect(formatted).not.toContain('klines');
		expect(formatted).not.toContain('open');
	});

	it('injects the bounded pack into the DOUNI system prompt', () => {
		const result = buildContext({
			profile: { name: 'DOUNI', archetype: 'RIDER', stage: 'EGG' },
			budget: {
				intent: 'quick_ask',
				tools: [],
				maxTokens: 280,
				historyDepth: 0,
				includeSnapshot: 'never',
				preferredProvider: 'cerebras',
			},
			history: [],
			message: 'BTC 어때?',
			detectedSymbol: 'BTC',
			agentContextPack: agentPack,
		});

		expect(result.systemPrompt).toContain('[Agent Context Pack]');
		expect(result.systemPrompt).toContain('runtime=fallback_local captures=1');
		expect(result.messages[0]?.content).toContain('[Agent Context Pack]');
		expect(result.systemPrompt).not.toContain('klines');
	});
});
