import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { normalizePair, PAIR_RE, toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

const TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>) {
  return {
    userId: row.user_id,
    defaultPair: row.default_pair,
    defaultTimeframe: row.default_timeframe,
    battleSpeed: Number(row.battle_speed ?? 3),
    signalsEnabled: Boolean(row.signals_enabled),
    sfxEnabled: Boolean(row.sfx_enabled),
    chartTheme: row.chart_theme,
    dataSource: row.data_source,
    language: row.language,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function ensurePreferences(userId: string) {
  const upsert = await query(
    `
      INSERT INTO user_preferences (
        user_id, default_pair, default_timeframe, battle_speed,
        signals_enabled, sfx_enabled, chart_theme, data_source, language
      )
      VALUES ($1, 'BTC/USDT', '4h', 3, true, true, 'dark', 'binance', 'kr')
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

    const row = await ensurePreferences(user.id);
    return json({ success: true, preferences: mapRow(row) });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[preferences/get] unexpected error:', error);
    return json({ error: 'Failed to load preferences' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();

    const defaultPair = body?.defaultPair == null ? null : normalizePair(body.defaultPair);
    const defaultTimeframe =
      typeof body?.defaultTimeframe === 'string' ? body.defaultTimeframe.trim().toLowerCase() : null;
    const battleSpeed = body?.battleSpeed == null ? null : toBoundedInt(body.battleSpeed, 3, 1, 3);
    const signalsEnabled = typeof body?.signalsEnabled === 'boolean' ? body.signalsEnabled : null;
    const sfxEnabled = typeof body?.sfxEnabled === 'boolean' ? body.sfxEnabled : null;
    const chartTheme = typeof body?.chartTheme === 'string' ? body.chartTheme.trim() : null;
    const dataSource = typeof body?.dataSource === 'string' ? body.dataSource.trim() : null;
    const language = typeof body?.language === 'string' ? body.language.trim() : null;

    if (defaultPair && !PAIR_RE.test(defaultPair)) {
      return json({ error: 'defaultPair format must be BASE/QUOTE' }, { status: 400 });
    }
    if (defaultTimeframe && !TIMEFRAMES.has(defaultTimeframe)) {
      return json({ error: 'Invalid defaultTimeframe' }, { status: 400 });
    }

    const result = await query(
      `
        INSERT INTO user_preferences (
          user_id, default_pair, default_timeframe, battle_speed,
          signals_enabled, sfx_enabled, chart_theme, data_source, language
        )
        VALUES (
          $1,
          COALESCE($2, 'BTC/USDT'),
          COALESCE($3, '4h'),
          COALESCE($4, 3),
          COALESCE($5, true),
          COALESCE($6, true),
          COALESCE($7, 'dark'),
          COALESCE($8, 'binance'),
          COALESCE($9, 'kr')
        )
        ON CONFLICT (user_id) DO UPDATE SET
          default_pair = COALESCE($2, user_preferences.default_pair),
          default_timeframe = COALESCE($3, user_preferences.default_timeframe),
          battle_speed = COALESCE($4, user_preferences.battle_speed),
          signals_enabled = COALESCE($5, user_preferences.signals_enabled),
          sfx_enabled = COALESCE($6, user_preferences.sfx_enabled),
          chart_theme = COALESCE($7, user_preferences.chart_theme),
          data_source = COALESCE($8, user_preferences.data_source),
          language = COALESCE($9, user_preferences.language),
          updated_at = now()
        RETURNING *
      `,
      [
        user.id,
        defaultPair,
        defaultTimeframe,
        battleSpeed,
        signalsEnabled,
        sfxEnabled,
        chartTheme,
        dataSource,
        language,
      ]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'settings_changed', 'settings', null, 'info', $2::jsonb)
      `,
      [
        user.id,
        JSON.stringify({
          defaultPair,
          defaultTimeframe,
          battleSpeed,
          signalsEnabled,
          sfxEnabled,
          chartTheme,
          dataSource,
          language,
        }),
      ]
    ).catch(() => undefined);

    return json({ success: true, preferences: mapRow(result.rows[0]) });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[preferences/put] unexpected error:', error);
    return json({ error: 'Failed to update preferences' }, { status: 500 });
  }
};
