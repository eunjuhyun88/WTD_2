import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  let body: { email?: string; wallet_address?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || null;
  const wallet = body.wallet_address?.trim().toLowerCase() || null;

  if (!email && !wallet) {
    return json({ error: 'email or wallet_address required' }, { status: 400 });
  }

  try {
    if (wallet) {
      // Upsert: if already on waitlist do nothing, update email if provided
      await query(
        `INSERT INTO beta_allowlist (wallet_address, email, note, revoked_at)
         VALUES ($1, $2, 'waitlist_signup', now())
         ON CONFLICT (wallet_address) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, beta_allowlist.email)`,
        [wallet, email],
      );
    } else if (email) {
      // Email-only signup (no wallet connected)
      await query(
        `INSERT INTO beta_allowlist (email, note, revoked_at)
         VALUES ($1, 'waitlist_signup', now())
         ON CONFLICT (email) DO NOTHING`,
        [email],
      );
    }
    return json({ ok: true });
  } catch (err) {
    console.error('[beta/waitlist] error:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
