export type IndexableSurfaceEntry = {
	path: string;
	changefreq: 'hourly' | 'daily' | 'weekly' | 'monthly';
	priority: number;
};

export const INDEXABLE_SURFACE_ENTRIES: readonly IndexableSurfaceEntry[] = [
	{ path: '/', changefreq: 'weekly', priority: 1 },
	{ path: '/terminal', changefreq: 'daily', priority: 0.9 },
	{ path: '/lab', changefreq: 'weekly', priority: 0.75 },
	{ path: '/patterns', changefreq: 'daily', priority: 0.8 },
];

export const ROBOTS_DISALLOW_PATHS = ['/api/', '/dashboard', '/passport', '/settings', '/agent', '/healthz'];

function normalizePathname(pathname: string): string {
	if (!pathname) return '/';
	if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
	return pathname;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
	const normalizedPath = normalizePathname(pathname);
	const normalizedPrefix = normalizePathname(prefix);

	return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function shouldApplyNoIndexHeader(pathname: string): boolean {
	return ROBOTS_DISALLOW_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function isIndexableSurface(pathname: string): boolean {
	const normalizedPath = normalizePathname(pathname);
	return INDEXABLE_SURFACE_ENTRIES.some((entry) => entry.path === normalizedPath);
}
