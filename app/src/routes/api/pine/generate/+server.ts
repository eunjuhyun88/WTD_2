// ═══════════════════════════════════════════════════════════════
// POST /api/pine/generate
// ═══════════════════════════════════════════════════════════════
//
// Body shapes:
//   A) Direct template invocation
//      { "templateId": "wyckoff_overlay", "values": { ... } }
//   B) Natural-language prompt → classify → render
//      { "prompt": "show wyckoff phase on btc", "values": { ... } }
//      → engine picks templateId, fills in user-supplied values
//
// Response:
//   { ok: true,  templateId, title, source, filledSlots, warnings, classifier? }
//   { ok: false, error, missingSlots? }
//
// Cost profile:
//   - Template path:        $0    ~50ms
//   - Keyword classify:     $0    ~5ms
//   - LLM classify (rare):  ~$0.001  ~3s
//   - Pure LLM gen (TODO):  ~$0.005  ~5s

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { render } from '$lib/server/pine/engine';
import { classify } from '$lib/server/pine/classifier';
import { listTemplates, getTemplate } from '$lib/server/pine/registry';

interface GenerateBody {
  templateId?: string;
  prompt?: string;
  values?: Record<string, string | number | undefined | null>;
  allowLLMClassifier?: boolean;
}

export const GET: RequestHandler = async () => {
  // List templates (for UI catalog)
  return json({ ok: true, templates: listTemplates() });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const values = body.values ?? {};

  // ── Path A: explicit templateId ────────────────────────────
  if (body.templateId) {
    const result = await render({ templateId: body.templateId, values });
    return json(result, { status: result.ok ? 200 : 400 });
  }

  // ── Path B: natural-language prompt ────────────────────────
  if (body.prompt) {
    const cls = await classify(body.prompt, { allowLLM: body.allowLLMClassifier !== false });
    if (!cls) {
      return json(
        { ok: false, error: 'no matching template (custom Pine generation not yet enabled in fast-path)' },
        { status: 422 },
      );
    }
    const tmpl = getTemplate(cls.templateId);
    if (!tmpl) {
      return json({ ok: false, error: `classifier returned unknown template "${cls.templateId}"` }, { status: 500 });
    }
    const result = await render({ templateId: cls.templateId, values });
    if (!result.ok) {
      return json({ ...result, classifier: cls }, { status: 400 });
    }
    return json({ ...result, classifier: cls });
  }

  return json({ ok: false, error: 'provide either "templateId" or "prompt"' }, { status: 400 });
};
