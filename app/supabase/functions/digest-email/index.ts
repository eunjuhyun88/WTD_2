// Supabase Edge Function: digest-email (W-0401-P3)
// Schedule: 21:00 UTC daily = 06:00 KST
// Setup: Supabase dashboard → Edge Functions → digest-email → Schedule: "0 21 * * *"
//
// Required secrets (supabase secrets set --env-file):
//   RESEND_API_KEY
//   SUPABASE_URL (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'Cogotchi <digest@cogotchi.app>';
const STREAK_THRESHOLDS = [1, 3, 7, 14, 30];

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Users who explicitly opted out
  const { data: optouts } = await sb
    .from('digest_subscriptions')
    .select('user_id')
    .eq('opt_in', false);
  const optedOut = new Set((optouts ?? []).map((r: { user_id: string }) => r.user_id));

  // All users with at least one verdict
  const { data: verdictRows } = await sb
    .from('pattern_ledger_records')
    .select('user_id')
    .not('user_id', 'is', null);

  const userIds = [...new Set(
    (verdictRows ?? [])
      .map((r: { user_id: string }) => r.user_id)
      .filter((id: string) => !optedOut.has(id))
  )];

  let sent = 0;
  for (const userId of userIds) {
    try {
      const { data: { user } } = await sb.auth.admin.getUserById(userId);
      if (!user?.email) continue;

      const { data: profile } = await sb
        .from('user_profiles')
        .select('username')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      const stats = await getUserStats(sb, userId);
      if (stats.totalCount === 0) continue;

      const html = renderHtml({
        name: profile?.username ?? '트레이더',
        ...stats,
      });

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [user.email],
          subject: `Cogotchi 일일 요약 — 이번 주 ${stats.weekCount}건 🔥`,
          html,
        }),
      });

      if (res.ok) sent++;
    } catch (err) {
      console.error('digest error for', userId, err);
    }
  }

  return new Response(
    JSON.stringify({ sent, total: userIds.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

async function getUserStats(sb: ReturnType<typeof createClient>, userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [weekRes, totalRes, streakRes] = await Promise.all([
    sb.from('pattern_ledger_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekAgo),
    sb.from('pattern_ledger_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    sb.from('pattern_ledger_records')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(365),
  ]);

  const streak = computeStreak((streakRes.data ?? []) as { created_at: string }[]);
  const next = nextThreshold(streak);

  return {
    weekCount: weekRes.count ?? 0,
    totalCount: totalRes.count ?? 0,
    streak,
    daysToNext: next != null ? next - streak : null,
  };
}

function computeStreak(rows: { created_at: string }[]): number {
  if (!rows.length) return 0;
  const days = new Set(rows.map(r => r.created_at.slice(0, 10)));
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let cur = new Date(today);
  while (true) {
    const d = cur.toISOString().slice(0, 10);
    if (days.has(d)) { streak++; cur.setDate(cur.getDate() - 1); }
    else break;
  }
  return streak;
}

function nextThreshold(streak: number): number | null {
  for (const t of STREAK_THRESHOLDS) {
    if (streak < t) return t;
  }
  return null;
}

function renderHtml(opts: {
  name: string; weekCount: number; totalCount: number; streak: number; daysToNext: number | null;
}): string {
  const nextLine = opts.daysToNext != null
    ? `<p>다음 streak 배지까지 <strong>${opts.daysToNext}일</strong> 남았습니다!</p>`
    : `<p>모든 streak 배지를 달성했습니다! 🎉</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0a0a0b;color:#faf7eb;max-width:480px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">안녕하세요, ${opts.name}!</h1>
  <p style="color:rgba(250,247,235,0.55);font-size:13px">오늘의 Cogotchi 요약입니다.</p>
  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(249,216,194,0.08);border-radius:12px;padding:16px;margin:16px 0">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">이번 주 verdict</span>
      <strong>${opts.weekCount}개</strong>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">연속 일수</span>
      <strong>🔥 ${opts.streak}일</strong>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">전체 누적</span>
      <strong>${opts.totalCount}개</strong>
    </div>
  </div>
  ${nextLine}
  <a href="https://cogotchi.app/patterns"
     style="display:block;background:linear-gradient(180deg,rgba(250,247,235,0.98),rgba(249,246,241,0.96));color:#0e0e12;text-align:center;padding:12px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;margin:16px 0">
    패턴 검증하기 →
  </a>
  <p style="font-size:11px;color:rgba(250,247,235,0.25);text-align:center;margin-top:24px">
    <a href="https://cogotchi.app/settings" style="color:rgba(250,247,235,0.4)">알림 설정 변경</a>
  </p>
</body></html>`;
}
