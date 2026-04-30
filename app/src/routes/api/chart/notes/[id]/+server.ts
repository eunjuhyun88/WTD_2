/**
 * PATCH  /api/chart/notes/[id]  — update body/tag
 * DELETE /api/chart/notes/[id]  — delete note
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { updateNote, deleteNote } from '$lib/server/chartNotesRepository';

const VALID_TAG = new Set(['idea','entry','exit','mistake','observation']);

export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const patch: { body?: string; tag?: string } = {};
  if (typeof body.body === 'string') {
    if (body.body.trim().length === 0) throw error(400, 'body cannot be empty');
    if (body.body.length > 500) throw error(400, 'body too long (max 500)');
    patch.body = body.body;
  }
  if (typeof body.tag === 'string') {
    if (!VALID_TAG.has(body.tag)) throw error(400, 'invalid tag');
    patch.tag = body.tag;
  }

  const note = await updateNote(user.id, params.id, patch);
  if (!note) throw error(404, 'Note not found');
  return json({ note });
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const deleted = await deleteNote(user.id, params.id);
  if (!deleted) throw error(404, 'Note not found');
  return json({ ok: true });
};
