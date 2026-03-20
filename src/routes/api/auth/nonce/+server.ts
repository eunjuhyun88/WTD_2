import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidEthAddress, issueWalletNonce, normalizeEthAddress } from '$lib/server/walletAuthRepository';
import { authNonceLimiter } from '$lib/server/rateLimit';
import { readAuthBodyWithTurnstile, runAuthAbuseGuard } from '$lib/server/authSecurity';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runAuthAbuseGuard({
    request,
    fallbackIp,
    limiter: authNonceLimiter,
    scope: 'auth:nonce',
    max: 8,
    tooManyMessage: 'Too many nonce requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const bodyResult = await readAuthBodyWithTurnstile({
      request,
      remoteIp: guard.remoteIp,
      maxBytes: 8 * 1024,
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
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : null;
    const chainRaw = typeof body?.chain === 'string' ? body.chain.trim().toUpperCase() : '';
    const chain = chainRaw === 'SOLANA' ? 'SOL' : chainRaw || 'ARB';

    if (chain === 'SOL') {
      return json({ error: 'Nonce challenge is only used for EVM wallet verification' }, { status: 400 });
    }

    if (!isValidEthAddress(addressRaw)) {
      return json({ error: 'Valid Ethereum wallet address required' }, { status: 400 });
    }

    const issued = await issueWalletNonce({
      address: normalizeEthAddress(addressRaw),
      provider,
      userAgent: request.headers.get('user-agent'),
      issuedIp: guard.remoteIp,
      ttlMinutes: 10,
    });

    return json({
      success: true,
      address: normalizeEthAddress(addressRaw),
      chain,
      nonce: issued.nonce,
      message: issued.message,
      expiresAt: issued.expiresAt,
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
    console.error('[auth/nonce] unexpected error:', error);
    return json({ error: 'Failed to issue wallet nonce' }, { status: 500 });
  }
};
