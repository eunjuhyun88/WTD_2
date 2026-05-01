// ═══════════════════════════════════════════════════════════════
// COGOCHI — On-chain Track Record Hash
// Pre-battle commit + post-battle reveal (ERC-8004 pattern)
// Design: Cogochi_TrackRecordOnChain_20260322
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { query } from '$lib/server/db.js';

// ─── Types ─────────────────────────────────────────────────────

interface PreBattlePayload {
  agentId: string;
  agentVersion: number;
  promptFingerprint: string;
  scenarioId: string;
  scenarioStart: number;
  scenarioEnd: number;
  tickCount: number;
  symbol: string;
  dataHash: string;
  committedAt: number;
  salt: string;
}

interface BattleResultPayload {
  commitHash: string;
  finalAction: string;
  finalConfidence: number;
  outcome: string;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  tickCount: number;
  revealedAt: number;
}

export interface CommitReceipt {
  commitHash: string;
  payload: PreBattlePayload;
  dbId: string;
}

export interface RevealReceipt {
  resultHash: string;
  payload: BattleResultPayload;
}

// ─── Pre-battle commit ─────────────────────────────────────────

export async function preBattleCommit(
  userId: string,
  agentId: string,
  agentVersion: number,
  systemPrompt: string,
  scenarioId: string,
  scenarioStart: number,
  scenarioEnd: number,
  tickCount: number,
  dataHash: string,
  symbol: string = 'BTCUSDT',
): Promise<CommitReceipt> {
  const payload: PreBattlePayload = {
    agentId,
    agentVersion,
    promptFingerprint: hashSHA256(systemPrompt),
    scenarioId,
    scenarioStart,
    scenarioEnd,
    tickCount,
    symbol,
    dataHash,
    committedAt: Date.now(),
    salt: crypto.randomUUID(),
  };

  const commitHash = hashSHA256(JSON.stringify(payload));

  // Save to DB (on-chain submission will happen in Phase 2)
  const result = await query<{ id: string }>(
    `INSERT INTO track_record_commits (
      agent_id, user_id, scenario_id, commit_hash, commit_payload
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [agentId, userId, scenarioId, commitHash, JSON.stringify(payload)],
  );

  return {
    commitHash,
    payload,
    dbId: result.rows[0]?.id ?? '',
  };
}

// ─── Post-battle reveal ────────────────────────────────────────

export async function postBattleReveal(
  commitReceipt: CommitReceipt,
  finalAction: string,
  finalConfidence: number,
  outcome: string,
  winRate: number,
  maxDrawdown: number,
  sharpeRatio: number,
  tickCount: number,
): Promise<RevealReceipt> {
  const payload: BattleResultPayload = {
    commitHash: commitReceipt.commitHash,
    finalAction,
    finalConfidence,
    outcome,
    winRate,
    maxDrawdown,
    sharpeRatio,
    tickCount,
    revealedAt: Date.now(),
  };

  const resultHash = hashSHA256(JSON.stringify(payload));

  // Update DB record with result
  await query(
    `UPDATE track_record_commits
     SET result_hash = $1, result_payload = $2, outcome = $3, revealed_at = NOW()
     WHERE commit_hash = $4`,
    [resultHash, JSON.stringify(payload), outcome, commitReceipt.commitHash],
  );

  return { resultHash, payload };
}

// ─── Verify a track record ─────────────────────────────────────

export async function verifyTrackRecord(
  commitHash: string,
): Promise<{
  verified: boolean;
  commit?: PreBattlePayload;
  result?: BattleResultPayload;
  error?: string;
}> {
  try {
    const record = await query<{
      commit_hash: string;
      commit_payload: string;
      result_hash: string;
      result_payload: string;
    }>(
      `SELECT commit_hash, commit_payload, result_hash, result_payload
       FROM track_record_commits
       WHERE commit_hash = $1`,
      [commitHash],
    );

    if (record.rows.length === 0) {
      return { verified: false, error: 'Commit not found' };
    }

    const row = record.rows[0];
    const commit: PreBattlePayload = JSON.parse(row.commit_payload);
    const result: BattleResultPayload | undefined = row.result_payload
      ? JSON.parse(row.result_payload)
      : undefined;

    // Verify commit hash integrity
    const recomputedCommit = hashSHA256(JSON.stringify(commit));
    if (recomputedCommit !== row.commit_hash) {
      return { verified: false, error: 'Commit hash mismatch — data may be tampered' };
    }

    // Verify result hash if exists
    if (result && row.result_hash) {
      const recomputedResult = hashSHA256(JSON.stringify(result));
      if (recomputedResult !== row.result_hash) {
        return { verified: false, error: 'Result hash mismatch — data may be tampered' };
      }
    }

    return { verified: true, commit, result };
  } catch (err: any) {
    return { verified: false, error: err?.message };
  }
}

// ─── Get agent track record summary ────────────────────────────

export async function getAgentTrackRecord(
  agentId: string,
): Promise<{
  totalCommits: number;
  totalRevealed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}> {
  try {
    const result = await query<{
      total: number;
      revealed: number;
      wins: number;
      losses: number;
      draws: number;
    }>(
      `SELECT
         COUNT(*)::INTEGER as total,
         COUNT(result_hash)::INTEGER as revealed,
         COUNT(*) FILTER (WHERE outcome = 'WIN')::INTEGER as wins,
         COUNT(*) FILTER (WHERE outcome = 'LOSS')::INTEGER as losses,
         COUNT(*) FILTER (WHERE outcome = 'DRAW')::INTEGER as draws
       FROM track_record_commits
       WHERE agent_id = $1`,
      [agentId],
    );

    const row = result.rows[0] ?? { total: 0, revealed: 0, wins: 0, losses: 0, draws: 0 };
    const totalDecided = row.wins + row.losses;
    const winRate = totalDecided > 0 ? row.wins / totalDecided : 0;

    return { totalCommits: row.total, totalRevealed: row.revealed, wins: row.wins, losses: row.losses, draws: row.draws, winRate };
  } catch {
    return { totalCommits: 0, totalRevealed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
  }
}

// ─── Helper ────────────────────────────────────────────────────

function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
