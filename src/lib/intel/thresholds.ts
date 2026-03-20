import rawThresholds from '../../../config/intelThresholds.json';

import type { EvidenceDomain, QualityGateScores } from './types';

export interface IntelThresholds {
  policyVersion: string;
  qualityGate: {
    minimum: QualityGateScores;
    weights: QualityGateScores;
    passThreshold: number;
    hardHideHelpfulnessBelow: number;
    cacheTtlSec: number;
  };
  domainWeights: Record<EvidenceDomain, number>;
  conflict: {
    edgeBandPct: number;
    confidencePenaltyPct: number;
    waitPrior: number;
  };
  noTrade: {
    minCoveragePct: number;
    minBacktestWinRatePct: number;
    maxVolatilityIndex: number;
    minEdgeToTrade: number;
  };
  maxSignalAgeSec: Record<EvidenceDomain, number>;
  panelRules: {
    maxCardsPerPanel: number;
    positionsPnlAlertPct: number;
    flowOutlierZScoreCut: number;
    headlineImpactCutPct: number;
    eventImpactCutPct: number;
  };
  backtestTargets: {
    winRateLiftPct: number;
    sharpeLift: number;
    maxDrawdownReductionPct: number;
    npsPositiveTargetPct: number;
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  const next = clone(base);
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchValue = patch[key];
    if (patchValue == null) continue;

    const currentValue = next[key];
    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      next[key] = mergeDeep(
        currentValue as unknown as T[keyof T],
        patchValue as DeepPartial<T[keyof T]>,
      );
      continue;
    }

    next[key] = patchValue as T[keyof T];
  }
  return next;
}

function normalizeQualityWeights(weights: QualityGateScores): QualityGateScores {
  const total =
    weights.actionability +
    weights.timeliness +
    weights.reliability +
    weights.relevance +
    weights.helpfulness;

  if (!Number.isFinite(total) || total <= 0) {
    return {
      actionability: 0.25,
      timeliness: 0.15,
      reliability: 0.25,
      relevance: 0.15,
      helpfulness: 0.2,
    };
  }

  return {
    actionability: weights.actionability / total,
    timeliness: weights.timeliness / total,
    reliability: weights.reliability / total,
    relevance: weights.relevance / total,
    helpfulness: weights.helpfulness / total,
  };
}

const defaultThresholds: IntelThresholds = clone(rawThresholds as IntelThresholds);
defaultThresholds.qualityGate.weights = normalizeQualityWeights(defaultThresholds.qualityGate.weights);

let runtimeThresholds: IntelThresholds = clone(defaultThresholds);

export function getIntelThresholds(): IntelThresholds {
  return clone(runtimeThresholds);
}

export function setIntelThresholds(next: IntelThresholds): IntelThresholds {
  const normalized = clone(next);
  normalized.qualityGate.weights = normalizeQualityWeights(normalized.qualityGate.weights);
  runtimeThresholds = normalized;
  return getIntelThresholds();
}

export function patchIntelThresholds(patch: DeepPartial<IntelThresholds>): IntelThresholds {
  runtimeThresholds = mergeDeep(runtimeThresholds, patch);
  runtimeThresholds.qualityGate.weights = normalizeQualityWeights(runtimeThresholds.qualityGate.weights);
  return getIntelThresholds();
}

export function resetIntelThresholds(): IntelThresholds {
  runtimeThresholds = clone(defaultThresholds);
  return getIntelThresholds();
}
