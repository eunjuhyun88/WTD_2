/**
 * usePriceLines — manages verdict / liq / whale price lines on a chart series.
 *
 * Extracted from ChartBoard.svelte for reuse across chart surfaces.
 * W-0287 Phase 4c.
 */
import type { ISeriesApi, SeriesType } from 'lightweight-charts';
import type { AIPriceLine } from '$lib/stores/chartAIOverlay';

type PriceLine = ReturnType<ISeriesApi<SeriesType>['createPriceLine']>;

export interface VerdictLevels {
  entry?: number;
  target?: number;
  stop?: number;
}

export interface LiqData {
  nearestLong?: { price: number } | null;
  nearestShort?: { price: number } | null;
  strongestClusters?: Array<{ price: number; side: 'long' | 'short'; totalUsd: number }>;
}

export interface WhalePosition {
  liquidationPrice?: number | null;
  netPosition: 'long' | 'short';
  sizeUsd: number;
  address: string;
}

export class PriceLineManager {
  private series: ISeriesApi<SeriesType> | null = null;
  private entryLine: PriceLine | null = null;
  private targetLine: PriceLine | null = null;
  private stopLine: PriceLine | null = null;
  private liqLines: PriceLine[] = [];
  private whaleLines: PriceLine[] = [];
  private aiLines: PriceLine[] = [];

  setSeries(series: ISeriesApi<SeriesType> | null) {
    this.series = series;
  }

  /** Apply verdict entry/target/stop lines. Clears existing lines first. */
  updateVerdictLevels(levels: VerdictLevels | undefined) {
    if (!this.series) return;
    this._removeLine(this.entryLine);
    this._removeLine(this.targetLine);
    this._removeLine(this.stopLine);
    this.entryLine = this.targetLine = this.stopLine = null;

    if (!levels) return;

    if (levels.entry != null) {
      this.entryLine = this.series.createPriceLine({
        price: levels.entry,
        color: 'rgba(251,191,36,0.9)',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'ENTRY',
      });
    }
    if (levels.target != null) {
      this.targetLine = this.series.createPriceLine({
        price: levels.target,
        color: 'rgba(38,166,154,0.9)',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: 'TARGET',
      });
    }
    if (levels.stop != null) {
      this.stopLine = this.series.createPriceLine({
        price: levels.stop,
        color: 'rgba(239,83,80,0.9)',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: 'STOP',
      });
    }
  }

  /** Apply liq cluster price lines from liqData snapshot. */
  applyLiqLines(liqData: LiqData | null) {
    this.clearLiqLines();
    if (!this.series || !liqData) return;

    const addLine = (price: number, color: string, title: string, lw: 1 | 2) => {
      if (!this.series) return;
      this.liqLines.push(
        this.series.createPriceLine({ price, color, lineWidth: lw, lineStyle: 2, axisLabelVisible: title.length > 0, title }),
      );
    };

    if (liqData.nearestLong?.price != null && Number.isFinite(liqData.nearestLong.price)) {
      addLine(liqData.nearestLong.price, 'rgba(248,113,113,0.92)', 'L-LIQ', 2);
    }
    if (liqData.nearestShort?.price != null && Number.isFinite(liqData.nearestShort.price)) {
      addLine(liqData.nearestShort.price, 'rgba(52,211,153,0.92)', 'S-LIQ', 2);
    }
    const clusters = liqData.strongestClusters ?? [];
    for (const c of clusters.slice(0, 4)) {
      if (!Number.isFinite(c.price)) continue;
      addLine(
        c.price,
        c.side === 'long' ? 'rgba(248,113,113,0.45)' : 'rgba(52,211,153,0.45)',
        '',
        1,
      );
    }
  }

  /** Apply whale liquidation price lines (top 3 by size). */
  applyWhaleLines(positions: WhalePosition[]) {
    this.clearWhaleLines();
    if (!this.series) return;

    const withLiq = positions.filter(
      (p) => p.liquidationPrice != null && Number.isFinite(p.liquidationPrice),
    );
    const top3 = [...withLiq].sort((a, b) => b.sizeUsd - a.sizeUsd).slice(0, 3);

    for (const pos of top3) {
      const liqPrice = pos.liquidationPrice!;
      const col =
        pos.netPosition === 'long' ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.5)';
      this.whaleLines.push(
        this.series.createPriceLine({
          price: liqPrice,
          color: col,
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: false,
          title: `🐋 ${pos.address}`,
        }),
      );
    }
  }

  /** Apply AI analysis price lines (entry / stop / target from AIPanel ANALYZE). */
  setAILines(lines: AIPriceLine[]) {
    this.clearAILines();
    if (!this.series) return;
    for (const l of lines) {
      this.aiLines.push(
        this.series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: l.style === 'solid' ? 0 : 2,
          axisLabelVisible: true,
          title: l.label,
        }),
      );
    }
  }

  clearAILines() {
    for (const pl of this.aiLines) this._removeLine(pl);
    this.aiLines = [];
  }

  clearLiqLines() {
    for (const pl of this.liqLines) this._removeLine(pl);
    this.liqLines = [];
  }

  clearWhaleLines() {
    for (const pl of this.whaleLines) this._removeLine(pl);
    this.whaleLines = [];
  }

  clearAll() {
    this._removeLine(this.entryLine);
    this._removeLine(this.targetLine);
    this._removeLine(this.stopLine);
    this.entryLine = this.targetLine = this.stopLine = null;
    this.clearLiqLines();
    this.clearWhaleLines();
  }

  private _removeLine(line: PriceLine | null) {
    if (!line || !this.series) return;
    try {
      this.series.removePriceLine(line);
    } catch {
      /* already removed with chart */
    }
  }
}
