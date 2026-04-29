import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  _stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
  return _stripe;
}

export function getStripeWebhookSecret(): string {
  const s = env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  return s;
}

export function getStripePriceId(): string {
  const id = env.STRIPE_PRICE_ID_PRO_MONTHLY;
  if (!id) throw new Error('STRIPE_PRICE_ID_PRO_MONTHLY not set');
  return id;
}

export function getAppUrl(): string {
  return env.APP_URL || 'https://app.cogochi.com';
}
