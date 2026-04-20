// ═══════════════════════════════════════════════════════════════
// COGOCHI — Doctrine API
// GET: Fetch active doctrine for agent
// POST: Create/update doctrine
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query } from '$lib/server/db.js';
import { getAuthUserFromCookies } from '$lib/server/authGuard.js';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const agentId = url.searchParams.get('agentId');
    const userId = url.searchParams.get('userId');

    if (!agentId || !userId) {
      return json({ error: 'agentId and userId required' }, { status: 400 });
    }

    const authUser = await getAuthUserFromCookies(cookies);
    if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
    if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });

    const result = await query(
      `SELECT * FROM doctrines WHERE agent_id = $1 AND user_id = $2 AND active = true LIMIT 1`,
      [agentId, userId],
    );

    if (result.rows.length === 0) {
      return json({ success: true, data: null });
    }

    return json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error('[api/doctrine] GET error:', err);
    return json({ error: 'Failed to fetch doctrine' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const {
      agentId, userId, archetype, systemPrompt,
      rolePrompt, riskStyle, horizon, signalWeights,
      naturalRules, enabledDataSources, autorunObjective,
    } = body;

    if (!agentId || !userId || !archetype || !systemPrompt) {
      return json({ error: 'agentId, userId, archetype, systemPrompt required' }, { status: 400 });
    }

    const authUser = await getAuthUserFromCookies(cookies);
    if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
    if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });

    // Deactivate previous doctrine
    await query(
      `UPDATE doctrines SET active = false, updated_at = NOW()
       WHERE agent_id = $1 AND user_id = $2 AND active = true`,
      [agentId, userId],
    );

    // Insert new doctrine
    const result = await query<{ id: string; version: number }>(
      `INSERT INTO doctrines (
        agent_id, user_id, archetype, system_prompt, role_prompt,
        risk_style, horizon, signal_weights, natural_rules,
        enabled_data_sources, autorun_objective, version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        COALESCE((SELECT MAX(version) FROM doctrines WHERE agent_id = $1 AND user_id = $2), 0) + 1
      )
      RETURNING id, version`,
      [
        agentId, userId, archetype, systemPrompt,
        rolePrompt ?? null,
        riskStyle ?? 'moderate',
        horizon ?? 'swing',
        JSON.stringify(signalWeights ?? { cvdDivergence: 0.5, fundingRate: 0.5, openInterest: 0.5, htfStructure: 0.5 }),
        naturalRules ?? [],
        enabledDataSources ?? ['cvd', 'funding', 'oi', 'htf'],
        autorunObjective ?? null,
      ],
    );

    return json({
      success: true,
      id: result.rows[0]?.id,
      version: result.rows[0]?.version,
    });
  } catch (err: any) {
    console.error('[api/doctrine] POST error:', err);
    return json({ error: 'Failed to save doctrine' }, { status: 500 });
  }
};
