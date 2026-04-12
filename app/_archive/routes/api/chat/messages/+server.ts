import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AGENT_POOL } from '$lib/engine/agents';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt, UUID_RE } from '$lib/server/apiValidation';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';
import { isPersistenceUnavailableError } from '$lib/services/scanService';
import {
  callLLM, isLLMAvailable,
  buildAgentSystemPrompt, buildOrchestratorSystemPrompt,
  type LLMMessage,
} from '$lib/server/llmService';
import { getMultiTimeframeIndicatorContext } from '$lib/server/multiTimeframeContext';
import { getErrorMessage, errorContains } from '$lib/utils/errorUtils';

const SENDER_KINDS = new Set(['user', 'agent', 'system']);

const AGENT_ALIASES = new Map<string, string>([
  ['STRUCTURE', 'STRUCTURE'],
  ['STR', 'STRUCTURE'],
  ['VPA', 'VPA'],
  ['ICT', 'ICT'],
  ['DERIV', 'DERIV'],
  ['VALUATION', 'VALUATION'],
  ['VALUE', 'VALUATION'],
  ['FLOW', 'FLOW'],
  ['SENTI', 'SENTI'],
  ['SENTIMENT', 'SENTI'],
  ['MACRO', 'MACRO'],
  ['GUARDIAN', 'ORCHESTRATOR'],
  ['COMMANDER', 'ORCHESTRATOR'],
  ['SCANNER', 'ORCHESTRATOR'],
  ['AGENT', 'ORCHESTRATOR'],
  ['ORCHESTRATOR', 'ORCHESTRATOR'],
  ['SYSTEM', 'ORCHESTRATOR'],
]);

const AGENT_IDS = new Set(Object.keys(AGENT_POOL));

type AgentChatRow = {
  id: string;
  user_id: string;
  channel: string;
  sender_kind: string;
  sender_id: string | null;
  sender_name: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  created_at: string;
};

type ScanRunContextRow = {
  id: string;
  pair: string;
  timeframe: string;
  consensus: 'long' | 'short' | 'neutral';
  avg_confidence: number | string;
  summary: string;
  created_at: string;
};

type ScanSignalContextRow = {
  agent_id: string;
  agent_name: string;
  vote: 'long' | 'short' | 'neutral';
  confidence: number | string;
  analysis_text: string;
  data_source: string;
  entry_price: number | string;
  tp_price: number | string;
  sl_price: number | string;
};

type ScanContext = {
  scanId: string | null;
  pair: string;
  timeframe: string;
  consensus: 'long' | 'short' | 'neutral' | null;
  avgConfidence: number | null;
  summary: string | null;
  signals: ScanSignalContextRow[];
};

type AgentReply = {
  agentId: string;
  text: string;
  source: 'scan_context' | 'fallback';
  scanId: string | null;
};

const MARKET_QUERY_RE =
  /btc|eth|sol|xrp|doge|usdt|가격|차트|캔들|패턴|롱|숏|매수|매도|트레이드|거래|시장|분석|예측|진입|청산|손절|익절|지지|저항|추세|변동성|funding|open.?interest|oi|liquidation|support|resistance|trend|breakout|breakdown|entry|stop|take.?profit/i;
const BIAS_TOKEN_RE = /\b(long|short|neutral|wait)\b|롱|숏|중립|관망/i;
const CONFIDENCE_RE = /(\d{1,3})\s?%/;

function hasKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

function isMarketQuestion(text: string): boolean {
  return MARKET_QUERY_RE.test(text);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimLines(text: string, maxLines = 6): string {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, maxLines).join('\n');
}

function hasBiasToken(text: string): boolean {
  return BIAS_TOKEN_RE.test(text);
}

function hasConfidenceToken(text: string): boolean {
  const match = text.match(CONFIDENCE_RE);
  if (!match) return false;
  const value = Number(match[1] ?? 0);
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Number(n) : fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapRow(row: AgentChatRow) {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    senderName: row.sender_name,
    message: row.message,
    meta: row.meta ?? {},
    createdAt: new Date(row.created_at).getTime(),
  };
}

function buildEphemeralRow(input: {
  userId: string;
  channel: string;
  senderKind: string;
  senderId: string | null;
  senderName: string;
  message: string;
  meta: Record<string, unknown>;
}) {
  return {
    id: `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    userId: input.userId,
    channel: input.channel,
    senderKind: input.senderKind,
    senderId: input.senderId,
    senderName: input.senderName,
    message: input.message,
    meta: input.meta,
    createdAt: Date.now(),
  };
}

function normalizeAgentName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/^@+/, '').replace(/[^A-Z0-9_]/g, '');
  if (!cleaned) return null;
  if (AGENT_ALIASES.has(cleaned)) return AGENT_ALIASES.get(cleaned)!;
  if (AGENT_IDS.has(cleaned)) return cleaned;
  return null;
}

function detectMentionedAgent(message: string, meta: Record<string, unknown>): string | null {
  const metaAgent = normalizeAgentName(meta.mentionedAgent);
  if (metaAgent) return metaAgent;

  const mentionMatches = message.matchAll(/@([a-z0-9_]+)/gi);
  for (const match of mentionMatches) {
    const token = normalizeAgentName(match[1]);
    if (token) return token;
  }
  return null;
}

/** 인텐트 기반 에이전트 라우팅 (멘션 없을 때 메시지 내용으로 추론) */
function inferAgentFromIntent(message: string): string | null {
  const lower = message.toLowerCase();

  // STRUCTURE — 차트/캔들/패턴/구조
  if (/차트|candle|캔들|패턴|pattern|bos|choch|ob|fvg|support|resist|지지|저항|추세|trend|구조|structure/i.test(lower)) {
    return 'STRUCTURE';
  }
  // DERIV — 파생/펀딩/OI/청산/옵션
  if (/파생|deriv|펀딩|funding|oi|open.?interest|청산|liquid|옵션|option|선물|futures|숏|롱|레버/i.test(lower)) {
    return 'DERIV';
  }
  // VALUATION — 온체인/밸류에이션/MVRV/NUPL
  if (/온체인|on.?chain|mvrv|nupl|sopr|nvt|valuation|밸류|네트워크|network|active.?addr|whale|고래/i.test(lower)) {
    return 'VALUATION';
  }
  // FLOW — 자금흐름/거래소/넷플로우/거래량
  if (/자금|flow|플로우|넷플로우|netflow|거래소|exchange|inflow|outflow|유입|유출|이동/i.test(lower)) {
    return 'FLOW';
  }
  // VPA — 거래량/볼륨/CVD
  if (/거래량|volume|볼륨|cvd|delta|vwap|profile|흡수|absorption/i.test(lower)) {
    return 'VPA';
  }
  // ICT — 스마트머니/유동성/imbalance
  if (/스마트.?머니|smart.?money|ict|유동성|liquid|imbalance|breaker|mitigation/i.test(lower)) {
    return 'ICT';
  }
  // SENTI — 센티멘트/공포/탐욕/소셜
  if (/센티|senti|감정|공포|탐욕|fear|greed|소셜|social|여론|분위기/i.test(lower)) {
    return 'SENTI';
  }
  // MACRO — 매크로/경제/금리/연준
  if (/매크로|macro|경제|금리|interest.?rate|연준|fed|cpi|gdp|달러|dollar|dxy|국채/i.test(lower)) {
    return 'MACRO';
  }
  return null; // ORCHESTRATOR가 기본 처리
}

function normalizeMeta(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {};
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toFixed(2);
  return value.toFixed(4);
}

async function loadScanContext(
  userId: string,
  meta: Record<string, unknown>
): Promise<ScanContext | null> {
  const requestedScanId = typeof meta.scanId === 'string' && UUID_RE.test(meta.scanId) ? meta.scanId : null;
  const requestedPair = typeof meta.pair === 'string' ? meta.pair.trim().toUpperCase() : '';
  const requestedTimeframe = typeof meta.timeframe === 'string' ? meta.timeframe.trim().toLowerCase() : '';

  try {
    let runRow: ScanRunContextRow | undefined;

    if (requestedScanId) {
      const run = await query<ScanRunContextRow>(
        `
          SELECT id, pair, timeframe, consensus, avg_confidence, summary, created_at
          FROM terminal_scan_runs
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [requestedScanId, userId]
      );
      runRow = run.rows[0];
    } else {
      const filters = ['user_id = $1'];
      const params: unknown[] = [userId];

      if (requestedPair) {
        params.push(requestedPair);
        filters.push(`pair = $${params.length}`);
      }
      if (requestedTimeframe) {
        params.push(requestedTimeframe);
        filters.push(`timeframe = $${params.length}`);
      }

      const run = await query<ScanRunContextRow>(
        `
          SELECT id, pair, timeframe, consensus, avg_confidence, summary, created_at
          FROM terminal_scan_runs
          WHERE ${filters.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT 1
        `,
        params
      );
      runRow = run.rows[0];
    }

    if (!runRow) {
      return {
        scanId: null,
        pair: requestedPair || 'BTC/USDT',
        timeframe: requestedTimeframe || '4h',
        consensus: null,
        avgConfidence: null,
        summary: null,
        signals: [],
      };
    }

    const signals = await query<ScanSignalContextRow>(
      `
        SELECT
          agent_id, agent_name, vote, confidence, analysis_text,
          data_source, entry_price, tp_price, sl_price
        FROM terminal_scan_signals
        WHERE scan_id = $1 AND user_id = $2
        ORDER BY confidence DESC, created_at DESC
      `,
      [runRow.id, userId]
    );

    return {
      scanId: runRow.id,
      pair: runRow.pair,
      timeframe: runRow.timeframe,
      consensus: runRow.consensus,
      avgConfidence: Math.round(toNum(runRow.avg_confidence, 0)),
      summary: runRow.summary,
      signals: signals.rows,
    };
  } catch (error: unknown) {
    if (isPersistenceUnavailableError(error)) return null;
    console.warn('[chat/messages] failed to load scan context:', error);
    return null;
  }
}

/** Template fallback (LLM 불가 시 사용) */
function buildAgentReplyFallback(
  agentId: string,
  _message: string,
  context: ScanContext | null,
  meta: Record<string, unknown>
): AgentReply {
  const fallbackPair = typeof meta.pair === 'string' && meta.pair ? meta.pair : 'BTC/USDT';
  const fallbackTf = typeof meta.timeframe === 'string' && meta.timeframe ? meta.timeframe : '4h';

  if (!context || context.signals.length === 0) {
    return {
      agentId,
      scanId: context?.scanId ?? null,
      source: 'fallback',
      text:
        `${agentId} response ready. Latest scan context is unavailable right now. ` +
        `Re-run scan on ${fallbackPair} ${String(fallbackTf).toUpperCase()} and ask again.`,
    };
  }

  if (agentId === 'ORCHESTRATOR') {
    const top = context.signals
      .slice(0, 3)
      .map((s) => `${s.agent_name} ${s.vote.toUpperCase()} ${Math.round(toNum(s.confidence, 0))}%`)
      .join(' · ');
    return {
      agentId,
      scanId: context.scanId,
      source: 'scan_context',
      text:
        `${context.pair} ${context.timeframe.toUpperCase()} consensus ${String(context.consensus || 'neutral').toUpperCase()} ` +
        `(${context.avgConfidence ?? 0}%). ${context.summary || ''}${top ? ` Top: ${top}` : ''}`,
    };
  }

  const target = context.signals.find((sig) => {
    const byId = normalizeAgentName(sig.agent_id);
    const byName = normalizeAgentName(sig.agent_name);
    return byId === agentId || byName === agentId;
  });

  if (!target) {
    return {
      agentId,
      scanId: context.scanId,
      source: 'scan_context',
      text:
        `${agentId} has no direct factor row in this scan. ` +
        `Current consensus is ${String(context.consensus || 'neutral').toUpperCase()} (${context.avgConfidence ?? 0}%).`,
    };
  }

  const conf = Math.round(toNum(target.confidence, 0));
  return {
    agentId,
    scanId: context.scanId,
    source: 'scan_context',
    text:
      `${target.agent_name} ${target.vote.toUpperCase()} ${conf}% · ${context.pair} ${context.timeframe.toUpperCase()} ` +
      `ENTRY ${formatPrice(toNum(target.entry_price, 0))} / TP ${formatPrice(toNum(target.tp_price, 0))} / ` +
      `SL ${formatPrice(toNum(target.sl_price, 0))}. ${target.analysis_text}`,
  };
}

/** LLM 기반 에이전트 응답 생성 (실패 시 template fallback) */
async function buildAgentReply(
  agentId: string,
  message: string,
  context: ScanContext | null,
  meta: Record<string, unknown>
): Promise<AgentReply> {
  // LLM 사용 불가 → 기존 template fallback
  if (!isLLMAvailable()) {
    return buildAgentReplyFallback(agentId, message, context, meta);
  }

  const fallbackPair = typeof meta.pair === 'string' && meta.pair ? meta.pair : 'BTC/USDT';
  const fallbackTf = typeof meta.timeframe === 'string' && meta.timeframe ? meta.timeframe : '4h';
  const marketQuestion = isMarketQuestion(message);
  const preferKorean = hasKorean(message);
  const mtfContext = marketQuestion
    ? await withTimeout(
        getMultiTimeframeIndicatorContext(fallbackPair).catch((error: unknown) => {
          console.warn('[chat/messages] failed to build MTF context:', getErrorMessage(error));
          return null;
        }),
        2200,
        null
      )
    : null;

  // 실시간 가격 (meta에서 전달받음)
  const livePrices = (meta.livePrices && typeof meta.livePrices === 'object')
    ? meta.livePrices as Record<string, number>
    : {};

  // Scan context → LLM signal data 변환
  const scanSignals = context?.signals?.map(s => ({
    agentName: s.agent_name,
    vote: s.vote,
    confidence: Math.round(toNum(s.confidence, 0)),
    analysisText: s.analysis_text || '',
    entryPrice: toNum(s.entry_price, 0),
    tpPrice: toNum(s.tp_price, 0),
    slPrice: toNum(s.sl_price, 0),
  })) ?? [];

  const scanSummary = context
    ? `${context.pair} ${context.timeframe.toUpperCase()} ${String(context.consensus || 'neutral').toUpperCase()} (${context.avgConfidence ?? 0}%). ${context.summary || ''}`
    : null;

  // 시스템 프롬프트 빌드
  const agentDef = AGENT_POOL[agentId as keyof typeof AGENT_POOL];
  let systemPrompt: string;

  if (agentId === 'ORCHESTRATOR' || !agentDef) {
    systemPrompt = buildOrchestratorSystemPrompt({
      pair: fallbackPair,
      timeframe: fallbackTf,
      scanSummary,
      scanSignals,
      livePrices,
      multiTimeframe: mtfContext,
    });
  } else {
    systemPrompt = buildAgentSystemPrompt({
      agentId,
      agentDescription: agentDef.description,
      pair: fallbackPair,
      timeframe: fallbackTf,
      scanSummary,
      scanSignals,
      livePrices,
      multiTimeframe: mtfContext,
    });
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: marketQuestion
        ? [
            message,
            '',
            'Output contract (must follow exactly):',
            `- Language: ${preferKorean ? 'Korean' : 'same as user message'}`,
            '- Line1: BIAS: LONG|SHORT|NEUTRAL | CONFIDENCE: NN%',
            '- Line2: WHAT CHANGED: one concrete signal',
            '- Line3: NOW WHAT: entry/invalid/stop plan',
            '- Line4: RISK: one invalidation risk',
            '- Keep total <= 5 lines. No markdown.',
          ].join('\n')
        : [
            message,
            '',
            `Language: ${preferKorean ? 'Korean' : 'same as user message'}.`,
            'Be direct and concise. No markdown.',
          ].join('\n'),
    },
  ];

  try {
    const result = await callLLM({
      messages,
      maxTokens: 300,
      temperature: marketQuestion ? 0.25 : 0.55,
      timeoutMs: 12000,
    });

    const cleaned = trimLines(normalizeWhitespace(result.text), marketQuestion ? 5 : 6);
    if (!cleaned) {
      return buildAgentReplyFallback(agentId, message, context, meta);
    }

    if (marketQuestion && (!hasBiasToken(cleaned) || !hasConfidenceToken(cleaned))) {
      return buildAgentReplyFallback(agentId, message, context, meta);
    }

    return {
      agentId,
      scanId: context?.scanId ?? null,
      source: context?.signals?.length ? 'scan_context' : 'fallback',
      text: cleaned,
    };
  } catch (err: unknown) {
    console.warn(`[chat/messages] LLM call failed for ${agentId}, using template fallback:`, getErrorMessage(err));
    return buildAgentReplyFallback(agentId, message, context, meta);
  }
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);
    const channel = typeof url.searchParams.get('channel') === 'string' ? url.searchParams.get('channel')!.trim() : '';

    const where = channel ? 'AND channel = $2' : '';
    const params = channel ? [user.id, channel] : [user.id];

    const count = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM agent_chat_messages WHERE user_id = $1 ${where}`,
      params
    );

    const rows = await query<AgentChatRow>(
      `
        SELECT
          id, user_id, channel, sender_kind, sender_id,
          sender_name, message, meta, created_at
        FROM agent_chat_messages
        WHERE user_id = $1
        ${where}
        ORDER BY created_at DESC
        LIMIT $${channel ? 3 : 2} OFFSET $${channel ? 4 : 3}
      `,
      channel ? [user.id, channel, limit, offset] : [user.id, limit, offset]
    );

    return json({
      success: true,
      total: Number(count.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapRow).reverse(),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[chat/messages/get] unexpected error:', error);
    return json({ error: 'Failed to load chat messages' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 32 * 1024);

    const channel = typeof body?.channel === 'string' ? body.channel.trim() : 'terminal';
    const senderKind = typeof body?.senderKind === 'string' ? body.senderKind.trim().toLowerCase() : 'user';
    const senderId = typeof body?.senderId === 'string' ? body.senderId.trim() : null;
    const senderName = typeof body?.senderName === 'string' ? body.senderName.trim() : 'YOU';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const meta = normalizeMeta(body?.meta);

    if (!message) return json({ error: 'message is required' }, { status: 400 });
    if (!SENDER_KINDS.has(senderKind)) return json({ error: 'senderKind must be user|agent|system' }, { status: 400 });
    if (channel.length > 64) return json({ error: 'channel is too long' }, { status: 400 });
    if (senderName.length > 64) return json({ error: 'senderName is too long' }, { status: 400 });
    if (message.length > 4000) return json({ error: 'message is too long' }, { status: 400 });

    let user: Awaited<ReturnType<typeof getAuthUserFromCookies>> | null = null;
    try {
      user = await getAuthUserFromCookies(cookies);
    } catch (authErr) {
      console.warn('[chat/messages/post] auth lookup failed, falling back to guest mode:', authErr);
      user = null;
    }

    const allowGuestTerminal = !user && channel === 'terminal' && senderKind === 'user';
    if (!user && !allowGuestTerminal) return json({ error: 'Authentication required' }, { status: 401 });

    const userId = user?.id ?? 'guest';
    const requestMeta = user ? meta : { ...meta, guestMode: true };

    let persistedMessage: ReturnType<typeof mapRow>;
    if (user) {
      const insert = await query<AgentChatRow>(
        `
          INSERT INTO agent_chat_messages (
            user_id, channel, sender_kind, sender_id, sender_name, message, meta, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
          RETURNING
            id, user_id, channel, sender_kind, sender_id, sender_name, message, meta, created_at
        `,
        [user.id, channel, senderKind, senderId, senderName, message, JSON.stringify(requestMeta)]
      );

      persistedMessage = mapRow(insert.rows[0]);
      await query(
        `
          INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
          VALUES ($1, 'chat_sent', 'terminal', $2, 'info', $3::jsonb)
        `,
        [user.id, insert.rows[0].id, JSON.stringify({ channel, senderKind })]
      ).catch(() => undefined);
    } else {
      persistedMessage = buildEphemeralRow({
        userId,
        channel,
        senderKind,
        senderId,
        senderName,
        message,
        meta: requestMeta,
      });
    }

    let agentResponse: ReturnType<typeof mapRow> | null = null;

    if (channel === 'terminal' && senderKind === 'user') {
      // 1. @멘션 감지 → 2. 인텐트 기반 추론 → 3. ORCHESTRATOR 기본
      const mentionedAgent = detectMentionedAgent(message, meta)
        || inferAgentFromIntent(message)
        || 'ORCHESTRATOR';
      {
        const context = user ? await loadScanContext(user.id, meta) : null;
        const reply = await buildAgentReply(mentionedAgent, message, context, meta);
        const replyMeta = {
          ...requestMeta,
          mentionedAgent,
          responseSource: reply.source,
          scanId: reply.scanId,
        };

        if (user) {
          try {
            const replyInsert = await query<AgentChatRow>(
              `
                INSERT INTO agent_chat_messages (
                  user_id, channel, sender_kind, sender_id, sender_name, message, meta, created_at
                )
                VALUES ($1, $2, 'agent', $3, $4, $5, $6::jsonb, now())
                RETURNING
                  id, user_id, channel, sender_kind, sender_id, sender_name, message, meta, created_at
              `,
              [user.id, channel, reply.agentId, reply.agentId, reply.text, JSON.stringify(replyMeta)]
            );
            agentResponse = mapRow(replyInsert.rows[0]);

            await query(
              `
                INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
                VALUES ($1, 'chat_sent', 'terminal', $2, 'info', $3::jsonb)
              `,
              [
                user.id,
                replyInsert.rows[0].id,
                JSON.stringify({
                  channel,
                  senderKind: 'agent',
                  senderId: reply.agentId,
                  source: reply.source,
                }),
              ]
            ).catch(() => undefined);
          } catch (error) {
            console.warn('[chat/messages/post] failed to persist agent response:', error);
          }
        } else {
          agentResponse = buildEphemeralRow({
            userId,
            channel,
            senderKind: 'agent',
            senderId: reply.agentId,
            senderName: reply.agentId,
            message: reply.text,
            meta: replyMeta,
          });
        }
      }
    }

    return json({
      success: true,
      guestMode: !user,
      message: persistedMessage,
      agentResponse,
    });
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[chat/messages/post] unexpected error:', error);
    return json({ error: 'Failed to create chat message' }, { status: 500 });
  }
};
