/**
 * Cogochi Context Builder
 * 1:1 port of cogochi/context_builder.py
 * LLM 프롬프트 조립. 블록 순서 절대 변경 불가.
 */

import type { CogBattleContext, CogAgent, CogScenario, MemoryCard } from './cogochiTypes';

export const TOKEN_BUDGET = {
	system_role: 400,
	scenario: 400,
	market_stage: 400,
	skills: 300,
	memories: 300,
	squad_schema: 200,
} as const;

const ROLE_PROMPTS: Record<string, string> = {
	CRUSHER:
		'You are aggressive. Prioritize CVD divergence and funding overheat. Bias toward SHORT on overextended longs.',
	RIDER:
		'You are trend-following. Wait for structure confirmation before entry. Avoid counter-trend trades.',
	ORACLE:
		'You specialize in divergence detection. Price vs orderflow discrepancies are your edge.',
	GUARDIAN:
		'You are risk-first. Veto high-risk setups. Capital preservation over gains.',
};

interface BuildArgs {
	ctx: CogBattleContext;
	agent: CogAgent;
	scenario: { id: string; symbol?: string; interval?: string };
}

export function buildContext({ ctx, agent, scenario }: BuildArgs): string {
	const blocks: string[] = [];
	const doctrine = agent.doctrine;
	const snap = ctx.snapshot;

	// 1. block_system (identity)
	blocks.push(
		`[IDENTITY]\nName: ${agent.name} | Archetype: ${agent.archetypeId} | Stage: ${agent.stage} | Level: ${agent.level}\nDoctrine: Trade with discipline.`,
	);

	// 2. block_role
	const role = ROLE_PROMPTS[agent.archetypeId] ?? '';
	blocks.push(`[ROLE]\n${role}`);

	// 3. block_objective
	blocks.push(
		`[OBJECTIVE]\nScenario: ${scenario.id} | Symbol: ${scenario.symbol ?? 'BTCUSDT'} | Timeframe: ${scenario.interval ?? '15m'}\nDecide: LONG, SHORT, or FLAT. Set SL and TP in price terms.`,
	);

	// 4. block_signals (weights)
	const wLines = Object.entries(doctrine.signal_weights)
		.map(([k, v]) => `  ${k}: ${v.toFixed(2)}`)
		.join('\n');
	blocks.push(`[SIGNAL WEIGHTS]\n${wLines || '  (default)'}`);

	// 5. block_market
	blocks.push(
		`[MARKET STATE]
  primaryZone:    ${snap.primaryZone ?? '?'}
  cvdState:       ${snap.cvdState} (${snap.cvdValue >= 0 ? '+' : ''}${snap.cvdValue.toFixed(0)})
  oiChange1h:     ${snap.oiChange1h >= 0 ? '+' : ''}${(snap.oiChange1h * 100).toFixed(1)}%
  fundingRate:    ${snap.fundingRate.toFixed(4)} (${snap.fundingLabel})
  htfStructure:   ${snap.htfStructure}
  atrPct:         ${snap.atrPct.toFixed(1)}%
  vwapDistance:   ${snap.vwapDistance >= 0 ? '+' : ''}${snap.vwapDistance.toFixed(2)}%
  compositeScore: ${snap.compositeScore.toFixed(2)}
  currentPrice:   ${snap.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}`,
	);

	// 6. block_stage
	blocks.push(`[STAGE]\n  Stage ${agent.stage} | Level ${agent.level} | Bond ${agent.bond}`);

	// 7. block_skills
	const skillLines: string[] = [];
	for (const [skillId, result] of Object.entries(ctx.skillResults)) {
		if (result !== null) {
			skillLines.push(summarizeSkill(skillId, result as Record<string, unknown>));
		}
	}
	if (skillLines.length > 0) {
		blocks.push('[SKILLS INTELLIGENCE]\n' + skillLines.map((l) => `  ${l}`).join('\n'));
	}

	// 8. block_memories
	if (ctx.memories.length > 0) {
		const memLines = ctx.memories.slice(0, 5).map((m: MemoryCard) => {
			const content = m.content.length > 120 ? m.content.slice(0, 120) : m.content;
			return `  [${m.kind}] ${content}`;
		});
		blocks.push('[PAST EXPERIENCE]\n' + memLines.join('\n'));
	}

	// 10. block_schema (always last)
	blocks.push(
		'[OUTPUT]\nRespond with ONLY this JSON (no markdown, no explanation):\n{"action":"LONG|SHORT|FLAT","confidence":0.0,"thesis":"<30 words>","sl":0.0,"tp":0.0}',
	);

	return blocks.join('\n\n');
}

function summarizeSkill(skillId: string, data: Record<string, unknown>): string {
	try {
		if (skillId === 'coingecko_price') {
			return `coingecko: BTC $${(data.btc_price as number)?.toLocaleString()} | dom ${data.btc_dominance}% | 24h ${((data.btc_24h_change as number) ?? 0).toFixed(1)}%`;
		}
		if (skillId === 'coinglass_liquidation') {
			return `coinglass: nearest liq cluster ${(data.nearest_cluster_pct as number)?.toFixed(1)}% away | 24h long liq $${Math.round((data.liq_24h_long_usd as number ?? 0) / 1e6)}M`;
		}
		if (skillId === 'nansen_smartmoney') {
			const flow = (data.net_flow_usd as number) ?? 0;
			return `nansen: smart money net ${flow > 0 ? 'inflow' : 'outflow'} $${Math.round(Math.abs(flow) / 1e6)}M last 24h`;
		}
		if (skillId === 'binance_market') {
			const ratio = (data.depth_ratio as number) ?? 1;
			const pressure = ratio > 1.2 ? 'bid-heavy' : ratio < 0.8 ? 'ask-heavy' : 'balanced';
			return `binance: orderbook ${pressure} (ratio ${ratio.toFixed(2)}) | top ask $${(data.top_ask_price as number)?.toLocaleString()}`;
		}
	} catch {
		/* ignore */
	}
	return `${skillId}: data available`;
}
