/**
 * GET /api/terminal/agent/models
 *
 * Proxies to engine GET /agent/chat/models — returns list of available LLM models
 * for the UI model selector in ChatThread.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';

export async function GET(_event: RequestEvent) {
  try {
    const res = await fetch(`${ENGINE_URL}/agent/chat/models`, {
      headers: buildEngineHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return json({ models: [] }, { status: 200 }); // graceful fallback
    }
    const data = await res.json() as { models: unknown[] };
    return json(data);
  } catch {
    // Engine unreachable — return empty list, UI shows default
    return json({ models: [] }, { status: 200 });
  }
}
