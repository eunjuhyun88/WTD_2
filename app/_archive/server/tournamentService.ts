import { withTransaction, query } from '$lib/server/db';

export type TournamentType = 'DAILY_SPRINT' | 'WEEKLY_CUP' | 'SEASON_CHAMPIONSHIP';
export type TournamentStatus = 'REG_OPEN' | 'REG_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface TournamentActiveRecord {
  tournamentId: string;
  type: TournamentType;
  pair: string;
  status: TournamentStatus;
  maxPlayers: number;
  registeredPlayers: number;
  entryFeeLp: number;
  startAt: string;
}

export interface TournamentRegisterResult {
  tournamentId: string;
  registered: boolean;
  seed: number;
  lpDelta: number;
}

export interface TournamentSide {
  userId: string;
  nickname: string;
}

export interface TournamentBracketMatch {
  matchIndex: number;
  userA: TournamentSide | null;
  userB: TournamentSide | null;
  winnerId: string | null;
  matchId: string | null;
}

export interface TournamentBracketResult {
  tournamentId: string;
  round: number;
  matches: TournamentBracketMatch[];
}

type ActiveTournamentRow = {
  tournament_id: string;
  type: TournamentType;
  pair: string;
  status: TournamentStatus;
  max_players: number;
  registered_players: string;
  entry_fee_lp: number;
  start_at: string;
};

type TournamentBracketRow = {
  round: number;
  match_index: number;
  user_a_id: string | null;
  user_a_name: string | null;
  user_b_id: string | null;
  user_b_name: string | null;
  winner_id: string | null;
  match_id: string | null;
};

type TournamentRegistrationRow = {
  user_id: string;
  nickname: string | null;
  seed: number | null;
};

const TABLE_UNAVAILABLE = new Set(['42P01', '42703', '23503']);
function isTableError(err: unknown): boolean {
  const errObj = err as Record<string, unknown> | null | undefined;
  const code = typeof errObj?.code === 'string' ? errObj.code : '';
  return TABLE_UNAVAILABLE.has(code) || (typeof errObj?.message === 'string' && (errObj.message as string).includes('DATABASE_URL is not set'));
}

export class TournamentError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function isTournamentError(err: unknown): err is TournamentError {
  return err instanceof TournamentError;
}

type MemoryTournament = TournamentActiveRecord & {
  registrations: Set<string>;
};

function isoFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

const MEMORY_TOURNAMENTS: MemoryTournament[] = [
  {
    tournamentId: 'demo-daily-sprint-btc',
    type: 'DAILY_SPRINT',
    pair: 'BTC/USDT',
    status: 'REG_OPEN',
    maxPlayers: 8,
    registeredPlayers: 5,
    entryFeeLp: 50,
    startAt: isoFromNow(6),
    registrations: new Set(['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5']),
  },
  {
    tournamentId: 'demo-weekly-cup-eth',
    type: 'WEEKLY_CUP',
    pair: 'ETH/USDT',
    status: 'REG_OPEN',
    maxPlayers: 16,
    registeredPlayers: 10,
    entryFeeLp: 100,
    startAt: isoFromNow(48),
    registrations: new Set(['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6', 'bot-7', 'bot-8', 'bot-9', 'bot-10']),
  },
  {
    tournamentId: 'demo-season-championship-sol',
    type: 'SEASON_CHAMPIONSHIP',
    pair: 'SOL/USDT',
    status: 'REG_CLOSED',
    maxPlayers: 32,
    registeredPlayers: 32,
    entryFeeLp: 0,
    startAt: isoFromNow(120),
    registrations: new Set(Array.from({ length: 32 }, (_, i) => `seed-${i + 1}`)),
  },
];

const MEMORY_USER_LP = new Map<string, number>();

function getMemoryUserLp(userId: string): number {
  const current = MEMORY_USER_LP.get(userId);
  if (typeof current === 'number') return current;
  const initial = 1200;
  MEMORY_USER_LP.set(userId, initial);
  return initial;
}

function shortName(userId: string): string {
  return userId.length <= 8 ? userId : userId.slice(0, 8);
}

function toActiveRecord(t: MemoryTournament): TournamentActiveRecord {
  const registeredPlayers = t.registrations.size;
  return {
    tournamentId: t.tournamentId,
    type: t.type,
    pair: t.pair,
    status: registeredPlayers >= t.maxPlayers && t.status === 'REG_OPEN' ? 'REG_CLOSED' : t.status,
    maxPlayers: t.maxPlayers,
    registeredPlayers,
    entryFeeLp: t.entryFeeLp,
    startAt: t.startAt,
  };
}

function buildBracketFromUsers(tournamentId: string, users: TournamentSide[]): TournamentBracketResult {
  const matches: TournamentBracketMatch[] = [];
  for (let i = 0; i < users.length; i += 2) {
    matches.push({
      matchIndex: Math.floor(i / 2) + 1,
      userA: users[i] ?? null,
      userB: users[i + 1] ?? null,
      winnerId: null,
      matchId: null,
    });
  }

  return {
    tournamentId,
    round: 1,
    matches,
  };
}

function listActiveTournamentsMemory(): TournamentActiveRecord[] {
  return MEMORY_TOURNAMENTS
    .map(toActiveRecord)
    .filter((t) => t.status === 'REG_OPEN' || t.status === 'REG_CLOSED' || t.status === 'IN_PROGRESS')
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

function registerTournamentMemory(userId: string, tournamentId: string): TournamentRegisterResult {
  const t = MEMORY_TOURNAMENTS.find((x) => x.tournamentId === tournamentId);
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', 404, 'Tournament not found');

  const current = toActiveRecord(t);
  if (current.status !== 'REG_OPEN') {
    throw new TournamentError('TOURNAMENT_LOCKED', 403, 'Tournament registration is closed');
  }

  if (t.registrations.has(userId)) {
    throw new TournamentError('ALREADY_REGISTERED', 409, 'Already registered for this tournament');
  }

  if (t.registrations.size >= t.maxPlayers) {
    t.status = 'REG_CLOSED';
    throw new TournamentError('TOURNAMENT_FULL', 409, 'Tournament is full');
  }

  const currentLp = getMemoryUserLp(userId);
  if (t.entryFeeLp > 0 && currentLp < t.entryFeeLp) {
    throw new TournamentError('INSUFFICIENT_LP', 422, 'Not enough LP to register');
  }

  t.registrations.add(userId);
  if (t.registrations.size >= t.maxPlayers) t.status = 'REG_CLOSED';

  const nextLp = currentLp - t.entryFeeLp;
  MEMORY_USER_LP.set(userId, nextLp);

  return {
    tournamentId: t.tournamentId,
    registered: true,
    seed: t.registrations.size,
    lpDelta: -t.entryFeeLp,
  };
}

function getTournamentBracketMemory(tournamentId: string): TournamentBracketResult | null {
  const t = MEMORY_TOURNAMENTS.find((x) => x.tournamentId === tournamentId);
  if (!t) return null;

  const users = Array.from(t.registrations)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ userId: id, nickname: `@${shortName(id)}` }));

  return buildBracketFromUsers(t.tournamentId, users);
}

export async function listActiveTournaments(limit = 20): Promise<TournamentActiveRecord[]> {
  try {
    const res = await query<ActiveTournamentRow>(
      `SELECT
         t.id AS tournament_id,
         t.type,
         t.pair,
         t.status,
         t.max_players,
         COUNT(r.user_id)::text AS registered_players,
         t.entry_fee_lp,
         t.start_at
       FROM tournaments t
       LEFT JOIN tournament_registrations r
         ON r.tournament_id = t.id
       WHERE t.status IN ('REG_OPEN', 'REG_CLOSED', 'IN_PROGRESS')
       GROUP BY t.id
       ORDER BY t.start_at ASC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((row: ActiveTournamentRow) => ({
      tournamentId: row.tournament_id,
      type: row.type,
      pair: row.pair,
      status: row.status,
      maxPlayers: Number(row.max_players),
      registeredPlayers: Number(row.registered_players || '0'),
      entryFeeLp: Number(row.entry_fee_lp || 0),
      startAt: row.start_at,
    }));
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
    return listActiveTournamentsMemory().slice(0, Math.max(1, Math.min(100, limit)));
  }
}

export async function registerTournament(userId: string, tournamentId: string): Promise<TournamentRegisterResult> {
  try {
    return await withTransaction(async (client) => {
      const tRes = await client.query<{
        id: string;
        status: TournamentStatus;
        max_players: number;
        entry_fee_lp: number;
      }>(
        `SELECT id, status, max_players, entry_fee_lp
         FROM tournaments
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [tournamentId]
      );

      const t = tRes.rows[0];
      if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', 404, 'Tournament not found');

      if (t.status !== 'REG_OPEN') {
        throw new TournamentError('TOURNAMENT_LOCKED', 403, 'Tournament registration is closed');
      }

      const exists = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM tournament_registrations
           WHERE tournament_id = $1 AND user_id = $2
         ) AS exists`,
        [tournamentId, userId]
      );

      if (exists.rows[0]?.exists) {
        throw new TournamentError('ALREADY_REGISTERED', 409, 'Already registered for this tournament');
      }

      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM tournament_registrations
         WHERE tournament_id = $1`,
        [tournamentId]
      );

      const registeredPlayers = Number(countRes.rows[0]?.count ?? '0');
      if (registeredPlayers >= Number(t.max_players)) {
        throw new TournamentError('TOURNAMENT_FULL', 409, 'Tournament is full');
      }

      const entryFee = Number(t.entry_fee_lp ?? 0);
      let lpDelta = -entryFee;

      if (entryFee > 0) {
        try {
          const deductRes = await client.query<{ total_lp: string }>(
            `UPDATE users
             SET total_lp = total_lp - $1
             WHERE id = $2 AND total_lp >= $1
             RETURNING total_lp::text`,
            [entryFee, userId]
          );

          if (!deductRes.rows[0]) {
            throw new TournamentError('INSUFFICIENT_LP', 422, 'Not enough LP to register');
          }
        } catch (err: unknown) {
          if (err instanceof TournamentError) throw err;
          if ((err as Record<string, unknown>)?.code === '42703') {
            lpDelta = 0;
          } else {
            throw err;
          }
        }
      }

      const seed = registeredPlayers + 1;
      await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id, seed, paid_lp)
         VALUES ($1, $2, $3, $4)`,
        [tournamentId, userId, seed, entryFee]
      );

      return {
        tournamentId,
        registered: true,
        seed,
        lpDelta,
      };
    });
  } catch (err: unknown) {
    if (isTournamentError(err)) throw err;
    if (!isTableError(err)) throw err;
    return registerTournamentMemory(userId, tournamentId);
  }
}

export async function getTournamentBracket(tournamentId: string): Promise<TournamentBracketResult | null> {
  try {
    const rows = await query<TournamentBracketRow>(
      `SELECT
         b.round,
         b.match_index,
         b.user_a_id,
         ua.nickname AS user_a_name,
         b.user_b_id,
         ub.nickname AS user_b_name,
         b.winner_id,
         b.match_id
       FROM tournament_brackets b
       LEFT JOIN users ua ON ua.id = b.user_a_id
       LEFT JOIN users ub ON ub.id = b.user_b_id
       WHERE b.tournament_id = $1
       ORDER BY b.round ASC, b.match_index ASC`,
      [tournamentId]
    );

    if (rows.rowCount && rows.rowCount > 0) {
      const bracketRows: TournamentBracketRow[] = rows.rows;
      const maxRound = bracketRows.reduce((maxRoundValue: number, row: TournamentBracketRow) => {
        return Math.max(maxRoundValue, Number(row.round || 1));
      }, 1);
      const activeRound = bracketRows.find((row: TournamentBracketRow) => !row.winner_id)?.round ?? maxRound;
      const matches = bracketRows
        .filter((row: TournamentBracketRow) => row.round === activeRound)
        .map((row: TournamentBracketRow) => ({
          matchIndex: Number(row.match_index),
          userA: row.user_a_id ? { userId: row.user_a_id, nickname: row.user_a_name || `@${shortName(row.user_a_id)}` } : null,
          userB: row.user_b_id ? { userId: row.user_b_id, nickname: row.user_b_name || `@${shortName(row.user_b_id)}` } : null,
          winnerId: row.winner_id,
          matchId: row.match_id,
        }));

      return {
        tournamentId,
        round: Number(activeRound),
        matches,
      };
    }

    const regRows = await query<TournamentRegistrationRow>(
      `SELECT r.user_id, u.nickname, r.seed
       FROM tournament_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.tournament_id = $1
       ORDER BY COALESCE(r.seed, 9999) ASC, r.registered_at ASC`,
      [tournamentId]
    );

    if (!regRows.rowCount || regRows.rowCount === 0) {
      const exists = await query<{ id: string }>(
        `SELECT id FROM tournaments WHERE id = $1 LIMIT 1`,
        [tournamentId]
      );
      if (!exists.rows[0]) return null;
      return { tournamentId, round: 1, matches: [] };
    }

    const users: TournamentSide[] = regRows.rows.map((row: TournamentRegistrationRow) => ({
      userId: row.user_id,
      nickname: row.nickname || `@${shortName(row.user_id)}`,
    }));

    return buildBracketFromUsers(tournamentId, users);
  } catch (err: unknown) {
    if (!isTableError(err)) throw err;
    return getTournamentBracketMemory(tournamentId);
  }
}
