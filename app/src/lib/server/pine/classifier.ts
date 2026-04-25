// ═══════════════════════════════════════════════════════════════
// Pine Template Intent Classifier
// ═══════════════════════════════════════════════════════════════
//
// Two-tier match strategy:
//  1. Keyword scoring (regex) — sub-millisecond, $0 cost
//  2. LLM fallback (Haiku-class) — only when score < threshold
//
// Returns the best matching templateId + confidence, or null if
// the request looks like custom Pine (caller should escalate to
// LLM Pine generation).

import { TEMPLATES } from './registry';
import { callLLM } from '../llmService';

export interface ClassifyResult {
  templateId: string;
  confidence: number; // 0..1
  via: 'keyword' | 'llm' | 'fallback';
  reason: string;
}

/** Tokenize and lower-case for keyword scoring */
function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}

/**
 * Score: count of unique keyword hits, normalized by template's keyword count.
 * Tie-broken by which template has the higher hit count.
 */
function keywordScore(prompt: string): { templateId: string; score: number; hits: number } | null {
  const promptTokens = new Set(tokens(prompt));
  if (promptTokens.size === 0) return null;

  let best: { templateId: string; score: number; hits: number } | null = null;
  for (const t of TEMPLATES) {
    let hits = 0;
    for (const kw of t.keywords) {
      // multi-word keywords ("smart money", "volume profile") need substring match
      if (kw.includes(' ')) {
        if (prompt.toLowerCase().includes(kw)) hits += 1;
      } else if (promptTokens.has(kw)) {
        hits += 1;
      }
    }
    if (hits === 0) continue;
    const score = hits / t.keywords.length;
    if (!best || hits > best.hits || (hits === best.hits && score > best.score)) {
      best = { templateId: t.id, score, hits };
    }
  }
  return best;
}

const KEYWORD_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Classify a free-form prompt to a template id.
 * Tier 1 (keyword) returns immediately if confident.
 * Tier 2 (LLM) only fires when keyword match is weak AND LLM is available.
 */
export async function classify(prompt: string, opts?: { allowLLM?: boolean }): Promise<ClassifyResult | null> {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  // Direct id mention shortcut
  for (const t of TEMPLATES) {
    if (trimmed === t.id || trimmed.includes(t.id)) {
      return { templateId: t.id, confidence: 1, via: 'keyword', reason: 'exact id match' };
    }
  }

  const kw = keywordScore(trimmed);
  if (kw && kw.score >= KEYWORD_CONFIDENCE_THRESHOLD) {
    return {
      templateId: kw.templateId,
      confidence: Math.min(1, kw.score + 0.2 * Math.min(1, kw.hits / 3)),
      via: 'keyword',
      reason: `${kw.hits} keyword hit(s), score ${kw.score.toFixed(2)}`,
    };
  }

  // LLM fallback (if enabled and weak keyword match exists)
  if (opts?.allowLLM !== false) {
    const llmResult = await llmClassify(trimmed).catch(() => null);
    if (llmResult) return llmResult;
  }

  // Last-resort fallback: best keyword hit (even if below threshold)
  if (kw) {
    return {
      templateId: kw.templateId,
      confidence: kw.score,
      via: 'fallback',
      reason: `weak keyword match (${kw.hits} hits)`,
    };
  }

  return null;
}

async function llmClassify(prompt: string): Promise<ClassifyResult | null> {
  const catalog = TEMPLATES.map((t) => `- ${t.id}: ${t.title} — ${t.description}`).join('\n');
  const system = [
    'You are a Pine Script template router for a trading analysis platform (WTD).',
    'Given a user request, choose the single best template id from the catalog.',
    'Respond ONLY with strict JSON: {"templateId":"<id>","confidence":<0..1>,"reason":"<short>"}',
    'If no template fits, respond {"templateId":null,"confidence":0,"reason":"custom"}.',
    '',
    'Catalog:',
    catalog,
  ].join('\n');

  const out = await callLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    maxTokens: 120,
    temperature: 0.1,
    timeoutMs: 6000,
  });

  // Robust JSON extraction
  const match = out.text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { templateId: string | null; confidence?: number; reason?: string };
    if (!parsed.templateId) return null;
    if (!TEMPLATES.some((t) => t.id === parsed.templateId)) return null;
    return {
      templateId: parsed.templateId,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.7)),
      via: 'llm',
      reason: parsed.reason ?? 'llm classified',
    };
  } catch {
    return null;
  }
}
