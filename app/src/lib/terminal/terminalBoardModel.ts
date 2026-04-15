import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';
import type { TerminalAnalyzeData } from '$lib/terminal/terminalDataOrchestrator';
import type { TerminalAsset, TerminalEvidence, TerminalVerdict } from '$lib/types/terminal';
import {
  buildBoardActionRows,
  buildFallbackDepth,
  buildFallbackLiqClusters,
  buildHeroMetricTiles,
  getOrderbookBiasLabel,
  getOrderbookTone,
  metricValueFromEvidence,
  type HeroMetricTile,
  type BoardActionRow,
  type ShellChromeTone,
} from '$lib/terminal/terminalDerived';

export interface BoardSummaryFact {
  label: string;
  value: string;
  tone: ShellChromeTone;
  emphasis?: 'primary' | 'secondary';
}

export interface BoardHeaderModel {
  focusLabel: string;
  timeframeLabel: string;
  biasLabel: string;
  biasTone: ShellChromeTone;
  regimeLabel: string;
  flowLabel: string;
}

export interface BoardDepthLevel {
  price: number;
  weight: number;
}

export interface BoardLiquidityCluster {
  side: 'SELL' | 'BUY';
  label: string;
  price: number;
  distancePct: number;
  usd: number;
}

export interface TerminalBoardModel {
  header: BoardHeaderModel;
  summaryFacts: BoardSummaryFact[];
  metricTiles: HeroMetricTile[];
  actionRows: BoardActionRow[];
  sourceRows: TerminalAsset['sources'];
  orderbookTone: ShellChromeTone;
  orderbookBiasLabel: string;
  orderbookDepth: { bids: BoardDepthLevel[]; asks: BoardDepthLevel[] } | null;
  orderbookMeta: {
    spreadLabel: string;
    imbalanceLabel: string;
    takerLabel: string;
    sourceLabel: string;
  };
  liquidityMeta: {
    title: string;
    metaLabel: string;
    shortLiqUsd: number | null;
    longLiqUsd: number | null;
  };
  liquidityClusters: BoardLiquidityCluster[];
}

interface BuildTerminalBoardModelInput {
  activeAsset: TerminalAsset | null;
  heroAsset: TerminalAsset | null;
  activeVerdict: TerminalVerdict | null;
  activeEvidence: TerminalEvidence[];
  activeAnalysisData: TerminalAnalyzeData | null;
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  activeFocusLabel: string;
  timeframeBadgeLabel: string;
  chartLevels: { stop?: number; target?: number };
  readPathDepth: DepthLadderEnvelope['data'] | null;
  readPathLiq: LiquidationClustersEnvelope['data'] | null;
}

function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatLastPrice(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  });
}

export function buildTerminalBoardModel(
  input: BuildTerminalBoardModelInput
): TerminalBoardModel {
  const {
    activeAsset,
    heroAsset,
    activeVerdict,
    activeEvidence,
    activeAnalysisData,
    flowBias,
    activeFocusLabel,
    timeframeBadgeLabel,
    chartLevels,
    readPathDepth,
    readPathLiq,
  } = input;

  const microstructure = activeAnalysisData?.microstructure ?? null;
  const orderbookDepth = readPathDepth
    ? {
        bids: readPathDepth.bids,
        asks: readPathDepth.asks,
      }
    : (microstructure?.depth ?? null);
  const imbalanceRatio = readPathDepth?.imbalanceRatio ?? null;
  const imbalanceLabel = readPathDepth?.imbalanceRatio != null
    ? `${readPathDepth.imbalanceRatio.toFixed(2)}x`
    : formatSignedPct(microstructure?.imbalancePct);
  const spreadLabel = readPathDepth?.spreadBps != null
    ? `${readPathDepth.spreadBps.toFixed(1)} bps`
    : microstructure?.spreadBps != null
      ? `${microstructure.spreadBps.toFixed(1)} bps`
      : activeAsset?.spreadBps
        ? `${activeAsset.spreadBps.toFixed(1)} bps`
        : 'est. 2.4 bps';
  const takerLabel = microstructure?.takerRatio != null ? microstructure.takerRatio.toFixed(2) : '—';

  const liquidityClusters = readPathLiq?.clusters?.length
    ? readPathLiq.clusters.slice(0, 4).map((cluster) => ({
        side: cluster.liquidatedSide === 'long' ? 'SELL' as const : 'BUY' as const,
        label: cluster.liquidatedSide === 'long' ? 'Longs' : 'Shorts',
        price: cluster.price,
        usd: cluster.usd,
        distancePct: cluster.distancePct,
      }))
    : buildFallbackLiqClusters({
        activeAsset,
        activeAnalysisData,
        chartLevels,
      });
  const fallbackDepth = buildFallbackDepth({ activeAsset, activeAnalysisData });
  const normalizedDepth = orderbookDepth ?? fallbackDepth;
  const regimeLabel = metricValueFromEvidence(activeEvidence, ['Regime', 'Breakout'], flowBias);
  const flowLabel = metricValueFromEvidence(activeEvidence, ['CVD', 'FR / Flow'], flowBias);
  const biasTone =
    activeVerdict?.direction === 'bullish'
      ? 'bull'
      : activeVerdict?.direction === 'bearish'
        ? 'bear'
        : 'neutral';

  return {
    header: {
      focusLabel: activeFocusLabel,
      timeframeLabel: timeframeBadgeLabel,
      biasLabel: activeVerdict?.direction?.toUpperCase?.() ?? 'NEUTRAL',
      biasTone,
      regimeLabel,
      flowLabel,
    },
    summaryFacts: activeAsset
      ? [
          { label: 'SYM', value: activeAsset.symbol.replace('USDT', ''), tone: 'info', emphasis: 'secondary' },
          { label: 'LAST', value: formatLastPrice(activeAsset.lastPrice), tone: 'neutral', emphasis: 'primary' },
          {
            label: '4H',
            value: formatSignedPct(activeAsset.changePct4h, 2),
            tone: activeAsset.changePct4h >= 0 ? 'bull' : 'bear',
            emphasis: 'primary',
          },
          {
            label: 'BIAS',
            value: activeVerdict?.direction?.toUpperCase?.() ?? 'NEUTRAL',
            tone:
              activeVerdict?.direction === 'bullish'
                ? 'bull'
                : activeVerdict?.direction === 'bearish'
                  ? 'bear'
                  : 'neutral',
            emphasis: 'primary',
          },
          {
            label: 'OI 1H',
            value: `${activeAsset.oiChangePct1h >= 0 ? '+' : ''}${activeAsset.oiChangePct1h.toFixed(1)}%`,
            tone: activeAsset.oiChangePct1h >= 0 ? 'bull' : 'bear',
            emphasis: 'secondary',
          },
          {
            label: 'FUND',
            value: `${(activeAsset.fundingRate * 100).toFixed(3)}%`,
            tone: Math.abs(activeAsset.fundingRate) > 0.01 ? 'warn' : 'neutral',
            emphasis: 'secondary',
          },
        ]
      : [],
    metricTiles: buildHeroMetricTiles({
      heroAsset,
      activeEvidence,
      flowBias,
    }),
    actionRows: buildBoardActionRows(activeVerdict),
    sourceRows: (activeAsset?.sources ?? []).slice(0, 4),
    orderbookTone: getOrderbookTone(imbalanceRatio),
    orderbookBiasLabel: getOrderbookBiasLabel(imbalanceRatio),
    orderbookDepth: normalizedDepth,
    orderbookMeta: {
      spreadLabel,
      imbalanceLabel,
      takerLabel,
      sourceLabel: orderbookDepth ? 'Read path' : 'Derived view',
    },
    liquidityMeta: {
      title: readPathLiq?.clusters?.length ? 'Liquidity' : 'Liquidation Map',
      metaLabel: readPathLiq?.clusters?.length ? 'Recent force orders' : 'Level proxy',
      shortLiqUsd: readPathLiq?.nearestShort?.usd ?? microstructure?.liqTotals?.shortUsd ?? liquidityClusters[1]?.usd ?? null,
      longLiqUsd: readPathLiq?.nearestLong?.usd ?? microstructure?.liqTotals?.longUsd ?? liquidityClusters[0]?.usd ?? null,
    },
    liquidityClusters,
  };
}
