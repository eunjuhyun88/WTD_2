/**
 * Cogochi Battle Service
 * DB 저장 + SSE 스트림 관리.
 * battle_lab_routers.py battle_router 의 서비스 레이어 포팅.
 */

import { query } from './db';
import type { CogBattleResult, CogAgent, CogScenario } from '$lib/engine/cogochiTypes';

// ─── Battle Result 저장 ───

export async function saveBattleResult(result: CogBattleResult): Promise<void> {
	try {
		await query(
			`INSERT INTO cogochi_battle_results
				(id, agent_id, scenario_id, outcome, agent_action, trainer_action,
				 confidence, thesis, reflection, skills_used, pnl,
				 chain_commit_hash, xp_gained, bond_gained, snapshot, skill_results)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb)`,
			[
				result.id,
				result.agentId,
				result.scenarioId,
				result.outcome,
				result.agentAction,
				result.trainerAction,
				result.confidence,
				result.thesis,
				result.reflection,
				result.skillsUsed,
				result.pnl,
				result.chainCommitHash,
				result.xpGained,
				result.bondGained,
				JSON.stringify(result.snapshot),
				JSON.stringify(result.skillResults),
			],
		);
	} catch (err: unknown) {
		const code = (err as Record<string, unknown>)?.code;
		if (code !== '42P01' && code !== '42703') throw err;
	}
}

// ─── Agent 통계 갱신 ───

export async function updateAgentStats(
	agentId: string,
	outcome: string,
	xpGained: number,
	bondGained: number,
): Promise<void> {
	try {
		await query(
			`UPDATE cogochi_agents SET
				xp = xp + $2,
				bond = LEAST(bond + $3, 100),
				updated_at = NOW()
			 WHERE id = $1`,
			[agentId, xpGained, bondGained],
		);
	} catch {
		/* table may not exist yet */
	}
}

// ─── Agent 상태 변경 ───

export async function setAgentStatus(agentId: string, status: string): Promise<void> {
	try {
		await query(
			`UPDATE cogochi_agents SET status = $2, updated_at = NOW() WHERE id = $1`,
			[agentId, status],
		);
	} catch {
		/* graceful */
	}
}

// ─── Agent 조회 ───

export async function getAgent(agentId: string, ownerAddress?: string): Promise<CogAgent | null> {
	try {
		const sql = ownerAddress
			? `SELECT * FROM cogochi_agents WHERE id = $1 AND owner_address = $2`
			: `SELECT * FROM cogochi_agents WHERE id = $1`;
		const params = ownerAddress ? [agentId, ownerAddress] : [agentId];
		const result = await query<Record<string, unknown>>(sql, params);
		const row = result.rows[0];
		if (!row) return null;
		return mapAgentRow(row);
	} catch {
		return null;
	}
}

// ─── Scenario 조회 ───

export async function getScenario(scenarioId: string): Promise<CogScenario | null> {
	try {
		const result = await query<Record<string, unknown>>(
			`SELECT * FROM cogochi_scenarios WHERE id = $1`,
			[scenarioId],
		);
		const row = result.rows[0];
		if (!row) return null;
		return {
			id: String(row.id),
			symbol: String(row.symbol),
			interval: String(row.interval),
			startTs: Number(row.start_ts),
			endTs: Number(row.end_ts),
			candles: (row.candles as Record<string, unknown>[]) ?? [],
			futureCandles: (row.future_candles as Record<string, unknown>[]) ?? [],
			snapshot: row.snapshot as unknown as import('$lib/engine/cogochiTypes').SignalSnapshot,
			difficulty: (row.difficulty as 'EASY' | 'NORMAL' | 'HARD') ?? null,
		};
	} catch {
		return null;
	}
}

export async function listScenarios(): Promise<Array<{ id: string; symbol: string; interval: string; difficulty: string | null }>> {
	try {
		const result = await query<Record<string, unknown>>(
			`SELECT id, symbol, interval, start_ts, end_ts, difficulty FROM cogochi_scenarios ORDER BY difficulty, id`,
		);
		return result.rows.map((r: Record<string, unknown>) => ({
			id: String(r.id),
			symbol: String(r.symbol),
			interval: String(r.interval),
			startTs: Number(r.start_ts),
			endTs: Number(r.end_ts),
			difficulty: r.difficulty ? String(r.difficulty) : null,
		}));
	} catch {
		return [];
	}
}

// ─── Recent battles ───

export async function getRecentBattles(agentId: string, limit: number = 30): Promise<CogBattleResult[]> {
	try {
		const result = await query<Record<string, unknown>>(
			`SELECT * FROM cogochi_battle_results WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
			[agentId, limit],
		);
		return result.rows.map(mapBattleRow);
	} catch {
		return [];
	}
}

// ─── Row mappers ───

function mapAgentRow(row: Record<string, unknown>): CogAgent {
	return {
		id: String(row.id),
		ownerAddress: String(row.owner_address),
		name: String(row.name),
		archetypeId: String(row.archetype_id) as CogAgent['archetypeId'],
		stage: Number(row.stage) as CogAgent['stage'],
		level: Number(row.level),
		xp: Number(row.xp),
		bond: Number(row.bond),
		doctrine: (row.doctrine as CogAgent['doctrine']) ?? ({} as CogAgent['doctrine']),
		skillLoadout: (row.skill_loadout as CogAgent['skillLoadout']) ?? { dataSkills: {}, maxSkillCallsPerTick: 3, totalBudgetMs: 6000 },
		modelVersion: row.model_version ? String(row.model_version) : null,
		nftTokenId: row.nft_token_id ? String(row.nft_token_id) : null,
		status: String(row.status) as CogAgent['status'],
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
	};
}

function mapBattleRow(row: Record<string, unknown>): CogBattleResult {
	return {
		id: String(row.id),
		agentId: String(row.agent_id),
		scenarioId: String(row.scenario_id),
		outcome: String(row.outcome) as CogBattleResult['outcome'],
		agentAction: String(row.agent_action) as CogBattleResult['agentAction'],
		trainerAction: row.trainer_action ? String(row.trainer_action) as CogBattleResult['trainerAction'] : null,
		confidence: Number(row.confidence ?? 0),
		thesis: String(row.thesis ?? ''),
		reflection: String(row.reflection ?? ''),
		skillsUsed: (row.skills_used as string[]) ?? [],
		pnl: Number(row.pnl ?? 0),
		chainCommitHash: row.chain_commit_hash ? String(row.chain_commit_hash) : null,
		xpGained: Number(row.xp_gained ?? 0),
		bondGained: Number(row.bond_gained ?? 0),
		snapshot: (row.snapshot as CogBattleResult['snapshot']) ?? null,
		skillResults: (row.skill_results as CogBattleResult['skillResults']) ?? null,
		createdAt: String(row.created_at),
	};
}
