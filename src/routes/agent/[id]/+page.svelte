<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { AGDEFS, type AgentDef } from '$lib/data/agents';
  import { agentStats, getWinRate, type AgentStats } from '$lib/stores/agentData';
  import {
    doctrineStore,
    getOrCreateDoctrine,
    updateWeights,
    saveDoctrine,
    type DoctrineWeights,
    type DoctrineVersion,
  } from '$lib/stores/doctrineStore';
  import { getAgentAge } from '$lib/stores/agentData';
  import { buildLabLink } from '$lib/utils/deepLinks';
  import DoctrineEditor from '../../../components/agent/DoctrineEditor.svelte';
  import MemoryCard from '../../../components/agent/MemoryCard.svelte';
  import MoodBadge from '../../../components/shared/MoodBadge.svelte';
  import EvolutionTimeline from '../../../components/shared/EvolutionTimeline.svelte';
  import InlineActionButton from '../../../components/shared/InlineActionButton.svelte';

  // ─── Route param ───────────────────────────────────────────
  const agentId = $derived($page.params.id);

  // ─── Agent data ────────────────────────────────────────────
  const agent = $derived<AgentDef | undefined>(AGDEFS.find(a => a.id === agentId));
  const allStats = $derived($agentStats);
  const stats = $derived<AgentStats | undefined>(agentId ? allStats[agentId] : undefined);
  const winRate = $derived(stats ? getWinRate(stats) : 0);

  // ─── Doctrine ──────────────────────────────────────────────
  const allDoctrines = $derived($doctrineStore);
  const doctrine = $derived(agentId ? allDoctrines[agentId] : undefined);

  let mounted = $state(false);

  onMount(() => {
    if (agentId) {
      getOrCreateDoctrine(agentId);
    }
    requestAnimationFrame(() => { mounted = true; });
  });

  // ─── Tabs ──────────────────────────────────────────────────
  type TabId = 'overview' | 'doctrine' | 'memory' | 'history' | 'record';
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'doctrine', label: 'Doctrine' },
    { id: 'memory', label: 'Memory' },
    { id: 'history', label: 'History' },
    { id: 'record', label: 'Record' },
  ];

  let activeTab = $state<TabId>('overview');
  let tabIndicatorLeft = $state(0);
  let tabIndicatorWidth = $state(0);
  let tabRefs: Record<string, HTMLButtonElement | null> = {};

  function switchTab(id: TabId) {
    activeTab = id;
    updateIndicator(id);
  }

  function updateIndicator(id: TabId) {
    const el = tabRefs[id];
    if (el) {
      tabIndicatorLeft = el.offsetLeft;
      tabIndicatorWidth = el.offsetWidth;
    }
  }

  $effect(() => {
    // Defer to next tick for DOM measurement
    if (mounted) {
      requestAnimationFrame(() => updateIndicator(activeTab));
    }
  });

  // ─── Stage helpers ─────────────────────────────────────────
  const stageColors: Record<string, string> = {
    BRONZE: '#cd7f32',
    SILVER: '#c0c0c0',
    GOLD: '#ffd700',
    DIAMOND: '#b9f2ff',
    MASTER: '#ff6b9d',
  };

  function getStageName(level: number): string {
    if (level >= 40) return 'MASTER';
    if (level >= 25) return 'DIAMOND';
    if (level >= 15) return 'GOLD';
    if (level >= 8) return 'SILVER';
    return 'BRONZE';
  }

  const stage = $derived(stats ? getStageName(stats.level) : 'BRONZE');
  const stageColor = $derived(stageColors[stage] ?? stageColors.BRONZE);
  const xpPercent = $derived(stats && stats.xpMax > 0 ? Math.round((stats.xp / stats.xpMax) * 100) : 0);
  const agentAge = $derived(stats ? getAgentAge(stats.createdAt ?? Date.now()) : 1);
  const agentMood = $derived(stats?.mood ?? 'focused' as const);
  const agentBond = $derived(stats?.bond ?? 0);
  const agentStage = $derived(stats?.stage ?? 1);
  const agentStageProgress = $derived(stats?.stageProgress ?? 0);
  const canListOnMarket = $derived(agentStage >= 2);

  // ─── Doctrine actions ──────────────────────────────────────
  function handleWeightChange(key: keyof DoctrineWeights, value: number) {
    if (agentId) updateWeights(agentId, { [key]: value });
  }

  function handleSave() {
    if (agentId) {
      saveDoctrine(agentId);
    }
  }

  function handleTest() {
    goto(buildLabLink({ agentId }));
  }

  // ─── Mock memory cards ─────────────────────────────────────
  const mockMemories = [
    { title: 'Black Thursday Survivor', era: '2020 Mar', description: 'Extreme fear with BTC -50% in one day. Stayed calm and identified CVD divergence at bottom.', kind: 'match' as const, quality: 'epic' as const, timestamp: 1584316800000 },
    { title: 'Bull Trap Recognition', era: '2021 May', description: 'Identified fakeout above resistance with declining volume and negative funding rate flip.', kind: 'pattern' as const, quality: 'rare' as const, timestamp: 1620086400000 },
    { title: 'Funding Rate Flip', era: '2021 Nov', description: 'Captured long squeeze setup when funding went from extreme positive to negative in 4 hours.', kind: 'pattern' as const, quality: 'normal' as const, timestamp: 1636934400000 },
    { title: 'Range Break Setup', era: '2022 Jul', description: 'Breakout from 3-week range with Volume Spike confirming directional move. BB squeeze preceded.', kind: 'match' as const, quality: 'normal' as const, timestamp: 1656633600000 },
    { title: 'Volume Expansion Event', era: '2023 Jan', description: 'Massive volume expansion at key support level with MVRV deep value zone confirmation.', kind: 'regime' as const, quality: 'rare' as const, timestamp: 1672531200000 },
    { title: 'MVRV Reset Opportunity', era: '2023 Oct', description: 'MVRV dropped below 1.0 signaling deep undervaluation. OI was building from lows.', kind: 'lesson' as const, quality: 'normal' as const, timestamp: 1696118400000 },
    { title: 'ETF Accumulation Phase', era: '2024 Jan', description: 'Sustained exchange outflows with smart money accumulation preceding BTC ETF approval.', kind: 'regime' as const, quality: 'epic' as const, timestamp: 1704067200000 },
    { title: 'Squeeze Cascade', era: '2024 Mar', description: 'OI surge with negative funding triggered cascading short liquidations above $60K level.', kind: 'match' as const, quality: 'rare' as const, timestamp: 1709251200000 },
    { title: 'Distribution Top', era: '2024 Jul', description: 'CVD divergence at highs with declining volume. Classic distribution pattern before correction.', kind: 'pattern' as const, quality: 'normal' as const, timestamp: 1719792000000 },
  ];

  let memoryPage = $state(0);
  const MEMORIES_PER_PAGE = 6;
  const totalMemoryPages = $derived(Math.ceil(mockMemories.length / MEMORIES_PER_PAGE));
  const visibleMemories = $derived(
    mockMemories.slice(memoryPage * MEMORIES_PER_PAGE, (memoryPage + 1) * MEMORIES_PER_PAGE)
  );

  // ─── Mock history versions ─────────────────────────────────
  const historyVersions = $derived<DoctrineVersion[]>(
    doctrine?.versions
      ? [...doctrine.versions].reverse().map((v, i) => ({
          ...v,
          winRate: v.winRate ?? (i === 0 ? 71 : i === 1 ? 64 : i === 2 ? 58 : 42),
          pnl: v.pnl ?? (i === 0 ? 12.4 : i === 1 ? 8.2 : i === 2 ? 5.1 : -2.3),
        }))
      : []
  );

  // ─── Mock battle records ───────────────────────────────────
  const mockRecords = [
    { win: true, pnl: 2.1, era: '2021 Bull', time: '14:30' },
    { win: true, pnl: 0.8, era: '2022 Bear', time: '13:15' },
    { win: false, pnl: -1.2, era: '2020 Crash', time: '12:00' },
    { win: true, pnl: 3.4, era: '2024 Rally', time: '11:45' },
    { win: true, pnl: 1.1, era: '2023 Recovery', time: '10:30' },
    { win: false, pnl: -0.6, era: '2021 May Top', time: '09:15' },
    { win: true, pnl: 2.8, era: '2024 ETF', time: '08:00' },
    { win: false, pnl: -2.1, era: '2022 LUNA', time: '07:30' },
    { win: true, pnl: 1.5, era: '2023 Q4', time: '06:45' },
    { win: true, pnl: 0.4, era: '2024 Q1', time: '06:00' },
  ];
</script>

<svelte:head>
  <title>{agent?.name ?? 'Agent'} HQ — Cogochi</title>
</svelte:head>

{#if !agent || !stats}
  <main class="agent-hq">
    <div class="not-found">
      <p>Agent not found</p>
      <button class="back-btn" type="button" onclick={() => goto('/agent')}>Back to Agents</button>
    </div>
  </main>
{:else}
  <main class="agent-hq" class:mounted>
    <!-- Breadcrumb + Status Bar -->
    <header class="hq-header">
      <div class="breadcrumb">
        <button class="breadcrumb-back" type="button" onclick={() => goto('/agent')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="back-icon">
            <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          AGENTS
        </button>
      </div>

      <div class="evo-timeline-wrap">
        <EvolutionTimeline currentStage={agentStage} totalStages={3} />
      </div>

      <div class="agent-status-bar">
        <div class="status-avatar" style="--agent-color:{agent.color}">
          <img src={agent.img.def} alt={agent.name} class="status-img" />
        </div>

        <div class="status-info">
          <div class="status-name-row">
            <span class="status-name">{agent.name}</span>
            <span class="status-level">Lv.{stats.level}</span>
          </div>
          <div class="status-details">
            <span class="status-winrate">Win {winRate}%</span>
            <span class="status-sep"></span>
            <span class="status-matches">{stats.wins + stats.losses} battles</span>
            <span class="status-sep"></span>
            <MoodBadge mood={agentMood} />
            <span class="status-sep"></span>
            <span class="status-bond">{'\u2665'} {agentBond}</span>
          </div>
        </div>

        <div class="status-stage">
          <span class="stage-name" style="color:{stageColor}">{stage}</span>
          <div class="stage-bar-wrap">
            <div class="stage-bar-fill" style="width:{xpPercent}%;background:{stageColor}"></div>
          </div>
        </div>
      </div>
    </header>

    <!-- Tab Strip -->
    <nav class="tab-strip">
      <div class="tab-list" role="tablist">
        {#each tabs as tab}
          <button
            role="tab"
            class="tab-btn"
            class:active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            bind:this={tabRefs[tab.id]}
            onclick={() => switchTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
        <div
          class="tab-indicator"
          style="left:{tabIndicatorLeft}px;width:{tabIndicatorWidth}px"
        ></div>
      </div>
    </nav>

    <!-- Tab Content -->
    <section class="tab-content">
      <!-- Overview Tab -->
      {#if activeTab === 'overview'}
        <div class="panel overview-panel" class:active={activeTab === 'overview'}>
          <div class="ov-section">
            <span class="ov-section-title">Evolution Path</span>
            <EvolutionTimeline currentStage={agentStage} totalStages={3} />
            <div class="ov-progress-row">
              <span class="ov-progress-label">Stage {agentStage} Progress</span>
              <div class="ov-progress-bar">
                <div class="ov-progress-fill" style="width:{agentStageProgress}%"></div>
              </div>
              <span class="ov-progress-pct">{agentStageProgress}%</span>
            </div>
          </div>

          <div class="ov-stats-grid">
            <div class="ov-stat-card">
              <span class="ov-stat-label">Bond</span>
              <span class="ov-stat-value bond-color">{'\u2665'} {agentBond}</span>
            </div>
            <div class="ov-stat-card">
              <span class="ov-stat-label">Age</span>
              <span class="ov-stat-value">{agentAge}d</span>
            </div>
            <div class="ov-stat-card">
              <span class="ov-stat-label">Mood</span>
              <MoodBadge mood={agentMood} />
            </div>
            <div class="ov-stat-card">
              <span class="ov-stat-label">Stage</span>
              <span class="ov-stat-value">{agentStage} / 3</span>
            </div>
          </div>

          <div class="ov-section">
            <span class="ov-section-title">Market Readiness</span>
            {#if canListOnMarket}
              <div class="ov-market-card ready">
                <span class="ov-market-icon">{'\u2705'}</span>
                <span class="ov-market-text">Stage 2+ reached. This agent can be listed on the market.</span>
              </div>
            {:else}
              <div class="ov-market-card locked">
                <span class="ov-market-icon">{'\uD83D\uDD12'}</span>
                <span class="ov-market-text">Reach Stage 2 to unlock market listing. Current: Stage {agentStage}</span>
              </div>
            {/if}
          </div>

          <div class="ov-section">
            <span class="ov-section-title">Recent Battles</span>
            {#if mockRecords.length === 0}
              <p class="ov-empty">No battles yet.</p>
            {:else}
              <div class="ov-recent-list">
                {#each mockRecords.slice(0, 3) as rec}
                  <div class="ov-recent-row">
                    <span class="ov-recent-dot" class:win={rec.win} class:loss={!rec.win}>
                      {rec.win ? 'W' : 'L'}
                    </span>
                    <span class="ov-recent-pnl" class:good={rec.pnl > 0} class:bad={rec.pnl < 0}>
                      {rec.pnl > 0 ? '+' : ''}{rec.pnl.toFixed(1)}%
                    </span>
                    <span class="ov-recent-era">{rec.era}</span>
                  </div>
                {/each}
              </div>
              <InlineActionButton label="All Records" href="#" />
            {/if}
          </div>
        </div>
      {/if}

      <!-- Doctrine Tab -->
      {#if activeTab === 'doctrine'}
        <div class="panel doctrine-panel" class:active={activeTab === 'doctrine'}>
          {#if doctrine}
            <DoctrineEditor
              weights={doctrine.current}
              style={doctrine.style}
              rrMinimum={doctrine.rrMinimum}
              maxPosition={doctrine.maxPosition}
              onWeightChange={handleWeightChange}
              onSave={handleSave}
              onTest={handleTest}
            />
          {:else}
            <div class="panel-empty">
              <p>Loading doctrine...</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Memory Tab -->
      {#if activeTab === 'memory'}
        <div class="panel memory-panel" class:active={activeTab === 'memory'}>
          <div class="memory-grid">
            {#each visibleMemories as mem}
              <MemoryCard
                title={mem.title}
                era={mem.era}
                description={mem.description}
                kind={mem.kind}
                quality={mem.quality}
                timestamp={mem.timestamp}
              />
            {/each}
          </div>

          <div class="memory-footer">
            <span class="memory-count">
              Showing {memoryPage * MEMORIES_PER_PAGE + 1}-{Math.min((memoryPage + 1) * MEMORIES_PER_PAGE, mockMemories.length)} of {mockMemories.length} cards
            </span>
            <div class="memory-pagination">
              <button
                class="page-btn"
                type="button"
                disabled={memoryPage === 0}
                onclick={() => memoryPage = Math.max(0, memoryPage - 1)}
              >Prev</button>
              {#each Array(totalMemoryPages) as _, i}
                <button
                  class="page-dot"
                  class:current={memoryPage === i}
                  type="button"
                  onclick={() => memoryPage = i}
                >{i + 1}</button>
              {/each}
              <button
                class="page-btn"
                type="button"
                disabled={memoryPage >= totalMemoryPages - 1}
                onclick={() => memoryPage = Math.min(totalMemoryPages - 1, memoryPage + 1)}
              >Next</button>
            </div>
          </div>
        </div>
      {/if}

      <!-- History Tab -->
      {#if activeTab === 'history'}
        <div class="panel history-panel" class:active={activeTab === 'history'}>
          {#if historyVersions.length === 0}
            <div class="panel-empty">
              <p>No doctrine versions yet. Save your first doctrine to start tracking history.</p>
            </div>
          {:else}
            <div class="history-list">
              {#each historyVersions as ver, i}
                <div class="history-row" class:current={i === 0}>
                  <div class="history-version">
                    <span class="ver-num">v{ver.version}</span>
                    {#if i === 0}
                      <span class="ver-current">current</span>
                    {/if}
                  </div>
                  <div class="history-stats">
                    <span class="hist-stat">
                      <span class="hist-label">Win</span>
                      <span class="hist-value" class:good={ver.winRate !== null && ver.winRate >= 60}>{ver.winRate ?? '-'}%</span>
                    </span>
                    <span class="hist-stat">
                      <span class="hist-label">PnL</span>
                      <span
                        class="hist-value"
                        class:good={ver.pnl !== null && ver.pnl > 0}
                        class:bad={ver.pnl !== null && ver.pnl < 0}
                      >
                        {ver.pnl !== null ? (ver.pnl > 0 ? '+' : '') + ver.pnl.toFixed(1) + '%' : '-'}
                      </span>
                    </span>
                  </div>
                  <div class="history-meta">
                    <span class="hist-label">{ver.label}</span>
                    <span class="hist-date">
                      {new Date(ver.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Record Tab -->
      {#if activeTab === 'record'}
        <div class="panel record-panel" class:active={activeTab === 'record'}>
          <div class="record-header-row">
            <span class="record-section-title">Recent Battles</span>
            <span class="record-count">{mockRecords.length} results</span>
          </div>
          <div class="record-list">
            {#each mockRecords as rec}
              <div class="record-row">
                <span class="record-dot" class:win={rec.win} class:loss={!rec.win}>
                  {rec.win ? 'W' : 'L'}
                </span>
                <span class="record-pnl" class:good={rec.pnl > 0} class:bad={rec.pnl < 0}>
                  {rec.pnl > 0 ? '+' : ''}{rec.pnl.toFixed(1)}%
                </span>
                <span class="record-era">ERA: {rec.era}</span>
                <span class="record-time">{rec.time}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  </main>
{/if}

<style>
  /* ═══ FOUNDATION ═══ */
  .agent-hq {
    min-height: 100%;
    padding: 24px 24px 64px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 780px;
    margin: 0 auto;
    background:
      radial-gradient(ellipse 60% 35% at 20% 0%, rgba(219,154,159,0.03), transparent),
      radial-gradient(ellipse 40% 25% at 85% 100%, rgba(96,160,240,0.03), transparent);
  }

  .not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 80px 24px;
    color: var(--sc-text-3);
    font-family: var(--sc-font-body);
  }
  .back-btn {
    padding: 10px 24px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(247,242,234,0.03);
    color: var(--sc-text-1);
    font-family: var(--sc-font-body);
    font-weight: 600;
    cursor: pointer;
  }

  /* Entrance */
  .hq-header, .tab-strip, .tab-content {
    opacity: 0;
    transform: translateY(16px);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .mounted .hq-header { opacity: 1; transform: none; transition-delay: 0ms; }
  .mounted .tab-strip { opacity: 1; transform: none; transition-delay: 80ms; }
  .mounted .tab-content { opacity: 1; transform: none; transition-delay: 160ms; }

  /* ═══ HEADER ═══ */
  .breadcrumb { margin-bottom: 12px; }

  .breadcrumb-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px 6px 8px;
    border-radius: 8px;
    border: none;
    background: rgba(247,242,234,0.02);
    color: var(--sc-text-3);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 600;
    letter-spacing: 1.5px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .breadcrumb-back:hover {
    background: rgba(247,242,234,0.05);
    color: var(--lis-ivory);
  }

  .back-icon {
    width: 14px;
    height: 14px;
  }

  .agent-status-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    border-radius: 16px;
    border: 1px solid rgba(247,242,234,0.05);
    background: linear-gradient(180deg, rgba(11,18,32,0.6), rgba(5,9,20,0.7));
  }

  .status-avatar {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(247,242,234,0.03);
    overflow: hidden;
    flex-shrink: 0;
  }

  .status-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .status-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .status-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .status-name {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-xl);
    font-weight: 700;
    color: var(--lis-ivory);
  }

  .status-level {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 700;
    color: var(--sc-text-3);
  }

  .status-details {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-winrate,
  .status-matches {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
  }

  .status-sep {
    width: 1px;
    height: 10px;
    background: rgba(247,242,234,0.08);
  }

  .status-stage {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .stage-name {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 700;
    letter-spacing: 1.5px;
  }

  .stage-bar-wrap {
    width: 80px;
    height: 3px;
    border-radius: 2px;
    background: rgba(247,242,234,0.05);
    overflow: hidden;
  }

  .stage-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ═══ TAB STRIP ═══ */
  .tab-strip {
    position: sticky;
    top: 0;
    z-index: var(--sc-z-sticky);
    padding: 0;
    background: var(--lis-bg-0);
    border-bottom: 1px solid rgba(247,242,234,0.04);
  }

  .tab-list {
    display: flex;
    position: relative;
    gap: 0;
  }

  .tab-btn {
    flex: 1;
    padding: 14px 0;
    border: none;
    background: transparent;
    color: var(--sc-text-3);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.25s;
    text-align: center;
  }
  .tab-btn:hover { color: var(--sc-text-1); }
  .tab-btn.active { color: var(--lis-ivory); }

  .tab-indicator {
    position: absolute;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--lis-accent);
    box-shadow: 0 0 8px rgba(219,154,159,0.3);
    transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ═══ TAB CONTENT ═══ */
  .tab-content {
    flex: 1;
  }

  .panel {
    animation: panelIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes panelIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }

  .panel-empty {
    padding: 48px 24px;
    text-align: center;
    color: var(--sc-text-3);
    font-family: var(--sc-font-body);
  }

  /* ─── Memory Tab ─── */
  .memory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }

  .memory-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 18px;
    margin-top: 18px;
    border-top: 1px solid rgba(247,242,234,0.04);
  }

  .memory-count {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--sc-text-3);
  }

  .memory-pagination {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .page-btn {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid rgba(247,242,234,0.06);
    background: rgba(247,242,234,0.02);
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .page-btn:hover:not(:disabled) {
    border-color: rgba(247,242,234,0.12);
    color: var(--lis-ivory);
  }
  .page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .page-dot {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid rgba(247,242,234,0.04);
    background: transparent;
    color: var(--sc-text-3);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .page-dot:hover { border-color: rgba(247,242,234,0.1); color: var(--sc-text-1); }
  .page-dot.current {
    background: rgba(219,154,159,0.1);
    border-color: rgba(219,154,159,0.2);
    color: var(--lis-accent);
  }

  /* ─── History Tab ─── */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-row {
    display: grid;
    grid-template-columns: 100px 1fr auto;
    gap: 16px;
    align-items: center;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(247,242,234,0.04);
    background: rgba(247,242,234,0.01);
    transition: all 0.2s;
  }
  .history-row:hover {
    border-color: rgba(247,242,234,0.08);
    background: rgba(247,242,234,0.03);
  }
  .history-row.current {
    border-color: rgba(219,154,159,0.12);
    background: rgba(219,154,159,0.03);
  }

  .history-version {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ver-num {
    font-family: var(--sc-font-display);
    font-size: var(--sc-fs-xl);
    letter-spacing: 1px;
    color: var(--lis-ivory);
  }

  .ver-current {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(219,154,159,0.1);
    color: var(--lis-accent);
    border: 1px solid rgba(219,154,159,0.12);
  }

  .history-stats {
    display: flex;
    gap: 18px;
  }

  .hist-stat {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hist-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .hist-value {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--sc-text-1);
  }
  .hist-value.good { color: var(--lis-positive); }
  .hist-value.bad { color: var(--lis-negative); }

  .history-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .hist-date {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
  }

  /* ─── Record Tab ─── */
  .record-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .record-section-title {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--lis-ivory);
  }

  .record-count {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
  }

  .record-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .record-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.03);
    background: rgba(247,242,234,0.01);
    transition: all 0.2s;
  }
  .record-row:hover {
    border-color: rgba(247,242,234,0.06);
    background: rgba(247,242,234,0.025);
  }

  .record-dot {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-display);
    font-size: 12px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .record-dot.win {
    background: rgba(173,202,124,0.1);
    border: 1px solid rgba(173,202,124,0.2);
    color: var(--lis-positive);
  }
  .record-dot.loss {
    background: rgba(207,127,143,0.1);
    border: 1px solid rgba(207,127,143,0.2);
    color: var(--lis-negative);
  }

  .record-pnl {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    font-weight: 700;
    min-width: 54px;
  }
  .record-pnl.good { color: var(--lis-positive); }
  .record-pnl.bad { color: var(--lis-negative); }

  .record-era {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--sc-text-2);
    flex: 1;
  }

  .record-time {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
  }

  /* ─── Evolution Timeline Wrap ─── */
  .evo-timeline-wrap {
    padding: 0 4px;
  }

  /* ─── Status Bond ─── */
  .status-bond {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--lis-negative);
    letter-spacing: 0.5px;
  }

  /* ─── Overview Tab ─── */
  .overview-panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .ov-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ov-section-title {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--lis-ivory);
    letter-spacing: 0.3px;
  }

  .ov-progress-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
  }

  .ov-progress-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .ov-progress-bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: rgba(247, 242, 234, 0.05);
    overflow: hidden;
  }

  .ov-progress-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--lis-accent);
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ov-progress-pct {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    min-width: 28px;
    text-align: right;
  }

  .ov-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .ov-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px;
    border-radius: var(--sc-radius-lg);
    border: 1px solid rgba(247, 242, 234, 0.04);
    background: rgba(247, 242, 234, 0.015);
  }

  .ov-stat-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }

  .ov-stat-value {
    font-family: var(--sc-font-display);
    font-size: var(--sc-fs-xl);
    letter-spacing: 1px;
    color: var(--lis-ivory);
  }

  .bond-color { color: var(--lis-negative); }

  .ov-market-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-radius: var(--sc-radius-lg);
  }

  .ov-market-card.ready {
    background: rgba(var(--lis-rgb-lime), 0.06);
    border: 1px solid rgba(var(--lis-rgb-lime), 0.15);
  }

  .ov-market-card.locked {
    background: rgba(247, 242, 234, 0.02);
    border: 1px solid rgba(247, 242, 234, 0.06);
  }

  .ov-market-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .ov-market-text {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-1);
    line-height: var(--sc-lh-normal);
  }

  .ov-empty {
    color: var(--sc-text-3);
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
  }

  .ov-recent-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ov-recent-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--sc-radius-md);
    border: 1px solid rgba(247, 242, 234, 0.03);
    background: rgba(247, 242, 234, 0.01);
  }

  .ov-recent-dot {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-display);
    font-size: 11px;
    flex-shrink: 0;
  }
  .ov-recent-dot.win {
    background: rgba(173, 202, 124, 0.1);
    border: 1px solid rgba(173, 202, 124, 0.2);
    color: var(--lis-positive);
  }
  .ov-recent-dot.loss {
    background: rgba(207, 127, 143, 0.1);
    border: 1px solid rgba(207, 127, 143, 0.2);
    color: var(--lis-negative);
  }

  .ov-recent-pnl {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    font-weight: 700;
    min-width: 50px;
  }
  .ov-recent-pnl.good { color: var(--lis-positive); }
  .ov-recent-pnl.bad { color: var(--lis-negative); }

  .ov-recent-era {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--sc-text-2);
  }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 768px) {
    .agent-hq { padding: 20px 16px 48px; }
    .agent-status-bar { flex-wrap: wrap; gap: 12px; }
    .status-stage { flex-direction: row; align-items: center; gap: 10px; width: 100%; }
    .stage-bar-wrap { flex: 1; }
    .memory-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .ov-stats-grid { grid-template-columns: repeat(2, 1fr); }
    .history-row { grid-template-columns: 80px 1fr; gap: 10px; }
    .history-meta { grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
  }

  @media (max-width: 480px) {
    .agent-hq { padding: 16px 12px 40px; gap: 18px; }
    .agent-status-bar { padding: 14px; }
    .status-avatar { width: 44px; height: 44px; }
    .memory-grid { grid-template-columns: 1fr; }
    .memory-footer { flex-direction: column; gap: 12px; align-items: stretch; }
    .memory-pagination { justify-content: center; }
    .tab-btn { padding: 12px 0; font-size: 9px; letter-spacing: 1px; }
    .record-row { gap: 10px; padding: 10px 12px; }
    .record-era { font-size: var(--sc-fs-2xs); }
  }

  @media (prefers-reduced-motion: reduce) {
    .hq-header, .tab-strip, .tab-content, .panel {
      opacity: 1;
      transform: none;
      transition: none;
      animation: none;
    }
  }
</style>
