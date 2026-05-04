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
  const engineBody = {
    ...parsed.data,
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
