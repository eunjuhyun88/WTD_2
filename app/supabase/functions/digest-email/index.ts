// Supabase Edge Function: digest-email (W-0401-P3)
// Schedule: 21:00 UTC daily = 06:00 KST next day
// Setup: Supabase dashboard → Edge Functions → digest-email → Schedule: "0 21 * * *"
//
// Required secrets (supabase secrets set --env-file):
//   RESEND_API_KEY  (optional — omit for dry-run / console.log only)
//   SUPABASE_URL (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'Cogochi <noreply@cogochi.io>';
const APP_BASE = 'https://cogochi.io';
const LAYER_C_THRESHOLD = 50;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch subscribers and their stats
  const { data: subs, error } = await sb
    .from('digest_subscriptions')
    .select('user_id, email, unsubscribe_token')
    .eq('subscribed', true);

  if (error) {
    console.error('digest: failed to fetch subscriptions', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = await Promise.allSettled(
    (subs ?? []).map(sub => sendDigestToUser(sb, sub.user_id, sub.email, sub.unsubscribe_token))
  );

  const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
  const total = (subs ?? []).length;

  console.log(`digest: ${sent}/${total} sent`);

  return new Response(
    JSON.stringify({ sent, total }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

async function sendDigestToUser(
  sb: ReturnType<typeof createClient>,
  userId: string,
  email: string,
  unsubscribeToken: string,
): Promise<boolean> {
  try {
    const stats = await getUserStats(sb, userId);
    if (stats.total === 0) return false;

    const body = renderPlainText(stats, unsubscribeToken);

    if (!RESEND_API_KEY) {
      // Dry-run mode: log instead of sending (AC1)
      console.log(`[DRY RUN] digest to ${email}:\n${body}`);
      return true;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: 'Cogochi 일일 요약',
        text: body,
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error(`digest: resend error for ${userId}: ${msg}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('digest error for', userId, err);
    return false;
  }
}

async function getUserStats(
  sb: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ yesterday: number; streak: number; total: number; remaining: number }> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yDate = yesterday.toISOString().slice(0, 10);

  // verdict_streak_history is a view: SELECT user_id, day_utc, verdict_count
  const [streakRes, yesterdayRes] = await Promise.all([
    sb
      .from('verdict_streak_history')
      .select('day_utc, verdict_count')
      .eq('user_id', userId)
      .order('day_utc', { ascending: false })
      .limit(365),
    sb
      .from('verdict_streak_history')
      .select('verdict_count')
      .eq('user_id', userId)
      .eq('day_utc', yDate)
      .maybeSingle(),
  ]);

  const rows = (streakRes.data ?? []) as { day_utc: string; verdict_count: number }[];
  const yesterdayCount = (yesterdayRes.data as { verdict_count: number } | null)?.verdict_count ?? 0;
  const total = rows.reduce((s, r) => s + r.verdict_count, 0);
  const streak = computeStreak(rows.map(r => r.day_utc));

  return {
    yesterday: yesterdayCount,
    streak,
    total,
    remaining: Math.max(0, LAYER_C_THRESHOLD - total),
  };
}

function computeStreak(days: string[]): number {
  if (!days.length) return 0;
  const daySet = new Set(days);
  let streak = 0;
  const cur = new Date();
  cur.setUTCHours(0, 0, 0, 0);
  while (true) {
    const d = cur.toISOString().slice(0, 10);
    if (daySet.has(d)) {
      streak++;
      cur.setUTCDate(cur.getUTCDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderPlainText(
  stats: { yesterday: number; streak: number; total: number; remaining: number },
  unsubscribeToken: string,
): string {
  return [
    '안녕하세요!',
    `어제 판정: ${stats.yesterday}건 · 연속 ${stats.streak}일째`,
    `Layer C 학습까지: ${stats.remaining}건 남았습니다 (${stats.total}/${LAYER_C_THRESHOLD})`,
    '',
    `[판정하러 가기] ${APP_BASE}/cogochi`,
    `[수신거부] ${APP_BASE}/api/digest/unsubscribe?token=${unsubscribeToken}`,
  ].join('\n');
}
