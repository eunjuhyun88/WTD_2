/**
 * W-0248 AC5: Stripe webhook signature verification
 * - Missing signature → 400
 * - Invalid signature → 401
 * - Valid signature → 200
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConstructEvent = vi.fn();

vi.mock('$lib/server/stripe', () => ({
  getStripe: vi.fn(() => ({ webhooks: { constructEvent: mockConstructEvent } })),
  getStripeWebhookSecret: vi.fn(() => 'whsec_test'),
}));

vi.mock('$lib/server/db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('$env/dynamic/private', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test' },
}));

function makeRequest(body: string, sig: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sig !== null) headers.set('stripe-signature', sig);
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

async function callPost(req: Request): Promise<{ status: number }> {
  const { POST } = await import('./+server.js');
  try {
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    return { status: res.status };
  } catch (e: unknown) {
    // SvelteKit throws HttpError on error()
    const err = e as { status?: number };
    if (typeof err.status === 'number') return { status: err.status };
    throw e;
  }
}

describe('W-0248 webhook signature verification', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
  });

  it('AC5-a: missing stripe-signature returns 400', async () => {
    const result = await callPost(makeRequest('{}', null));
    expect(result.status).toBe(400);
  });

  it('AC5-b: invalid signature returns 401', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Signature mismatch');
    });
    const result = await callPost(makeRequest('{}', 'bad-sig'));
    expect(result.status).toBe(401);
  });

  it('AC5-c: valid signature returns 200', async () => {
    mockConstructEvent.mockReturnValueOnce({ type: 'ping', data: { object: {} } });
    const result = await callPost(makeRequest('{}', 't=1234,v1=abc'));
    expect(result.status).toBe(200);
  });
});
