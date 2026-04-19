<script lang="ts">
  import Splitter from '../Splitter.svelte';

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
  }

  const { mode, tabState, updateTabState, splitY, splitX, onResizeY, onResizeX }: Props = $props();
</script>

<div class="trade-mode">
  <div style:flex={`${splitY}%`} style:min-height="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
    <div class="analyze-pane">
      <div class="pane-header">ANALYZE</div>
      <div class="pane-content">
        <p>Chart content (will integrate existing ChartBoard)</p>
      </div>
    </div>
  </div>

  <Splitter orientation="horizontal" onDrag={onResizeY} />

  <div style:flex={`${100 - splitY}%`} style:min-height="0" style:overflow="hidden">
    <div class="bottom-pane">
      <div style:display="flex" style:height="100%" style:gap="1px">
        <div style:flex={`${splitX}%`} style:min-width="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
          <div class="sub-pane">
            <div class="pane-header">SCAN</div>
            <div class="pane-content">
              <p>Scan grid (existing ScanGrid)</p>
            </div>
          </div>
        </div>

        <Splitter orientation="vertical" onDrag={onResizeX} />

        <div style:flex={`${100 - splitX}%`} style:min-width="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
          <div class="sub-pane">
            <div class="pane-header">JUDGE</div>
            <div class="pane-content">
              <p>Judge panel (existing JudgePanel)</p>
            </div>
          </div>
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

  .analyze-pane,
  .sub-pane {
    display: flex;
    flex-direction: column;
    background: var(--g0);
    border: 0.5px solid var(--g3);
  }

  .bottom-pane {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .pane-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 8px 12px;
    background: var(--g1);
    border-bottom: 0.5px solid var(--g3);
    color: var(--g6);
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    padding: 12px;
    color: var(--g7);
    font-size: 11px;
  }
</style>
