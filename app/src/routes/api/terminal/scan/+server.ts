import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { runTerminalScan } from '$lib/services/scanService';
import { scanLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';
import { computeTerminalScanEmbedding } from '$lib/engine/ragEmbedding';
import { saveTerminalScanRAG } from '$lib/server/ragService';

function parseValidationMessage(message: string): string | null {
  if (message.startsWith('pair must be like')) return message;
  if (message.startsWith('timeframe must be one of')) return message;
  return null;
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

    const result = await runTerminalScan(user.id, {
      pair: body?.pair,
      timeframe: body?.timeframe,
    });

    // Fire-and-forget: activity_events
    query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'scan_run', 'terminal', $2, 'info', $3::jsonb)
      `,
      [
        user.id,
        result.scanId,
        JSON.stringify({
          pair: result.data.pair,
          timeframe: result.data.timeframe,
          consensus: result.data.consensus,
          avgConfidence: result.data.avgConfidence,
          source,
          persisted: result.persisted,
        }),
      ]
    ).catch(() => undefined);

    // Fire-and-forget: RAG entry 저장 (Terminal 스캔 → 256d 임베딩)
    // Paper 2: 에이전트별 세분화 시그널 (agentSignals JSONB)
    try {
      const scanSignals = (result.data.highlights ?? []).map((h: any) => ({
        agentId: h.agent ?? '',
        vote: h.vote ?? 'neutral',
        confidence: h.conf ?? 50,
      }));

      if (scanSignals.length > 0) {
        const embedding = computeTerminalScanEmbedding(
          scanSignals,
          result.data.timeframe ?? '4h'
        );

        // Paper 2: Fine-grained agent signals → JSONB
        const agentSignals: Record<string, { vote: string; confidence: number; note: string }> = {};
        for (const h of result.data.highlights ?? []) {
          agentSignals[(h.agent ?? '').toUpperCase()] = {
            vote: h.vote ?? 'neutral',
            confidence: h.conf ?? 50,
            note: h.note ?? '',
          };
        }

        saveTerminalScanRAG(user.id, {
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

    return json({
      success: true,
      ok: true,
      scanId: result.scanId,
      persisted: result.persisted,
      warning: result.warning,
      data: result.data,
    });
  } catch (error: any) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    const validationMessage = typeof error?.message === 'string' ? parseValidationMessage(error.message) : null;
    if (validationMessage) return json({ error: validationMessage }, { status: 400 });
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[terminal/scan/post] unexpected error:', error);
    return json({ error: 'Failed to run terminal scan' }, { status: 500 });
  }
};
