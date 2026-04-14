import type { RequestHandler } from './$types';
import { buildSitemapXml } from '$lib/seo/documents';
import { INDEXABLE_SURFACE_ENTRIES } from '$lib/seo/policy';
import { resolveSiteUrl } from '$lib/seo/site';

export const GET: RequestHandler = ({ url }) => {
	const siteUrl = resolveSiteUrl(url.origin) ?? url.origin;
	const body = buildSitemapXml(siteUrl, INDEXABLE_SURFACE_ENTRIES);

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600',
		},
	});
};
