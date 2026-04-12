export interface ThermoData {
  fearGreed: number | null;
  btcDominance: number | null;
  kimchiPremium: number | null;
  usdKrw: number | null;
  btcTx: number | null;
  mempoolPending: number | null;
  fastestFee: number | null;
}

export const EMPTY_THERMO_DATA: ThermoData = {
  fearGreed: null,
  btcDominance: null,
  kimchiPremium: null,
  usdKrw: null,
  btcTx: null,
  mempoolPending: null,
  fastestFee: null
};

function normalizeThermoData(payload: Record<string, unknown> | null | undefined): ThermoData {
  return {
    fearGreed: (payload?.fearGreed as number | null) ?? null,
    btcDominance: (payload?.btcDominance as number | null) ?? null,
    kimchiPremium: (payload?.kimchiPremium as number | null) ?? null,
    usdKrw: (payload?.usdKrw as number | null) ?? null,
    btcTx: (payload?.btcTx as number | null) ?? null,
    mempoolPending: (payload?.mempoolPending as number | null) ?? null,
    fastestFee: (payload?.fastestFee as number | null) ?? null
  };
}

export async function fetchThermoData(fetcher: typeof fetch = fetch): Promise<ThermoData | null> {
  try {
    const response = await fetcher('/api/cogochi/thermometer', { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeThermoData(payload);
  } catch {
    return null;
  }
}

export function startThermoPolling(
  onData: (data: ThermoData) => void,
  fetcher: typeof fetch = fetch,
  intervalMs = 60_000
): () => void {
  const tick = async () => {
    const next = await fetchThermoData(fetcher);
    if (next) onData(next);
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(timer);
}
