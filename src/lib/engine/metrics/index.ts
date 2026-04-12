// ═══════════════════════════════════════════════════════════════
// Metric Engine — Barrel Export
// ═══════════════════════════════════════════════════════════════

export { MetricStore } from './store';
export type { MetricResult, MetricComputeFn, MetricContext } from './types';
export { resolveMetric, getRegisteredMetricIds, registerMetric } from './registry';
export { metricToFactorValue } from './adapters/factorAdapter';
export { enrichExtendedData } from './adapters/layerAdapter';
