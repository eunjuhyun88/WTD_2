/**
 * Agent directive parser — extracts structured card tokens from LLM text.
 *
 * Format: <directive type="verdict_card" payload={"key":"val"}/>
 * Falls back to raw text if payload JSON is malformed.
 */

export type DirectiveType = 'verdict_card' | 'similarity_card' | 'passport_card';

export interface VerdictCardPayload {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  p_win: number;         // 0–1
  capture_id?: string;
  timeframe?: string;
}

export interface SimilarityCardPayload {
  symbol: string;
  similar_patterns: Array<{
    id: string;
    symbol: string;
    timeframe: string;
    outcome: string;
    p_win: number;
  }>;
}

export interface PassportCardPayload {
  username: string;
  accuracy: number;    // 0–1
  streak: number;
  total_verdicts: number;
}

export type DirectivePayload = VerdictCardPayload | SimilarityCardPayload | PassportCardPayload;

export interface Directive {
  type: DirectiveType;
  payload: DirectivePayload;
}

export interface TextSegment  { kind: 'text';      text: string; }
export interface CardSegment  { kind: 'directive';  directive: Directive; }
export type Segment = TextSegment | CardSegment;

/** Parse LLM output into interleaved text/card segments. */
export function parseDirectives(raw: string): Segment[] {
  // Match <directive type="..." payload={...}/>
  const RE = /<directive\s+type="([^"]+)"\s+payload=(\{[^}]*(?:\{[^}]*\}[^}]*)?\})\s*\/>/g;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = RE.exec(raw)) !== null) {
    if (m.index > last) {
      out.push({ kind: 'text', text: raw.slice(last, m.index) });
    }
    try {
      const payload = JSON.parse(m[2]) as DirectivePayload;
      out.push({ kind: 'directive', directive: { type: m[1] as DirectiveType, payload } });
    } catch {
      // malformed JSON → raw text fallback (AC4-2)
      out.push({ kind: 'text', text: m[0] });
    }
    last = m.index + m[0].length;
  }

  if (last < raw.length) out.push({ kind: 'text', text: raw.slice(last) });
  return out.length ? out : [{ kind: 'text', text: raw }];
}
