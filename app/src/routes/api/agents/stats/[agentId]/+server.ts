import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// No-op server sync placeholder. Client keeps authoritative local stats.
export const PATCH: RequestHandler = async () => {
  return json({ success: true });
};
