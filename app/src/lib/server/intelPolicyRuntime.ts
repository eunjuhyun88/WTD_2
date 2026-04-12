import { computeDecision, type EngineEvidence } from '$lib/intel/decisionEngine';
import { evaluateQualityGateFromFeatures } from '$lib/intel/qualityGate';
import { getIntelThresholds } from '$lib/intel/thresholds';
import type { DecisionBias, IntelDecisionOutput, ManipulationRiskLevel, QualityGateResult, QualityGateScores } from '$lib/intel/types';

export type IntelPanelKey = 'headlines' | 'events' | 'flow' | 'trending' | 'picks';

type NewsItem = {
  id?: string;
  source?: string;
  title?: string;
  summary?: string;
  sentiment?: string;
  network?: string;
  interactions?: number;
  importance?: number;
  publishedAt?: number;
};

type EventItem = {
  id?: string;
  tag?: string;
  level?: string;
  text?: string;
  source?: string;
  createdAt?: number;
};

type FlowSnapshot = {
  funding?: number | null;
  lsRatio?: number | null;
  liqLong24h?: number | null;
  liqShort24h?: number | null;
  quoteVolume24h?: number | null;
  priceChangePct?: number | null;
  cmcChange24hPct?: number | null;
  cmcMarketCap?: number | null;
};

type FlowRecord = {
  id?: string;
  agent?: string;
  vote?: string;
  confidence?: number;
  text?: string;
  source?: string;
  createdAt?: number;
};

type TrendingCoin = {
  symbol?: string;
  name?: string;
  rank?: number;
  change24h?: number;
  socialVolume?: number | null;
  sentiment?: number | null;
  galaxyScore?: number | null;
};

type PickCoin = {
  symbol?: string;
  name?: string;
  direction?: string;
  confidence?: number;
  totalScore?: number;
  reasons?: string[];
  alerts?: string[];
  change24h?: number;
};

export interface IntelPolicyCard {
  id: string;
  panel: IntelPanelKey;
  title: string;
  source: string;
  createdAt: number;
  bias: DecisionBias;
  confidence: number;
  what: string;
  soWhat: string;
  nowWhat: string;
  why: string;
  helpfulnessWhy: string;
  visualAid: string | null;
  gate: QualityGateResult;
}

export interface IntelPolicyInput {
  pair: string;
  timeframe: string;
  newsRecords: NewsItem[];
  eventRecords: EventItem[];
  flowSnapshot: FlowSnapshot | null;
  flowRecords: FlowRecord[];
  trendingCoins: TrendingCoin[];
  pickCoins: PickCoin[];
}

export interface IntelPolicyOutput {
  generatedAt: number;
  decision: IntelDecisionOutput;
  panels: Record<IntelPanelKey, IntelPolicyCard[]>;
  summary: {
    pair: string;
    timeframe: string;
    domainsUsed: string[];
    avgHelpfulness: number;
  };
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toUpperSafe(value: string): string {
  return value.trim().toUpperCase();
}

function delayMinutes(ts: number): number {
  const raw = Math.floor((Date.now() - ts) / 60_000);
  if (!Number.isFinite(raw)) return 120;
  return Math.max(0, raw);
}

function logScore(value: number, scale = 12, cap = 100): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp(Math.log10(value + 1) * scale, 0, cap);
}

function freshnessScore(minutes: number, fullAtMin = 0, zeroAtMin = 240): number {
  if (!Number.isFinite(minutes)) return 0;
  if (minutes <= fullAtMin) return 100;
  if (minutes >= zeroAtMin) return 0;
  return clamp(((zeroAtMin - minutes) / Math.max(1, zeroAtMin - fullAtMin)) * 100, 0, 100);
}

function strengthFromDeviation(value: number, neutral = 0, unit = 1): number {
  if (!Number.isFinite(value) || !Number.isFinite(unit) || unit <= 0) return 0;
  return clamp((Math.abs(value - neutral) / unit) * 100, 0, 100);
}

function calibrateConfidence(parts: Array<{ score: number; weight: number }>, offset = 0): number {
  const totalWeight = parts.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return clamp(offset);
  const weighted = parts.reduce((sum, item) => sum + clamp(item.score) * Math.max(0, item.weight), 0) / totalWeight;
  return clamp(weighted + offset);
}

function sourceReliabilityScore(source: string): number {
  const normalized = source.toLowerCase();
  if (normalized.includes('coinalyze')) return 94;
  if (normalized.includes('binance')) return 93;
  if (normalized.includes('coinmarketcap')) return 92;
  if (normalized.includes('rss') || normalized.includes('coindesk') || normalized.includes('cointelegraph')) return 90;
  if (normalized.includes('opportunity_scan')) return 88;
  if (normalized.includes('dexscreener')) return 84;
  if (normalized.includes('lunarcrush')) return 74;
  if (normalized.includes('social')) return 68;
  return 78;
}

function manipulationRiskFor(source: string): ManipulationRiskLevel {
  const normalized = source.toLowerCase();
  if (normalized.includes('social') || normalized.includes('boost') || normalized.includes('ads')) return 'high';
  if (normalized.includes('dexscreener')) return 'medium';
  return 'low';
}

function relevanceScore(text: string, pairToken: string): number {
  const lower = text.toLowerCase();
  const token = pairToken.toLowerCase();
  const aliases: Record<string, string[]> = {
    btc: ['btc', 'bitcoin'],
    eth: ['eth', 'ethereum'],
    sol: ['sol', 'solana'],
    doge: ['doge', 'dogecoin'],
    xrp: ['xrp', 'ripple'],
  };
  const hits = new Set<string>();
  for (const alias of aliases[token] ?? [token]) {
    if (lower.includes(alias)) hits.add(alias);
  }
  const generic = /crypto|market|exchange|macro|futures|perp|liquidation|funding/.test(lower);
  if (hits.size >= 2) return 100;
  if (hits.size === 1) return 95;
  if (generic) return 80;
  return 66;
}

function biasToActionText(bias: DecisionBias): string {
  if (bias === 'long') return '롱 진입/홀드 우선';
  if (bias === 'short') return '숏 진입/홀드 우선';
  return '신규 포지션 보류';
}

function visualAidForBias(bias: DecisionBias): string {
  if (bias === 'long') return 'UP_ARROW';
  if (bias === 'short') return 'DOWN_ARROW';
  return 'NEUTRAL_DOT';
}

function textBias(text: string): DecisionBias {
  const lower = text.toLowerCase();
  let biasScore = 0;
  if (/long|bull|breakout|uptrend|상승|매수|롱/.test(lower)) biasScore += 2;
  if (/short|bear|breakdown|downtrend|하락|매도|숏/.test(lower)) biasScore -= 2;
  if (/risk-on|유입|squeeze|support|accumulation|매집/.test(lower)) biasScore += 1;
  if (/risk-off|청산|매도압력|resistance|distribution|과열/.test(lower)) biasScore -= 1;
  if (biasScore >= 2) return 'long';
  if (biasScore <= -2) return 'short';
  return 'wait';
}

function normalizeBias(raw: string | undefined): DecisionBias {
  const normalized = (raw ?? '').toLowerCase();
  if (normalized === 'long' || normalized === 'bullish') return 'long';
  if (normalized === 'short' || normalized === 'bearish') return 'short';
  return 'wait';
}

function gateCard(
  panel: IntelPanelKey,
  sourceId: string,
  sourceLabel: string,
  payload: {
    title: string;
    createdAt: number;
    bias: DecisionBias;
    confidence: number;
    what: string;
    soWhat: string;
    nowWhat: string;
    why: string;
    helpfulnessWhy: string;
    visualAid: string | null;
  },
  scoreInput: {
    actionTypeCount: number;
    clarityScore: number;
    sourceReliability: number;
    failureRatePct: number;
    manipulationRisk: ManipulationRiskLevel;
    pairKeywordMatchPct: number;
    timeframeAligned: boolean;
    backtestWinRateLiftPct: number;
    feedbackPositivePct: number;
    applyRatePct: number;
    pnlLiftPct?: number;
  },
): IntelPolicyCard {
  const gate = evaluateQualityGateFromFeatures(
    {
      actionability: {
        actionTypeCount: scoreInput.actionTypeCount,
        clarityScore: scoreInput.clarityScore,
      },
      timeliness: {
        delayMinutes: delayMinutes(payload.createdAt),
        horizonMinutes: 120,
      },
      reliability: {
        sourceReliability: scoreInput.sourceReliability,
        failureRatePct: scoreInput.failureRatePct,
        manipulationRisk: scoreInput.manipulationRisk,
      },
      relevance: {
        pairKeywordMatchPct: scoreInput.pairKeywordMatchPct,
        timeframeAligned: scoreInput.timeframeAligned,
      },
      helpfulness: {
        backtestWinRateLiftPct: scoreInput.backtestWinRateLiftPct,
        feedbackPositivePct: scoreInput.feedbackPositivePct,
        applyRatePct: scoreInput.applyRatePct,
        pnlLiftPct: scoreInput.pnlLiftPct ?? 0,
      },
    },
    sourceId,
  );

  return {
    id: sourceId,
    panel,
    title: payload.title,
    source: sourceLabel,
    createdAt: payload.createdAt,
    bias: payload.bias,
    confidence: clamp(payload.confidence),
    what: payload.what,
    soWhat: payload.soWhat,
    nowWhat: payload.nowWhat,
    why: payload.why,
    helpfulnessWhy: payload.helpfulnessWhy,
    visualAid: payload.visualAid,
    gate,
  };
}

function cardRank(card: IntelPolicyCard): number {
  const visibilityBonus = card.gate.visibility === 'full' ? 10 : card.gate.visibility === 'low_impact' ? 2 : -100;
  return card.gate.weightedScore + visibilityBonus + card.confidence * 0.1;
}

function pickTopCards(cards: IntelPolicyCard[], maxCount: number): IntelPolicyCard[] {
  return cards
    .filter((card) => card.gate.visibility !== 'hidden')
    .sort((a, b) => cardRank(b) - cardRank(a))
    .slice(0, maxCount);
}

function buildHeadlineCards(input: IntelPolicyInput, maxCount: number): IntelPolicyCard[] {
  const token = toUpperSafe(input.pair.split('/')[0] ?? 'BTC');
  const out: IntelPolicyCard[] = [];

  for (const raw of input.newsRecords.slice(0, 40)) {
    const title = (raw.title ?? raw.summary ?? '').trim();
    if (!title) continue;

    const sentimentBias = normalizeBias(raw.sentiment);
    const bias = sentimentBias === 'wait' ? textBias(`${title} ${raw.summary ?? ''}`) : sentimentBias;
    const interactions = Math.max(0, toNum(raw.interactions, 0));
    const importance = clamp(toNum(raw.importance, 50));
    const createdAt = toNum(raw.publishedAt, Date.now());
    const sourceLabel = raw.source ?? raw.network ?? 'MARKET_NEWS';
    const source = `${sourceLabel}${raw.network ? `:${raw.network}` : ''}`;
    const ageMin = delayMinutes(createdAt);
    const freshness = freshnessScore(ageMin, 5, 240);
    const sourceReliability = sourceReliabilityScore(source);
    const pairRelevance = relevanceScore(`${title} ${raw.summary ?? ''}`, token);
    const interactionScore = logScore(interactions, 26);
    const impactStrength = strengthFromDeviation(importance, 50, 18);
    const hasStructuredSignal = /\d+%|\$\d+|etf|fomc|cpi|funding|liquidation|listing|delist|hack/i.test(title);
    const clarityScore = clamp((title.length >= 28 ? 34 : 30) + (hasStructuredSignal ? 4 : 0), 26, 40);

    const confidence = calibrateConfidence(
      [
        { score: importance, weight: 0.30 },
        { score: interactionScore, weight: 0.18 },
        { score: impactStrength, weight: 0.16 },
        { score: freshness, weight: 0.20 },
        { score: sourceReliability, weight: 0.08 },
        { score: pairRelevance, weight: 0.08 },
      ],
      bias === 'wait' ? -10 : -2,
    );
    const backtestWinRateLiftPct = clamp(
      3 + impactStrength / 20 + interactionScore / 22 + pairRelevance / 80 + freshness / 120,
      3,
      9.6,
    );
    const feedbackPositivePct = clamp(
      58 + interactionScore * 0.22 + importance * 0.1 + (bias === 'wait' ? -4 : 4),
      52,
      92,
    );
    const applyRatePct = clamp(confidence * 0.82 + freshness * 0.18, 45, 95);
    const pnlLiftPct = clamp(
      1.6 + impactStrength / 24 + (bias === 'wait' ? 0.5 : 1.2) + pairRelevance / 90,
      1.2,
      8.4,
    );

    const score = gateCard(
      'headlines',
      `headline:${raw.id ?? title.slice(0, 24)}`,
      source,
      {
        title: `HEADLINE · ${title.slice(0, 72)}`,
        createdAt,
        bias,
        confidence,
        what: title,
        soWhat:
          bias === 'long'
            ? '상승 촉매 가능성이 커서 단기 상방 변동성이 열릴 수 있습니다.'
            : bias === 'short'
              ? '하방 리스크 촉매로 작동할 수 있어 변동성 확대 구간입니다.'
              : '명확한 방향 촉매가 부족해 단독 신호로는 약합니다.',
        nowWhat: biasToActionText(bias),
        why: `${sourceLabel} 기반 중요도 ${Math.round(importance)} · 상호작용 ${Math.round(interactions).toLocaleString()}`,
        helpfulnessWhy: `신선도 ${Math.round(freshness)} · 영향도 ${Math.round(impactStrength)} · 상호작용 ${Math.round(interactionScore)}`,
        visualAid: visualAidForBias(bias),
      },
      {
        actionTypeCount: bias === 'wait' ? 1 : 3,
        clarityScore,
        sourceReliability,
        failureRatePct: raw.network === 'rss' ? 4 : 7,
        manipulationRisk: manipulationRiskFor(source),
        pairKeywordMatchPct: pairRelevance,
        timeframeAligned: ageMin <= 120,
        backtestWinRateLiftPct,
        feedbackPositivePct,
        applyRatePct,
        pnlLiftPct,
      },
    );

    out.push(score);
  }

  return pickTopCards(out, maxCount);
}

function parseDerivFunding(text: string): number | null {
  const m = text.match(/Funding\s+([+-]?\d+(?:\.\d+)?)%/i);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value / 100 : null;
}

function parseLsRatio(text: string): number | null {
  const m = text.match(/L\/S\s+([+-]?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

function buildEventCards(input: IntelPolicyInput, maxCount: number): IntelPolicyCard[] {
  const token = toUpperSafe(input.pair.split('/')[0] ?? 'BTC');
  const out: IntelPolicyCard[] = [];

  for (const raw of input.eventRecords.slice(0, 40)) {
    const text = (raw.text ?? '').trim();
    if (!text) continue;

    const tag = (raw.tag ?? 'EVENT').toUpperCase();
    const level = (raw.level ?? 'info').toLowerCase();
    const createdAt = toNum(raw.createdAt, Date.now());
    const source = raw.source ?? 'MARKET_EVENTS';
    const ageMin = delayMinutes(createdAt);
    const freshness = freshnessScore(ageMin, 10, 720);
    const sourceReliability = sourceReliabilityScore(source);
    const pairRelevance = relevanceScore(`${tag} ${text}`, token);

    let bias: DecisionBias = 'wait';
    let derivativeStrength = 0;
    if (tag === 'DERIV') {
      const funding = parseDerivFunding(text);
      const lsRatio = parseLsRatio(text);
      if (funding != null && funding < -0.0006) bias = 'long';
      else if (funding != null && funding > 0.0006) bias = 'short';
      else if (lsRatio != null && lsRatio < 0.9) bias = 'long';
      else if (lsRatio != null && lsRatio > 1.1) bias = 'short';
      else bias = 'wait';

      derivativeStrength = Math.max(
        funding == null ? 0 : strengthFromDeviation(funding, 0, 0.0005),
        lsRatio == null ? 0 : strengthFromDeviation(lsRatio, 1, 0.12),
      );
    } else if (tag === 'TAKEOVER' || tag === 'BOOST') {
      bias = 'long';
    } else if (tag === 'ADS') {
      bias = 'wait';
    } else {
      bias = textBias(text);
    }

    const tagBaseScore =
      tag === 'DERIV'
        ? 94
        : tag === 'TAKEOVER'
          ? 72
          : tag === 'BOOST'
            ? 66
            : tag === 'ADS'
              ? 54
              : 64;
    const levelScore = level === 'critical' ? 95 : level === 'warning' ? 84 : level === 'info' ? 70 : 64;
    const textSignal = textBias(text) === 'wait' ? 52 : 74;
    const signalStrength = tag === 'DERIV' ? Math.max(58, derivativeStrength) : calibrateConfidence(
      [
        { score: tagBaseScore, weight: 0.55 },
        { score: textSignal, weight: 0.45 },
      ],
    );
    const hasTimingHint = /\b(t-|t\+|분|minute|hour|h)\b/i.test(text);
    const clarityScore = clamp((text.length >= 24 ? 32 : 28) + (hasTimingHint ? 4 : 0), 24, 40);
    const confidence = calibrateConfidence(
      [
        { score: tagBaseScore, weight: 0.30 },
        { score: levelScore, weight: 0.15 },
        { score: signalStrength, weight: 0.24 },
        { score: freshness, weight: 0.20 },
        { score: sourceReliability, weight: 0.05 },
        { score: pairRelevance, weight: 0.06 },
      ],
      (bias === 'wait' ? -10 : -2) + (tag === 'ADS' ? -8 : 0),
    );
    const backtestWinRateLiftPct = clamp(
      3 + signalStrength / 25 + (tag === 'DERIV' ? 1.8 : 0.8) + freshness / 140,
      3,
      9,
    );
    const feedbackPositivePct = clamp(
      57 + tagBaseScore * 0.22 + (level === 'warning' ? 5 : 0) + (bias === 'wait' ? -4 : 3) - (tag === 'ADS' ? 6 : 0),
      50,
      90,
    );
    const applyRatePct = clamp(confidence * 0.85 + freshness * 0.15, 42, 95);
    const pnlLiftPct = clamp(
      1.8 + signalStrength / 30 + (tag === 'DERIV' ? 1.9 : 0.9),
      1.5,
      7.4,
    );

    out.push(
      gateCard(
        'events',
        `event:${raw.id ?? text.slice(0, 24)}`,
        source,
        {
          title: `${tag} · ${text.slice(0, 72)}`,
          createdAt,
          bias,
          confidence,
          what: text,
          soWhat:
            tag === 'DERIV'
              ? '파생지표 이벤트라 30~120분 구간 방향성 압력에 직접 연결됩니다.'
              : '단기 유동성/관심도에 영향을 주는 이벤트로 변동성 트리거가 됩니다.',
          nowWhat: biasToActionText(bias),
          why: `${source} · ${tag} · ${level}`,
          helpfulnessWhy: `태그강도 ${Math.round(tagBaseScore)} · 신호강도 ${Math.round(signalStrength)} · 신선도 ${Math.round(freshness)}`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 3,
          clarityScore,
          sourceReliability,
          failureRatePct: 6,
          manipulationRisk: manipulationRiskFor(`${source}:${tag}`),
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: ageMin <= 120,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  return pickTopCards(out, maxCount);
}

function buildFlowCards(input: IntelPolicyInput, maxCount: number): IntelPolicyCard[] {
  const token = toUpperSafe(input.pair.split('/')[0] ?? 'BTC');
  const source = 'FLOW_COMPOSITE';
  const out: IntelPolicyCard[] = [];
  const snap = input.flowSnapshot ?? {};
  const createdAt = Date.now();

  const funding = snap.funding ?? null;
  if (funding != null) {
    const bias: DecisionBias = funding < -0.0006 ? 'long' : funding > 0.0006 ? 'short' : 'wait';
    const fundingStrength = strengthFromDeviation(funding, 0, 0.00045);
    const pairRelevance = relevanceScore(`${token} funding`, token);
    const confidence = calibrateConfidence(
      [
        { score: fundingStrength, weight: 0.58 },
        { score: 96, weight: 0.18 },
        { score: 100, weight: 0.14 },
        { score: bias === 'wait' ? 52 : 75, weight: 0.10 },
      ],
      bias === 'wait' ? -14 : -2,
    );
    const backtestWinRateLiftPct = clamp(4 + fundingStrength / 20, 4, 9.4);
    const feedbackPositivePct = clamp(60 + fundingStrength * 0.22 + (bias === 'wait' ? -6 : 4), 54, 91);
    const applyRatePct = clamp(confidence * 0.86 + fundingStrength * 0.14, 46, 96);
    const pnlLiftPct = clamp(2.2 + fundingStrength / 26, 2, 7.2);

    out.push(
      gateCard(
        'flow',
        'flow:funding',
        'COINALYZE',
        {
          title: 'FUNDING SIGNAL',
          createdAt,
          bias,
          confidence,
          what: `Funding ${(funding * 100).toFixed(4)}%`,
          soWhat:
            bias === 'short'
              ? '롱 과밀 가능성으로 되돌림 하방 압력이 생길 수 있습니다.'
              : bias === 'long'
                ? '숏 과밀 해소 구간으로 숏커버 상방 압력이 생길 수 있습니다.'
                : '펀딩 단독으로는 방향성이 중립입니다.',
          nowWhat: biasToActionText(bias),
          why: '펀딩 극단값 임계(±0.06%) 기반',
          helpfulnessWhy: `펀딩강도 ${Math.round(fundingStrength)} · 값 ${(funding * 100).toFixed(4)}%`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 3,
          clarityScore: 36,
          sourceReliability: 92,
          failureRatePct: 4,
          manipulationRisk: 'low',
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  const lsRatio = snap.lsRatio ?? null;
  if (lsRatio != null) {
    const bias: DecisionBias = lsRatio < 0.9 ? 'long' : lsRatio > 1.1 ? 'short' : 'wait';
    const lsStrength = strengthFromDeviation(lsRatio, 1, 0.12);
    const pairRelevance = relevanceScore(`${token} long short ratio`, token);
    const confidence = calibrateConfidence(
      [
        { score: lsStrength, weight: 0.56 },
        { score: 95, weight: 0.18 },
        { score: 100, weight: 0.16 },
        { score: bias === 'wait' ? 50 : 74, weight: 0.10 },
      ],
      bias === 'wait' ? -12 : 0,
    );
    const backtestWinRateLiftPct = clamp(3.8 + lsStrength / 22, 3.8, 8.8);
    const feedbackPositivePct = clamp(59 + lsStrength * 0.2 + (bias === 'wait' ? -5 : 3), 53, 89);
    const applyRatePct = clamp(confidence * 0.84 + lsStrength * 0.16, 45, 95);
    const pnlLiftPct = clamp(2 + lsStrength / 28, 1.8, 6.8);

    out.push(
      gateCard(
        'flow',
        'flow:ls_ratio',
        'COINALYZE',
        {
          title: 'LONG/SHORT RATIO',
          createdAt,
          bias,
          confidence,
          what: `L/S ratio ${lsRatio.toFixed(2)}`,
          soWhat: bias === 'wait' ? '롱/숏 포지션 비대칭이 약해 중립입니다.' : '포지션 비대칭으로 역방향 압력이 확대될 수 있습니다.',
          nowWhat: biasToActionText(bias),
          why: 'L/S 임계(0.9 / 1.1) 기반 쏠림 판단',
          helpfulnessWhy: `L/S 강도 ${Math.round(lsStrength)} · 편차 ${(Math.abs(lsRatio - 1) * 100).toFixed(1)}%`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 3,
          clarityScore: 34,
          sourceReliability: 90,
          failureRatePct: 4,
          manipulationRisk: 'low',
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  const liqLong = toNum(snap.liqLong24h, 0);
  const liqShort = toNum(snap.liqShort24h, 0);
  if (liqLong + liqShort > 0) {
    const bias: DecisionBias = liqLong > liqShort ? 'short' : liqShort > liqLong ? 'long' : 'wait';
    const imbalance = Math.abs(liqLong - liqShort) / Math.max(liqLong + liqShort, 1);
    const totalLiq = liqLong + liqShort;
    const imbalanceStrength = clamp(imbalance * 100);
    const sizeScore = logScore(totalLiq, 24);
    const pairRelevance = relevanceScore(`${token} liquidation`, token);
    const confidence = calibrateConfidence(
      [
        { score: imbalanceStrength, weight: 0.46 },
        { score: sizeScore, weight: 0.28 },
        { score: 94, weight: 0.16 },
        { score: bias === 'wait' ? 52 : 74, weight: 0.10 },
      ],
      bias === 'wait' ? -10 : 0,
    );
    const backtestWinRateLiftPct = clamp(3.6 + imbalanceStrength / 22 + sizeScore / 80, 3.6, 9.1);
    const feedbackPositivePct = clamp(58 + imbalanceStrength * 0.18 + sizeScore * 0.08 + (bias === 'wait' ? -4 : 4), 52, 90);
    const applyRatePct = clamp(confidence * 0.82 + imbalanceStrength * 0.18, 44, 95);
    const pnlLiftPct = clamp(2 + imbalanceStrength / 24 + sizeScore / 140, 1.8, 7.4);

    out.push(
      gateCard(
        'flow',
        'flow:liquidations',
        'COINALYZE',
        {
          title: 'LIQUIDATION IMBALANCE',
          createdAt,
          bias,
          confidence,
          what: `Liq Long $${Math.round(liqLong).toLocaleString()} / Short $${Math.round(liqShort).toLocaleString()}`,
          soWhat: '청산 쏠림이 단기 가격 압력을 만들어 추세 가속/반전 트리거가 됩니다.',
          nowWhat: biasToActionText(bias),
          why: `청산 불균형 ${(imbalance * 100).toFixed(1)}%`,
          helpfulnessWhy: `편중강도 ${Math.round(imbalanceStrength)} · 규모점수 ${Math.round(sizeScore)}`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 3,
          clarityScore: 36,
          sourceReliability: 90,
          failureRatePct: 4,
          manipulationRisk: 'low',
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  const cmcChange = snap.cmcChange24hPct ?? null;
  if (cmcChange != null) {
    const bias: DecisionBias = cmcChange > 0.6 ? 'long' : cmcChange < -0.6 ? 'short' : 'wait';
    const regimeStrength = strengthFromDeviation(cmcChange, 0, 0.75);
    const pairRelevance = relevanceScore(`${token} market cap regime`, token);
    const confidence = calibrateConfidence(
      [
        { score: regimeStrength, weight: 0.52 },
        { score: 92, weight: 0.20 },
        { score: 100, weight: 0.18 },
        { score: bias === 'wait' ? 52 : 72, weight: 0.10 },
      ],
      bias === 'wait' ? -12 : -5,
    );
    const backtestWinRateLiftPct = clamp(3.2 + regimeStrength / 24, 3.2, 7.9);
    const feedbackPositivePct = clamp(56 + regimeStrength * 0.18 + (bias === 'wait' ? -5 : 2), 50, 86);
    const applyRatePct = clamp(confidence * 0.86 + regimeStrength * 0.14, 42, 94);
    const pnlLiftPct = clamp(1.6 + regimeStrength / 30, 1.4, 5.8);

    out.push(
      gateCard(
        'flow',
        'flow:cmc_regime',
        'COINMARKETCAP',
        {
          title: 'MARKET CAP REGIME',
          createdAt,
          bias,
          confidence,
          what: `Global mcap 24h ${cmcChange >= 0 ? '+' : ''}${cmcChange.toFixed(2)}%`,
          soWhat: '전체 시총 레짐은 개별 종목 변동성의 방향 확률을 보정합니다.',
          nowWhat: biasToActionText(bias),
          why: '시장 레짐 필터 (mcap 24h 변화율)',
          helpfulnessWhy: `레짐강도 ${Math.round(regimeStrength)} · 변화 ${Math.abs(cmcChange).toFixed(2)}%`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 2,
          clarityScore: 30,
          sourceReliability: 92,
          failureRatePct: 5,
          manipulationRisk: 'low',
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  for (const rec of input.flowRecords.slice(0, 4)) {
    const text = (rec.text ?? '').trim();
    if (!text) continue;

    const sourceLabel = rec.source ?? source;
    const recBias = normalizeBias(rec.vote);
    const bias = recBias === 'wait' ? textBias(text) : recBias;
    const rawConfidence = clamp(toNum(rec.confidence, 55));
    const recCreatedAt = toNum(rec.createdAt, createdAt);
    const ageMin = delayMinutes(recCreatedAt);
    const freshness = freshnessScore(ageMin, 0, 180);
    const sourceReliability = sourceReliabilityScore(sourceLabel);
    const pairRelevance = relevanceScore(text, token);
    const confidence = calibrateConfidence(
      [
        { score: rawConfidence, weight: 0.46 },
        { score: freshness, weight: 0.24 },
        { score: sourceReliability, weight: 0.20 },
        { score: pairRelevance, weight: 0.10 },
      ],
      bias === 'wait' ? -8 : 0,
    );
    const hasNumericContext = /\d+%|\$\d+|liq|funding|ratio/i.test(text);
    const clarityScore = clamp((text.length >= 30 ? 32 : 28) + (hasNumericContext ? 4 : 0), 24, 40);
    const backtestWinRateLiftPct = clamp(3 + rawConfidence / 30 + freshness / 120, 3, 7.2);
    const feedbackPositivePct = clamp(52 + rawConfidence * 0.2 + freshness * 0.12, 48, 85);
    const applyRatePct = clamp(confidence * 0.84 + rawConfidence * 0.16, 40, 94);
    const pnlLiftPct = clamp(1.4 + rawConfidence / 35 + freshness / 150, 1.2, 5.6);

    out.push(
      gateCard(
        'flow',
        `flow:record:${rec.id ?? text.slice(0, 24)}`,
        sourceLabel,
        {
          title: `${rec.agent ?? 'FLOW'} SNAPSHOT`,
          createdAt: recCreatedAt,
          bias,
          confidence,
          what: text,
          soWhat: '실시간 플로우 레코드는 방향 압력을 보조 확인하는 증거입니다.',
          nowWhat: biasToActionText(bias),
          why: `${sourceLabel} 레코드`,
          helpfulnessWhy: `원본신뢰 ${Math.round(rawConfidence)} · 신선도 ${Math.round(freshness)} · 출처 ${Math.round(sourceReliability)}`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 2,
          clarityScore,
          sourceReliability,
          failureRatePct: 7,
          manipulationRisk: manipulationRiskFor(sourceLabel),
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: ageMin <= 120,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  return pickTopCards(out, maxCount);
}

function buildTrendingCards(input: IntelPolicyInput, maxCount: number): IntelPolicyCard[] {
  const token = toUpperSafe(input.pair.split('/')[0] ?? 'BTC');
  const out: IntelPolicyCard[] = [];

  for (const coin of input.trendingCoins.slice(0, 20)) {
    const symbol = (coin.symbol ?? '').toUpperCase();
    if (!symbol) continue;

    const rank = Math.max(1, Math.floor(toNum(coin.rank, 1)));
    const change24h = toNum(coin.change24h, 0);
    const socialVolume = toNum(coin.socialVolume, 0);
    const bias: DecisionBias = change24h > 1.2 ? 'long' : change24h < -1.2 ? 'short' : 'wait';
    const momentumStrength = strengthFromDeviation(change24h, 0, 1.4);
    const socialScore = logScore(socialVolume, 28);
    const rankScore = clamp(100 - (rank - 1) * 11, 22, 100);
    const pairRelevance = symbol === token ? 100 : relevanceScore(`${symbol} ${coin.name ?? ''}`, token);
    const pumpRisk = change24h > 20 && socialVolume > 120_000;
    const manipulationRisk: ManipulationRiskLevel = pumpRisk ? 'high' : socialVolume > 80_000 ? 'medium' : 'low';
    const confidence = calibrateConfidence(
      [
        { score: momentumStrength, weight: 0.40 },
        { score: socialScore, weight: 0.22 },
        { score: rankScore, weight: 0.18 },
        { score: 86, weight: 0.10 },
        { score: pairRelevance, weight: 0.10 },
      ],
      (bias === 'wait' ? -8 : 0) - (pumpRisk ? 14 : 0),
    );
    const clarityScore = clamp(30 + (bias === 'wait' ? 0 : 4), 28, 40);
    const backtestWinRateLiftPct = clamp(
      3 + momentumStrength / 24 + socialScore / 60 + (symbol === token ? 1 : 0),
      3,
      8.8,
    );
    const feedbackPositivePct = clamp(
      56 + rankScore * 0.12 + momentumStrength * 0.14 - (pumpRisk ? 15 : 0),
      45,
      88,
    );
    const applyRatePct = clamp(confidence * 0.82 + rankScore * 0.18, 40, 95);
    const pnlLiftPct = clamp(
      1.4 + momentumStrength / 28 + (pumpRisk ? -0.8 : 0.6),
      1,
      6.5,
    );

    out.push(
      gateCard(
        'trending',
        `trending:${symbol}`,
        'CMC_LUNARCRUSH',
        {
          title: `TRENDING #${rank} ${symbol}`,
          createdAt: Date.now(),
          bias,
          confidence,
          what: `${symbol} 24h ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`,
          soWhat: '트렌딩 강도는 단기 후보군 우선순위에 직접 반영됩니다.',
          nowWhat: biasToActionText(bias),
          why: `rank ${rank} · social ${Math.round(socialVolume).toLocaleString()} · pumpRisk ${pumpRisk ? 'Y' : 'N'}`,
          helpfulnessWhy: `모멘텀 ${Math.round(momentumStrength)} · 소셜 ${Math.round(socialScore)} · 랭크 ${Math.round(rankScore)}`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 2,
          clarityScore,
          sourceReliability: 86,
          failureRatePct: 5,
          manipulationRisk,
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  return pickTopCards(out, maxCount);
}

function buildPickCards(input: IntelPolicyInput, maxCount: number): IntelPolicyCard[] {
  const token = toUpperSafe(input.pair.split('/')[0] ?? 'BTC');
  const out: IntelPolicyCard[] = [];

  for (const coin of input.pickCoins.slice(0, 20)) {
    const symbol = (coin.symbol ?? '').toUpperCase();
    if (!symbol) continue;

    const direction = (coin.direction ?? 'neutral').toLowerCase();
    const bias: DecisionBias = direction === 'long' ? 'long' : direction === 'short' ? 'short' : 'wait';
    const totalScore = clamp(toNum(coin.totalScore, 50));
    const baseConfidence = clamp(toNum(coin.confidence, 55));
    const reasons = Array.isArray(coin.reasons) ? coin.reasons.filter((r) => typeof r === 'string') : [];
    const alerts = Array.isArray(coin.alerts) ? coin.alerts.filter((r) => typeof r === 'string') : [];
    const alertText = alerts.join(' ').toLowerCase();
    const highRiskAlert = /(rug|honeypot|exploit|drain|scam|spoof|wash|blacklist|⚠)/.test(alertText);
    const mediumRiskAlert = !highRiskAlert && /(risk|warning|volatility|unlock|dilution|dump)/.test(alertText);
    const riskPenalty = highRiskAlert ? 18 : mediumRiskAlert ? 8 : 0;
    const riskLevel: ManipulationRiskLevel = highRiskAlert ? 'high' : mediumRiskAlert ? 'medium' : 'low';
    const reasonScore = clamp(reasons.length * 14 + (reasons[0] ? 12 : 0), 0, 100);
    const pairRelevance = symbol === token ? 100 : relevanceScore(`${symbol} ${coin.name ?? ''} ${reasons.join(' ')}`, token);
    const confidence = calibrateConfidence(
      [
        { score: totalScore, weight: 0.34 },
        { score: baseConfidence, weight: 0.30 },
        { score: reasonScore, weight: 0.18 },
        { score: pairRelevance, weight: 0.10 },
        { score: 86, weight: 0.08 },
      ],
      (bias === 'wait' ? -8 : 0) - riskPenalty,
    );
    const backtestWinRateLiftPct = clamp(3.5 + totalScore / 24 + reasonScore / 100 - riskPenalty / 20, 3, 9.3);
    const feedbackPositivePct = clamp(58 + totalScore * 0.18 + reasonScore * 0.08 - riskPenalty * 1.2, 45, 91);
    const applyRatePct = clamp(confidence * 0.84 + totalScore * 0.16, 40, 96);
    const pnlLiftPct = clamp(1.8 + totalScore / 22 - riskPenalty / 16 + (bias === 'wait' ? 0 : 0.9), 1, 7.6);
    const createdAt = Date.now();

    out.push(
      gateCard(
        'picks',
        `pick:${symbol}`,
        'OPPORTUNITY_SCAN',
        {
          title: `PICK ${symbol}`,
          createdAt,
          bias,
          confidence,
          what: `${symbol} 종합점수 ${Math.round(totalScore)}/100`,
          soWhat: totalScore >= 70 ? '다중 팩터가 동시 정렬된 상위 후보입니다.' : '후보군이지만 확신도는 중간 수준입니다.',
          nowWhat: biasToActionText(bias),
          why: reasons.slice(0, 2).join(' · ') || '복합 스코어 기반 선별',
          helpfulnessWhy: `score ${Math.round(totalScore)} · reason ${Math.round(reasonScore)} · riskPenalty ${riskPenalty}`,
          visualAid: visualAidForBias(bias),
        },
        {
          actionTypeCount: bias === 'wait' ? 1 : 3,
          clarityScore: 36,
          sourceReliability: 86,
          failureRatePct: 6,
          manipulationRisk: riskLevel,
          pairKeywordMatchPct: pairRelevance,
          timeframeAligned: true,
          backtestWinRateLiftPct,
          feedbackPositivePct,
          applyRatePct,
          pnlLiftPct,
        },
      ),
    );
  }

  return pickTopCards(out, maxCount);
}

function evidenceFromCard(domain: EngineEvidence['domain'], card: IntelPolicyCard): EngineEvidence {
  const strength = clamp(card.confidence);
  const confidence = calibrateConfidence(
    [
      { score: card.confidence, weight: 0.62 },
      { score: card.gate.weightedScore, weight: 0.38 },
    ],
  );
  return {
    domain,
    bias: card.bias,
    biasStrength: strength,
    confidence,
    freshnessSec: Math.max(0, Math.floor((Date.now() - card.createdAt) / 1000)),
    reason: card.soWhat,
    qualityScore: card.gate.weightedScore,
    helpfulnessScore: card.gate.scores.helpfulness,
    gate: card.gate,
  };
}

function avgHelpfulness(cards: IntelPolicyCard[]): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + card.gate.scores.helpfulness, 0) / cards.length;
}

function domainCoverage(domains: EngineEvidence['domain'][]): string[] {
  return Array.from(new Set(domains));
}

export function buildIntelPolicyOutput(input: IntelPolicyInput): IntelPolicyOutput {
  const thresholds = getIntelThresholds();
  const maxCards = thresholds.panelRules.maxCardsPerPanel;

  const panels: Record<IntelPanelKey, IntelPolicyCard[]> = {
    headlines: buildHeadlineCards(input, maxCards),
    events: buildEventCards(input, maxCards),
    flow: buildFlowCards(input, maxCards),
    trending: buildTrendingCards(input, maxCards),
    picks: buildPickCards(input, maxCards),
  };

  const evidence: EngineEvidence[] = [];
  const headlineTop = panels.headlines[0];
  if (headlineTop) evidence.push(evidenceFromCard('headlines', headlineTop));
  const eventTop = panels.events[0];
  if (eventTop) evidence.push(evidenceFromCard('events', eventTop));
  const flowTop = panels.flow[0];
  if (flowTop) evidence.push(evidenceFromCard('flow', flowTop));

  const derivativesTop = panels.flow.find((card) => card.id.includes('funding') || card.id.includes('ls_ratio') || card.id.includes('liquidations'));
  if (derivativesTop) evidence.push(evidenceFromCard('derivatives', derivativesTop));

  const trendingTop = panels.trending[0] ?? panels.picks[0];
  if (trendingTop) evidence.push(evidenceFromCard('trending', trendingTop));

  const activeCards = Object.values(panels).flat();
  const avgHelp = avgHelpfulness(activeCards);
  const backtestWinRatePct = clamp(48 + avgHelp * 0.45);

  const volatilityIndex = (() => {
    const snap = input.flowSnapshot;
    if (!snap) return null;
    const pct = Math.abs(toNum(snap.priceChangePct, 0));
    const cmcPct = Math.abs(toNum(snap.cmcChange24hPct, 0));
    return clamp(pct * 1.7 + cmcPct * 4.2, 0, 100);
  })();

  const decision = computeDecision(evidence, {
    backtestWinRatePct,
    volatilityIndex,
  });

  return {
    generatedAt: Date.now(),
    decision,
    panels,
    summary: {
      pair: input.pair,
      timeframe: input.timeframe,
      domainsUsed: domainCoverage(evidence.map((item) => item.domain)),
      avgHelpfulness: Number(avgHelp.toFixed(2)),
    },
  };
}

export function emptyPanels(): Record<IntelPanelKey, IntelPolicyCard[]> {
  return {
    headlines: [],
    events: [],
    flow: [],
    trending: [],
    picks: [],
  };
}

export function summarizeScoreBreakdown(scores: QualityGateScores): string {
  return `A ${Math.round(scores.actionability)} · T ${Math.round(scores.timeliness)} · R ${Math.round(scores.reliability)} · Re ${Math.round(scores.relevance)} · H ${Math.round(scores.helpfulness)}`;
}
