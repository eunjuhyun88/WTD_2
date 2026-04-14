// ═══════════════════════════════════════════════════════════════
// WTD — Shared Deep Link Utilities
// Canonical URL builders for reusable route state.
// ═══════════════════════════════════════════════════════════════

export type DeepLinkValue = string | number | boolean | null | undefined;
export type DeepLinkParams = Record<string, DeepLinkValue>;

export interface ParsedDeepLink {
  path: string;
  params: Record<string, string>;
  hash: string;
}

export function buildDeepLink(path: string, params: DeepLinkParams = {}, hash = ''): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (typeof value === 'boolean') {
      if (value) search.set(key, '1');
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return `${path}${query ? `?${query}` : ''}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;
}

export function parseDeepLink(input: string | URL, base = 'http://localhost'): ParsedDeepLink {
  const url = typeof input === 'string' ? new URL(input, base) : input;
  return {
    path: url.pathname,
    params: Object.fromEntries(url.searchParams.entries()),
    hash: url.hash.replace(/^#/, ''),
  };
}

export function buildTerminalLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/terminal', params);
}

export function buildDashboardLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/dashboard', params);
}

export function buildLabLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/lab', params);
}

// NOTE: passport routes are archived (Phase 2 deferred) but this builder
// is still used by terminal/+page.svelte for wallet dossier links.
export function buildPassportWalletLink(chain: string, address: string): string {
  return buildDeepLink(`/passport/wallet/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`);
}
