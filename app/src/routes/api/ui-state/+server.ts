import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

const MOBILE_TABS = new Set(['warroom', 'chart', 'intel']);
const ACTIVE_TABS = new Set(['intel', 'community', 'positions']);
const INNER_TABS = new Set(['chat', 'headlines', 'events', 'flow']);
const PASSPORT_TABS = new Set(['profile', 'wallet', 'positions', 'arena']);
const ORACLE_PERIODS = new Set(['7d', '30d', 'all']);
const ORACLE_SORTS = new Set(['accuracy', 'level', 'sample', 'conf']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>) {
  return {
    userId: row.user_id,
    terminalLeftWidth: Number(row.terminal_left_width ?? 280),
    terminalRightWidth: Number(row.terminal_right_width ?? 300),
    terminalLeftCollapsed: Boolean(row.terminal_left_collapsed),
    terminalRightCollapsed: Boolean(row.terminal_right_collapsed),
    terminalMobileTab: row.terminal_mobile_tab,
    terminalActiveTab: row.terminal_active_tab,
    terminalInnerTab: row.terminal_inner_tab,
    passportActiveTab: row.passport_active_tab,
    signalsFilter: row.signals_filter,
    oraclePeriod: row.oracle_period,
    oracleSort: row.oracle_sort,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function ensureUiState(userId: string) {
  const upsert = await query(
    `
      INSERT INTO user_ui_state (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING *
    `,
    [userId]
  );

  return upsert.rows[0];
}

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const row = await ensureUiState(user.id);
    return json({ success: true, uiState: mapRow(row) });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[ui-state/get] unexpected error:', error);
    return json({ error: 'Failed to load ui state' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();

    const terminalLeftWidth = body?.terminalLeftWidth == null ? null : toBoundedInt(body.terminalLeftWidth, 280, 0, 900);
    const terminalRightWidth = body?.terminalRightWidth == null ? null : toBoundedInt(body.terminalRightWidth, 300, 0, 900);
    const terminalLeftCollapsed = typeof body?.terminalLeftCollapsed === 'boolean' ? body.terminalLeftCollapsed : null;
    const terminalRightCollapsed = typeof body?.terminalRightCollapsed === 'boolean' ? body.terminalRightCollapsed : null;

    const terminalMobileTab = typeof body?.terminalMobileTab === 'string' ? body.terminalMobileTab.trim() : null;
    const terminalActiveTab = typeof body?.terminalActiveTab === 'string' ? body.terminalActiveTab.trim() : null;
    const terminalInnerTab = typeof body?.terminalInnerTab === 'string' ? body.terminalInnerTab.trim() : null;
    const passportActiveTab = typeof body?.passportActiveTab === 'string' ? body.passportActiveTab.trim() : null;

    const signalsFilter = typeof body?.signalsFilter === 'string' ? body.signalsFilter.trim() : null;
    const oraclePeriod = typeof body?.oraclePeriod === 'string' ? body.oraclePeriod.trim() : null;
    const oracleSort = typeof body?.oracleSort === 'string' ? body.oracleSort.trim() : null;

    if (terminalMobileTab && !MOBILE_TABS.has(terminalMobileTab)) return json({ error: 'Invalid terminalMobileTab' }, { status: 400 });
    if (terminalActiveTab && !ACTIVE_TABS.has(terminalActiveTab)) return json({ error: 'Invalid terminalActiveTab' }, { status: 400 });
    if (terminalInnerTab && !INNER_TABS.has(terminalInnerTab)) return json({ error: 'Invalid terminalInnerTab' }, { status: 400 });
    if (passportActiveTab && !PASSPORT_TABS.has(passportActiveTab)) return json({ error: 'Invalid passportActiveTab' }, { status: 400 });
    if (oraclePeriod && !ORACLE_PERIODS.has(oraclePeriod)) return json({ error: 'Invalid oraclePeriod' }, { status: 400 });
    if (oracleSort && !ORACLE_SORTS.has(oracleSort)) return json({ error: 'Invalid oracleSort' }, { status: 400 });

    const result = await query(
      `
        INSERT INTO user_ui_state (
          user_id,
          terminal_left_width,
          terminal_right_width,
          terminal_left_collapsed,
          terminal_right_collapsed,
          terminal_mobile_tab,
          terminal_active_tab,
          terminal_inner_tab,
          passport_active_tab,
          signals_filter,
          oracle_period,
          oracle_sort
        )
        VALUES (
          $1,
          COALESCE($2, 280),
          COALESCE($3, 300),
          COALESCE($4, false),
          COALESCE($5, false),
          COALESCE($6, 'chart'),
          COALESCE($7, 'intel'),
          COALESCE($8, 'chat'),
          COALESCE($9, 'profile'),
          COALESCE($10, 'all'),
          COALESCE($11, 'all'),
          COALESCE($12, 'accuracy')
        )
        ON CONFLICT (user_id) DO UPDATE SET
          terminal_left_width = COALESCE($2, user_ui_state.terminal_left_width),
          terminal_right_width = COALESCE($3, user_ui_state.terminal_right_width),
          terminal_left_collapsed = COALESCE($4, user_ui_state.terminal_left_collapsed),
          terminal_right_collapsed = COALESCE($5, user_ui_state.terminal_right_collapsed),
          terminal_mobile_tab = COALESCE($6, user_ui_state.terminal_mobile_tab),
          terminal_active_tab = COALESCE($7, user_ui_state.terminal_active_tab),
          terminal_inner_tab = COALESCE($8, user_ui_state.terminal_inner_tab),
          passport_active_tab = COALESCE($9, user_ui_state.passport_active_tab),
          signals_filter = COALESCE($10, user_ui_state.signals_filter),
          oracle_period = COALESCE($11, user_ui_state.oracle_period),
          oracle_sort = COALESCE($12, user_ui_state.oracle_sort),
          updated_at = now()
        RETURNING *
      `,
      [
        user.id,
        terminalLeftWidth,
        terminalRightWidth,
        terminalLeftCollapsed,
        terminalRightCollapsed,
        terminalMobileTab,
        terminalActiveTab,
        terminalInnerTab,
        passportActiveTab,
        signalsFilter,
        oraclePeriod,
        oracleSort,
      ]
    );

    return json({ success: true, uiState: mapRow(result.rows[0]) });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[ui-state/put] unexpected error:', error);
    return json({ error: 'Failed to update ui state' }, { status: 500 });
  }
};
