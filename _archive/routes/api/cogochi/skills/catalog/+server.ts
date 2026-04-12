import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSkillCatalog } from '$lib/server/skillsRegistry';

export const GET: RequestHandler = async () => {
	return json(getSkillCatalog());
};
