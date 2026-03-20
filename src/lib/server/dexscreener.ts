// ═══════════════════════════════════════════════════════════════
// Stockclaw — DexScreener server client
// ═══════════════════════════════════════════════════════════════

const DEX_BASE = 'https://api.dexscreener.com';

const CHAIN_ID_RE = /^[a-zA-Z0-9:_-]{1,64}$/;
const PATH_ID_RE = /^[a-zA-Z0-9._:-]{2,160}$/;

export type DexScreenerLink = {
  type: string | null;
  label: string | null;
  url: string;
};

export type DexTokenProfile = {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon: string | null;
  header: string | null;
  description: string | null;
  links: DexScreenerLink[] | null;
};

export type DexCommunityTakeover = DexTokenProfile & {
  claimDate: string | null;
};

export type DexAd = {
  url: string;
  chainId: string;
  tokenAddress: string;
  date: string | null;
  type: string | null;
  durationHours: number | null;
  impressions: number | null;
};

function toBoundedLimit(raw: unknown, fallback = 20, min = 1, max = 100): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function validateChainId(chainId: string): string {
  if (!CHAIN_ID_RE.test(chainId)) {
    throw new Error('invalid chainId');
  }
  return chainId;
}

function validatePathId(value: string, fieldName: string): string {
  if (!PATH_ID_RE.test(value)) {
    throw new Error(`invalid ${fieldName}`);
  }
  return value;
}

function validateTokenAddressesCsv(value: string): string {
  const parts = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 30) {
    throw new Error('invalid tokenAddresses');
  }
  for (const part of parts) validatePathId(part, 'tokenAddress');
  return parts.join(',');
}

async function fetchJsonWithTimeout(path: string, timeoutMs = 6000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DEX_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`dexscreener ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function mapLinks(raw: unknown): DexScreenerLink[] | null {
  if (!Array.isArray(raw)) return null;
  const links: DexScreenerLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== 'string' || !rec.url.trim()) continue;
    links.push({
      type: typeof rec.type === 'string' ? rec.type : null,
      label: typeof rec.label === 'string' ? rec.label : null,
      url: rec.url,
    });
  }
  return links.length ? links : null;
}

function mapTokenProfile(raw: unknown): DexTokenProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec.url !== 'string' ||
    typeof rec.chainId !== 'string' ||
    typeof rec.tokenAddress !== 'string'
  ) {
    return null;
  }

  return {
    url: rec.url,
    chainId: rec.chainId,
    tokenAddress: rec.tokenAddress,
    icon: typeof rec.icon === 'string' ? rec.icon : null,
    header: typeof rec.header === 'string' ? rec.header : null,
    description: typeof rec.description === 'string' ? rec.description : null,
    links: mapLinks(rec.links),
  };
}

function mapTokenProfileList(input: unknown, limit: number): DexTokenProfile[] {
  if (!Array.isArray(input)) return [];
  const rows: DexTokenProfile[] = [];
  for (const raw of input) {
    const mapped = mapTokenProfile(raw);
    if (mapped) rows.push(mapped);
    if (rows.length >= limit) break;
  }
  return rows;
}

function mapTakeoverList(input: unknown, limit: number): DexCommunityTakeover[] {
  if (!Array.isArray(input)) return [];
  const rows: DexCommunityTakeover[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const profile = mapTokenProfile(rec);
    if (!profile) continue;
    rows.push({
      ...profile,
      claimDate: typeof rec.claimDate === 'string' ? rec.claimDate : null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function mapAdsList(input: unknown, limit: number): DexAd[] {
  if (!Array.isArray(input)) return [];
  const rows: DexAd[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    if (
      typeof rec.url !== 'string' ||
      typeof rec.chainId !== 'string' ||
      typeof rec.tokenAddress !== 'string'
    ) {
      continue;
    }
    rows.push({
      url: rec.url,
      chainId: rec.chainId,
      tokenAddress: rec.tokenAddress,
      date: typeof rec.date === 'string' ? rec.date : null,
      type: typeof rec.type === 'string' ? rec.type : null,
      durationHours: typeof rec.durationHours === 'number' ? rec.durationHours : null,
      impressions: typeof rec.impressions === 'number' ? rec.impressions : null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export async function fetchDexTokenProfilesLatest(limitRaw?: unknown): Promise<DexTokenProfile[]> {
  const limit = toBoundedLimit(limitRaw, 20, 1, 100);
  const json = await fetchJsonWithTimeout('/token-profiles/latest/v1');
  return mapTokenProfileList(json, limit);
}

export async function fetchDexCommunityTakeoversLatest(limitRaw?: unknown): Promise<DexCommunityTakeover[]> {
  const limit = toBoundedLimit(limitRaw, 20, 1, 100);
  const json = await fetchJsonWithTimeout('/community-takeovers/latest/v1');
  return mapTakeoverList(json, limit);
}

export async function fetchDexAdsLatest(limitRaw?: unknown): Promise<DexAd[]> {
  const limit = toBoundedLimit(limitRaw, 20, 1, 100);
  const json = await fetchJsonWithTimeout('/ads/latest/v1');
  return mapAdsList(json, limit);
}

export async function fetchDexTokenBoostsLatest(limitRaw?: unknown): Promise<DexTokenProfile[]> {
  const limit = toBoundedLimit(limitRaw, 20, 1, 100);
  const json = await fetchJsonWithTimeout('/token-boosts/latest/v1');
  return mapTokenProfileList(json, limit);
}

export async function fetchDexTokenBoostsTop(limitRaw?: unknown): Promise<DexTokenProfile[]> {
  const limit = toBoundedLimit(limitRaw, 20, 1, 100);
  const json = await fetchJsonWithTimeout('/token-boosts/top/v1');
  return mapTokenProfileList(json, limit);
}

export async function fetchDexOrders(chainIdRaw: string, tokenAddressRaw: string): Promise<unknown> {
  const chainId = validateChainId(chainIdRaw);
  const tokenAddress = validatePathId(tokenAddressRaw, 'tokenAddress');
  return fetchJsonWithTimeout(`/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`);
}

export async function fetchDexPair(chainIdRaw: string, pairIdRaw: string): Promise<unknown> {
  const chainId = validateChainId(chainIdRaw);
  const pairId = validatePathId(pairIdRaw, 'pairId');
  return fetchJsonWithTimeout(`/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairId)}`);
}

export async function searchDexPairs(queryRaw: string): Promise<unknown> {
  const q = queryRaw.trim();
  if (!q) throw new Error('query is required');
  return fetchJsonWithTimeout(`/latest/dex/search?q=${encodeURIComponent(q)}`);
}

export async function fetchDexTokenPairs(chainIdRaw: string, tokenAddressRaw: string): Promise<unknown> {
  const chainId = validateChainId(chainIdRaw);
  const tokenAddress = validatePathId(tokenAddressRaw, 'tokenAddress');
  return fetchJsonWithTimeout(`/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`);
}

export async function fetchDexTokens(chainIdRaw: string, tokenAddressesRaw: string): Promise<unknown> {
  const chainId = validateChainId(chainIdRaw);
  const tokenAddresses = validateTokenAddressesCsv(tokenAddressesRaw);
  return fetchJsonWithTimeout(`/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddresses)}`);
}
