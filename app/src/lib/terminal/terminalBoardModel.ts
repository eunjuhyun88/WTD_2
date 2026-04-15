import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';
import type { TerminalAnalyzeData } from '$lib/terminal/terminalDataOrchestrator';
import type { TerminalAsset } from '$lib/types/terminal';
import {
  buildFallbackDepth,
  buildFallbackLiqClusters,
  getOrderbookBiasLabel,
  getOrderbookTone,
  type ShellChromeTone,
} from '$lib/terminal/terminalDerived';

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
  activeAnalysisData: TerminalAnalyzeData | null;
  chartLevels: { stop?: number; target?: number };
  readPathDepth: DepthLadderEnvelope['data'] | null;
  readPathLiq: LiquidationClustersEnvelope['data'] | null;
}

function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function buildTerminalBoardModel(
  input: BuildTerminalBoardModelInput
): TerminalBoardModel {
  const {
    activeAsset,
    activeAnalysisData,
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

  return {
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
