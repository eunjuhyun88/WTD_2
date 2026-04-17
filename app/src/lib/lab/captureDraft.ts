import type { ConditionBlock, Strategy } from '$lib/contracts/backtest';
import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

export interface LabCaptureDraft {
  name: string;
  direction: Strategy['direction'];
  interval: string;
  conditions: ConditionBlock[];
  thesis: string;
}

function deriveDirection(capture: PatternCaptureRecord): Strategy['direction'] {
  const verdict = capture.decision.verdict;
  if (verdict === 'bullish') return 'long';
  if (verdict === 'bearish') return 'short';
  return 'both';
}

function normalizeInterval(timeframe: string): string {
  if (timeframe === '1h' || timeframe === '4h' || timeframe === '1d') return timeframe;
  return '4h';
}

function phaseConditions(reason?: string): ConditionBlock[] {
  switch (reason) {
    case 'ACCUMULATION':
      return [
        { factorId: 'HIGHER_HIGH', operator: 'gt', value: 0, enabled: true },
        { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.2, enabled: true },
      ];
    case 'REAL_DUMP':
      return [
        { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.8, enabled: true },
        { factorId: 'BB_POSITION', operator: 'lt', value: 25, enabled: true },
      ];
    case 'BREAKOUT':
      return [
        { factorId: 'EMA_CROSS', operator: 'gt', value: 0, enabled: true },
        { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.3, enabled: true },
      ];
    case 'ARCH_ZONE':
      return [
        { factorId: 'BB_SQUEEZE', operator: 'lt', value: 20, enabled: true },
        { factorId: 'ATR_PERCENT', operator: 'lt', value: 4, enabled: true },
      ];
    case 'FAKE_DUMP':
      return [
        { factorId: 'RSI', operator: 'lt', value: 35, enabled: true },
        { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.1, enabled: true },
      ];
    default:
      return [
        { factorId: 'EMA_TREND', operator: 'gt', value: 0, enabled: true },
        { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.2, enabled: true },
      ];
  }
}

export function buildLabDraftFromCapture(capture: PatternCaptureRecord): LabCaptureDraft {
  const reasonLabel = capture.reason?.toLowerCase().replaceAll('_', ' ') ?? 'capture';
  const symbolLabel = capture.symbol.replace(/USDT$/i, '');
  const thesis =
    capture.note?.trim() ||
    `Draft evaluation seeded from ${capture.triggerOrigin} capture at ${capture.timeframe} around ${reasonLabel}.`;

  return {
    name: `${symbolLabel} ${reasonLabel} draft`,
    direction: deriveDirection(capture),
    interval: normalizeInterval(capture.timeframe),
    conditions: phaseConditions(capture.reason),
    thesis,
  };
}
