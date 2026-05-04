/**
 * W-0248 AC5: Stripe webhook signature verification
 * - Missing signature → 400
 * - Invalid signature → 401
 * - Valid signature → 200
 *
 * W-PF-205: PropFirm eval payment webhook
 * - checkout.session.completed with mode='payment' + metadata.type='propfirm_eval' → evaluations UPDATE
 * - Already ACTIVE evaluation → no-op (idempotency)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConstructEvent = vi.fn();
const mockSupabaseUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSupabaseEq = vi.fn();
const mockSupabaseSingle = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseFrom = vi.fn();

// Build a chainable mock for supabase
function makeChainableMock(singleData: { status: string } | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: singleData, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn(() => chain),
    chain,
  };
}

let supabaseMock = makeChainableMock(null);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMock),
}));

vi.mock('$lib/server/stripe', () => ({
  getStripe: vi.fn(() => ({ webhooks: { constructEvent: mockConstructEvent } })),
  getStripeWebhookSecret: vi.fn(() => 'whsec_test'),
}));

vi.mock('$lib/server/db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('$env/dynamic/private', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_test',
  },
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

describe('W-PF-205 PropFirm eval payment webhook', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    // Reset supabase mock to default (no existing record)
    supabaseMock = makeChainableMock(null);
  });

  it('PF-205-a: checkout.session.completed with propfirm_eval metadata → 200', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          client_reference_id: 'eval-uuid-123',
          payment_intent: 'pi_test_123',
          metadata: {
            type: 'propfirm_eval',
            user_id: 'user-uuid-456',
            tier_id: 'tier-uuid-789',
          },
        },
      },
    });

    const result = await callPost(makeRequest('{}', 't=1234,v1=abc'));
    expect(result.status).toBe(200);
  });

  it('PF-205-b: already ACTIVE evaluation → no-op, returns 200 (idempotency)', async () => {
    // Supabase returns ACTIVE status for the evaluation
    supabaseMock = makeChainableMock({ status: 'ACTIVE' });

    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          client_reference_id: 'eval-uuid-already-active',
          payment_intent: 'pi_test_duplicate',
          metadata: {
            type: 'propfirm_eval',
            user_id: 'user-uuid-456',
            tier_id: 'tier-uuid-789',
          },
        },
      },
    });

    // Should not throw, should return 200
    const result = await callPost(makeRequest('{}', 't=1234,v1=abc'));
    expect(result.status).toBe(200);
  });

  it('PF-205-c: missing evalId → skips processing, returns 200', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          client_reference_id: null,
          payment_intent: 'pi_test_123',
          metadata: {
            type: 'propfirm_eval',
            user_id: 'user-uuid-456',
          },
        },
      },
    });

    const result = await callPost(makeRequest('{}', 't=1234,v1=abc'));
    expect(result.status).toBe(200);
  });
});
