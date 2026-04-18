import type { RequestHandler } from './$types';
import { buildRobotsTxt } from '$lib/seo/documents';
import { ROBOTS_DISALLOW_PATHS } from '$lib/seo/policy';
import { resolveSiteUrl } from '$lib/seo/site';

export const config = {
	runtime: 'nodejs22.x',
	regions: ['iad1'],
	memory: 256,
	maxDuration: 5,
};

export const GET: RequestHandler = ({ url }) => {
	const siteUrl = resolveSiteUrl(url.origin) ?? url.origin;
	const body = buildRobotsTxt(siteUrl, ROBOTS_DISALLOW_PATHS);

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600',
		},
	});
};
