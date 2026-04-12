import { normalizeTimeframe } from '$lib/utils/timeframe';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toNumberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizePair(pairRaw: unknown): string {
  const pair = toStringValue(pairRaw, 'BTC/USDT').toUpperCase();
  return pair || 'BTC/USDT';
}

function normalizeBias(raw: unknown): 'long' | 'short' | 'wait' {
  const value = toStringValue(raw).toLowerCase();
  if (value === 'long' || value === 'buy') return 'long';
  if (value === 'short' || value === 'sell') return 'short';
  if (value === 'neutral') return 'wait';
  return 'wait';
}

function normalizeConfidence(raw: unknown, fallback = 0.5): number {
  const value = toNumberValue(raw, fallback);
  if (!Number.isFinite(value)) return fallback;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function normalizeMtfFrame(input: unknown): OrpoMtfFrame {
  const obj = asObject(input);
  return {
    bias: normalizeBias(obj.bias),
    confidence: Math.round(normalizeConfidence(obj.confidence, 0.5) * 100),
    rsi14: Number(toNumberValue(obj.rsi14, 50).toFixed(2)),
    emaTrend: normalizeEmaTrend(obj.emaTrend),
  };
}

function normalizeEmaTrend(raw: unknown): 'bullish' | 'bearish' | 'flat' {
  const value = toStringValue(raw).toLowerCase();
  if (value === 'bullish' || value === 'up') return 'bullish';
  if (value === 'bearish' || value === 'down') return 'bearish';
  return 'flat';
}

function normalizeRiskLevel(raw: unknown): 'low' | 'medium' | 'high' {
  const value = toStringValue(raw).toLowerCase();
  if (value === 'low') return 'low';
  if (value === 'high') return 'high';
  return 'medium';
}

export interface OrpoMtfFrame {
  bias: 'long' | 'short' | 'wait';
  confidence: number;
  rsi14: number;
  emaTrend: 'bullish' | 'bearish' | 'flat';
}

export interface OrpoPromptContract {
  schemaVersion: 'orpo-prompt-v1';
  traceId: string;
  asOf: string;
  market: {
    pair: string;
    timeframe: string;
    price: number;
    regime: string;
  };
  zone: {
    primary: string;
    modifiers: string[];
    ambiguityScore: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  mtf: {
    '1H': OrpoMtfFrame;
    '4H': OrpoMtfFrame;
    '1D': OrpoMtfFrame;
    '1W': OrpoMtfFrame;
    '1M': OrpoMtfFrame;
  };
  entryScore: {
    total: number;
    zoneAlignment: number;
    frameworkConsensus: number;
    riskReward: number;
    liquidityStructure: number;
  };
  riskGate: {
    p0Blocked: boolean;
    violations: string[];
    rr: number;
  };
  skills: {
    computeEntryScore: string;
    checkP0Rules: string;
    buildRrLevels: string;
    detectConflict: string;
  };
  constraints: {
    maxLeverage: number;
    maxPositionPct: number;
    mustSetStop: boolean;
    noPredictionClaim: boolean;
  };
}

export interface OrpoResponseContract {
  schemaVersion: 'orpo-response-v1';
  decision: {
    bias: 'long' | 'short' | 'wait';
    confidence: number;
    entryPlan: {
      type: 'zone' | 'breakout' | 'pullback';
      levels: string[];
    };
    riskPlan: {
      slBps: number;
      maxPositionPct: number;
      invalidations: string[];
    };
    tpPlan: Array<{
      tpBps: number;
      sizePct: number;
    }>;
  };
  explanation: {
    whatChanged: string;
    why: string[];
    nowWhat: string;
    risk: string;
  };
  policy: {
    p0Compliant: boolean;
    ruleViolations: string[];
  };
}

export interface BuildPromptInput {
  traceId: string;
  contextFeatures: unknown;
  decisionFeatures?: unknown;
  asOfIso?: string;
}

export function buildOrpoPromptContract(input: BuildPromptInput): OrpoPromptContract {
  const context = asObject(input.contextFeatures);
  const decision = asObject(input.decisionFeatures);
  const zone = asObject(context.zone);
  const mtf = asObject(context.mtf);
  const entryScore = asObject(context.entryScore);
  const riskGate = asObject(context.riskGate);
  const constraints = asObject(context.constraints);

  const pair = normalizePair(context.pair ?? context.marketPair ?? context.symbolPair);
  const timeframe = normalizeTimeframe(toStringValue(context.timeframe, '4h'));
  const price = toNumberValue(context.price ?? context.currentPrice ?? decision.entry ?? decision.entryPrice, 0);

  const regime = toStringValue(context.regime, 'unknown') || 'unknown';
  const modifiersRaw = Array.isArray(zone.modifiers) ? zone.modifiers : [];
  const modifiers = modifiersRaw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const violationsRaw = Array.isArray(riskGate.violations) ? riskGate.violations : [];
  const violations = violationsRaw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);

  return {
    schemaVersion: 'orpo-prompt-v1',
    traceId: input.traceId,
    asOf: input.asOfIso ?? new Date().toISOString(),
    market: {
      pair,
      timeframe,
      price,
      regime,
    },
    zone: {
      primary: toStringValue(zone.primary, 'UNKNOWN') || 'UNKNOWN',
      modifiers,
      ambiguityScore: Math.round(toNumberValue(zone.ambiguityScore, 50)),
      riskLevel: normalizeRiskLevel(zone.riskLevel),
    },
    mtf: {
      '1H': normalizeMtfFrame(mtf['1H']),
      '4H': normalizeMtfFrame(mtf['4H']),
      '1D': normalizeMtfFrame(mtf['1D']),
      '1W': normalizeMtfFrame(mtf['1W']),
      '1M': normalizeMtfFrame(mtf['1M']),
    },
    entryScore: {
      total: Math.round(toNumberValue(entryScore.total, toNumberValue(decision.entryScore, 50))),
      zoneAlignment: Math.round(toNumberValue(entryScore.zoneAlignment, 0)),
      frameworkConsensus: Math.round(toNumberValue(entryScore.frameworkConsensus, 0)),
      riskReward: Math.round(toNumberValue(entryScore.riskReward, 0)),
      liquidityStructure: Math.round(toNumberValue(entryScore.liquidityStructure, 0)),
    },
    riskGate: {
      p0Blocked: toBool(riskGate.p0Blocked, false),
      violations,
      rr: toNumberValue(riskGate.rr, toNumberValue(decision.rr, 0)),
    },
    skills: {
      computeEntryScore: toStringValue(context.computeEntryScoreStatus, 'unknown') || 'unknown',
      checkP0Rules: toStringValue(context.checkP0RulesStatus, 'unknown') || 'unknown',
      buildRrLevels: toStringValue(context.buildRrLevelsStatus, 'unknown') || 'unknown',
      detectConflict: toStringValue(context.detectConflictStatus, 'unknown') || 'unknown',
    },
    constraints: {
      maxLeverage: toNumberValue(constraints.maxLeverage, 3),
      maxPositionPct: toNumberValue(constraints.maxPositionPct, 8),
      mustSetStop: toBool(constraints.mustSetStop, true),
      noPredictionClaim: toBool(constraints.noPredictionClaim, true),
    },
  };
}

export interface BuildResponseInput {
  decisionFeatures: unknown;
  outcomeFeatures?: unknown;
}

export function buildOrpoResponseContract(input: BuildResponseInput): OrpoResponseContract {
  const decision = asObject(input.decisionFeatures);
  const outcome = asObject(input.outcomeFeatures);

  const violations = Array.isArray(decision.ruleViolations)
    ? decision.ruleViolations.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];

  const bias = normalizeBias(decision.bias ?? decision.dir ?? decision.direction);
  const confidence = normalizeConfidence(decision.confidence, 0.5);

  const invalidationsRaw = Array.isArray(decision.invalidations)
    ? decision.invalidations
    : Array.isArray(outcome.invalidations)
      ? outcome.invalidations
      : [];

  const invalidations = invalidationsRaw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  const tpPlanInput = Array.isArray(decision.tpPlan)
    ? decision.tpPlan
    : decision.tp != null
      ? [{ tpBps: toNumberValue(decision.tp, 0), sizePct: 100 }]
      : [];

  const tpPlan = tpPlanInput
    .map((item) => asObject(item))
    .map((item) => ({
      tpBps: toNumberValue(item.tpBps ?? item.tp, 0),
      sizePct: toNumberValue(item.sizePct ?? item.size, 100),
    }))
    .slice(0, 5);

  return {
    schemaVersion: 'orpo-response-v1',
    decision: {
      bias,
      confidence,
      entryPlan: {
        type: toStringValue(asObject(decision.entryPlan).type, 'zone') === 'breakout'
          ? 'breakout'
          : toStringValue(asObject(decision.entryPlan).type, 'zone') === 'pullback'
            ? 'pullback'
            : 'zone',
        levels: Array.isArray(asObject(decision.entryPlan).levels)
          ? (asObject(decision.entryPlan).levels as unknown[])
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      },
      riskPlan: {
        slBps: toNumberValue(asObject(decision.riskPlan).slBps ?? decision.slBps ?? decision.sl, 0),
        maxPositionPct: toNumberValue(asObject(decision.riskPlan).maxPositionPct ?? decision.maxPositionPct, 8),
        invalidations,
      },
      tpPlan,
    },
    explanation: {
      whatChanged: toStringValue(asObject(decision.explanation).whatChanged, ''),
      why: Array.isArray(asObject(decision.explanation).why)
        ? (asObject(decision.explanation).why as unknown[])
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      nowWhat: toStringValue(asObject(decision.explanation).nowWhat, ''),
      risk: toStringValue(asObject(decision.explanation).risk, ''),
    },
    policy: {
      p0Compliant: toBool(decision.p0Compliant, violations.length === 0),
      ruleViolations: violations,
    },
  };
}

function stableStringify(value: unknown): string {
  if (!isObject(value) && !Array.isArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',');
  return `{${body}}`;
}

export function hashPromptContract(prompt: OrpoPromptContract): string {
  const payload = stableStringify(prompt);
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `h${hash.toString(16).padStart(8, '0')}`;
}
