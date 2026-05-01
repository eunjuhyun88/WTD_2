<script lang="ts">
  import { shellStore, activeRightPanelTab, activeTabState } from './shell.store';
  import type { RightPanelTab } from './shell.store';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import AIPanel from './AIPanel.svelte';
  import VerdictInboxPanel from '../../components/terminal/peek/VerdictInboxPanel.svelte';
  import ScanGrid from '../../components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '../../components/terminal/peek/JudgePanel.svelte';

  // ── Shared engine capture shape ───────────────────────────────────────────
  interface EngineCapture {
    capture_id: string;
    symbol: string;
    timeframe: string;
    pattern_slug?: string;
    trigger_origin?: string;
    captured_at_ms?: number;
    outcome?: string | null;
    p_win?: number | null;
    blocks_triggered?: string[];
  }

  interface AlertRow {
    id: string;
    symbol: string;
    timeframe: string;
    blocks_triggered: string[];
    p_win: number | null;
    created_at: string;
    preview?: { price?: number; rsi14?: number; funding_rate?: number; regime?: string };
  }

  const TABS: Array<{ id: RightPanelTab; label: string }> = [
    { id: 'decision', label: 'AI'  },
    { id: 'analyze',  label: 'ANL' },
    { id: 'scan',     label: 'SCN' },
    { id: 'judge',    label: 'JDG' },
    { id: 'pattern',  label: 'PAT' },
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
  const expanded  = $derived($activeTabState.rightPanelExpanded ?? false);

  // ── Shared helper ─────────────────────────────────────────────────────────
  function capToPatternRecord(cap: EngineCapture): PatternCaptureRecord {
    const ts = cap.captured_at_ms
      ? new Date(cap.captured_at_ms).toISOString()
      : new Date().toISOString();
    return {
      id: cap.capture_id,
      symbol: cap.symbol,
      timeframe: cap.timeframe,
      contextKind: 'symbol',
      triggerOrigin: (cap.trigger_origin ?? 'manual') as PatternCaptureRecord['triggerOrigin'],
      patternSlug: cap.pattern_slug ?? undefined,
      snapshot: {},
      decision: {
        verdict: (cap.outcome === 'bullish' || cap.outcome === 'bearish' || cap.outcome === 'neutral')
          ? cap.outcome : undefined,
      },
      sourceFreshness: {},
      createdAt: ts,
      updatedAt: ts,
    };
  }

  function openCapture(rec: PatternCaptureRecord) {
    shellStore.setSymbol(rec.symbol);
    shellStore.setDecisionBundle({
      symbol: rec.symbol,
      timeframe: rec.timeframe,
      patternSlug: rec.patternSlug ?? null,
    });
    shellStore.setRightPanelTab('decision');
  }

  // ── PAT tab ───────────────────────────────────────────────────────────────
  let patternRecords    = $state<PatternCaptureRecord[]>([]);
  let patternLoading    = $state(false);
  let patternLoaded     = $state(false);
  let patternFilter     = $state('');
  let patternVerdictFilter = $state<'all' | 'bullish' | 'bearish'>('all');
  let patternSelectedIdx   = $state(-1);

  const filteredPatterns = $derived.by(() => {
    let list = patternRecords;
    if (patternFilter) {
      const q = patternFilter.toLowerCase();
      list = list.filter(r =>
        r.symbol.toLowerCase().includes(q) ||
        (r.patternSlug ?? '').toLowerCase().includes(q),
      );
    }
    if (patternVerdictFilter !== 'all') {
      list = list.filter(r => r.decision.verdict === patternVerdictFilter);
    }
    return list;
  });

  async function loadPatterns() {
    if (patternLoaded) return;
    patternLoading = true;
    try {
      const res = await fetch('/api/captures?limit=100');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      patternRecords = (data.captures ?? []).map(capToPatternRecord);
      patternLoaded = true;
    } catch { /* leave empty */ } finally { patternLoading = false; }
  }

  function handlePatternKey(e: KeyboardEvent) {
    const len = filteredPatterns.length;
    if (!len) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      patternSelectedIdx = Math.min(patternSelectedIdx + 1, len - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      patternSelectedIdx = Math.max(patternSelectedIdx - 1, 0);
    } else if (e.key === 'Enter' && patternSelectedIdx >= 0) {
      e.preventDefault();
      openCapture(filteredPatterns[patternSelectedIdx]);
    }
  }

  $effect(() => { if (activeTab === 'pattern') void loadPatterns(); });

  // ── SCN tab ───────────────────────────────────────────────────────────────
  let scanAlerts        = $state<AlertRow[]>([]);
  let scanSimilar       = $state<PatternCaptureRecord[]>([]);
  let scanLoadingSimilar = $state(false);
  let scanAlertsLoaded  = $state(false);

  function capToAlertRow(cap: EngineCapture): AlertRow {
    return {
      id: cap.capture_id,
      symbol: cap.symbol,
      timeframe: cap.timeframe,
      blocks_triggered: cap.blocks_triggered ?? (cap.pattern_slug ? [cap.pattern_slug] : []),
      p_win: cap.p_win ?? null,
      created_at: cap.captured_at_ms
        ? new Date(cap.captured_at_ms).toISOString()
        : new Date().toISOString(),
    };
  }

  async function loadScanAlerts() {
    if (scanAlertsLoaded) return;
    try {
      const res = await fetch('/api/captures?trigger_origin=scanner&limit=50');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      scanAlerts = (data.captures ?? []).map(capToAlertRow);
      scanAlertsLoaded = true;
    } catch { /* leave empty */ }
  }

  async function loadScanSimilar(sym: string) {
    scanLoadingSimilar = true;
    try {
      const res = await fetch(`/api/captures?symbol=${encodeURIComponent(sym)}&limit=20`);
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      scanSimilar = (data.captures ?? []).map(capToPatternRecord);
    } catch { /* leave empty */ } finally { scanLoadingSimilar = false; }
  }

  $effect(() => {
    if (activeTab === 'scan') {
      void loadScanAlerts();
      void loadScanSimilar(symbol);
    }
  });

  // ── JDG tab ───────────────────────────────────────────────────────────────
  let judgeCaptures = $state<PatternCaptureRecord[]>([]);
  let judgeSaving   = $state(false);
  let judgeLoaded   = $state(false);

  async function loadJudgeCaptures() {
    try {
      const res = await fetch('/api/captures?limit=30');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      judgeCaptures = (data.captures ?? []).map(capToPatternRecord);
      judgeLoaded = true;
    } catch { /* leave empty */ }
  }

  async function handleSaveJudgment({ verdict, note }: { verdict: string; note: string }) {
    judgeSaving = true;
    try {
      await fetch('/api/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, verdict, note, trigger_origin: 'manual' }),
      });
      judgeLoaded = false;
      await loadJudgeCaptures();
    } catch { /* leave empty */ } finally { judgeSaving = false; }
  }

  $effect(() => { if (activeTab === 'judge' && !judgeLoaded) void loadJudgeCaptures(); });

  // ── Expand toggle ─────────────────────────────────────────────────────────
  function toggleExpand() {
    shellStore.updateTabState(s => ({ ...s, rightPanelExpanded: !s.rightPanelExpanded }));
  }
</script>

<div class="agent-panel" class:expanded>
  <!-- ── Tab bar ── -->
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

  <!-- ── Tab content ── -->
  <div class="tab-content">

    {#if activeTab === 'decision'}
      <!-- AI — chat + indicator overlay -->
      <AIPanel
        {messages}
        onSend={onSend}
        {symbol}
        {timeframe}
        onSelectSymbol={onSelectSymbol}
        onClose={() => {}}
      />

    {:else if activeTab === 'analyze'}
      <!-- ANL — Verdict inbox: watch hits / review / recent closed -->
      <VerdictInboxPanel
        onVerdictSubmit={(captureId, _verdict) => shellStore.selectVerdict(captureId)}
      />

    {:else if activeTab === 'scan'}
      <!-- SCN — Scanner alerts + similar pattern grid -->
      <ScanGrid
        alerts={scanAlerts}
        similar={scanSimilar}
        activeSymbol={symbol}
        loadingSimilar={scanLoadingSimilar}
        onOpenCapture={openCapture}
      />

    {:else if activeTab === 'judge'}
      <!-- JDG — Trade judgment: immediate verdict + recent + re-label -->
      <JudgePanel
        {symbol}
        {timeframe}
        captures={judgeCaptures}
        saving={judgeSaving}
        onSaveJudgment={handleSaveJudgment}
        onOpenCapture={openCapture}
      />

    {:else if activeTab === 'pattern'}
      <!-- PAT — Pattern capture history with filter chips + keyboard nav -->
      <div class="pat-panel">
        <div class="pat-search-row">
          <input
            class="pat-search"
            placeholder="filter symbol / pattern…"
            bind:value={patternFilter}
            onkeydown={handlePatternKey}
          />
          <div class="pat-chips">
            <button
              class="pat-chip"
              class:active={patternVerdictFilter === 'all'}
              onclick={() => { patternVerdictFilter = 'all'; patternSelectedIdx = -1; }}
            >ALL</button>
            <button
              class="pat-chip chip-pos"
              class:active={patternVerdictFilter === 'bullish'}
              onclick={() => { patternVerdictFilter = 'bullish'; patternSelectedIdx = -1; }}
            >BULL</button>
            <button
              class="pat-chip chip-neg"
              class:active={patternVerdictFilter === 'bearish'}
              onclick={() => { patternVerdictFilter = 'bearish'; patternSelectedIdx = -1; }}
            >BEAR</button>
          </div>
        </div>
        <div class="pat-list" role="listbox" aria-label="Pattern captures">
          {#if patternLoading}
            <span class="pat-empty">loading…</span>
          {:else if filteredPatterns.length === 0}
            <span class="pat-empty">{patternLoaded ? 'no patterns' : 'no data'}</span>
          {:else}
            {#each filteredPatterns as r, i}
              <button
                class="pat-row"
                class:selected={patternSelectedIdx === i}
                role="option"
                aria-selected={patternSelectedIdx === i}
                onclick={() => { patternSelectedIdx = i; openCapture(r); }}
              >
                <span class="pat-sym">{r.symbol.replace('USDT', '')}</span>
                <span class="pat-tf">{r.timeframe.toUpperCase()}</span>
                <span class="pat-slug">{r.patternSlug ? r.patternSlug.replace(/_/g, ' ').slice(0, 14) : ''}</span>
                <span
                  class="pat-verdict"
                  class:pos={r.decision.verdict === 'bullish'}
                  class:neg={r.decision.verdict === 'bearish'}
                >
                  {r.decision.verdict ? r.decision.verdict.slice(0, 4).toUpperCase() : '——'}
                </span>
              </button>
            {/each}
          {/if}
        </div>
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

/* ── Tab bar ── */
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
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--g5, #3d3830);
  cursor: pointer;
  background: transparent;
  border: none;
  font-size: 10px;
  transition: color 0.08s;
}
.expand-btn:hover { color: var(--g7, #9d9690); }

/* ── Tab content ── */
.tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── PAT tab ── */
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
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  box-sizing: border-box;
}
.pat-search:focus { border-color: var(--g6, #5a534c); }

.pat-chips {
  display: flex;
  gap: 4px;
}

.pat-chip {
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  background: transparent;
  color: var(--g5, #3d3830);
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 0.07s, border-color 0.07s, background 0.07s;
}
.pat-chip:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }
.pat-chip.active { color: var(--g9, #eceae8); border-color: var(--g6, #5a534c); background: var(--g2, #131110); }
.pat-chip.chip-pos.active { color: var(--pos, #4ade80); border-color: var(--pos, #4ade80); }
.pat-chip.chip-neg.active { color: var(--neg, #f87171); border-color: var(--neg, #f87171); }

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
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.06s, border-color 0.06s;
}
.pat-row:hover { background: var(--g2, #131110); }
.pat-row.selected {
  background: var(--g2, #131110);
  border-left-color: var(--amb, #f5a623);
}

.pat-sym {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--g9, #eceae8);
  min-width: 40px;
}
.pat-tf {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g5, #3d3830);
  min-width: 24px;
}
.pat-slug {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  color: var(--g4, #272320);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pat-verdict {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g5, #3d3830);
  flex-shrink: 0;
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
</style>
