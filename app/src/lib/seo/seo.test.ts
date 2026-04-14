import { describe, expect, it } from 'vitest';
import { buildRobotsTxt, buildSitemapXml } from './documents';
import { INDEXABLE_SURFACE_ENTRIES, shouldApplyNoIndexHeader } from './policy';
import { buildCanonicalHref, resolveSiteUrl } from './site';

describe('SEO policy artifacts', () => {
	it('builds robots.txt with sitemap and private path exclusions', () => {
		const robots = buildRobotsTxt('https://cogochi.example', ['/api/', '/dashboard', '/passport']);

		expect(robots).toContain('Allow: /');
		expect(robots).toContain('Disallow: /api/');
		expect(robots).toContain('Disallow: /dashboard');
		expect(robots).toContain('Sitemap: https://cogochi.example/sitemap.xml');
	});

	it('builds sitemap.xml from indexable surfaces only', () => {
		const xml = buildSitemapXml('https://cogochi.example', INDEXABLE_SURFACE_ENTRIES);

		expect(xml).toContain('<loc>https://cogochi.example/</loc>');
		expect(xml).toContain('<loc>https://cogochi.example/terminal</loc>');
		expect(xml).toContain('<loc>https://cogochi.example/patterns</loc>');
		expect(xml).not.toContain('/dashboard');
		expect(xml).not.toContain('/passport');
	});

	it('marks private and API routes as noindex', () => {
		expect(shouldApplyNoIndexHeader('/api/cogochi/analyze')).toBe(true);
		expect(shouldApplyNoIndexHeader('/dashboard')).toBe(true);
		expect(shouldApplyNoIndexHeader('/passport')).toBe(true);
		expect(shouldApplyNoIndexHeader('/settings')).toBe(true);
		expect(shouldApplyNoIndexHeader('/healthz')).toBe(true);
		expect(shouldApplyNoIndexHeader('/')).toBe(false);
		expect(shouldApplyNoIndexHeader('/terminal')).toBe(false);
	});

	it('normalizes site urls and canonical hrefs', () => {
		expect(resolveSiteUrl('https://cogochi.example///')).toBe('https://cogochi.example');
		expect(resolveSiteUrl('not-a-url')).toBeNull();
		expect(buildCanonicalHref('/terminal', 'https://cogochi.example/')).toBe('https://cogochi.example/terminal');
		expect(buildCanonicalHref('patterns', 'https://cogochi.example/app/')).toBe('https://cogochi.example/patterns');
	});
});
