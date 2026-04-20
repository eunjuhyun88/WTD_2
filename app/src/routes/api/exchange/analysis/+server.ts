// ═══════════════════════════════════════════════════════════════
// COGOCHI — Trade Analysis API
// GET: Analyze imported trades → trading profile
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { analyzeTradePattern } from '$lib/server/exchange/patternAnalyzer.js';
import { getAuthUserFromCookies } from '$lib/server/authGuard.js';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return json({ error: 'userId required' }, { status: 400 });
    }

    const authUser = await getAuthUserFromCookies(cookies);
    if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
    if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });

    const { profile, error } = await analyzeTradePattern(userId);

    if (error) {
      return json({ error }, { status: 400 });
    }

    return json({ success: true, data: profile });
  } catch (err: any) {
    console.error('[api/exchange/analysis] GET error:', err);
    return json({ error: 'Failed to analyze trades' }, { status: 500 });
  }
};
