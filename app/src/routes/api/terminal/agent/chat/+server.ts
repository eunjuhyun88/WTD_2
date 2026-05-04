/**
 * POST /api/terminal/agent/chat
 *
 * BFF SSE proxy for AI agent chat stream.
 * Forwards to engine /agent/chat and streams response directly.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';

const QUOTA_LIMITS: Record<string, number> = { free: 20, pro: 500, team: 2000 };

const ChatSchema = z.object({
  message: z.string().min(1).max(4000),
  symbol: z.string().default('BTCUSDT'),
  timeframe: z.string().default('4h'),
});

export async function POST({ request, cookies }: RequestEvent) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'invalid request' }, { status: 422 });
  }

  const user = await getAuthUserFromCookies(cookies);

  // ── Tier resolution ──────────────────────────────────────────────────────
  let tier = 'free';
  if (user) {
    const pref = await query<{ tier: string }>(
      'SELECT tier FROM user_preferences WHERE user_id = $1',
      [user.id],
    );
    tier = pref.rows[0]?.tier ?? 'free';
  }

  // ── Quota check (authenticated users only) ───────────────────────────────
  if (user) {
    const limit = QUOTA_LIMITS[tier] ?? 20;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const qRow = await query<{ msg_count: number }>(
      `SELECT msg_count FROM agent_quota_daily WHERE user_id = $1 AND date = $2`,
      [user.id, today],
    );
    const used = qRow.rows[0]?.msg_count ?? 0;
    if (used >= limit) {
      return json(
        { error: 'quota_exceeded', tier, limit, used, upgrade_url: '/upgrade' },
        { status: 429 },
      );
    }
    // Increment quota (upsert)
    await query(
      `INSERT INTO agent_quota_daily (user_id, date, msg_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, date)
       DO UPDATE SET msg_count = agent_quota_daily.msg_count + 1`,
      [user.id, today],
    );
  }

  const engineBody = {
    ...parsed.data,
    tier,
    ...(user ? { user_id: user.id } : {}),
  };

  // Stream directly from engine — do NOT buffer
  const res = await fetch(`${ENGINE_URL}/agent/chat`, {
    method: 'POST',
    headers: buildEngineHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(engineBody),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    return json({ error: `engine error ${res.status}`, detail: errText }, { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
