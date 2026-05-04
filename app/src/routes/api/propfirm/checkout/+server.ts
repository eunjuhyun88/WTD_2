/**
 * POST /api/propfirm/checkout
 * PropFirm 챌린지 결제 세션 생성 ($99 일회성).
 * Returns { url } — 브라우저를 Stripe Checkout으로 리다이렉트.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getStripe, getAppUrl } from '$lib/server/stripe';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

function getSupabase() {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export const POST: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const supabase = getSupabase();

  // Get active beta tier
  const { data: tier, error: tierErr } = await supabase
    .from('challenge_tiers')
    .select('id, fee_usd')
    .eq('name', 'beta')
    .eq('active', true)
    .single();

  if (tierErr || !tier) throw error(500, 'Beta tier not found');

  // Check for existing ACTIVE or PENDING evaluation
  const { data: existing } = await supabase
    .from('evaluations')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['ACTIVE', 'PENDING'])
    .maybeSingle();

  if (existing) {
    return json({ error: 'already_active' }, { status: 400 });
  }

  // Insert PENDING evaluation
  const { data: evaluation, error: evalErr } = await supabase
    .from('evaluations')
    .insert({
      user_id: user.id,
      tier_id: tier.id,
      status: 'PENDING',
      payment_method: 'stripe',
    })
    .select('id')
    .single();

  if (evalErr || !evaluation) throw error(500, 'Failed to create evaluation');

  const stripe = getStripe();
  const origin = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(tier.fee_usd) * 100),
          product_data: {
            name: 'PropFirm Challenge (Beta)',
            description: 'WTD PropFirm Eval Challenge',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'propfirm_eval',
      user_id: user.id,
      tier_id: tier.id,
    },
    client_reference_id: evaluation.id,
    success_url: `${origin}/propfirm/dashboard?payment=success`,
    cancel_url: `${origin}/propfirm/dashboard?payment=cancelled`,
  });

  return json({ url: session.url });
};
