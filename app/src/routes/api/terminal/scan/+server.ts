import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { runTerminalScan, normalizeScanRequest, type RunTerminalScanResult } from '$lib/services/scanService';
import { scanLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';
import { computeTerminalScanEmbedding } from '$lib/server/rag/embedding';
import { saveTerminalScanRAG } from '$lib/server/ragService';
import {
  completeTerminalScanJob,
  createTerminalScanJob,
  failTerminalScanJob,
  markTerminalScanJobRunning,
} from '$lib/server/terminalScanJobStore';

function parseValidationMessage(message: string): string | null {
  if (message.startsWith('pair must be like')) return message;
  if (message.startsWith('timeframe must be one of')) return message;
  return null;
}

function wantsAsyncScan(body: Record<string, unknown> | null | undefined): boolean {
  if (!body || typeof body !== 'object') return false;
  const v = (body as { async?: unknown }).async;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
  return false;
}

async function emitScanSideEffects(
  userId: string,
  result: RunTerminalScanResult,
  source: string,
): Promise<void> {
  query(
    `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'scan_run', 'terminal', $2, 'info', $3::jsonb)
      `,
    [
      userId,
      result.scanId,
      JSON.stringify({
        pair: result.data.pair,
        timeframe: result.data.timeframe,
        consensus: result.data.consensus,
        avgConfidence: result.data.avgConfidence,
        source,
        persisted: result.persisted,
      }),
    ],
  ).catch(() => undefined);

  try {
    const scanSignals = (result.data.highlights ?? []).map((h: { agent?: string; vote?: string; conf?: number }) => ({
      agentId: h.agent ?? '',
      vote: h.vote ?? 'neutral',
      confidence: h.conf ?? 50,
    }));

    if (scanSignals.length > 0) {
      const embedding = await computeTerminalScanEmbedding(scanSignals, result.data.timeframe ?? '4h');

      const agentSignals: Record<string, { vote: string; confidence: number; note: string }> = {};
      for (const h of result.data.highlights ?? []) {
        const row = h as { agent?: string; vote?: string; conf?: number; note?: string };
        agentSignals[(row.agent ?? '').toUpperCase()] = {
          vote: row.vote ?? 'neutral',
          confidence: row.conf ?? 50,
          note: row.note ?? '',
        };
      }

      saveTerminalScanRAG(userId, {
        scanId: result.scanId,
        pair: result.data.pair,
        timeframe: result.data.timeframe,
        consensus: result.data.consensus,
        avgConfidence: result.data.avgConfidence,
        highlights: result.data.highlights,
        embedding,
        agentSignals,
      }).catch(() => undefined);
    }
  } catch {
    // RAG 저장 실패는 스캔 결과에 영향 없음
  }
}

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: scanLimiter,
    scope: 'terminal:scan',
    max: 6,
    tooManyMessage: 'Too many scan requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const source = typeof body?.source === 'string' ? body.source.trim() : 'terminal';

    const scanInput = { pair: body?.pair, timeframe: body?.timeframe };
    try {
      normalizeScanRequest(scanInput);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid scan request';
      const validationMessage = parseValidationMessage(message);
      if (validationMessage) return json({ error: validationMessage }, { status: 400 });
      return json({ error: message }, { status: 400 });
    }

    if (wantsAsyncScan(body)) {
      const jobId = createTerminalScanJob(user.id);
      markTerminalScanJobRunning(jobId);
      void (async () => {
        try {
          const result = await runTerminalScan(user.id, scanInput);
          completeTerminalScanJob(jobId, result);
          await emitScanSideEffects(user.id, result, source);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Failed to run terminal scan';
          failTerminalScanJob(jobId, msg);
        }
      })();

      return json(
        {
          success: true,
          async: true,
          jobId,
          state: 'running',
          pollUrl: `/api/terminal/scan/jobs/${jobId}`,
        },
        { status: 202 },
      );
    }

    const result = await runTerminalScan(user.id, scanInput);

    await emitScanSideEffects(user.id, result, source);

    return json({
      success: true,
      ok: true,
      scanId: result.scanId,
      persisted: result.persisted,
      warning: result.warning,
      data: result.data,
    });
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    const validationMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? parseValidationMessage(String((error as { message?: unknown }).message))
        : null;
    if (validationMessage) return json({ error: validationMessage }, { status: 400 });
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String((error as { message?: unknown }).message).includes('DATABASE_URL is not set')
    ) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[terminal/scan/post] unexpected error:', error);
    return json({ error: 'Failed to run terminal scan' }, { status: 500 });
  }
};
