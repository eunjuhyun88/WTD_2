// ═══════════════════════════════════════════════════════════════
// POST /api/analyze — 트레이딩 분석 텍스트 → 다중 LLM 신호 추출
//
// Groq + Gemini + Cerebras 병렬 호출 후 결과 비교 반환.
// 각 모델이 추출한 building block 목록을 비교해
// 공통 신호(consensus)와 모델별 고유 신호를 구분.
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
  getGroqApiKey, GROQ_MODEL, GROQ_ENDPOINT,
  getGeminiApiKey, GEMINI_MODEL, GEMINI_ENDPOINT,
  getCerebrasApiKey, CEREBRAS_MODEL, CEREBRAS_ENDPOINT,
} from '$lib/server/llmConfig.js';

// ─── Known building blocks (engine과 동기화) ─────────────────
const KNOWN_BLOCKS = [
  'bullish_engulfing', 'bearish_engulfing', 'long_lower_wick', 'long_upper_wick',
  'rsi_threshold', 'rsi_bullish_divergence', 'rsi_bearish_divergence', 'support_bounce',
  'recent_rally', 'recent_decline', 'gap_up', 'gap_down',
  'breakout_above_high', 'breakout_volume_confirm', 'consolidation_then_breakout',
  'volume_spike', 'volume_spike_down', 'sweep_below_low',
  'golden_cross', 'dead_cross', 'ema_pullback', 'bollinger_squeeze', 'bollinger_expansion',
  'funding_extreme', 'funding_flip', 'positive_funding_bias',
  'higher_lows_sequence', 'ls_ratio_recovery',
  'oi_change', 'oi_expansion_confirm', 'oi_hold_after_spike', 'oi_spike_with_dump',
  'oi_price_lag_detect',
  'cvd_state_eq', 'cvd_buying', 'delta_flip_positive',
  'absorption_signal', 'post_dump_compression', 'reclaim_after_dump', 'sideways_compression',
  'social_sentiment_spike', 'kol_signal', 'fear_greed_rising',
  'volume_below_average', 'extreme_volatility', 'coinbase_premium_weak',
];

const SYSTEM_PROMPT = `너는 암호화폐 트레이딩 신호 분석 AI야.
트레이딩 분석 텍스트를 읽고 아래 JSON 형식으로만 응답해:

{
  "symbol": "심볼명USDT (모르면 null)",
  "bias": "bullish | bearish | neutral",
  "watch_blocks": ["블록명1", "블록명2"],
  "entry_condition": "진입 조건 한 줄 요약",
  "risk_note": "리스크 한 줄 요약",
  "confidence": 0.0~1.0
}

watch_blocks는 반드시 이 목록에서만 선택:
${KNOWN_BLOCKS.join(', ')}

JSON만 출력. 마크다운, 설명, 주석 없이.`;

// ─── 타입 ────────────────────────────────────────────────────

interface AnalysisResult {
  provider: string;
  model: string;
  symbol: string | null;
  bias: string;
  watch_blocks: string[];
  entry_condition: string;
  risk_note: string;
  confidence: number;
  latency_ms: number;
  error?: string;
}

// ─── JSON 파싱 헬퍼 ──────────────────────────────────────────

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}') + 1;
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end)); } catch { /* ignore */ }
    }
    return {};
  }
}

function toResult(
  provider: string,
  model: string,
  d: Record<string, unknown>,
  latency: number,
): AnalysisResult {
  const blocks = (d.watch_blocks as string[] | undefined ?? [])
    .filter((b) => KNOWN_BLOCKS.includes(b));
  return {
    provider,
    model,
    symbol: (d.symbol as string | null) ?? null,
    bias: (d.bias as string) || 'neutral',
    watch_blocks: blocks,
    entry_condition: (d.entry_condition as string) || '',
    risk_note: (d.risk_note as string) || '',
    confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0.5)),
    latency_ms: latency,
  };
}

// ─── Provider 호출 함수 ──────────────────────────────────────

async function callOpenAICompat(
  provider: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  analysis: string,
): Promise<AnalysisResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: analysis },
        ],
        max_tokens: 512,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '{}';
    return toResult(provider, model, parseJson(text), Date.now() - t0);
  } catch (e) {
    return {
      provider, model,
      symbol: null, bias: 'neutral', watch_blocks: [],
      entry_condition: '', risk_note: '',
      confidence: 0, latency_ms: Date.now() - t0,
      error: String(e),
    };
  }
}

async function callGemini(analysis: string): Promise<AnalysisResult> {
  const t0 = Date.now();
  const apiKey = getGeminiApiKey();
  try {
    const url = `${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${SYSTEM_PROMPT}\n\n분석 텍스트:\n${analysis}` }],
        }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return toResult('Gemini', GEMINI_MODEL, parseJson(text), Date.now() - t0);
  } catch (e) {
    return {
      provider: 'Gemini', model: GEMINI_MODEL,
      symbol: null, bias: 'neutral', watch_blocks: [],
      entry_condition: '', risk_note: '',
      confidence: 0, latency_ms: Date.now() - t0,
      error: String(e),
    };
  }
}

// ─── Main handler ────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json() as { analysis?: string; providers?: string[] };
  const analysis = (body.analysis ?? '').trim();

  if (!analysis || analysis.length < 20) {
    return json({ error: '분석 텍스트를 입력해주세요 (최소 20자)' }, { status: 400 });
  }

  const selectedProviders = body.providers ?? ['groq', 'gemini', 'cerebras'];

  const calls: Promise<AnalysisResult>[] = [];

  if (selectedProviders.includes('groq')) {
    calls.push(callOpenAICompat(
      'Groq', GROQ_MODEL, GROQ_ENDPOINT,
      getGroqApiKey(), analysis,
    ));
  }
  if (selectedProviders.includes('gemini')) {
    calls.push(callGemini(analysis));
  }
  if (selectedProviders.includes('cerebras')) {
    calls.push(callOpenAICompat(
      'Cerebras', CEREBRAS_MODEL, CEREBRAS_ENDPOINT,
      getCerebrasApiKey(), analysis,
    ));
  }

  const results = await Promise.all(calls);
  const successful = results.filter((r) => !r.error);

  // 공통 블록 — 절반 이상 모델이 동의
  const blockCounts: Record<string, number> = {};
  for (const r of successful) {
    for (const b of r.watch_blocks) {
      blockCounts[b] = (blockCounts[b] ?? 0) + 1;
    }
  }
  const threshold = Math.max(1, Math.ceil(successful.length / 2));
  const consensus_blocks = Object.entries(blockCounts)
    .filter(([, cnt]) => cnt >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([block]) => block);

  // 편향 합의
  const biasVotes = successful.map((r) => r.bias);
  const biasCounts = biasVotes.reduce<Record<string, number>>((acc, b) => {
    acc[b] = (acc[b] ?? 0) + 1; return acc;
  }, {});
  const consensus_bias = Object.entries(biasCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'neutral';

  return json({
    ok: true,
    consensus: { bias: consensus_bias, blocks: consensus_blocks },
    results,
    block_counts: blockCounts,
  });
};
