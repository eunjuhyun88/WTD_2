import { env } from '$env/dynamic/public';

function normalizeSiteUrl(raw: string | URL | null | undefined): string | null {
	if (!raw) return null;

	const candidate = raw instanceof URL ? raw.toString() : String(raw).trim();
	if (!candidate) return null;

	try {
		const url = new URL(candidate);
		const normalizedPath = url.pathname.replace(/\/+$/, '');
		url.pathname = normalizedPath || '/';
		return url.toString().replace(/\/$/, '');
	} catch {
		return null;
	}
}

export function resolveSiteUrl(fallbackOrigin?: string | URL): string | null {
	return normalizeSiteUrl(env.PUBLIC_SITE_URL) ?? normalizeSiteUrl(fallbackOrigin);
}

export function buildCanonicalHref(path: string, fallbackOrigin?: string | URL): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const siteUrl = resolveSiteUrl(fallbackOrigin);
	return siteUrl ? new URL(normalizedPath, `${siteUrl}/`).toString() : normalizedPath;
}
