/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session for Pro Monthly subscription.
 * Returns { url } — redirect the browser there.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getStripe, getStripePriceId, getAppUrl } from '$lib/server/stripe';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const stripe = getStripe();

  const prefRows = await query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM user_preferences WHERE user_id = $1',
    [user.id],
  );
  let customerId = prefRows.rows[0]?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await query(
      'UPDATE user_preferences SET stripe_customer_id = $1 WHERE user_id = $2',
      [customerId, user.id],
    );
  }

  const origin = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: getStripePriceId(), quantity: 1 }],
    success_url: `${origin}/settings/billing?success=1`,
    cancel_url: `${origin}/settings/billing?cancelled=1`,
    subscription_data: { metadata: { user_id: user.id } },
  });

  return json({ url: session.url });
};
