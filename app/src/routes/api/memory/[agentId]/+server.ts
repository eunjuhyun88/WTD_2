// ═══════════════════════════════════════════════════════════════
// COGOCHI — Memory API: Get/create agent memories
// GET: L1 recent memories for an agent
// POST: Create a DOCTRINE card manually
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getL1RecentMemory } from '$lib/server/memory/l1Recent.js';
import { saveDoctrine } from '$lib/server/memory/memoryCardBuilder.js';
import { getAuthUserFromCookies } from '$lib/server/authGuard.js';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
  try {
    const agentId = params.agentId;
    const userId = url.searchParams.get('userId');

    if (!agentId || !userId) {
      return json({ error: 'agentId and userId required' }, { status: 400 });
    }

    const authUser = await getAuthUserFromCookies(cookies);
    if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
    if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });

    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
    const memories = await getL1RecentMemory(agentId, userId, limit);

    return json({ success: true, data: memories });
  } catch (err: any) {
    console.error('[api/memory] GET error:', err);
    return json({ error: 'Failed to fetch memories' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
  try {
    const agentId = params.agentId;
    const body = await request.json();
    const { userId, title, lesson, detail } = body;

    if (!agentId || !userId || !title || !lesson) {
      return json({ error: 'agentId, userId, title, lesson required' }, { status: 400 });
    }

    const authUser = await getAuthUserFromCookies(cookies);
    if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
    if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });

    const result = await saveDoctrine(userId, agentId, title, lesson, detail);

    if (!result.success) {
      return json({ error: result.error }, { status: 500 });
    }

    return json({ success: true, id: result.id });
  } catch (err: any) {
    console.error('[api/memory] POST error:', err);
    return json({ error: 'Failed to save doctrine' }, { status: 500 });
  }
};
