<script lang="ts">
  import Splitter from '../Splitter.svelte';
  import ChartBoard from '$lib/components/terminal/workspace/ChartBoard.svelte';
  import ScanGrid from '$lib/components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '$lib/components/terminal/peek/JudgePanel.svelte';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface TabState {
    tradePrompt: string;
    rangeSelection: boolean;
    setupTokens: any;
    verdicts: Record<string, string>;
    selectedScan: string;
    scanView: 'grid' | 'list';
    expandedSample: string | null;
    chat: Array<any>;
  }

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    splitY: number;
    splitX: number;
    onResizeY: (dy: number) => void;
    onResizeX: (dx: number) => void;
    symbol?: string;
    timeframe?: string;
  }

  let { mode, tabState, updateTabState, splitY, splitX, onResizeY, onResizeX, symbol = 'BTCUSDT', timeframe = '4h' }: Props = $props();

  let selectedCapture = $state<PatternCaptureRecord | null>(null);


<div class="trade-mode">
  <div style:flex={`${splitY}%`} style:min-height="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
    <ChartBoard {symbol} tf={timeframe} contextMode="chart" />
  </div>

  <Splitter orientation="horizontal" onDrag={onResizeY} />

  <div style:flex={`${100 - splitY}%`} style:min-height="0" style:overflow="hidden">
    <div class="bottom-pane">
      <div style:display="flex" style:height="100%" style:gap="1px">
        <div style:flex={`${splitX}%`} style:min-width="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
          <ScanGrid activeSymbol={symbol} onOpenCapture={(r) => (selectedCapture = r)} />
        </div>

        <Splitter orientation="vertical" onDrag={onResizeX} />

        <div style:flex={`${100 - splitX}%`} style:min-width="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
          <JudgePanel {symbol} {timeframe} />
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
  }

  .bottom-pane {
    display: flex;
    height: 100%;
    overflow: hidden;
  }
</style>
