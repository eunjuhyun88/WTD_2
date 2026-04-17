import type { OpportunityAlert } from '$lib/server/opportunity/scanner';
import { getHotCached } from '$lib/server/hotCache';

type AppFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TerminalAlertPreview {
  id?: string;
  symbol: string;
  timeframe?: string;
  blocks_triggered?: string[];
  p_win?: number | null;
  created_at?: string;
  preview?: {
    price?: number;
    rsi14?: number;
    funding_rate?: number;
    regime?: string;
    cvd_state?: string;
  };
}

export interface TerminalPatternCandidatesPayload {
  entry_candidates?: Record<string, string[]>;
  total_count?: number;
}

export interface TerminalScannerStatusPayload {
  running?: boolean;
  next_scan?: string | null;
  interval_seconds?: number;
  universe?: string;
}

export interface TerminalOpportunityPayload {
  data?: {
    alerts?: OpportunityAlert[];
    macroBackdrop?: {
      fedFundsRate?: number | null;
      yieldCurveSpread?: number | null;
      m2ChangePct?: number | null;
      overallMacroScore?: number;
      regime?: 'risk-on' | 'risk-off' | 'neutral';
    };
    scannedAt?: number;
  };
}

export interface TerminalPresetItem {
  id: string;
  label: string;
  count: number;
  tone: 'normal' | 'warn' | 'danger';
  sampleSymbols: string[];
  freshness: string;
}

export interface TerminalAnomalyItem {
  id: string;
  symbol: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  supportingMetrics: Record<string, number | string | null | undefined>;
  source: 'scanner_alert' | 'opportunity_scan';
  timestamp: number;
}

export interface TerminalParitySnapshot {
  scannerStatus: TerminalScannerStatusPayload | null;
  alerts: TerminalAlertPreview[];
  patternCandidates: Record<string, string[]>;
  opportunityAlerts: OpportunityAlert[];
  macroBackdrop: NonNullable<TerminalOpportunityPayload['data']>['macroBackdrop'] | null;
  scannedAt: number;
  btcDominance: number | null;
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchInternalJson<T>(fetcher: AppFetch, path: string): Promise<T | null> {
  try {
    const response = await fetcher(path);
    if (!response.ok) return null;
    return await readJsonSafe<T>(response);
  } catch {
    return null;
  }
}

function uniqSymbols(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim().toUpperCase()).filter(Boolean))];
}

function hasBlock(alert: TerminalAlertPreview, pattern: RegExp): boolean {
  return (alert.blocks_triggered ?? []).some((block) => pattern.test(block));
}

function isBearishAlert(alert: TerminalAlertPreview): boolean {
  const regime = String(alert.preview?.regime ?? '').toLowerCase();
  const cvd = String(alert.preview?.cvd_state ?? '').toLowerCase();
  return (alert.p_win ?? 0.5) < 0.5 || regime.includes('risk_off') || cvd.includes('sell');
}

export function deriveTerminalPresets(args: {
  alerts: TerminalAlertPreview[];
  opportunityAlerts: OpportunityAlert[];
  patternCandidates: Record<string, string[]>;
}): TerminalPresetItem[] {
  const { alerts, opportunityAlerts, patternCandidates } = args;
  const patternSymbols = uniqSymbols(Object.values(patternCandidates).flat());
  const bullishSymbols = uniqSymbols(alerts.filter((alert) => (alert.p_win ?? 0) >= 0.55).map((alert) => alert.symbol));
  const highOiSymbols = uniqSymbols(
    alerts
      .filter((alert) => hasBlock(alert, /\boi\b|open_interest|squeeze/i) || Math.abs(alert.preview?.funding_rate ?? 0) >= 0.01)
      .map((alert) => alert.symbol),
  );
  const dangerSymbols = uniqSymbols([
    ...alerts.filter(isBearishAlert).map((alert) => alert.symbol),
    ...opportunityAlerts
      .filter((alert) => alert.severity !== 'info')
      .map((alert) => alert.symbol),
  ]);
  const breakoutSymbols = uniqSymbols([
    ...Object.entries(patternCandidates)
      .filter(([slug]) => /break|accum|entry|phase/i.test(slug))
      .flatMap(([, symbols]) => symbols),
    ...alerts.filter((alert) => hasBlock(alert, /break|vwap|trend|momentum/i)).map((alert) => alert.symbol),
  ]);
  const liquidationSymbols = uniqSymbols([
    ...alerts.filter((alert) => hasBlock(alert, /liq|funding|cascade|cvd/i)).map((alert) => alert.symbol),
    ...opportunityAlerts
      .filter((alert) => /squeeze|spike|volume|whale/i.test(alert.type))
      .map((alert) => alert.symbol),
  ]);

  return [
    {
      id: 'buy-candidates',
      label: 'Buy Candidates',
      count: uniqSymbols([...patternSymbols, ...bullishSymbols]).length,
      tone: 'normal',
      sampleSymbols: uniqSymbols([...patternSymbols, ...bullishSymbols]).slice(0, 4),
      freshness: 'live',
    },
    {
      id: 'high-oi',
      label: 'High OI',
      count: highOiSymbols.length,
      tone: 'warn',
      sampleSymbols: highOiSymbols.slice(0, 4),
      freshness: 'live',
    },
    {
      id: 'whats-wrong',
      label: "What's Wrong",
      count: dangerSymbols.length,
      tone: 'danger',
      sampleSymbols: dangerSymbols.slice(0, 4),
      freshness: 'live',
    },
    {
      id: 'breakout',
      label: 'Breakout',
      count: breakoutSymbols.length,
      tone: 'normal',
      sampleSymbols: breakoutSymbols.slice(0, 4),
      freshness: 'live',
    },
    {
      id: 'liquidation',
      label: 'Liquidation',
      count: liquidationSymbols.length,
      tone: 'warn',
      sampleSymbols: liquidationSymbols.slice(0, 4),
      freshness: 'live',
    },
  ];
}

export function deriveTerminalAnomalies(args: {
  alerts: TerminalAlertPreview[];
  opportunityAlerts: OpportunityAlert[];
}): TerminalAnomalyItem[] {
  const fromDb = args.alerts.map((alert): TerminalAnomalyItem => {
    const fundingRate = alert.preview?.funding_rate ?? null;
    const inferredType = hasBlock(alert, /\boi\b|squeeze/i)
      ? 'high_oi'
      : hasBlock(alert, /liq|cascade/i)
        ? 'liquidation'
        : hasBlock(alert, /cvd|flow/i)
          ? 'flow'
          : hasBlock(alert, /break|trend/i)
            ? 'breakout'
            : 'scanner';
    const severity: TerminalAnomalyItem['severity'] =
      (alert.p_win ?? 0) >= 0.62
        ? 'info'
        : isBearishAlert(alert)
          ? 'warning'
          : Math.abs(fundingRate ?? 0) >= 0.02
            ? 'critical'
            : 'info';
    const blocks = (alert.blocks_triggered ?? []).slice(0, 3).join(', ');
    return {
      id: `scanner:${alert.id ?? `${alert.symbol}:${alert.created_at ?? 'unknown'}`}`,
      symbol: alert.symbol,
      type: inferredType,
      severity,
      summary: blocks ? `${alert.symbol} ${blocks}` : `${alert.symbol} scanner alert`,
      supportingMetrics: {
        timeframe: alert.timeframe,
        pWin: alert.p_win,
        rsi14: alert.preview?.rsi14,
        fundingRate,
        regime: alert.preview?.regime,
        cvdState: alert.preview?.cvd_state,
      },
      source: 'scanner_alert',
      timestamp: alert.created_at ? Date.parse(alert.created_at) || Date.now() : Date.now(),
    };
  });

  const fromOpportunity = args.opportunityAlerts.map((alert): TerminalAnomalyItem => ({
    id: `opportunity:${alert.symbol}:${alert.type}:${alert.timestamp}`,
    symbol: alert.symbol,
    type: alert.type,
    severity: alert.severity,
    summary: alert.message,
    supportingMetrics: {
      score: alert.score,
    },
    source: 'opportunity_scan',
    timestamp: alert.timestamp,
  }));

  const severityRank = { critical: 0, warning: 1, info: 2 } satisfies Record<TerminalAnomalyItem['severity'], number>;

  return [...fromDb, ...fromOpportunity]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.timestamp - a.timestamp)
    .slice(0, 24);
}

export async function fetchTerminalParitySnapshot(args: {
  fetcher: AppFetch;
  fetchBtcDominance?: () => Promise<number | null>;
  alertsLimit?: number;
  opportunityLimit?: number;
}): Promise<TerminalParitySnapshot> {
  const { fetcher, fetchBtcDominance, alertsLimit = 48, opportunityLimit = 15 } = args;
  const [scannerStatus, alertsPayload, patternCandidates, opportunityPayload, btcDominance] = await Promise.all([
    fetchInternalJson<TerminalScannerStatusPayload>(fetcher, '/api/engine/scanner/status'),
    fetchInternalJson<{ alerts?: TerminalAlertPreview[] }>(fetcher, `/api/cogochi/alerts?limit=${alertsLimit}`),
    fetchInternalJson<TerminalPatternCandidatesPayload>(fetcher, '/api/engine/patterns/candidates'),
    fetchInternalJson<TerminalOpportunityPayload>(fetcher, `/api/terminal/opportunity-scan?limit=${opportunityLimit}`),
    fetchBtcDominance ? fetchBtcDominance() : Promise.resolve(null),
  ]);

  return {
    scannerStatus,
    alerts: alertsPayload?.alerts ?? [],
    patternCandidates: patternCandidates?.entry_candidates ?? {},
    opportunityAlerts: opportunityPayload?.data?.alerts ?? [],
    macroBackdrop: opportunityPayload?.data?.macroBackdrop ?? null,
    scannedAt: opportunityPayload?.data?.scannedAt ?? Date.now(),
    btcDominance,
  };
}

export async function getCachedTerminalParitySnapshot(args: {
  fetcher: AppFetch;
  fetchBtcDominance?: () => Promise<number | null>;
  alertsLimit?: number;
  opportunityLimit?: number;
  ttlMs?: number;
}): Promise<TerminalParitySnapshot> {
  const { fetcher, fetchBtcDominance, alertsLimit = 48, opportunityLimit = 15, ttlMs = 15_000 } = args;
  const key = `terminal-parity:${alertsLimit}:${opportunityLimit}:${fetchBtcDominance ? 'btc' : 'nobtc'}`;
  return getHotCached(key, ttlMs, () =>
    fetchTerminalParitySnapshot({
      fetcher,
      fetchBtcDominance,
      alertsLimit,
      opportunityLimit,
    }),
  );
}
