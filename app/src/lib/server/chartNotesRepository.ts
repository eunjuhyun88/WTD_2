import { query } from './db';

export interface ChartNote {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  bar_time: number;
  price_at_write: number;
  body: string;
  tag: 'idea' | 'entry' | 'exit' | 'mistake' | 'observation';
  created_at: string;
  updated_at: string;
}

export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/[-_/]/g, '');
}

export async function listNotes(userId: string, symbol: string, timeframe: string): Promise<ChartNote[]> {
  const sym = normalizeSymbol(symbol);
  const { rows } = await query<ChartNote>(
    `SELECT id, user_id, symbol, timeframe, bar_time, price_at_write::float8 AS price_at_write,
            body, tag, created_at, updated_at
     FROM chart_notes
     WHERE user_id = $1 AND symbol = $2 AND timeframe = $3
     ORDER BY bar_time ASC`,
    [userId, sym, timeframe],
  );
  return rows;
}

export async function countNotes(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    'SELECT count(*)::text AS count FROM chart_notes WHERE user_id = $1',
    [userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function insertNote(
  userId: string,
  input: { symbol: string; timeframe: string; bar_time: number; price_at_write: number; body: string; tag: string },
): Promise<ChartNote> {
  const sym = normalizeSymbol(input.symbol);
  const { rows } = await query<ChartNote>(
    `INSERT INTO chart_notes (user_id, symbol, timeframe, bar_time, price_at_write, body, tag)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, user_id, symbol, timeframe, bar_time,
               price_at_write::float8 AS price_at_write, body, tag, created_at, updated_at`,
    [userId, sym, input.timeframe, input.bar_time, input.price_at_write, input.body.trim(), input.tag],
  );
  return rows[0];
}

export async function updateNote(
  userId: string,
  id: string,
  patch: { body?: string; tag?: string },
): Promise<ChartNote | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  if (patch.body !== undefined) { sets.push(`body = $${vals.push(patch.body.trim())}`); }
  if (patch.tag  !== undefined) { sets.push(`tag  = $${vals.push(patch.tag)}`);  }
  if (!sets.length) return null;
  const { rows } = await query<ChartNote>(
    `UPDATE chart_notes SET ${sets.join(', ')}
     WHERE user_id = $1 AND id = $2
     RETURNING id, user_id, symbol, timeframe, bar_time,
               price_at_write::float8 AS price_at_write, body, tag, created_at, updated_at`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(
    'DELETE FROM chart_notes WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}
