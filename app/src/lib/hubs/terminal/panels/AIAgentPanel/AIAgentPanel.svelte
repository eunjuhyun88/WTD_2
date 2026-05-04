<script lang="ts">
  import { shellStore, activeRightPanelTab, activeTabState, verdictCount } from '../../shell.store';
  import type { RightPanelTab, TabState } from '../../shell.store';
  import { trackRightpanelTabSwitch, trackTabSwitch, trackDecideDrawerOpen } from '../../telemetry';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import type { TerminalSource } from '$lib/types/terminal';
  import VerdictInboxPanel from '../../peek/VerdictInboxPanel.svelte';
  import JudgePanel from '../../peek/JudgePanel.svelte';
  import DecisionHUDAdapter from '../../workspace/DecisionHUDAdapter.svelte';
  import DecideRightPanel from '../../DecideRightPanel.svelte';
  import DrawerSlide from './DrawerSlide.svelte';
  import PatternTab from './PatternTab.svelte';
  import AskInput from './AskInput.svelte';
  import DirectionBadge from '$lib/shared/panels/DirectionBadge.svelte';
  import SourcePill from '../../workspace/SourcePill.svelte';

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

  // W-0402 PR3 tab order: Decision → Pattern → Verdict → Research → Judge
  // `short` is the 5-char strip label; `label` is the full word (kept for existing tests).
  const TABS: Array<{ id: RightPanelTab; label: string; short: string }> = [
    { id: 'decision',  label: 'Decision',  short: 'DEC' },
    { id: 'pattern',   label: 'Pattern',   short: 'PAT' },
    { id: 'verdict',   label: 'Verdict',   short: 'VER' },
    { id: 'research',  label: 'Research',  short: 'RES' },
    { id: 'judge',     label: 'Judge',     short: 'JDG' },
  ];

  const DRAWER_TITLE: Record<NonNullable<TabState['drawerKind']>, string> = {
    'evidence-grid':   'EVIDENCE',
    'why-panel':       'WHY',
    'pattern-library': 'PATTERN LIBRARY',
    'verdict-card':    'VERDICT DETAIL',
    'research-full':   'RESEARCH',
    'judge-full':      'JUDGE HISTORY',
    'decide-full':     'DECIDE',
  };

  interface Props {
    symbol?: string;
    timeframe?: string;
    /** deeplink: pre-open decide drawer for this verdict id */
    initialDecideId?: string | null;
    /** @deprecated — kept for TerminalHub compat; ChatThread removed in PR3 */
    messages?: unknown[];
    onSend?: unknown;
    onSelectSymbol?: (s: string) => void;
  }
  let { symbol = 'BTCUSDT', timeframe = '4h', initialDecideId = null, onSelectSymbol }: Props = $props();

  // ── 3-state: default (320) / wide (480) / folded (20) ─────────────────────
  // `folded` is internal to the panel; wide derives from shellStore.aiWide.
  let folded = $state(false);
  const wide = $derived($shellStore.aiWide);

  // ── Active tab ─────────────────────────────────────────────────────────────
  const activeTab  = $derived($activeRightPanelTab);
  const expanded   = $derived($activeTabState.rightPanelExpanded ?? false);
  const drawerOpen = $derived($activeTabState.drawerOpen);
  const drawerKind = $derived($activeTabState.drawerKind);

  // ── Pending verdict count (for tab badge) ──────────────────────────────────
  let pendingVerdictCount = $state(0);

  // ── DEC tab — Decision inline ──────────────────────────────────────────────
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

  // Derive direction and confidence from decisionData
  const decDirection = $derived(
    decisionData?.ensemble?.direction ??
    decisionData?.deep?.verdict ??
    'neutral'
  );
  const decConfidence = $derived(
    decisionData?.entryPlan?.confidencePct ?? null
  );
  const decSources = $derived<TerminalSource[]>(
    (decisionData?.sources ?? []).slice(0, 3).map(s => ({
      label:    s.name,
      category: (s.kind === 'market' ? 'Market'
               : s.kind === 'derived' ? 'Derived'
               : s.kind === 'model'   ? 'Model'
               : 'News') as TerminalSource['category'],
      freshness: 'live' as const,
      updatedAt: Date.parse(s.timestamp) || Date.now(),
    }))
  );

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

  // 7-day win/avoid stats derived from captures
  const judge7dStats = $derived.by(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    const recent = judgeCaptures.filter(c => Date.parse(c.createdAt) >= cutoff);
    if (recent.length === 0) return { winRate: null, avoidRate: null, total: 0 };
    const wins   = recent.filter(c => c.decision?.verdict === 'bullish').length;
    const avoids = recent.filter(c => c.decision?.verdict === 'bearish').length;
    return {
      winRate:   Math.round((wins   / recent.length) * 100),
      avoidRate: Math.round((avoids / recent.length) * 100),
      total: recent.length,
    };
  });

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
        body: JSON.stringify({ cmd: 'judge', context: { symbol, timeframe } }),
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
      const decision = {
        verdict,
        note,
        ...(judgeResult
          ? { entry: judgeResult.entry, stop: judgeResult.stop, target: judgeResult.target,
              p_win: judgeResult.p_win, rationale: judgeResult.rationale }
          : {}),
      };
      await fetch('/api/terminal/agent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'save',
          context: { symbol, timeframe, snapshot: judgeResult?.snapshot ?? {}, decision, trigger_origin: 'agent_judge' },
        }),
      });
      judgeLoaded = false;
      await loadJudgeCaptures();
    } catch { /* leave empty */ } finally { judgeSaving = false; }
  }

  $effect(() => {
    if (activeTab === 'judge') {
      if (!judgeLoaded) void loadJudgeCaptures();
      void loadJudgeAnalysis();
    }
  });
  $effect(() => { void symbol; void timeframe; judgeResult = null; judgeCacheKey = ''; });

  // ── Tab switch with telemetry ─────────────────────────────────────────────
  function switchRightPanelTab(tab: RightPanelTab) {
    const prev = activeTab;
    shellStore.setRightPanelTab(tab);
    if (prev !== tab) {
      trackRightpanelTabSwitch(prev, tab);
      trackTabSwitch({ from: prev, to: tab, trigger: 'manual' });
    }
  }

  // ── Drawer helpers ────────────────────────────────────────────────────────
  function openMoreDrawer(kind: TabState['drawerKind']) {
    shellStore.openDrawer(kind);
  }

  function openDecideDrawer(verdictId?: string, trigger: 'jdg_tab_button' | 'deeplink' = 'jdg_tab_button') {
    shellStore.openDrawer('decide-full');
    trackDecideDrawerOpen({ verdict_id: verdictId ?? undefined, trigger });
  }

  /**
   * openDrawer(tab) — stub for PR10 AI Drawer.
   * PR10 will replace this with real slide-out implementation.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openDrawer(_tab: string) {
    // PR10: wire to Drawer slide-out
  }

  // Deeplink: if initialDecideId is provided, switch to judge tab and open decide drawer
  $effect(() => {
    if (initialDecideId) {
      shellStore.setRightPanelTab('judge');
      openDecideDrawer(initialDecideId, 'deeplink');
    }
  });
</script>

<!--
  AIAgentPanel — 3-state shell (W-0402 PR3)
  data-ai-state:  default (320px) | wide (480px) | folded (20px)
-->
<div
  class="agent-panel"
  class:wide
  class:folded
  class:expanded
  data-ai-state={folded ? 'folded' : wide ? 'wide' : 'default'}
>

  {#if folded}
    <!-- ── Folded state: 20px strip with unfold button ── -->
    <button
      class="unfold-strip"
      onclick={() => { folded = false; }}
      title="Expand AI panel"
      aria-label="Expand AI panel"
    >[&lt;]</button>

  {:else}
    <!-- ── Tab strip (40px) ── -->
    <div class="tab-bar">
      {#each TABS as tab}
        {@const badge = tab.id === 'pattern' ? (patternLoaded ? patternRecords.length : 0)
                      : tab.id === 'verdict' ? $verdictCount
                      : 0}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          onclick={() => switchRightPanelTab(tab.id)}
          title={tab.label}
          aria-label={tab.label}
        >{tab.short}{#if badge > 0}<span class="tab-badge">{badge}</span>{/if}</button>
      {/each}
      <button
        class="fold-btn"
        onclick={() => { folded = true; }}
        title="Fold AI panel"
        aria-label="Fold AI panel"
      >&gt;</button>
    </div>

    <!-- ── AI Search (32px sticky) — inert input, PR6 will wire ── -->
    <div class="search-row">
      <input
        type="text"
        class="ai-search"
        placeholder="AI search... (⌘L)"
        readonly
        tabindex="-1"
        aria-label="AI search"
      />
    </div>

    <!-- ── Tab content (scrollable) ── -->
    <div class="tab-content">

      {#if activeTab === 'decision'}
        <!-- DEC: Direction badge + Confidence% + 3 SourcePills + → 더 보기 -->
        <div class="tab-inner" class:wide-pad={wide}>
          <div class="dec-header">
            <DirectionBadge direction={decDirection} confidence={decConfidence} showConfidence size="md" variant="soft" />
            {#if decConfidence != null}
              <span class="conf-pct">{Math.round(decConfidence)}%</span>
            {/if}
          </div>
          {#if decisionLoading}
            <div class="tab-placeholder">Loading…</div>
          {:else if decSources.length > 0}
            <div class="source-pills">
              {#each decSources as src}
                <SourcePill source={src} />
              {/each}
            </div>
          {:else}
            <div class="tab-placeholder">—</div>
          {/if}
          <div class="more-row">
            <button class="more-link" onclick={() => openDrawer('decision')}>→ 더 보기</button>
          </div>
        </div>

      {:else if activeTab === 'pattern'}
        <!-- PAT: 5 matching capture cards + library link -->
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
        <!-- VER: 10 latest verdicts -->
        <div class="tab-inner" class:wide-pad={wide}>
          <div class="tab-scroll">
            <VerdictInboxPanel
              onVerdictSubmit={(captureId, _verdict) => shellStore.selectVerdict(captureId)}
              onPendingCountChange={(n) => { pendingVerdictCount = n; }}
            />
          </div>
          <div class="more-row">
            <button class="more-link" onclick={() => openMoreDrawer('verdict-card')}>VIEW →</button>
          </div>
        </div>

      {:else if activeTab === 'research'}
        <!-- RES: query input + last-analysis 3-line summary (placeholder for PR6) -->
        <div class="tab-inner" class:wide-pad={wide}>
          <div class="res-query-row">
            <input type="text" class="res-input" placeholder="Search or ask…" />
          </div>
          <div class="res-summary">
            <div class="res-summary-line">마지막 분석: 데이터 없음</div>
            <div class="res-summary-line res-muted">—</div>
            <div class="res-summary-line res-muted">—</div>
          </div>
          <div class="more-row">
            <button class="more-link" onclick={() => openMoreDrawer('research-full')}>Full →</button>
          </div>
        </div>

      {:else if activeTab === 'judge'}
        <!-- JDG: WinRate / AvoidRate (7d) summary cards + full history -->
        <div class="tab-inner" class:wide-pad={wide}>
          <div class="judge-stats">
            <div class="stat-card">
              <span class="stat-label">Win Rate (7d)</span>
              <span class="stat-value {judge7dStats.winRate != null && judge7dStats.winRate >= 50 ? 'pos' : 'neg'}">
                {judge7dStats.winRate != null ? `${judge7dStats.winRate}%` : '—'}
              </span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Avoid Rate (7d)</span>
              <span class="stat-value">
                {judge7dStats.avoidRate != null ? `${judge7dStats.avoidRate}%` : '—'}
              </span>
            </div>
          </div>
          <div class="tab-scroll">
            <JudgePanel
              {symbol}
              {timeframe}
              verdict={judgeResult ? { direction: judgeResult.verdict as 'bullish' | 'bearish' | 'neutral' } : null}
              entry={judgeResult?.entry ?? null}
              stop={judgeResult?.stop ?? null}
              target={judgeResult?.target ?? null}
              pWin={judgeResult?.p_win ?? null}
              captures={judgeCaptures}
              saving={judgeSaving || judgeLoading}
              onSaveJudgment={handleSaveJudgment}
              onOpenCapture={openCapture}
            />
          </div>
          <div class="more-row">
            <button class="more-link" onclick={() => openMoreDrawer('judge-full')}>History →</button>
            <button class="more-link decide" onclick={() => openDecideDrawer(undefined, 'jdg_tab_button')}>Decide →</button>
          </div>
        </div>

      {/if}
    </div>
  {/if}
</div>

<!-- ── Drawer (PR10 will extend) ── -->
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
    <div class="drawer-placeholder">
      <span>Research Full</span>
      <p>Full research panel coming in PR6.</p>
    </div>
  {:else if drawerKind === 'judge-full'}
    <JudgePanel
      {symbol}
      {timeframe}
      verdict={judgeResult ? { direction: judgeResult.verdict as 'bullish' | 'bearish' | 'neutral' } : null}
      entry={judgeResult?.entry ?? null}
      stop={judgeResult?.stop ?? null}
      target={judgeResult?.target ?? null}
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
  {:else if drawerKind === 'decide-full'}
    <DecideRightPanel />
  {/if}
</DrawerSlide>

<style>
/* ── Root panel ── */
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--g1, #0c0a09);
  overflow: hidden;
}

/* ── Folded state: 20px vertical strip ── */
.agent-panel.folded {
  width: 20px;
  min-width: 20px;
}

.unfold-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--g5, #3d3830);
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: var(--sp-2, 8px) 0;
  transition: color 0.08s;
}
.unfold-strip:hover { color: var(--g7, #9d9690); }

/* ── Tab strip (40px) ── */
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 40px;
  border-bottom: 1px solid var(--g4, #272320);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  height: 100%;
  padding: 0 var(--sp-1, 4px);
  border: none;
  border-bottom: 2px solid transparent;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--g5, #3d3830);
  cursor: pointer;
  background: transparent;
  transition: color 0.08s, border-color 0.08s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1, 4px);
}
.tab-btn:hover { color: var(--g7, #9d9690); }
.tab-btn.active {
  color: var(--g9, #eceae8);
  border-bottom-color: var(--accent-amb, var(--amb, #f5a623));
}

.tab-badge {
  display: inline-block;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  padding: 0 2px;
  background: var(--accent-amb, var(--amb, #f5a623));
  color: var(--g0, #080706);
  border-radius: 7px;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-align: center;
  vertical-align: middle;
}

.fold-btn {
  width: 28px;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--g5, #3d3830);
  cursor: pointer;
  background: transparent;
  border: none;
  border-left: 1px solid var(--g4, #272320);
  font-size: var(--ui-text-xs);
  font-family: 'JetBrains Mono', monospace;
  transition: color 0.08s;
}
.fold-btn:hover { color: var(--g7, #9d9690); }

/* ── Search row (32px sticky) ── */
.search-row {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 var(--sp-2, 8px);
  border-bottom: 1px solid var(--g4, #272320);
}

.ai-search {
  width: 100%;
  height: 22px;
  background: var(--g2, #110f0d);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g6, #6e6860);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  padding: 0 var(--sp-2, 8px);
  cursor: default;
  outline: none;
}
.ai-search::placeholder { color: var(--g5, #3d3830); }

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
  padding: var(--sp-3, 12px);
  gap: var(--sp-2, 8px);
}

/* Wide mode: more breathing room */
.tab-inner.wide-pad {
  padding: var(--sp-4, 16px);
  gap: var(--sp-3, 12px);
}

.tab-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ── DEC tab ── */
.dec-header {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
  flex-shrink: 0;
}

.conf-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: var(--g7, #9d9690);
}

.source-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1, 4px);
  flex-shrink: 0;
}

/* ── RES tab ── */
.res-query-row {
  flex-shrink: 0;
}

.res-input {
  width: 100%;
  height: 24px;
  background: var(--g2, #110f0d);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g7, #9d9690);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  padding: 0 var(--sp-2, 8px);
  outline: none;
  box-sizing: border-box;
}
.res-input::placeholder { color: var(--g5, #3d3830); }
.res-input:focus { border-color: var(--g5, #3d3830); }

.res-summary {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1, 4px);
  flex-shrink: 0;
}

.res-summary-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  color: var(--g7, #9d9690);
  line-height: 1.5;
}

.res-muted { color: var(--g5, #3d3830); }

/* ── JDG tab stats ── */
.judge-stats {
  display: flex;
  gap: var(--sp-2, 8px);
  flex-shrink: 0;
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2, 8px);
  background: var(--g2, #110f0d);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
}

.stat-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--g5, #3d3830);
  text-transform: uppercase;
}

.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: var(--g7, #9d9690);
}

.stat-value.pos { color: #4caf50; }
.stat-value.neg { color: var(--g7, #9d9690); }

/* ── More / action row ── */
.more-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-1, 4px);
  padding-top: var(--sp-1, 4px);
  border-top: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}

.more-link {
  padding: 3px var(--sp-2, 8px);
  background: transparent;
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g5, #3d3830);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  cursor: pointer;
  transition: color 0.07s, border-color 0.07s;
}
.more-link:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }

.more-link.decide {
  border-color: var(--accent-amb, var(--amb, #f5a623));
  color: var(--accent-amb, var(--amb, #f5a623));
}
.more-link.decide:hover {
  background: color-mix(in srgb, var(--accent-amb, var(--amb, #f5a623)) 12%, transparent);
}

/* ── Tab placeholder ── */
.tab-placeholder {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  color: var(--g5, #3d3830);
  padding: var(--sp-2, 8px) 0;
}

/* ── Drawer placeholder ── */
.drawer-placeholder {
  padding: var(--sp-5, 24px) var(--sp-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2, 8px);
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
