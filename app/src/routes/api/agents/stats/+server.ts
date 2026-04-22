import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Local storage remains the primary persistence path for agent stats in app-web.
// These endpoints keep browser sync calls non-fatal until server persistence lands.
export const GET: RequestHandler = async () => {
  return json({ success: true, records: [] });
};
