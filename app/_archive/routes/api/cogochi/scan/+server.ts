// ===================================================================
// POST /api/cogochi/scan -- Multi-symbol scanner endpoint
// ===================================================================
// Body: { mode: 'topN' | 'custom', symbols?: string[], topN?: number, preset?: string }
// Response: { results: ScanResult[], count: number, timestamp: number }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanMarket, type ScanConfig, type ScanResult } from '$lib/server/scanner';

const SCAN_TIMEOUT_MS = 60_000;

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mode = body.mode as string | undefined;
  if (mode !== 'topN' && mode !== 'custom') {
    return json(
      { error: 'Invalid mode. Expected "topN" or "custom".' },
      { status: 400 },
    );
  }

  if (mode === 'custom') {
    if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
      return json(
        { error: 'custom mode requires a non-empty symbols array.' },
        { status: 400 },
      );
    }
    if (body.symbols.length > 50) {
      return json(
        { error: 'Maximum 50 symbols per scan.' },
        { status: 400 },
      );
    }
  }

  const config: ScanConfig = {
    mode,
    symbols: mode === 'custom' ? (body.symbols as string[]) : undefined,
    topN: typeof body.topN === 'number' ? Math.min(Math.max(body.topN, 1), 50) : undefined,
    preset: typeof body.preset === 'string' ? body.preset : undefined,
  };

  try {
    // Race the scan against a timeout
    const results = await Promise.race<ScanResult[]>([
      scanMarket(config),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Scan timed out')), SCAN_TIMEOUT_MS),
      ),
    ]);

    return json({
      results,
      count: results.length,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    const status = message === 'Scan timed out' ? 504 : 500;
    return json({ error: message }, { status });
  }
};
