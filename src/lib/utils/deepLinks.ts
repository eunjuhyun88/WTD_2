// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Shared Deep Link Utilities
// Canonical URL builders for reusable route state.
// ═══════════════════════════════════════════════════════════════

export type DeepLinkValue = string | number | boolean | null | undefined;
export type DeepLinkParams = Record<string, DeepLinkValue>;

export interface ParsedDeepLink {
  path: string;
  params: Record<string, string>;
  hash: string;
}

export interface TerminalCopyTradeParams {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  conf?: number;
  source?: string;
  reason?: string;
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

export function buildCreateLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/create', params);
}

export function buildWorldLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/world', params);
}

export function buildAgentLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/agent', params);
}

export function buildTerminalCopyTradeLink(params: TerminalCopyTradeParams): string {
  return buildTerminalLink({
    copyTrade: true,
    pair: params.pair,
    dir: params.dir,
    entry: Math.round(params.entry),
    tp: Math.round(params.tp),
    sl: Math.round(params.sl),
    conf: params.conf == null ? undefined : Math.round(params.conf),
    source: params.source ?? 'community',
    reason: params.reason ?? '',
  });
}

export function buildSignalsLink(view?: 'feed' | 'trending' | 'ai'): string {
  return buildDeepLink('/signals', view && view !== 'feed' ? { view } : {});
}

export function buildMarketLink(view?: 'feed' | 'trending' | 'ai'): string {
  return buildSignalsLink(view);
}

export function buildBattleLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/arena', params);
}

export function buildLabLink(params: DeepLinkParams = {}): string {
  return buildDeepLink('/lab', params);
}

export function buildPassportLink(tab?: string): string {
  return buildDeepLink('/passport', tab ? { tab } : {});
}

export function buildArenaLink(mode?: 'quick' | 'war' | 'tournament'): string {
  return buildBattleLink(mode ? { mode } : {});
}
