<script lang="ts">
  import { onMount } from 'svelte';
  import { shellStore, activeRightPanelTab, activeTabState, verdictCount } from '../../shell.store';
  import type { RightPanelTab, TabState } from '../../shell.store';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import { selectedRange } from '$lib/stores/chartSaveMode';
  import AIPanel from './AIPanel.svelte';
  import VerdictInboxPanel from '../../peek/VerdictInboxPanel.svelte';
  import JudgePanel from '../../peek/JudgePanel.svelte';
  import DecisionHUDAdapter from '../../workspace/DecisionHUDAdapter.svelte';
  import DrawerSlide from './DrawerSlide.svelte';
  import PatternTab from './PatternTab.svelte';
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

  // Quant workflow order: Research → Pattern → Verdict → Decision → Judge
  const TABS: Array<{ id: RightPanelTab; label: string }> = [
    { id: 'research',  label: 'Research'  },
    { id: 'pattern',   label: 'Pattern'   },
    { id: 'verdict',   label: 'Verdict'   },
    { id: 'decision',  label: 'Decision'  },
    { id: 'judge',     label: 'Judge'     },
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

  $effect(() => { if (activeTab === 'pattern') void loadPatterns(); });

  // ── JDG tab ───────────────────────────────────────────────────────────────
  interface JudgeResult {
    verdict: string;
    entry: number | null;
    stop: number | null;
    target: number | null;
    p_win: number | null;
    rationale: string;
    snapshot: Record<string, number>;
  }

  let judgeCaptures    = $state<PatternCaptureRecord[]>([]);
  let judgeSaving      = $state(false);
  let judgeLoaded      = $state(false);
  let judgeResult      = $state<JudgeResult | null>(null);
  let judgeLoading     = $state(false);
  let judgeCacheKey    = $state('');

  // W-0392 Phase 3: Extract entry/stop/target from selected range for prefill
  function extractPricesFromSelectedRange(range: any): { entry: number | null; stop: number | null; target: number | null } {
    if (!range?.payload?.klines) return { entry: null, stop: null, target: null };

    const klines = range.payload.klines.filter((k: any) =>
      k.time >= Math.min(range.anchorA, range.anchorB) &&
      k.time <= Math.max(range.anchorA, range.anchorB)
    );

    if (klines.length === 0) return { entry: null, stop: null, target: null };

    const entry = klines[0]?.close ?? null;
    const stops = klines.map((k: any) => k.low).filter((v: any) => v != null);
    const targets = klines.map((k: any) => k.high).filter((v: any) => v != null);

    const stop = stops.length > 0 ? Math.min(...stops) : null;
    const target = targets.length > 0 ? Math.max(...targets) : null;

    return { entry, stop, target };
  }

  async function loadJudgeCaptures() {
    try {
      const res = await fetch('/api/captures?limit=30');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      judgeCaptures = (data.captures ?? []).map(capToPatternRecord);
      judgeLoaded = true;
    } catch { /* leave empty */ }
  }

  async function loadJudgeAnalysis() {
    const key = `${symbol}:${timeframe}`;
    if (judgeLoading || judgeCacheKey === key) return;
    judgeLoading = true;
    try {
      const res = await fetch('/api/terminal/agent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'judge',
          context: { symbol, timeframe },
        }),
      });
      if (res.ok) {
        const data = await res.json() as JudgeResult & { cmd: string };
        judgeResult = { ...data, snapshot: {} };
        judgeCacheKey = key;
      }
    } catch { /* leave null */ } finally { judgeLoading = false; }
  }

  async function handleSaveJudgment({ verdict, note }: { verdict: string; note: string }) {
    judgeSaving = true;
    try {
      // W-0392 Ph3: Include displayed prices (from judgeResult or selectedRange) in save
      const decision = {
        verdict,
        note,
        entry: displayedJudgePrices.entry,
        stop: displayedJudgePrices.stop,
        target: displayedJudgePrices.target,
        ...(judgeResult
          ? {
              p_win: judgeResult.p_win,
              rationale: judgeResult.rationale,
            }
          : {}),
      };
      await fetch('/api/terminal/agent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'save',
          context: {
            symbol,
            timeframe,
            snapshot: judgeResult?.snapshot ?? {},
            decision,
            trigger_origin: 'agent_judge',
          },
        }),
      });
      judgeLoaded = false;
      await loadJudgeCaptures();
    } catch { /* leave empty */ } finally { judgeSaving = false; }
  }

  // W-0392 Phase 3: Derive displayed prices from judge result or selected range
  const displayedJudgePrices = $derived.by(() => {
    if (judgeResult) {
      return {
        entry: judgeResult.entry,
        stop: judgeResult.stop,
        target: judgeResult.target,
      };
    }
    const range = $selectedRange;
    if (range) return extractPricesFromSelectedRange(range);
    return { entry: null, stop: null, target: null };
  });

  $effect(() => {
    if (activeTab === 'judge') {
      if (!judgeLoaded) void loadJudgeCaptures();
      void loadJudgeAnalysis();
    }
  });

  $effect(() => { void symbol; void timeframe; judgeResult = null; judgeCacheKey = ''; });

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
      {@const badge = tab.id === 'pattern' ? (patternLoaded ? patternRecords.length : 0)
                    : tab.id === 'verdict' ? $verdictCount
                    : 0}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        onclick={() => shellStore.setRightPanelTab(tab.id)}
      >{tab.label}{#if badge > 0}<span class="tab-badge">{badge}</span>{/if}</button>
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
      <PatternTab
        records={patternRecords}
        loading={patternLoading}
        loaded={patternLoaded}
        filter={patternFilter}
        verdictFilter={patternVerdictFilter}
        selectedIdx={patternSelectedIdx}
        onFilterChange={(v) => { patternFilter = v; patternSelectedIdx = -1; }}
        onVerdictFilterChange={(v) => { patternVerdictFilter = v; patternSelectedIdx = -1; }}
        onSelectCapture={(r, idx) => { patternSelectedIdx = idx; openCapture(r); }}
        onOpenLibrary={() => openMoreDrawer('pattern-library')}
      />

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
            verdict={judgeResult ? { direction: judgeResult.verdict as 'bullish' | 'bearish' | 'neutral' } : null}
            entry={displayedJudgePrices.entry}
            stop={displayedJudgePrices.stop}
            target={displayedJudgePrices.target}
            pWin={judgeResult?.p_win ?? null}
            captures={judgeCaptures}
            saving={judgeSaving || judgeLoading}
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
      verdict={judgeResult ? { direction: judgeResult.verdict as 'bullish' | 'bearish' | 'neutral' } : null}
      entry={displayedJudgePrices.entry}
      stop={displayedJudgePrices.stop}
      target={displayedJudgePrices.target}
      pWin={judgeResult?.p_win ?? null}
      captures={judgeCaptures}
      saving={judgeSaving || judgeLoading}
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
  font-size: var(--ui-text-xs);
  font-weight: 600;
  letter-spacing: 0.03em;
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

.tab-badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 3px;
  margin-left: 3px;
  background: var(--amb, #f5a623);
  color: var(--g0, #080706);
  border-radius: 8px;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-align: center;
  vertical-align: middle;
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
  font-size: var(--ui-text-xs);
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
  font-size: var(--ui-text-xs);
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
  font-size: var(--ui-text-xs);
  cursor: pointer;
  transition: color 0.07s, border-color 0.07s;
}
.more-btn button:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }

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
  font-size: var(--ui-text-xs);
  color: var(--g5, #3d3830);
  line-height: 1.5;
  margin: 0;
}
</style>
