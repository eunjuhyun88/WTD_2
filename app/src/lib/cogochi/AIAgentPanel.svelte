<script lang="ts">
  import { shellStore, activeRightPanelTab, activeTabState } from './shell.store';
  import type { RightPanelTab } from './shell.store';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import AIPanel from './AIPanel.svelte';
  import DecisionHUDAdapter from './DecisionHUDAdapter.svelte';
  import VerdictInboxPanel from '../../components/terminal/peek/VerdictInboxPanel.svelte';

  interface EngineCapture {
    capture_id: string; symbol: string; timeframe: string;
    pattern_slug?: string; trigger_origin?: string;
    captured_at_ms?: number; outcome?: string | null;
  }

  const TABS: Array<{ id: RightPanelTab; label: string }> = [
    { id: 'decision', label: 'AI' },
    { id: 'analyze', label: 'ANL' },
    { id: 'scan', label: 'SCN' },
    { id: 'judge', label: 'JDG' },
    { id: 'pattern', label: 'PAT' },
  ];

  interface Message { role: 'user' | 'assistant'; text: string; }
  interface Props {
    messages?: Message[];
    onSend?: (text: string, msgs: Message[]) => void;
    onSelectSymbol?: (s: string) => void;
    symbol?: string;
    timeframe?: string;
  }
  let { messages = [], onSend, onSelectSymbol, symbol = 'BTCUSDT', timeframe = '4h' }: Props = $props();

  const activeTab = $derived($activeRightPanelTab);
  const expanded = $derived($activeTabState.rightPanelExpanded ?? false);

  // Pattern tab inline data
  let patternRecords = $state<PatternCaptureRecord[]>([]);
  let patternLoading = $state(false);
  let patternLoaded = $state(false);
  let patternFilter = $state('');

  const filteredPatterns = $derived(
    patternFilter
      ? patternRecords.filter(r =>
          r.symbol.toLowerCase().includes(patternFilter.toLowerCase()) ||
          (r.patternSlug ?? '').toLowerCase().includes(patternFilter.toLowerCase())
        )
      : patternRecords
  );

  async function loadPatterns() {
    if (patternLoaded) return;
    patternLoading = true;
    try {
      const res = await fetch('/api/captures?limit=100');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      patternRecords = (data.captures ?? []).map((cap): PatternCaptureRecord => {
        const ts = cap.captured_at_ms ? new Date(cap.captured_at_ms).toISOString() : new Date().toISOString();
        return {
          id: cap.capture_id, symbol: cap.symbol, timeframe: cap.timeframe,
          contextKind: 'symbol',
          triggerOrigin: (cap.trigger_origin ?? 'manual') as PatternCaptureRecord['triggerOrigin'],
          patternSlug: cap.pattern_slug ?? undefined, snapshot: {},
          decision: { verdict: (cap.outcome === 'bullish' || cap.outcome === 'bearish' || cap.outcome === 'neutral') ? cap.outcome : undefined },
          sourceFreshness: {}, createdAt: ts, updatedAt: ts,
        };
      });
      patternLoaded = true;
    } catch { /* leave empty */ } finally { patternLoading = false; }
  }

  $effect(() => { if (activeTab === 'pattern') loadPatterns(); });

  function selectPattern(record: PatternCaptureRecord) {
    shellStore.setSymbol(record.symbol);
    shellStore.setDecisionBundle({ symbol: record.symbol, timeframe: record.timeframe, patternSlug: record.patternSlug ?? null });
    shellStore.setRightPanelTab('decision');
  }

  function toggleExpand() {
    shellStore.updateTabState(s => ({ ...s, rightPanelExpanded: !s.rightPanelExpanded }));
  }
</script>

<div class="agent-panel" class:expanded>
  <!-- Tab bar -->
  <div class="tab-bar">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        onclick={() => shellStore.setRightPanelTab(tab.id)}
      >{tab.label}</button>
    {/each}
    <button
      class="expand-btn"
      onclick={toggleExpand}
      title={expanded ? 'Collapse panel' : 'Expand panel'}
    >{expanded ? '⤡' : '⤢'}</button>
  </div>

  <!-- Tab content -->
  <div class="tab-content">
    {#if activeTab === 'decision'}
      <AIPanel
        {messages}
        onSend={onSend}
        {symbol}
        {timeframe}
        onSelectSymbol={onSelectSymbol}
        onClose={() => {}}
      />
    {:else if activeTab === 'pattern'}
      <div class="pat-panel">
        <div class="pat-search-row">
          <input class="pat-search" placeholder="filter symbol / pattern…" bind:value={patternFilter} />
        </div>
        <div class="pat-list">
          {#if patternLoading}
            <span class="pat-empty">loading…</span>
          {:else if filteredPatterns.length === 0}
            <span class="pat-empty">{patternLoaded ? 'no patterns' : 'no data'}</span>
          {:else}
            {#each filteredPatterns as r}
              <button class="pat-row" onclick={() => selectPattern(r)}>
                <span class="pat-sym">{r.symbol.replace('USDT','')}</span>
                <span class="pat-tf">{r.timeframe.toUpperCase()}</span>
                <span class="pat-verdict" class:pos={r.decision.verdict==='bullish'} class:neg={r.decision.verdict==='bearish'}>
                  {r.decision.verdict ? r.decision.verdict.slice(0,4).toUpperCase() : '——'}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {:else if activeTab === 'analyze'}
      <VerdictInboxPanel
        onVerdictSubmit={(captureId, _verdict) => shellStore.selectVerdict(captureId)}
      />
    {:else if activeTab === 'scan'}
      <div class="stub-panel">
        <span class="stub-lbl">SCAN</span>
        <span class="stub-txt">alpha world model · W-0376</span>
      </div>
    {:else if activeTab === 'judge'}
      <div class="stub-panel">
        <span class="stub-lbl">JUDGE</span>
        <span class="stub-txt">trade execution · W-0376</span>
      </div>
    {/if}
  </div>
</div>

<style>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--g1, #0c0a09);
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-bottom: 1px solid var(--g4, #272320);
  flex-shrink: 0;
  gap: 0;
}

.tab-btn {
  height: 100%;
  padding: 0 9px;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--g5, #3d3830);
  cursor: pointer;
  background: transparent;
  transition: color 0.08s, border-color 0.08s;
}
.tab-btn:hover { color: var(--g7, #9d9690); }
.tab-btn.active {
  color: var(--g9, #eceae8);
  border-bottom-color: var(--amb, #f5a623);
}

.expand-btn {
  margin-left: auto;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  color: var(--g5, #3d3830);
  cursor: pointer;
  background: transparent;
  border: none;
  font-size: 10px;
  transition: color 0.08s;
}
.expand-btn:hover { color: var(--g7, #9d9690); }

.tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Pattern tab */
.pat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.pat-search-row {
  padding: 6px 8px;
  border-bottom: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}
.pat-search {
  width: 100%;
  background: var(--g2, #131110);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g8, #cec9c4);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 3px 6px;
  outline: none;
}
.pat-search:focus { border-color: var(--g5, #3d3830); }
.pat-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
}
.pat-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--g2, #131110);
  cursor: pointer;
  text-align: left;
  transition: background 0.06s;
}
.pat-row:hover { background: var(--g2, #131110); }
.pat-sym {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--g9, #eceae8);
  min-width: 44px;
}
.pat-tf {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g5, #3d3830);
  min-width: 28px;
}
.pat-verdict {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g5, #3d3830);
  margin-left: auto;
}
.pat-verdict.pos { color: var(--pos, #4ade80); }
.pat-verdict.neg { color: var(--neg, #f87171); }
.pat-empty {
  display: block;
  padding: 20px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g4, #272320);
  text-align: center;
}

/* Stub tabs */
.stub-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
}
.stub-lbl {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--g4, #272320);
}
.stub-txt {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g3, #1c1918);
}
</style>
