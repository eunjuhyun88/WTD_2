import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { callLLM } from '$lib/server/llmService';

// ─── Pine Script AI Generator ─────────────────────────────────────────────
// Natural language → Pine Script v5.
// Supports: indicator overlays, sub-pane studies, comparison benchmarks,
// smart money markers, liquidation maps, CVD variants, and more.

const PINE_SYSTEM_PROMPT = `You are an expert Pine Script v5 developer for TradingView.
Convert natural language requests into production-ready Pine Script v5 code.

Rules:
- Always use //@version=5
- Use indicator() or strategy() as appropriate
- Prefer input.* for parameters
- Include tooltips on inputs
- Use proper color schemes (crypto: dark background friendly)
- Add plot labels and legends
- Handle edge cases (na values, division by zero)
- Keep code clean and commented
- For comparison indicators: use request.security() for multi-symbol
- For volume profile: use histogram with color intensity
- For smart money: use label.new() for markers
- For CVD: cumulative delta = sum(volume * sign(close - open))
- For funding rate display: use table.new() for data tables
- For liquidation heatmap: use box.new() for price clusters

Output format - respond with ONLY this JSON structure:
{
  "name": "indicator name",
  "description": "one line what it does",
  "script": "full pine script code here",
  "usage": "brief how to use it in TradingView",
  "limitations": "any known limitations or data requirements"
}

Do not include any text outside the JSON.`;

export const POST: RequestHandler = async ({ request }) => {
  let body: { prompt?: string; symbol?: string; tf?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, symbol, tf } = body;
  if (!prompt?.trim()) {
    return json({ error: 'prompt is required' }, { status: 400 });
  }

  const userMessage = [
    symbol ? `Current symbol: ${symbol}` : null,
    tf ? `Timeframe: ${tf}` : null,
    `Request: ${prompt.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await callLLM({
      messages: [
        { role: 'system', content: PINE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.2, // low temp for deterministic code
      timeoutMs: 25000,
    });

    // Parse JSON from LLM response
    const raw = result.text.trim();
    // Extract JSON if wrapped in markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? null;
    const jsonStr = jsonMatch ? jsonMatch[1] : raw;

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: return raw script if JSON parse fails
      return json({
        name: 'Custom Indicator',
        description: prompt.slice(0, 80),
        script: raw,
        usage: 'Paste into TradingView Pine Script editor',
        limitations: '',
      });
    }

    return json({
      name: parsed.name ?? 'Custom Indicator',
      description: parsed.description ?? '',
      script: parsed.script ?? '',
      usage: parsed.usage ?? 'Paste into TradingView Pine Script editor',
      limitations: parsed.limitations ?? '',
      provider: result.provider,
    });
  } catch (err: any) {
    console.error('[pine-script] LLM call failed:', err.message);
    return json({ error: 'LLM unavailable. Check API keys.' }, { status: 503 });
  }
};
