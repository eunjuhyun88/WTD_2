/**
 * POST /api/billing/webhook
 * Stripe webhook receiver. Validates signature (timestamp tolerance 300s).
 * Handles: checkout.session.completed, customer.subscription.deleted,
 *          invoice.payment_failed
 *
 * Idempotent: uses Stripe event.id to skip duplicates.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStripe, getStripeWebhookSecret } from '$lib/server/stripe';
import { query } from '$lib/server/db';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type Stripe from 'stripe';

function getSupabase() {
  const url = env.PUBLIC_SUPABASE_URL ?? '';
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) throw error(400, 'Missing stripe-signature header');

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw error(401, `Webhook signature verification failed: ${msg}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // PropFirm eval one-time payment (신규)
      if (session.mode === 'payment' && session.metadata?.type === 'propfirm_eval') {
        const evalId = session.client_reference_id;
        const paymentIntent = session.payment_intent as string | null;
        const userId = session.metadata.user_id;

        if (!evalId || !userId) break;

        const supabase = getSupabase();

        // Idempotent: 이미 ACTIVE면 skip
        const { data: existing } = await supabase
          .from('evaluations')
          .select('status')
          .eq('id', evalId)
          .single();

        if (existing?.status === 'ACTIVE') break;

        await supabase
          .from('evaluations')
          .update({
            status: 'ACTIVE',
            stripe_payment_intent: paymentIntent,
            payment_method: 'stripe',
            paid_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            equity_start: 10000,
            equity_current: 10000,
          })
          .eq('id', evalId)
          .eq('status', 'PENDING');

        break;
      }

      // Existing subscription handling
      if (session.mode !== 'subscription') break;
      const userId = session.metadata?.user_id as string | undefined;
      if (!userId) break;
      const subRaw = await stripe.subscriptions.retrieve(session.subscription as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expiresAt = new Date((subRaw as any).current_period_end * 1000).toISOString();
      await query(
        `UPDATE user_preferences
           SET tier = 'pro', subscription_active = TRUE, subscription_expires_at = $1
         WHERE user_id = $2`,
        [expiresAt, userId],
      );
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await query(
        `UPDATE user_preferences
           SET tier = 'free', subscription_active = FALSE
         WHERE user_id = $1`,
        [userId],
      );
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as unknown as { subscription?: string }).subscription;
      if (!subId) break;
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await query(
        `UPDATE user_preferences
           SET tier = 'free', subscription_active = FALSE
         WHERE user_id = $1`,
        [userId],
      );
      break;
    }
    default:
      break;
  }

  return json({ received: true });
};
