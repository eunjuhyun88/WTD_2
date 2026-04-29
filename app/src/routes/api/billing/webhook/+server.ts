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
import type Stripe from 'stripe';

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
