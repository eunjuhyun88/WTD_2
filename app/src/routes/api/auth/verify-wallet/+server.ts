import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedUser } from '$lib/server/authRepository';
import {
  isValidEthAddress,
  linkWalletToUser,
  normalizeEthAddress,
  verifyAndConsumeEvmNonce,
} from '$lib/server/walletAuthRepository';
import { parseSessionCookie, SESSION_COOKIE_NAME } from '$lib/server/session';
import { authVerifyLimiter } from '$lib/server/rateLimit';
import { readAuthBodyWithTurnstile, runAuthAbuseGuard } from '$lib/server/authSecurity';

const EVM_SIGNATURE_RE = /^0x[0-9a-f]{130}$/i;

function normalizeChain(chainRaw: string | null): string {
  const normalized = chainRaw?.trim().toUpperCase() || '';
  if (!normalized) return 'ARB';
  if (normalized === 'SOLANA') return 'SOL';
  return normalized;
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runAuthAbuseGuard({
    request,
    fallbackIp,
    limiter: authVerifyLimiter,
    scope: 'auth:verify-wallet',
    max: 10,
    tooManyMessage: 'Too many wallet verification attempts. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const bodyResult = await readAuthBodyWithTurnstile({
      request,
      remoteIp: guard.remoteIp,
      maxBytes: 16 * 1024,
    });
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.body;

    const addressField = typeof body?.address === 'string' ? body.address.trim() : '';
    const walletAddressField = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';
    if (
      addressField &&
      walletAddressField &&
      normalizeEthAddress(addressField) !== normalizeEthAddress(walletAddressField)
    ) {
      return json({ error: 'Conflicting wallet address fields' }, { status: 400 });
    }
    const addressRaw = addressField || walletAddressField;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const signature = typeof body?.signature === 'string' ? body.signature.trim() : '';
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : null;
    const chain = normalizeChain(typeof body?.chain === 'string' ? body.chain : null);

    if (chain === 'SOL') {
      return json({ error: 'Solana wallet verification is temporarily unavailable. Use an EVM wallet.' }, { status: 400 });
    }

    if (!isValidEthAddress(addressRaw)) {
      return json({ error: 'Valid EVM wallet address required' }, { status: 400 });
    }

    if (!message || message.length < 20) {
      return json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > 2048) {
      return json({ error: 'Message is too long' }, { status: 400 });
    }

    if (!EVM_SIGNATURE_RE.test(signature)) {
      return json({ error: 'Invalid EVM signature format' }, { status: 400 });
    }

    const address = normalizeEthAddress(addressRaw);
    const verification = await verifyAndConsumeEvmNonce({
      address,
      message,
      signature,
    });

    if (verification === 'missing_nonce') {
      return json({ error: 'Nonce not found in message' }, { status: 400 });
    }
    if (verification === 'invalid_signature') {
      return json({ error: 'Signature does not match wallet address' }, { status: 401 });
    }
    if (verification === 'invalid_nonce') {
      return json({ error: 'Nonce is invalid, expired, or already used' }, { status: 401 });
    }

    const sessionCookie = cookies.get(SESSION_COOKIE_NAME);
    const parsed = parseSessionCookie(sessionCookie);

    let linkedToUser = false;
    let userId: string | null = null;

    if (parsed) {
      const user = await getAuthenticatedUser(parsed.token, parsed.userId);
      if (user) {
        await linkWalletToUser({
          userId: user.id,
          address,
          signature,
          provider,
          chain,
          meta: {
            chain,
            issuedAt: new Date().toISOString(),
          },
        });
        linkedToUser = true;
        userId = user.id;
      }
    }

    return json({
      success: true,
      verified: true,
      linkedToUser,
      userId,
      wallet: {
        address,
        shortAddr: address.slice(0, 6) + '...' + address.slice(-4),
        chain,
        provider: provider || 'metamask',
        verified: true,
      },
    });
  } catch (error: any) {
    if (error?.code === '42P01') {
      return json({ error: 'auth_nonces table is missing. Run migration 0003 first.' }, { status: 500 });
    }
    if (error?.code === '42501') {
      return json({ error: 'Database role lacks permissions for auth_nonces setup. Run migration 0003 with owner role.' }, { status: 500 });
    }
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[auth/verify-wallet] unexpected error:', error);
    return json({ error: 'Failed to verify wallet signature' }, { status: 500 });
  }
};
