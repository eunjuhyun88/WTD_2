<script lang="ts">
  import { onMount } from 'svelte';
  import { shellStore, activeRightPanelTab, activeTabState } from '../../shell.store';
  import type { RightPanelTab, TabState } from '../../shell.store';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import AIPanel from './AIPanel.svelte';
  import VerdictInboxPanel from '../../peek/VerdictInboxPanel.svelte';
  import JudgePanel from '../../peek/JudgePanel.svelte';
  import DecisionHUDAdapter from '../../workspace/DecisionHUDAdapter.svelte';
  import DrawerSlide from './DrawerSlide.svelte';
  import { routeQuery } from '../../aiQueryRouter';

  // ── Types ─────────────────────────────────────────────────────────────────
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

  const TABS: Array<{ id: RightPanelTab; label: string }> = [
    { id: 'decision', label: 'DEC' },
    { id: 'pattern',  label: 'PAT' },
    { id: 'verdict',  label: 'VER' },
    { id: 'research', label: 'RES' },
    { id: 'judge',    label: 'JDG' },
  ];

  const DRAWER_TITLE: Record<NonNullable<TabState['drawerKind']>, string> = {
    'evidence-grid':   'EVIDENCE',
    'why-panel':       'WHY',
    'pattern-library': 'PATTERN LIBRARY',
    'verdict-card':    'VERDICT DETAIL',
    'research-full':   'RESEARCH',
    'judge-full':      'JUDGE HISTORY',
  };

  interface Message { role: 'user' | 'assistant'; text: string; }
  interface Props {
    messages?: Message[];
    onSend?: (text: string, msgs: Message[]) => void;
    onSelectSymbol?: (s: string) => void;
    symbol?: string;
    timeframe?: string;
  }
  let { messages = [], onSend, onSelectSymbol, symbol = 'BTCUSDT', timeframe = '4h' }: Props = $props();

  const activeTab  = $derived($activeRightPanelTab);
  const expanded   = $derived($activeTabState.rightPanelExpanded ?? false);
  const drawerOpen = $derived($activeTabState.drawerOpen);
  const drawerKind = $derived($activeTabState.drawerKind);

  // ── AI Search ─────────────────────────────────────────────────────────────
  let searchQuery = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);

  function handleSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submitSearch();
  }

  function submitSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    const action = routeQuery(q);
    if (action) {
      if (action.type === 'set-tab') {
        shellStore.setRightPanelTab(action.tab);
      } else if (action.type === 'toggle-drawing') {
        shellStore.setDrawingTool('trendLine');
      } else if (action.type === 'analyze') {
        shellStore.setRightPanelTab('research');
      } else if (action.type === 'pattern-recall') {
        shellStore.setRightPanelTab('pattern');
      } else if (action.type === 'open-whale-data') {
        shellStore.setRightPanelTab('verdict');
      } else {
        window.dispatchEvent(new CustomEvent('cogochi:ai-query', { detail: action }));
      }
    }
    searchQuery = '';
  }

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'l') {
        e.preventDefault();
        searchEl?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ── DEC tab — auto-refresh on tab switch or symbol change ─────────────────
  let decisionData = $state<AnalyzeEnvelope | null>(null);
  let decisionLoading = $state(false);
  let decisionCacheKey = $state('');

  async function loadDecision() {
    const key = `${symbol}:${timeframe}`;
    if (decisionLoading || decisionCacheKey === key) return;
    decisionLoading = true;
    try {
      const res = await fetch(`/api/cogochi/analyze?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`);
      if (res.ok) { decisionData = await res.json() as AnalyzeEnvelope; decisionCacheKey = key; }
    } catch { /* leave null */ } finally { decisionLoading = false; }
  }

  $effect(() => { if (activeTab === 'decision') void loadDecision(); });
  $effect(() => { void symbol; void timeframe; decisionData = null; decisionCacheKey = ''; });

  // ── PAT tab ───────────────────────────────────────────────────────────────
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

  let patternRecords       = $state<PatternCaptureRecord[]>([]);
  let patternLoading       = $state(false);
  let patternLoaded        = $state(false);
  let patternFilter        = $state('');
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

  // ── Expand + Drawer ───────────────────────────────────────────────────────
  function toggleExpand() {
    shellStore.updateTabState(s => ({ ...s, rightPanelExpanded: !s.rightPanelExpanded }));
  }

  function openMoreDrawer(kind: TabState['drawerKind']) {
    shellStore.openDrawer(kind);
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

  <!-- ── AI Search ── -->
  <div class="ai-search-bar">
    <input
      class="ai-search-input"
      placeholder="AI search… (⌘L)"
      bind:value={searchQuery}
      bind:this={searchEl}
      onkeydown={handleSearchKey}
    />
  </div>

  <!-- ── Tab content ── -->
  <div class="tab-content">

    {#if activeTab === 'decision'}
      <div class="tab-inner">
        <div class="tab-scroll">
          <DecisionHUDAdapter analysisData={decisionData} isLoading={decisionLoading} />
        </div>
        <div class="more-btn">
          <button onclick={() => openMoreDrawer('evidence-grid')}>Evidence →</button>
        </div>
      </div>

    {:else if activeTab === 'pattern'}
      <div class="tab-inner">
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
            <div class="pat-skeleton-list" aria-hidden="true">
              {#each [80, 60, 72] as w}
                <div class="pat-skel-row">
                  <span class="skel-block" style="width:{w}px"></span>
                  <span class="skel-block" style="width:28px"></span>
                  <span class="skel-block" style="width:52px"></span>
                  <span class="skel-block" style="width:32px"></span>
                </div>
              {/each}
            </div>
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
        <div class="more-btn">
          <button onclick={() => openMoreDrawer('pattern-library')}>Library →</button>
        </div>
      </div>

    {:else if activeTab === 'verdict'}
      <div class="tab-inner">
        <div class="tab-scroll">
          <VerdictInboxPanel
            onVerdictSubmit={(captureId, _verdict) => shellStore.selectVerdict(captureId)}
          />
        </div>
        <div class="more-btn">
          <button onclick={() => openMoreDrawer('verdict-card')}>Detail →</button>
        </div>
      </div>

    {:else if activeTab === 'research'}
      <div class="tab-inner">
        <div class="tab-scroll">
          <AIPanel
            {messages}
            onSend={onSend}
            {symbol}
            {timeframe}
            onSelectSymbol={onSelectSymbol}
            onClose={() => {}}
          />
        </div>
        <div class="more-btn">
          <button onclick={() => openMoreDrawer('research-full')}>Full →</button>
        </div>
      </div>

    {:else if activeTab === 'judge'}
      <div class="tab-inner">
        <div class="tab-scroll">
          <JudgePanel
            {symbol}
            {timeframe}
            captures={judgeCaptures}
            saving={judgeSaving}
            onSaveJudgment={handleSaveJudgment}
            onOpenCapture={openCapture}
          />
        </div>
        <div class="more-btn">
          <button onclick={() => openMoreDrawer('judge-full')}>History →</button>
        </div>
      </div>

    {/if}
  </div>
</div>

<!-- ── Drawer ── -->
<DrawerSlide
  open={drawerOpen}
  title={drawerKind ? DRAWER_TITLE[drawerKind] : ''}
  onClose={() => shellStore.closeDrawer()}
>
  {#if drawerKind === 'evidence-grid'}
    <DecisionHUDAdapter />
  {:else if drawerKind === 'pattern-library'}
    <div class="drawer-placeholder">
      <span>Pattern Library</span>
      <p>Select a pattern from the PAT tab to view details here.</p>
    </div>
  {:else if drawerKind === 'verdict-card'}
    <div class="drawer-placeholder">
      <span>Verdict Detail</span>
      <p>Select a verdict from the VER tab to view full details here.</p>
    </div>
  {:else if drawerKind === 'research-full'}
    <AIPanel
      {messages}
      onSend={onSend}
      {symbol}
      {timeframe}
      onSelectSymbol={onSelectSymbol}
      onClose={() => shellStore.closeDrawer()}
    />
  {:else if drawerKind === 'judge-full'}
    <JudgePanel
      {symbol}
      {timeframe}
      captures={judgeCaptures}
      saving={judgeSaving}
      onSaveJudgment={handleSaveJudgment}
      onOpenCapture={openCapture}
    />
  {:else if drawerKind === 'why-panel'}
    <div class="drawer-placeholder">
      <span>Why Panel</span>
      <p>Reasoning breakdown coming soon.</p>
    </div>
  {/if}
</DrawerSlide>

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

/* ── AI Search ── */
.ai-search-bar {
  padding: 5px 8px;
  border-bottom: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}
.ai-search-input {
  width: 100%;
  background: var(--g2, #131110);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g8, #cec9c4);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 4px 8px;
  outline: none;
  box-sizing: border-box;
}
.ai-search-input:focus { border-color: var(--amb, #f5a623); }

/* ── Tab content ── */
.tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tab-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ── More button ── */
.more-btn {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 10px;
  border-top: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}
.more-btn button {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g5, #3d3830);
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  cursor: pointer;
  transition: color 0.07s, border-color 0.07s;
}
.more-btn button:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }

/* ── PAT tab ── */
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
.pat-chips { display: flex; gap: 4px; }
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
.pat-row.selected { background: var(--g2, #131110); border-left-color: var(--amb, #f5a623); }
.pat-sym { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: var(--g9, #eceae8); min-width: 40px; }
.pat-tf { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--g5, #3d3830); min-width: 24px; }
.pat-slug { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g4, #272320); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pat-verdict { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--g5, #3d3830); flex-shrink: 0; }
.pat-verdict.pos { color: var(--pos, #4ade80); }
.pat-verdict.neg { color: var(--neg, #f87171); }
.pat-empty { display: block; padding: 20px 12px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--g4, #272320); text-align: center; }

/* ── Pattern skeleton ── */
.pat-skeleton-list { display: flex; flex-direction: column; gap: 1px; padding: 4px 0; }
.pat-skel-row {
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 10px;
  border-left: 2px solid var(--g3, #1e1c1a);
}
.skel-block {
  height: 8px; border-radius: 3px;
  background: linear-gradient(90deg, var(--g2, #131110) 25%, var(--g3, #1e1c1a) 50%, var(--g2, #131110) 75%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.4s ease-in-out infinite;
}
@keyframes skel-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Drawer placeholder ── */
.drawer-placeholder {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-placeholder span {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--g7, #9d9690);
}
.drawer-placeholder p {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--g5, #3d3830);
  line-height: 1.5;
  margin: 0;
}
</style>
