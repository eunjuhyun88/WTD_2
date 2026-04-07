/**
 * Cogochi Battle FSM
 * 6-state: OBSERVE → RETRIEVE → REASON → DECIDE → RESOLVE → REFLECT
 * 1:1 port of cogochi/battle_engine.py run_battle()
 *
 * Returns an AsyncGenerator that yields SSE-formatted strings.
 * DECIDE state pauses until trainer action is registered.
 */

import type {
	CogAgent,
	CogBattleContext,
	CogBattleSSEEvent,
	CogBattleState,
	CogDecision,
	GuardianVetoReason,
	MemoryCard,
	SignalSnapshot,
	TrainerAction,
} from './cogochiTypes';
import { XP_TABLE, BOND_TABLE } from './cogochiTypes';
import { buildContext } from './cogochiContextBuilder';
import { ollamaGenerate } from '$lib/server/ollamaClient';
import { qdrantSearch, qdrantUpsert } from '$lib/server/qdrantClient';
import { callAllParallel, formatSkillResults } from '$lib/server/skillsRegistry';
import { computeEmbedding } from './ragEmbedding';

// ─── SSE format helper ───

function sse(state: CogBattleState, payload: Record<string, unknown>): string {
	const event: CogBattleSSEEvent = { state, payload };
	return `event: state_change\ndata: ${JSON.stringify(event)}\n\n`;
}

function sseDone(data: Record<string, unknown>): string {
	return `event: done\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Trainer action store (in-memory, per-battle) ───

const pendingTrainerActions = new Map<string, { resolve: (action: TrainerAction) => void }>();

export function registerTrainerAction(battleId: string, action: TrainerAction): boolean {
	const pending = pendingTrainerActions.get(battleId);
	if (!pending) return false;
	pending.resolve(action);
	pendingTrainerActions.delete(battleId);
	return true;
}

function waitForTrainerAction(battleId: string, timeoutMs: number = 60000): Promise<TrainerAction> {
	return new Promise<TrainerAction>((resolve) => {
		const timer = setTimeout(() => {
			pendingTrainerActions.delete(battleId);
			resolve('APPROVE');
		}, timeoutMs);

		pendingTrainerActions.set(battleId, {
			resolve: (action) => {
				clearTimeout(timer);
				resolve(action);
			},
		});
	});
}

// ─── Guardian Veto (battle_engine.py guardian_veto) ───

function guardianVeto(
	ctx: CogBattleContext,
): { vetoed: boolean; reason: GuardianVetoReason | null } {
	const s = ctx.snapshot;
	const action = ctx.llmOutput?.action ?? 'FLAT';

	// Condition 1: funding overheat + long
	if (s.fundingRate > 0.0015 && action === 'LONG') {
		return { vetoed: true, reason: 'funding_overheat_long' };
	}

	// Condition 2: ATR extreme
	if (s.atrPct > 8.0) {
		return { vetoed: true, reason: 'atr_extreme' };
	}

	// Condition 3: liquidation cluster within 1.5%
	const liq = ctx.skillResults.coinglass_liquidation as Record<string, unknown> | null;
	if (liq && (liq.nearest_cluster_pct as number) < 1.5) {
		return { vetoed: true, reason: 'liq_cluster_near' };
	}

	// nofx pattern: 3 consecutive losses
	const recent = ctx.memories
		.filter((m) => m.kind === 'MATCH_SUMMARY')
		.slice(-3);
	if (recent.length === 3 && recent.every((m) => m.content.includes('LOSS'))) {
		return { vetoed: true, reason: 'three_consecutive_loss' };
	}

	return { vetoed: false, reason: null };
}

// ─── Resolve outcome (battle_engine.py resolve_outcome) ───

function resolveOutcome(
	ctx: CogBattleContext,
	futureCandles: Array<Record<string, number>>,
): { outcome: 'WIN' | 'LOSS' | 'DRAW'; pnl: number } {
	const action = ctx.llmOutput?.action ?? 'FLAT';
	const sl = ctx.llmOutput?.sl ?? null;
	const tp = ctx.llmOutput?.tp ?? null;

	if (action === 'FLAT' || futureCandles.length === 0) {
		return { outcome: 'DRAW', pnl: 0 };
	}

	const entry = ctx.snapshot.currentPrice;
	const atr = (ctx.snapshot.atrPct / 100) * entry;

	const effectiveSl = sl ?? (action === 'LONG' ? entry - atr * 1.5 : entry + atr * 1.5);
	const effectiveTp = tp ?? (action === 'LONG' ? entry + atr * 2.0 : entry - atr * 2.0);

	for (const candle of futureCandles.slice(0, 20)) {
		const high = candle.high ?? entry;
		const low = candle.low ?? entry;

		if (action === 'LONG') {
			if (high >= effectiveTp) return { outcome: 'WIN', pnl: round5((effectiveTp - entry) / entry) };
			if (low <= effectiveSl) return { outcome: 'LOSS', pnl: round5((effectiveSl - entry) / entry) };
		} else {
			if (low <= effectiveTp) return { outcome: 'WIN', pnl: round5((entry - effectiveTp) / entry) };
			if (high >= effectiveSl) return { outcome: 'LOSS', pnl: round5((entry - effectiveSl) / entry) };
		}
	}

	// TP/SL not hit within 20 candles
	const lastClose = futureCandles[futureCandles.length - 1]?.close ?? entry;
	const pnl = action === 'LONG' ? (lastClose - entry) / entry : (entry - lastClose) / entry;
	const outcome = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'DRAW';
	return { outcome, pnl: round5(pnl) };
}

function round5(n: number): number {
	return Math.round(n * 100000) / 100000;
}

// ─── XP/Bond calc ───

function calcXpBond(outcome: string, confidence: number): { xp: number; bond: number } {
	const baseXp = XP_TABLE[outcome] ?? 0;
	const baseBond = BOND_TABLE[outcome] ?? 0;
	const multiplier = 1.0 + (confidence - 0.5) * 0.5;
	return { xp: Math.round(baseXp * multiplier), bond: baseBond };
}

// ─── Reflection generation ───

async function generateReflection(ctx: CogBattleContext, model: string): Promise<string> {
	const action = ctx.llmOutput?.action ?? 'FLAT';
	const thesis = ctx.llmOutput?.thesis ?? '';
	const skills = Object.keys(ctx.skillResults);

	const prompt = `You made a ${action} decision with thesis: "${thesis}"
Result: ${ctx.outcome} (pnl: ${ctx.pnl?.toFixed(4)})
Skills used: ${skills.length > 0 ? skills.join(', ') : 'none'}

Write EXACTLY 2 sentences: what you got right and what to improve next time.
Be specific about signals. No generic phrases.`;

	const raw = await ollamaGenerate(model, prompt, { max_tokens: 80 });
	if (raw) return raw.trim();

	// Fallback
	if (ctx.outcome === 'WIN') {
		return `${action} decision validated by ${thesis.slice(0, 50)}. Confidence was well-calibrated.`;
	}
	if (ctx.outcome === 'LOSS') {
		return `${action} triggered stop-loss. Re-examine ${ctx.snapshot.cvdState} threshold.`;
	}
	return 'Position closed at entry. Market was indecisive.';
}

// ─── Parse LLM output ───

function parseLlmOutput(raw: string): CogDecision {
	try {
		const start = raw.indexOf('{');
		const end = raw.lastIndexOf('}') + 1;
		if (start === -1 || end === 0) throw new Error('no json');

		const data = JSON.parse(raw.slice(start, end));
		let action = String(data.action ?? 'FLAT').toUpperCase();
		if (!['LONG', 'SHORT', 'FLAT'].includes(action)) action = 'FLAT';

		let confidence = parseFloat(data.confidence ?? 0.5);
		confidence = Math.max(0, Math.min(1, confidence));

		return {
			action: action as 'LONG' | 'SHORT' | 'FLAT',
			confidence,
			thesis: String(data.thesis ?? '').slice(0, 200),
			sl: data.sl ? parseFloat(data.sl) : null,
			tp: data.tp ? parseFloat(data.tp) : null,
		};
	} catch {
		return { action: 'FLAT', confidence: 0, thesis: 'parse_error_fallback', sl: null, tp: null };
	}
}

// ─── Main Battle FSM (SSE Generator) ───

export interface BattleFSMConfig {
	battleId: string;
	agent: CogAgent;
	scenario: {
		id: string;
		symbol?: string;
		interval?: string;
		snapshot: SignalSnapshot;
		candles: Array<Record<string, number>>;
		futureCandles: Array<Record<string, number>>;
	};
}

export async function* runBattleFSM(config: BattleFSMConfig): AsyncGenerator<string> {
	const { battleId, agent, scenario } = config;

	const ctx: CogBattleContext = {
		battleId,
		agentId: agent.id,
		scenarioId: scenario.id,
		snapshot: scenario.snapshot,
		memories: [],
		skillResults: {},
		llmOutput: null,
		trainerAction: null,
		outcome: null,
		pnl: null,
		reflection: null,
		chainHash: null,
		xpGained: 0,
		bondGained: 0,
		startedAt: Date.now(),
	};

	const model = agent.modelVersion ?? agent.doctrine.model.base;

	// ── OBSERVE ──
	yield sse('OBSERVE', {
		scenario_id: scenario.id,
		symbol: scenario.symbol ?? 'BTCUSDT',
		snapshot: ctx.snapshot,
		agent_name: agent.name,
		archetype: agent.archetypeId,
	});

	// ── RETRIEVE ──
	try {
		const embedding = computeEmbedding(JSON.stringify(ctx.snapshot).slice(0, 500));
		ctx.memories = await qdrantSearch(embedding, 5, { agentId: agent.id });
	} catch {
		ctx.memories = [];
	}

	yield sse('RETRIEVE', {
		memories_count: ctx.memories.length,
		memories: ctx.memories.map((m) => ({
			kind: m.kind,
			content: m.content.slice(0, 100),
		})),
	});

	// ── REASON (Skills + LLM) ──
	ctx.skillResults = await callAllParallel(
		agent.skillLoadout,
		ctx.snapshot,
		agent.skillLoadout.totalBudgetMs,
	);

	const skillSummary: Record<string, { status: string; data: unknown }> = {};
	for (const [id, result] of Object.entries(ctx.skillResults)) {
		skillSummary[id] = { status: result !== null ? 'ok' : 'failed', data: result };
	}

	yield sse('REASON', {
		skills_called: Object.keys(ctx.skillResults),
		skills_summary: skillSummary,
	});

	// ── DECIDE (LLM + Guardian + Trainer) ──
	const contextStr = buildContext({ ctx, agent, scenario });

	const raw = await ollamaGenerate(model, contextStr);
	ctx.llmOutput = raw ? parseLlmOutput(raw) : {
		action: 'FLAT',
		confidence: 0,
		thesis: 'llm_unavailable',
		sl: null,
		tp: null,
	};

	// Guardian veto
	const { vetoed, reason } = guardianVeto(ctx);
	if (vetoed && ctx.llmOutput) {
		ctx.llmOutput.action = 'FLAT';
		ctx.llmOutput.veto = true;
		ctx.llmOutput.veto_reason = reason ?? undefined;
	}

	yield sse('DECIDE', {
		...ctx.llmOutput,
		awaiting_trainer: true,
	});

	// Wait for trainer input
	ctx.trainerAction = await waitForTrainerAction(battleId, 60000);

	// Apply override
	if (ctx.trainerAction.startsWith('OVERRIDE_') && ctx.llmOutput) {
		const overrideAction = ctx.trainerAction.replace('OVERRIDE_', '') as 'LONG' | 'SHORT' | 'FLAT';
		ctx.llmOutput.action = overrideAction;
		ctx.llmOutput.overridden = true;
	}

	// ── RESOLVE ──
	const { outcome, pnl } = resolveOutcome(ctx, scenario.futureCandles);
	ctx.outcome = outcome;
	ctx.pnl = pnl;

	const { xp, bond } = calcXpBond(outcome, ctx.llmOutput?.confidence ?? 0.5);
	ctx.xpGained = xp;
	ctx.bondGained = bond;

	yield sse('RESOLVE', {
		outcome: ctx.outcome,
		pnl: ctx.pnl,
		xp_gained: ctx.xpGained,
		bond_gained: ctx.bondGained,
	});

	// ── REFLECT ──
	ctx.reflection = await generateReflection(ctx, model);

	// Save memory
	try {
		const memoryKind = outcome === 'WIN' ? 'SUCCESS_CASE' : 'FAILURE_CASE';
		const importance = outcome === 'WIN' ? 0.9 : ctx.trainerAction?.startsWith('OVERRIDE') ? 0.95 : 0.7;
		const content = `${ctx.llmOutput?.action} → ${outcome} (${ctx.pnl?.toFixed(4)}). ${ctx.reflection}`;
		const embedding = computeEmbedding(content);

		await qdrantUpsert(crypto.randomUUID(), embedding, {
			agentId: agent.id,
			kind: memoryKind,
			content,
			importance,
			createdAt: Date.now(),
		});
	} catch {
		/* memory save failure is non-fatal */
	}

	yield sse('REFLECT', {
		reflection: ctx.reflection,
		memory_saved: true,
		chain_hash: ctx.chainHash,
	});

	yield sseDone({
		battle_id: battleId,
		outcome: ctx.outcome,
		pnl: ctx.pnl,
		chain_hash: ctx.chainHash,
	});
}
