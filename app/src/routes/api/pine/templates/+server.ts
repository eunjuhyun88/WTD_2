// GET /api/pine/templates           — full catalog
// GET /api/pine/templates?id=<id>   — slot spec for one template
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTemplates, getTemplate } from '$lib/server/pine/registry';

export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (id) {
    const spec = getTemplate(id);
    if (!spec) return json({ ok: false, error: `unknown template "${id}"` }, { status: 404 });
    return json({ ok: true, template: spec });
  }
  return json({ ok: true, templates: listTemplates() });
};
