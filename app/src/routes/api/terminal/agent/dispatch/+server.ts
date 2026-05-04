/**
 * POST /api/terminal/agent/dispatch
 *
 * BFF proxy for AI agent LLM commands: explain | scan | similar | judge | save.
 * Injects user_id from session — required by /agent/save, optional for others.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

const DispatchSchema = z.object({
  cmd: z.enum(['explain', 'scan', 'similar', 'judge', 'save']),
  args: z.string().default(''),
  context: z.record(z.unknown()).optional(),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = DispatchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'invalid request' }, { status: 422 });
  }

  const { cmd, context } = parsed.data;

  // /agent/save requires user_id; /agent/judge logs it optionally.
  const user = await getAuthUserFromCookies(cookies);
  if (cmd === 'save' && !user) {
    return json({ error: 'authentication required' }, { status: 401 });
  }

  const enginePath = `/agent/${cmd}`;
  const engineBody: Record<string, unknown> = { ...(context ?? {}) };
  if (user) engineBody.user_id = user.id;

  try {
    const res = await engineFetch(enginePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(engineBody),
      signal: AbortSignal.timeout(35_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json({ error: `engine error ${res.status}`, detail: errText }, { status: res.status });
    }

    const data = await res.json();
    return json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return json({ error: msg }, { status: 503 });
  }
};
