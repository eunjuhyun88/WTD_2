import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return json(
    {
      error: 'Deprecated endpoint. Use /api/auth/nonce + /api/auth/verify-wallet.',
      code: 'AUTH_WALLET_DEPRECATED',
    },
    { status: 410 }
  );
};
