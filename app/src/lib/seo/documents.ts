import type { IndexableSurfaceEntry } from './policy';

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function buildAbsoluteUrl(siteUrl: string, path: string): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return new URL(normalizedPath, `${siteUrl}/`).toString();
}

export function buildRobotsTxt(siteUrl: string, disallowPaths: readonly string[]): string {
	const lines = ['User-agent: *', 'Allow: /', ...disallowPaths.map((path) => `Disallow: ${path}`)];
	lines.push(`Sitemap: ${buildAbsoluteUrl(siteUrl, '/sitemap.xml')}`);
	return `${lines.join('\n')}\n`;
}

export function buildSitemapXml(siteUrl: string, entries: readonly IndexableSurfaceEntry[]): string {
	const lastmod = new Date().toISOString();
	const urls = entries
		.map((entry) => {
			const loc = escapeXml(buildAbsoluteUrl(siteUrl, entry.path));
			return [
				'  <url>',
				`    <loc>${loc}</loc>`,
				`    <lastmod>${lastmod}</lastmod>`,
				`    <changefreq>${entry.changefreq}</changefreq>`,
				`    <priority>${entry.priority.toFixed(1)}</priority>`,
				'  </url>',
			].join('\n');
		})
		.join('\n');

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		urls,
		'</urlset>',
		'',
	].join('\n');
}
