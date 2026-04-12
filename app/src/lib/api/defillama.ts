// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — DeFiLlama API Client (B-05)
// ═══════════════════════════════════════════════════════════════
// Completely free, no API key, no rate limit
// https://defillama.com/docs/api
//
// Maps to: MACRO → STABLECOIN_MCAP
//          General DeFi health

const LLAMA_BASE = 'https://api.llama.fi';
const STABLES_BASE = 'https://stablecoins.llama.fi';

// ─── Types ─────────────────────────────────────────────────

export interface DeFiProtocol {
  name: string;
  tvl: number;
  change1h: number;
  change1d: number;
  change7d: number;
  category: string;
  chains: string[];
}

export interface StablecoinData {
  totalMcap: number;
  change24h: number;
  change7d: number;
  stables: {
    name: string;
    symbol: string;
    mcap: number;
    pegMechanism: string;
  }[];
}

export interface ChainTvl {
  chain: string;
  tvl: number;
  change1d: number;
  change7d: number;
}

// ─── Helpers ────────────────────────────────────────────────

async function llamaFetch(base: string, path: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Stablecoin Market Cap ──────────────────────────────────

export async function fetchStablecoins(): Promise<StablecoinData | null> {
  try {
    const json = await llamaFetch(STABLES_BASE, '/stablecoins?includePrices=true');
    if (!json?.peggedAssets?.length) return null;

    const stables = json.peggedAssets
      .filter((s: any) => s.circulating?.peggedUSD > 0)
      .map((s: any) => ({
        name: s.name ?? '',
        symbol: s.symbol ?? '',
        mcap: s.circulating?.peggedUSD ?? 0,
        pegMechanism: s.pegMechanism ?? 'unknown',
      }))
      .sort((a: { mcap: number }, b: { mcap: number }) => b.mcap - a.mcap)
      .slice(0, 20);

    const totalMcap = stables.reduce((s: number, item: { mcap: number }) => s + item.mcap, 0);

    // Approximate changes from the total chart
    let change24h = 0;
    let change7d = 0;
    try {
      const chartJson = await llamaFetch(STABLES_BASE, '/stablecoincharts/all?stablecoin=1');
      if (Array.isArray(chartJson) && chartJson.length >= 8) {
        const latest = chartJson[chartJson.length - 1];
        const day1 = chartJson[chartJson.length - 2];
        const day7 = chartJson[chartJson.length - 8];
        const latestVal = latest?.totalCirculatingUSD?.peggedUSD ?? 0;
        const day1Val = day1?.totalCirculatingUSD?.peggedUSD ?? 0;
        const day7Val = day7?.totalCirculatingUSD?.peggedUSD ?? 0;
        if (day1Val > 0) change24h = ((latestVal - day1Val) / day1Val) * 100;
        if (day7Val > 0) change7d = ((latestVal - day7Val) / day7Val) * 100;
      }
    } catch {
      // Non-critical
    }

    return { totalMcap, change24h, change7d, stables };
  } catch (err) {
    console.error('[DeFiLlama] stablecoins error:', err);
    return null;
  }
}

// ─── Total DeFi TVL ─────────────────────────────────────────

export async function fetchTotalTvl(): Promise<{ tvl: number; change24h: number } | null> {
  try {
    const json = await llamaFetch(LLAMA_BASE, '/v2/historicalChainTvl');
    if (!Array.isArray(json) || json.length < 2) return null;

    const latest = json[json.length - 1];
    const prev = json[json.length - 2];
    const tvl = latest?.tvl ?? 0;
    const prevTvl = prev?.tvl ?? 0;
    const change24h = prevTvl > 0 ? ((tvl - prevTvl) / prevTvl) * 100 : 0;

    return { tvl, change24h };
  } catch (err) {
    console.error('[DeFiLlama] TVL error:', err);
    return null;
  }
}

// ─── Chain TVL Rankings ─────────────────────────────────────

export async function fetchChainTvls(): Promise<ChainTvl[]> {
  try {
    const json = await llamaFetch(LLAMA_BASE, '/v2/chains');
    if (!Array.isArray(json)) return [];

    return json
      .filter((c: any) => c.tvl > 0)
      .map((c: any) => ({
        chain: c.name ?? '',
        tvl: c.tvl ?? 0,
        change1d: c.change_1d ?? 0,
        change7d: c.change_7d ?? 0,
      }))
      .sort((a: ChainTvl, b: ChainTvl) => b.tvl - a.tvl)
      .slice(0, 30);
  } catch (err) {
    console.error('[DeFiLlama] chains error:', err);
    return [];
  }
}

// ─── Protocol Rankings ──────────────────────────────────────

export async function fetchTopProtocols(limit = 20): Promise<DeFiProtocol[]> {
  try {
    const json = await llamaFetch(LLAMA_BASE, '/protocols');
    if (!Array.isArray(json)) return [];

    return json
      .filter((p: any) => p.tvl > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0))
      .slice(0, limit)
      .map((p: any) => ({
        name: p.name ?? '',
        tvl: p.tvl ?? 0,
        change1h: p.change_1h ?? 0,
        change1d: p.change_1d ?? 0,
        change7d: p.change_7d ?? 0,
        category: p.category ?? '',
        chains: Array.isArray(p.chains) ? p.chains : [],
      }));
  } catch (err) {
    console.error('[DeFiLlama] protocols error:', err);
    return [];
  }
}
