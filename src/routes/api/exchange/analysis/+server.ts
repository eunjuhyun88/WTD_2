// ═══════════════════════════════════════════════════════════════
// COGOCHI — Trade Analysis API
// GET: Analyze imported trades → trading profile
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { analyzeTradePattern } from '$lib/server/exchange/patternAnalyzer.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return json({ error: 'userId required' }, { status: 400 });
    }

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
