<script lang="ts">
  import { shellStore, activeRightPanelTab, activeTabState, verdictCount } from '../../shell.store';
  import type { RightPanelTab, TabState } from '../../shell.store';
  import { pendingQuery } from '$lib/hubs/cogochi/panelRouter';
  import { trackRightpanelTabSwitch, trackTabSwitch, trackDecideDrawerOpen } from '../../telemetry';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import type { TerminalSource } from '$lib/types/terminal';
  import VerdictInboxPanel from '../../peek/VerdictInboxPanel.svelte';
  import JudgePanel from '../../peek/JudgePanel.svelte';
  import DecisionHUDAdapter from '../../workspace/DecisionHUDAdapter.svelte';
  import DecideRightPanel from '../../DecideRightPanel.svelte';
  import DrawerSlide from './DrawerSlide.svelte';
  import AIDrawer from './AIDrawer.svelte';
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

  // W-0402 PR3 tab order + W-T6: + Scan
  // `short` is the 5-char strip label; `label` is the full word (kept for existing tests).
  const TABS: Array<{ id: RightPanelTab; label: string; short: string }> = [
    { id: 'decision',  label: 'Decision',  short: 'DEC' },
    { id: 'pattern',   label: 'Pattern',   short: 'PAT' },
    { id: 'verdict',   label: 'Verdict',   short: 'VER' },
    { id: 'research',  label: 'Research',  short: 'RES' },
    { id: 'judge',     label: 'Judge',     short: 'JDG' },
    { id: 'scan',      label: 'Scan',      short: 'SCN' },
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

  // ── W-T6: NL intent router ───────────────────────────────────────────────
  const SYMBOL_RE = /\b([A-Z]{2,10})(?:USDT)?\b/i;
  const TF_RE = /\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|1w)\b/i;
  const PANE_MAP: Record<string, string> = {
    fr: 'funding', '펀딩': 'funding', funding: 'funding',
    oi: 'oi', rsi: 'rsi', macd: 'macd', cvd: 'cvd', liq: 'liq',
  };
  const SECTOR_MAP: Record<string, string> = {
    '밈': 'meme', meme: 'meme', '밈코인': 'meme',
    defi: 'defi', ai: 'ai', '게임': 'gaming', gaming: 'gaming',
    layer1: 'layer1', l1: 'layer1', rwa: 'rwa',
  };

  function parseIntent(text: string): void {
    const lower = text.toLowerCase().trim();
    if (!lower) return;

    // Scan intent: "밈코인 강세", "scan meme", "스캔"
    for (const [kw, sector] of Object.entries(SECTOR_MAP)) {
      if (lower.includes(kw)) {
        switchRightPanelTab('scan');
        scanSector = sector;
        void loadScanResults();
        return;
      }
    }
    if (/스캔|scan/.test(lower)) {
      switchRightPanelTab('scan');
      void loadScanResults();
      return;
    }

    // add_pane: "FR 추가", "RSI 추가"
    if (/추가|add/.test(lower)) {
      for (const [kw, paneKey] of Object.entries(PANE_MAP)) {
        if (lower.includes(kw)) {
          shellStore.updateTabState((s) => {
            const exists = s.panes.some((p) => p.kind === paneKey);
            if (exists) return s;
            return { ...s, panes: [...s.panes, { kind: paneKey as 'funding', visible: true }] };
          });
          return;
        }
      }
    }

    // remove_pane: "RSI 빼", "FR 제거"
    if (/빼|제거|remove|delete/.test(lower)) {
      for (const [kw, paneKey] of Object.entries(PANE_MAP)) {
        if (lower.includes(kw)) {
          shellStore.updateTabState((s) => ({
            ...s,
            panes: s.panes.filter((p) => p.kind !== paneKey),
          }));
          return;
        }
      }
    }

    // change_symbol_tf or new_tab
    const symMatch = SYMBOL_RE.exec(text.toUpperCase());
    const tfMatch = TF_RE.exec(lower);
    if (symMatch) {
      const sym = symMatch[1].toUpperCase() + (symMatch[1].endsWith('USDT') ? '' : 'USDT');
      const tf = tfMatch?.[1] ?? undefined;
      if (/새\s*탭|new\s*tab/.test(lower)) {
        shellStore.openTab({ kind: 'trade', title: sym, symbol: sym });
      } else {
        shellStore.setSymbol(sym);
        if (tf) shellStore.setTimeframe(tf);
      }
      return;
    }

    // decide
    if (/진입|결정|decide/.test(lower)) {
      switchRightPanelTab('judge');
      return;
    }

    // Fallback: route to research
    resQueryValue = text;
    switchRightPanelTab('research');
  }

  let aiSearchValue = $state('');

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      parseIntent(aiSearchValue);
      aiSearchValue = '';
    }
    if (e.key === 'Escape') {
      aiSearchValue = '';
      (e.target as HTMLElement)?.blur();
    }
  }

  // ── SCN tab — Scan mode ─────────────────────────────────────────────────
  const SCAN_SECTORS = ['All', 'Layer1', 'DeFi', 'Meme', 'AI', 'Gaming', 'RWA'];
  let scanSector = $state('All');
  let scanResults = $state<Array<{ symbol: string; score: number; change24h?: number }>>([]);
  let scanLoading = $state(false);

  async function loadScanResults() {
    if (scanLoading) return;
    scanLoading = true;
    try {
      const params = new URLSearchParams({ universe: 'all' });
      if (scanSector && scanSector !== 'All') params.set('sector', scanSector.toLowerCase());
      const res = await fetch(`/api/cogochi/alpha/scan?${params}`);
      if (!res.ok) return;
      const d = await res.json() as { scores?: Array<{ symbol: string; score: number; change24h?: number }> };
      scanResults = (d.scores ?? []).slice(0, 20);
    } catch { /* silent */ } finally { scanLoading = false; }
  }

  $effect(() => {
    if (activeTab === 'scan') void loadScanResults();
  });

  // ── RES tab — query input value ───────────────────────────────────────────
  let resQueryValue = $state('');

  // ── PR7: consume pendingQuery from panelRouter ────────────────────────────
  $effect(() => {
    const pq = $pendingQuery;
    if (!pq) return;

    switch (pq.tab) {
      case 'research':
        resQueryValue = pq.query;
        break;
      case 'pattern':
        if (pq.query) { patternFilter = pq.query; patternSelectedIdx = -1; }
        void loadPatterns();
        break;
      case 'decision':
        // Reset cache to force reload with current symbol context
        decisionData = null;
        decisionCacheKey = '';
        void loadDecision();
        break;
      case 'judge':
        judgeResult = null;
        judgeCacheKey = '';
        void loadJudgeAnalysis();
        break;
      case 'verdict':
        // VerdictInboxPanel loads its own data reactively; switching tab is sufficient
        break;
    }

    // Consume: clear after handling so panels don't re-react on re-render
    pendingQuery.set(null);
  });

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

  // ── AI Drawer (PR10) — L3 drill-down slide-out ──────────────────────────
  let aiDrawerOpen = $state(false);
  let aiDrawerTab  = $state<string | null>(null);

  function openDrawer(tab: string) {
    aiDrawerTab  = tab;
    aiDrawerOpen = true;
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

    <!-- ── AI Search (32px sticky) — W-T6: NL intent router ── -->
    <div class="search-row">
      <input
        type="text"
        class="ai-search"
        placeholder='"ETH 보여줘" / "FR 추가" / "밈코인 강세"'
        bind:value={aiSearchValue}
        onkeydown={handleSearchKeydown}
        aria-label="AI natural language command"
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
        <div class="tab-inner tab-inner--stretch" class:wide-pad={wide}>
          <div class="tab-scroll">
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
          </div>
          <div class="more-row">
            <button class="more-link" onclick={() => openDrawer('pattern')}>Details →</button>
          </div>
        </div>

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
            <button class="more-link" onclick={() => openDrawer('verdict')}>Details →</button>
            <button class="more-link" onclick={() => openMoreDrawer('verdict-card')}>VIEW →</button>
          </div>
        </div>

      {:else if activeTab === 'research'}
        <!-- RES: query input + last-analysis 3-line summary (placeholder for PR6) -->
        <div class="tab-inner" class:wide-pad={wide}>
          <div class="res-query-row">
            <input type="text" class="res-input" placeholder="Search or ask…" bind:value={resQueryValue} />
          </div>
          <div class="res-summary">
            <div class="res-summary-line">마지막 분석: 데이터 없음</div>
            <div class="res-summary-line res-muted">—</div>
            <div class="res-summary-line res-muted">—</div>
          </div>
          <div class="more-row">
            <button class="more-link" onclick={() => openDrawer('research')}>Details →</button>
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
            <button class="more-link" onclick={() => openDrawer('judge')}>Details →</button>
            <button class="more-link" onclick={() => openMoreDrawer('judge-full')}>History →</button>
            <button class="more-link decide" onclick={() => openDecideDrawer(undefined, 'jdg_tab_button')}>Decide →</button>
          </div>
        </div>

      {:else if activeTab === 'scan'}
        <!-- SCN: sector chip strip + alpha score results -->
        <div class="tab-inner tab-inner--stretch" class:wide-pad={wide}>
          <div class="scan-sectors">
            {#each SCAN_SECTORS as sector}
              <button
                class="sector-chip"
                class:sector-chip--active={scanSector === sector}
                onclick={() => { scanSector = sector; void loadScanResults(); }}
              >{sector}</button>
            {/each}
          </div>
          <div class="tab-scroll scan-results">
            {#if scanLoading}
              <div class="tab-placeholder">Scanning…</div>
            {:else if scanResults.length === 0}
              <div class="tab-placeholder">No results</div>
            {:else}
              {#each scanResults as row (row.symbol)}
                <button
                  type="button"
                  class="scan-row"
                  onclick={() => shellStore.setSymbol(row.symbol)}
                >
                  <span class="scan-sym">{row.symbol.replace('USDT', '')}</span>
                  <span class="scan-bar-wrap">
                    <span class="scan-bar" style="width: {Math.round(row.score * 100)}%"></span>
                  </span>
                  <span class="scan-score">{Math.round(row.score * 100)}</span>
                  {#if row.change24h != null}
                    <span class="scan-chg" class:pos={row.change24h >= 0} class:neg={row.change24h < 0}>
                      {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(1)}%
                    </span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>

      {/if}
    </div>
  {/if}
</div>

<!-- ── AI Drawer (PR10) — L3 tab drill-down ── -->
<AIDrawer
  open={aiDrawerOpen}
  tab={aiDrawerTab}
  onClose={() => { aiDrawerOpen = false; }}
/>

<!-- ── Drawer (existing kind-based drawers) ── -->
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
  color: var(--g7, #9d9690);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  padding: 0 var(--sp-2, 8px);
  outline: none;
  cursor: text;
  box-sizing: border-box;
}
.ai-search::placeholder { color: var(--g4, #272320); }
.ai-search:focus { border-color: var(--g5, #3d3830); }

/* ── SCN tab ── */
.scan-sectors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}

.sector-chip {
  padding: 2px 7px;
  background: transparent;
  border: 1px solid var(--g3, #1c1918);
  border-radius: 3px;
  color: var(--g5, #3d3830);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  cursor: pointer;
  transition: border-color 0.08s, color 0.08s;
}
.sector-chip:hover { border-color: var(--g5, #3d3830); color: var(--g7, #9d9690); }
.sector-chip--active { border-color: var(--brand, #4a9eff); color: var(--brand, #4a9eff); }

.scan-results { display: flex; flex-direction: column; }

.scan-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-bottom: 0.5px solid var(--g2, #110f0d);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  color: var(--g7, #9d9690);
  cursor: pointer;
  text-align: left;
  transition: background 0.08s;
}
.scan-row:hover { background: var(--g2, #110f0d); }

.scan-sym {
  width: 44px;
  font-weight: 700;
  color: var(--g8, #ccc9c5);
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.scan-bar-wrap {
  flex: 1;
  height: 4px;
  background: var(--g2, #110f0d);
  border-radius: 2px;
  overflow: hidden;
}

.scan-bar {
  display: block;
  height: 100%;
  background: var(--brand, #4a9eff);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.scan-score {
  width: 24px;
  text-align: right;
  color: var(--g6, #6e6860);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.scan-chg {
  width: 42px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.scan-chg.pos { color: #22AB94; }
.scan-chg.neg { color: #F23645; }

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

/* Stretch variant: no padding, used when child handles its own spacing */
.tab-inner--stretch {
  padding: 0;
  gap: 0;
}
.tab-inner--stretch .more-row {
  padding: var(--sp-1, 4px) var(--sp-3, 12px);
  margin-top: 0;
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
