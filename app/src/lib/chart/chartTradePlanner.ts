import { clampRoundPrice } from '$lib/chart/chartCoordinates';
import { clampRatio } from '$lib/chart/chartHelpers';
import { LINE_ENTRY_DEFAULT_RR } from '$lib/chart/chartIndicators';
import type {
  AgentTradeSetup,
  CommunitySignalDraft,
  LineEntryTradeDraft,
  PlannedTradeOrder,
  TradePlanDraft,
  TradePreviewData,
} from '$lib/chart/chartTypes';
import { normalizeTimeframe } from '$lib/utils/timeframe';

function sanitizeRewardRatio(rr: number | null | undefined): number {
  return Number.isFinite(rr) && rr! > 0 ? rr! : LINE_ENTRY_DEFAULT_RR;
}

function computeRiskPercent(entry: number, sl: number): number {
  const risk = Math.abs(entry - sl);
  return (risk / Math.max(Math.abs(entry), 1)) * 100;
}

function clampSignalConfidence(value: number, fallback = 68): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function buildLineEntryTradeDraft(options: {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  stopHint: number;
  rr?: number;
}): LineEntryTradeDraft | null {
  const pair = options.pair || 'BTC/USDT';
  const dir = options.dir;
  const entry = clampRoundPrice(options.entry);
  let sl = clampRoundPrice(options.stopHint);
  if (dir === 'LONG' && sl >= entry) sl = clampRoundPrice(entry * 0.995);
  if (dir === 'SHORT' && sl <= entry) sl = clampRoundPrice(entry * 1.005);

  const risk = Math.abs(entry - sl);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(risk) || risk <= 0) return null;

  const rr = sanitizeRewardRatio(options.rr);
  const tp = clampRoundPrice(dir === 'LONG' ? entry + risk * rr : entry - risk * rr);
  if (!Number.isFinite(tp) || tp <= 0) return null;

  return { pair, dir, entry, sl, tp, rr };
}

export function buildTradePlanDraftFromPreview(
  preview: Pick<TradePreviewData, 'dir' | 'entry' | 'sl' | 'tp' | 'rr' | 'riskPct'>,
  pair: string,
): TradePlanDraft {
  const entry = clampRoundPrice(preview.entry);
  const sl = clampRoundPrice(preview.sl);
  return {
    pair: pair || 'BTC/USDT',
    previewDir: preview.dir,
    entry,
    sl,
    tp: clampRoundPrice(preview.tp),
    rr: sanitizeRewardRatio(preview.rr),
    riskPct: Number.isFinite(preview.riskPct) && preview.riskPct > 0
      ? preview.riskPct
      : computeRiskPercent(entry, sl),
    longRatio: preview.dir === 'LONG' ? 70 : 30,
  };
}

export function withTradePlanRatio(plan: TradePlanDraft, nextLongRatio: number): TradePlanDraft {
  const longRatio = clampRatio(nextLongRatio);
  if (plan.longRatio === longRatio) return plan;
  return { ...plan, longRatio };
}

export function getPlannedTradeOrder(plan: TradePlanDraft): PlannedTradeOrder {
  const dir: 'LONG' | 'SHORT' = plan.longRatio >= 50 ? 'LONG' : 'SHORT';
  const rr = sanitizeRewardRatio(plan.rr);
  const risk = Math.max(Math.abs(plan.entry - plan.sl), Math.max(0.0001, Math.abs(plan.entry) * 0.001));
  const entry = clampRoundPrice(plan.entry);
  const sl = clampRoundPrice(dir === 'LONG' ? entry - risk : entry + risk);
  const tp = clampRoundPrice(dir === 'LONG' ? entry + risk * rr : entry - risk * rr);
  return {
    pair: plan.pair,
    dir,
    entry,
    sl,
    tp,
    rr,
    riskPct: computeRiskPercent(entry, sl),
    longRatio: clampRatio(plan.longRatio),
    shortRatio: 100 - clampRatio(plan.longRatio),
  };
}

export function buildCommunitySignalDraft(options: {
  pair: string;
  dir: 'LONG' | 'SHORT';
  livePrice: number;
  activeTradeSetup: AgentTradeSetup | null;
  timeframe: string;
  chatTradeReady: boolean;
  chatTradeDir: 'LONG' | 'SHORT';
}): CommunitySignalDraft | null {
  const pair = options.pair || 'BTC/USDT';
  const setup = options.activeTradeSetup
    && options.activeTradeSetup.dir === options.dir
    && options.activeTradeSetup.pair === pair
      ? options.activeTradeSetup
      : null;
  const liveEntry = Number.isFinite(options.livePrice) && options.livePrice > 0 ? options.livePrice : null;
  const entry = clampRoundPrice(setup?.entry ?? liveEntry ?? 0);
  if (!Number.isFinite(entry) || entry <= 0) return null;

  const rr = sanitizeRewardRatio(setup?.rr);
  let risk = setup ? Math.abs(setup.entry - setup.sl) : entry * 0.01;
  if (!Number.isFinite(risk) || risk <= 0) {
    risk = Math.max(entry * 0.008, Math.max(entry * 0.0005, 0.0001));
  }

  const sl = clampRoundPrice(options.dir === 'LONG' ? entry - risk : entry + risk);
  const tp = clampRoundPrice(options.dir === 'LONG' ? entry + risk * rr : entry - risk * rr);
  if (!Number.isFinite(sl) || !Number.isFinite(tp) || sl <= 0 || tp <= 0) return null;

  const source = setup ? 'CHART SETUP' : 'CHART VIEW';
  const reason = setup
    ? `Overlay based ${options.dir} setup (${setup.source === 'consensus' ? 'consensus' : setup.agentName || 'agent'})`
    : `Manual ${options.dir} perspective from chart (${normalizeTimeframe(options.timeframe).toUpperCase()})`;
  const conf = setup
    ? clampSignalConfidence(setup.conf)
    : clampSignalConfidence(options.chatTradeReady && options.chatTradeDir === options.dir ? 74 : 68);

  return { pair, dir: options.dir, entry, tp, sl, rr, conf, source, reason };
}
