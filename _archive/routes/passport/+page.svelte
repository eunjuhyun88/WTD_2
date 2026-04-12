<script lang="ts">
  import { onMount } from 'svelte';
  import { userProfileStore, earnedBadges, lockedBadges, profileTier, profileStats, setAvatar, setUsername, hydrateUserProfile } from '$lib/stores/userProfileStore';
  import { activeSignalCount, activeSignals, expiredSignals } from '$lib/stores/trackedSignalStore';
  import { openTradeCount, totalQuickPnL, openTrades, closedTrades } from '$lib/stores/quickTradeStore';
  import { matchHistoryStore, winRate, bestStreak } from '$lib/stores/matchHistoryStore';
  import { walletStore, openWalletModal } from '$lib/stores/walletStore';
  import { agentStats, hydrateAgentStats } from '$lib/stores/agentData';
  import { AGDEFS, CHARACTER_ART } from '$lib/data/agents';
  import { HOLDINGS_DATA, calcPnL, type HoldingAsset } from '$lib/data/holdings';
  import { gameState } from '$lib/stores/gameState';
  import { fetchUiStateApi, updateUiStateApi } from '$lib/api/preferencesApi';
  import { fetchHoldings } from '$lib/api/portfolioApi';
  import {
    fetchPassportLearningStatus,
    fetchPassportLearningDatasets,
    fetchPassportLearningEvals,
    fetchPassportLearningTrainJobs,
    fetchPassportLearningReports,
    runPassportLearningWorker,
    queuePassportRetrainJob,
    generatePassportLearningReport,
    type PassportLearningStatus,
    type PassportDatasetVersion,
    type PassportEvalReport,
    type PassportTrainJob,
    type PassportReport
  } from '$lib/api/passportLearningApi';
  import { livePrices } from '$lib/stores/priceStore';
  import EmptyState from '../../components/shared/EmptyState.svelte';
  import {
    ASSET_COLORS,
    ASSET_ICONS,
    withLivePrices,
    toHoldingAsset,
    summarizeClosedTrades,
    countLongTrades,
    focusToneClass,
    formatDateTime,
    formatAgo,
    statusColor,
    compactSummary,
    evalMetricsPreview,
    tierColor,
    tierEmoji,
    tierLabel,
    pnlColor,
    pnlPrefix,
    timeSince,
    isPassportTab,
    type FocusTone,
    type PassportTabType,
  } from '../../components/passport/passportHelpers';

  $: profile = $userProfileStore;
  $: wallet = $walletStore;
  $: stats = $profileStats;
  $: tier = $profileTier;
  $: earned = $earnedBadges;
  $: locked = $lockedBadges;
  $: agStats = $agentStats;
  $: gState = $gameState;
  $: openPos = $openTradeCount;
  $: trackedCount = $activeSignalCount;
  $: pnl = $totalQuickPnL;
  $: opens = $openTrades;
  $: closed = $closedTrades;
  $: tracked = $activeSignals;
  $: expired = $expiredSignals;
  $: records = $matchHistoryStore.records;
  $: wr = $winRate;
  $: bStreak = $bestStreak;

  // Holdings: live API data with static fallback
  let liveHoldings: HoldingAsset[] = [];
  let holdingsLoaded = false;
  let holdingsState: 'loading' | 'live' | 'fallback' = 'loading';
  let holdingsStatusMessage = 'Syncing wallet holdings...';
  let holdingsSyncAddress: string | null = null;
  let baseHoldings: HoldingAsset[] = HOLDINGS_DATA;
  let effectiveHoldings: HoldingAsset[] = HOLDINGS_DATA;
  $: liveP = $livePrices;

  async function hydrateHoldings() {
    holdingsState = 'loading';
    holdingsStatusMessage = 'Syncing wallet holdings...';

    try {
      const res = await fetchHoldings();
      if (res?.ok && res.data.holdings.length > 0) {
        liveHoldings = res.data.holdings.map(toHoldingAsset);
        holdingsLoaded = true;
        holdingsState = 'live';
        holdingsStatusMessage = `Live holdings synced (${liveHoldings.length} assets)`;
        return;
      }
    } catch {
      // handled below with fallback state
    }

    liveHoldings = [];
    holdingsLoaded = false;
    holdingsState = 'fallback';
    holdingsStatusMessage = wallet.connected
      ? 'Live holdings unavailable. Showing demo holdings.'
      : 'Connect wallet to load live holdings.';
  }

  // Build effective holdings array: live API → static fallback + live price overlay
  $: baseHoldings = holdingsLoaded && liveHoldings.length > 0 ? liveHoldings : HOLDINGS_DATA;
  $: effectiveHoldings = withLivePrices(baseHoldings, liveP);

  // Holdings calculations
  $: total = effectiveHoldings.reduce((s, h) => s + h.amount * h.currentPrice, 0);
  $: totalCost = effectiveHoldings.reduce((s, h) => s + h.amount * h.avgPrice, 0);
  $: totalPnl = total - totalCost;
  $: totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;
  $: unrealizedPnl = opens.reduce((s, t) => s + t.pnlPercent, 0);

  // Tab state
  type TabType = PassportTabType;
  let activeTab: TabType = 'wallet';

  const TABS: { id: TabType; label: string; icon: string }[] = [
    { id: 'wallet', label: 'WALLET', icon: '💼' },
    { id: 'positions', label: 'POSITIONS', icon: '📈' },
    { id: 'profile', label: 'PROFILE', icon: '👤' },
    { id: 'arena', label: 'ARENA', icon: '🏟️' },
  ];

  const OPEN_PREVIEW_LIMIT = 4;
  const MATCH_PREVIEW_LIMIT = 5;
  const HOLDINGS_PREVIEW_LIMIT = 6;
  $: openPreview = opens.slice(0, OPEN_PREVIEW_LIMIT);
  $: openOverflow = opens.slice(OPEN_PREVIEW_LIMIT);
  $: holdingsPreview = effectiveHoldings.slice(0, HOLDINGS_PREVIEW_LIMIT);
  $: holdingsOverflow = effectiveHoldings.slice(HOLDINGS_PREVIEW_LIMIT);
  $: matchPreview = records.slice(0, MATCH_PREVIEW_LIMIT);

  interface FocusInsight {
    key: string;
    value: string;
    sub: string;
    tone: FocusTone;
  }

  interface HeaderStat {
    label: string;
    value: string | number;
    color?: string;
  }

  interface FocusCard extends FocusInsight {
    primary?: boolean;
  }

  let headerStats: HeaderStat[] = [];
  let focusCards: FocusCard[] = [];

  $: closedStats = summarizeClosedTrades(closed);
  $: closedWins = closedStats.wins;
  $: closedLosses = closedStats.losses;
  $: closedWinRate = closed.length > 0 ? Math.round((closedWins / closed.length) * 100) : 0;
  $: totalLongTrades = countLongTrades([...opens, ...closed]);
  $: totalTradeDecisions = opens.length + closed.length;
  $: longBiasPct = totalTradeDecisions > 0 ? Math.round((totalLongTrades / totalTradeDecisions) * 100) : 50;
  $: avgWinPnl = closedStats.avgWinPnl;
  $: avgLossPnl = closedStats.avgLossPnl;
  $: resolvedSamples = closed.length + records.length;
  $: learningSamples = closed.length + records.length + tracked.length + expired.length;
  $: learningReadinessPct = Math.min(100, Math.round((learningSamples / 40) * 100));
  $: showFocusInsights = resolvedSamples >= 8 || learningSamples >= 20;

  $: headerStats = [
    { label: 'OPEN', value: openPos },
    { label: 'ASSETS', value: wallet.connected ? effectiveHoldings.length : 0, color: '#8bd8ff' },
    { label: 'WIN RATE', value: `${wr}%`, color: wr >= 50 ? '#9dffcf' : '#ff8f7e' },
    { label: 'TRACKED', value: trackedCount, color: '#ff8c3b' }
  ];

  $: performanceInsight = (() => {
    const sampleCount = closed.length + records.length;
    if (sampleCount < 8) {
      return {
        key: 'PERFORMANCE STATUS',
        value: 'BOOTSTRAP',
        sub: 'Need 8+ resolved samples for reliable fit',
        tone: 'neutral'
      } satisfies FocusInsight;
    }

    const riskBalance = avgLossPnl <= 0 ? 1.2 : avgWinPnl / avgLossPnl;
    if (closedWinRate >= 55 && riskBalance >= 1 && wr >= 50) {
      return {
        key: 'PERFORMANCE STATUS',
        value: 'ON TRACK',
        sub: 'Win quality and risk control are aligned',
        tone: 'good'
      } satisfies FocusInsight;
    }

    if (riskBalance < 0.9 || closedWinRate < 45) {
      return {
        key: 'PERFORMANCE STATUS',
        value: 'TUNE RISK',
        sub: 'Loss size is dominating your wins',
        tone: 'bad'
      } satisfies FocusInsight;
    }

    return {
      key: 'PERFORMANCE STATUS',
      value: 'MIXED',
      sub: 'Edge exists but consistency is not stable',
      tone: 'warn'
    } satisfies FocusInsight;
  })();

  $: winRateInsight = (() => {
    if (records.length < 5) {
      return {
        key: 'WHY WIN RATE',
        value: `${wr}%`,
        sub: 'Arena sample is still small',
        tone: 'neutral'
      } satisfies FocusInsight;
    }

    if (avgLossPnl > avgWinPnl && closedLosses >= 3) {
      return {
        key: 'WHY WIN RATE',
        value: `${wr}%`,
        sub: 'Average loss is larger than average win',
        tone: 'bad'
      } satisfies FocusInsight;
    }

    if (longBiasPct >= 70 || longBiasPct <= 30) {
      return {
        key: 'WHY WIN RATE',
        value: `${wr}%`,
        sub: `Directional bias is high (${longBiasPct}% LONG)`,
        tone: 'warn'
      } satisfies FocusInsight;
    }

    return {
      key: 'WHY WIN RATE',
      value: `${wr}%`,
      sub: 'Direction and execution are mostly balanced',
      tone: 'good'
    } satisfies FocusInsight;
  })();

  $: actionInsight = (() => {
    if (closed.length < 6) {
      return {
        key: 'NEXT IMPROVEMENT',
        value: 'BUILD SAMPLE',
        sub: 'Close at least 6 trades before tuning rules',
        tone: 'neutral'
      } satisfies FocusInsight;
    }

    if (avgLossPnl > avgWinPnl && closedLosses > 0) {
      return {
        key: 'NEXT IMPROVEMENT',
        value: 'CUT LOSS FASTER',
        sub: `Target avg loss below ${avgWinPnl.toFixed(2)}%`,
        tone: 'bad'
      } satisfies FocusInsight;
    }

    if (longBiasPct >= 70 || longBiasPct <= 30) {
      return {
        key: 'NEXT IMPROVEMENT',
        value: 'REBALANCE BIAS',
        sub: 'Keep LONG/SHORT split near 50:50',
        tone: 'warn'
      } satisfies FocusInsight;
    }

    if (openPos > 4) {
      return {
        key: 'NEXT IMPROVEMENT',
        value: 'REDUCE OPEN RISK',
        sub: 'Keep concurrent positions at 3 or less',
        tone: 'warn'
      } satisfies FocusInsight;
    }

    return {
      key: 'NEXT IMPROVEMENT',
      value: 'SCALE GRADUALLY',
      sub: 'Increase size only if current rules stay consistent',
      tone: 'good'
    } satisfies FocusInsight;
  })();

  $: learningInsight = (() => {
    if (learningStatusRemote) {
      if (learningStatusRemote.outbox.failed > 0 || learningStatusRemote.trainJobs.failed > 0) {
        return {
          key: 'AI LEARNING READINESS',
          value: 'ATTENTION',
          sub: `Outbox failed ${learningStatusRemote.outbox.failed} · Jobs failed ${learningStatusRemote.trainJobs.failed}`,
          tone: 'bad'
        } satisfies FocusInsight;
      }

      if (learningStatusRemote.outbox.processing > 0 || learningStatusRemote.trainJobs.running > 0) {
        return {
          key: 'AI LEARNING READINESS',
          value: 'PIPELINE RUNNING',
          sub: `Processing ${learningStatusRemote.outbox.processing} events · Running ${learningStatusRemote.trainJobs.running} jobs`,
          tone: 'warn'
        } satisfies FocusInsight;
      }

      if (learningStatusRemote.latestDataset) {
        return {
          key: 'AI LEARNING READINESS',
          value: 'PIPELINE SYNCED',
          sub: `Latest dataset ${learningStatusRemote.latestDataset.versionLabel} (${learningStatusRemote.latestDataset.sampleCount} samples)`,
          tone: 'good'
        } satisfies FocusInsight;
      }
    }

    if (learningSamples >= 40) {
      return {
        key: 'AI LEARNING READINESS',
        value: `READY ${learningReadinessPct}%`,
        sub: `Trades ${closed.length} · Arena ${records.length} · Signals ${tracked.length + expired.length}`,
        tone: 'good'
      } satisfies FocusInsight;
    }

    if (learningSamples >= 20) {
      return {
        key: 'AI LEARNING READINESS',
        value: `WARMING ${learningReadinessPct}%`,
        sub: `Need ${Math.max(0, 40 - learningSamples)} more samples for stable training`,
        tone: 'warn'
      } satisfies FocusInsight;
    }

    return {
      key: 'AI LEARNING READINESS',
      value: `COLLECTING ${learningReadinessPct}%`,
      sub: `Need ${Math.max(0, 40 - learningSamples)} more samples to start model tuning`,
      tone: 'neutral'
    } satisfies FocusInsight;
  })();

  $: focusCards = [
    { ...performanceInsight, primary: true },
    winRateInsight,
    actionInsight,
    learningInsight
  ];

  let learningStatusRemote: PassportLearningStatus | null = null;
  let learningDatasetsRemote: PassportDatasetVersion[] = [];
  let learningEvalsRemote: PassportEvalReport[] = [];
  let learningTrainJobsRemote: PassportTrainJob[] = [];
  let learningReportsRemote: PassportReport[] = [];
  let learningHydrated = false;
  let learningRefreshing = false;
  let learningActionRunning = false;
  let learningActionMessage = '';
  let learningErrorMessage = '';

  async function hydrateLearningPanel() {
    learningRefreshing = true;
    learningErrorMessage = '';
    try {
      const [status, datasets, evals, jobs, reports] = await Promise.all([
        fetchPassportLearningStatus(),
        fetchPassportLearningDatasets({ limit: 6 }),
        fetchPassportLearningEvals({ limit: 6 }),
        fetchPassportLearningTrainJobs(6),
        fetchPassportLearningReports({ limit: 4 }),
      ]);
      learningStatusRemote = status;
      learningDatasetsRemote = datasets;
      learningEvalsRemote = evals;
      learningTrainJobsRemote = jobs;
      learningReportsRemote = reports;
      learningHydrated = true;
    } catch (error) {
      learningErrorMessage = error instanceof Error ? error.message : 'Failed to load learning pipeline';
      learningHydrated = true;
    } finally {
      learningRefreshing = false;
    }
  }

  async function runLearningWorkerNow() {
    if (learningActionRunning) return;
    learningActionRunning = true;
    learningActionMessage = '';
    const worker = await runPassportLearningWorker({
      workerId: `passport-ui:${Date.now()}`,
      limit: 50,
    });
    if (!worker) {
      learningErrorMessage = 'Worker run failed. Check auth or DB connection.';
    } else {
      learningActionMessage = `Worker ${worker.workerId} processed ${worker.processed}/${worker.claimed} events`;
      learningErrorMessage = '';
    }
    await hydrateLearningPanel();
    learningActionRunning = false;
  }

  async function queueLearningRetrainNow() {
    if (learningActionRunning) return;
    learningActionRunning = true;
    learningActionMessage = '';
    const datasetVersionIds = learningDatasetsRemote.slice(0, 3).map((item) => item.datasetVersionId);
    const job = await queuePassportRetrainJob({
      modelRole: 'policy',
      targetModelVersion: `policy-ui-${Date.now()}`,
      datasetVersionIds,
      triggerReason: 'manual_passport_ui',
    });
    if (!job) {
      learningErrorMessage = 'Failed to queue retrain job.';
    } else {
      learningActionMessage = `Retrain job queued: ${job.targetModelVersion}`;
      learningErrorMessage = '';
    }
    await hydrateLearningPanel();
    learningActionRunning = false;
  }

  async function generateLearningReportNow() {
    if (learningActionRunning) return;
    learningActionRunning = true;
    learningActionMessage = '';
    const report = await generatePassportLearningReport({
      reportType: 'on_demand',
      summary: `# Passport AI Report\n\n- generated_at: ${new Date().toISOString()}\n- closed_win_rate: ${closedWinRate}%\n- avg_win: ${avgWinPnl.toFixed(2)}%\n- avg_loss: ${avgLossPnl.toFixed(2)}%\n- long_bias: ${longBiasPct}%`,
    });
    if (!report) {
      learningErrorMessage = 'Failed to generate report draft.';
    } else {
      learningActionMessage = `Report generated: ${report.modelVersion}`;
      learningErrorMessage = '';
    }
    await hydrateLearningPanel();
    learningActionRunning = false;
  }

  $: learningOpsConnected = Boolean(
    learningStatusRemote || learningDatasetsRemote.length || learningEvalsRemote.length || learningTrainJobsRemote.length || learningReportsRemote.length
  );

  $: learningPipelineState = (() => {
    if (!learningStatusRemote) return 'LOCAL_ONLY';
    if (learningStatusRemote.outbox.failed > 0 || learningStatusRemote.trainJobs.failed > 0) return 'ATTENTION';
    if (learningStatusRemote.outbox.processing > 0 || learningStatusRemote.trainJobs.running > 0) return 'RUNNING';
    if (learningStatusRemote.latestDataset) return 'SYNCED';
    return 'BOOTSTRAP';
  })();

  $: latestLearningStatusLine = learningStatusRemote
    ? `Outbox P:${learningStatusRemote.outbox.pending} / R:${learningStatusRemote.outbox.processing} / F:${learningStatusRemote.outbox.failed} · Jobs Q:${learningStatusRemote.trainJobs.queued} / Run:${learningStatusRemote.trainJobs.running} / OK:${learningStatusRemote.trainJobs.succeeded}`
    : 'Learning backend is not connected for this user/session yet.';

  // Avatar options
  const AVATAR_OPTIONS = [
    '/doge/doge-confident.jpg', '/doge/doge-happy.jpg', '/doge/doge-cute.jpg', '/doge/doge-default.jpg',
    '/doge/doge-think.jpg', '/doge/doge-alert.jpg', '/doge/doge-angry.jpg', '/doge/doge-win.jpg',
    '/doge/sticker-grin.png', '/doge/sticker-love.png', '/doge/sticker-heart.png', '/doge/sticker-laugh.png',
    '/doge/meme-buff.png', '/doge/meme-bodybuilder.png', '/doge/meme-greedy.png', '/doge/meme-money.png',
    '/doge/badge-verified.png', '/doge/badge-shield.png', '/doge/badge-rocket.png', '/doge/badge-diamond.png',
  ];

  let showAvatarPicker = false;
  let editingName = false;
  let nameInput = '';

  function pickAvatar(path: string) { setAvatar(path); showAvatarPicker = false; }
  function startEditName() { nameInput = profile.username; editingName = true; }
  function saveName() { if (nameInput.trim().length >= 2) setUsername(nameInput.trim()); editingName = false; }

  function setActiveTab(tab: TabType) {
    if (tab === activeTab) return;
    activeTab = tab;
    void updateUiStateApi({ passportActiveTab: tab });
  }

  let holdingsSyncing = false;
  async function syncHoldingsNow() {
    if (holdingsSyncing) return;
    holdingsSyncing = true;
    try {
      await hydrateHoldings();
    } finally {
      holdingsSyncing = false;
    }
  }

  $: if (wallet.connected && wallet.address && wallet.address !== holdingsSyncAddress) {
    holdingsSyncAddress = wallet.address;
    void hydrateHoldings();
  }

  $: if (!wallet.connected && holdingsSyncAddress !== null) {
    holdingsSyncAddress = null;
  }

  // If wallet is disconnected after a live sync, clear cached live holdings
  // to avoid showing stale wallet data from a previous connection.
  $: if (
    (!wallet.connected || !wallet.address) &&
    (holdingsLoaded || liveHoldings.length > 0 || holdingsState === 'live')
  ) {
    holdingsSyncAddress = null;
    liveHoldings = [];
    holdingsLoaded = false;
    holdingsState = 'fallback';
    holdingsStatusMessage = 'Connect wallet to load live holdings.';
  }

  onMount(() => {
    hydrateUserProfile();
    hydrateAgentStats();
    void (async () => {
      const ui = await fetchUiStateApi();
      if (ui?.passportActiveTab && isPassportTab(ui.passportActiveTab)) {
        activeTab = ui.passportActiveTab;
      }

      // First-time / low-data users should land on wallet view first.
      if (activeTab === 'profile' && !wallet.connected && openPos === 0 && records.length === 0) {
        activeTab = 'wallet';
      }
    })();

    if (!wallet.connected || !wallet.address) {
      void hydrateHoldings();
    }

    void hydrateLearningPanel();
  });
</script>

<div class="passport-page">
  <div class="passport-sunburst"></div>
  <div class="passport-halftone"></div>

  <div class="passport-scroll">
    <div class="passport-card">
      <!-- ═══ RIBBON ═══ -->
      <div class="card-ribbon">
        <span class="ribbon-text">Stockclaw TRADER PASSPORT</span>
      </div>

      <!-- ═══ UNIFIED HEADER: PROFILE + PORTFOLIO ═══ -->
      <div class="unified-header">
        <div class="uh-left">
          <button class="doge-avatar" on:click={() => showAvatarPicker = !showAvatarPicker}>
            <img src={profile.avatar} alt="avatar" class="doge-img" />
            <span class="avatar-edit">✏️</span>
          </button>

          <div class="player-info">
            {#if editingName}
              <div class="name-edit">
                <input class="name-input" type="text" bind:value={nameInput} maxlength="16" on:keydown={(e) => e.key === 'Enter' && saveName()} />
                <button class="name-save" on:click={saveName}>✓</button>
              </div>
            {:else}
              <button class="player-name" on:click={startEditName}>
                {profile.username} <span class="name-pen">✏️</span>
              </button>
            {/if}
            <div class="player-tier" style="color:{tierColor(tier)}">
              {tierEmoji(tier)} {tierLabel(tier)}
            </div>
            {#if wallet.connected}
              <div class="player-addr">{wallet.shortAddr} · {wallet.chain}</div>
            {:else}
              <button class="connect-mini" on:click={openWalletModal}>CONNECT WALLET</button>
            {/if}
          </div>
        </div>

        <div class="uh-right">
          <div class="port-val">
            <div class="pv-label">PORTFOLIO</div>
            <div class="pv-amount">${(profile.balance.virtual + total).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            <div class="pv-pnl" class:up={totalPnl >= 0} class:down={totalPnl < 0}>
              {totalPnl >= 0 ? '▲' : '▼'} {pnlPrefix(totalPnlPct)}{totalPnlPct.toFixed(2)}%
            </div>
          </div>
          <div class="uh-stats">
            {#each headerStats as stat (stat.label)}
              <div class="uhs">
                <span class="uhs-val" style:color={stat.color}>{stat.value}</span>
                <span class="uhs-lbl">{stat.label}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="passport-stamp">
          <span class="stamp-text">{wallet.connected ? 'VERIFIED' : 'UNVERIFIED'}</span>
          <span class="stamp-icon">●</span>
        </div>
      </div>

      <!-- Avatar Picker -->
      {#if showAvatarPicker}
        <div class="avatar-picker">
          <div class="ap-title">SELECT AVATAR</div>
          <div class="ap-grid">
            {#each AVATAR_OPTIONS as opt}
              <button class="ap-opt" class:selected={profile.avatar === opt} on:click={() => pickAvatar(opt)}>
                <img src={opt} alt="avatar option" loading="lazy" />
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ═══ TAB BAR ═══ -->
      <div class="tab-bar">
        {#each TABS as tab}
          <button
            class="tab-btn"
            class:active={activeTab === tab.id}
            on:click={() => setActiveTab(tab.id)}
          >
            <span class="tab-icon">{tab.icon}</span>
            <span class="tab-label">{tab.label}</span>
            {#if tab.id === 'positions' && openPos > 0}
              <span class="tab-badge">{openPos}</span>
            {/if}
            {#if tab.id === 'arena' && records.length > 0}
              <span class="tab-badge">{records.length}</span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="control-rail">
        <div class="quick-actions">
          <a class="qa-btn qa-terminal" href="/terminal" data-gtm-area="passport" data-gtm-action="open_terminal">
            QUICK TRADE
          </a>
          {#if activeTab !== 'arena'}
            <a class="qa-btn qa-arena" href="/arena" data-gtm-area="passport" data-gtm-action="open_arena">
              START ARENA
            </a>
          {/if}
          {#if activeTab === 'wallet' && wallet.connected}
            <button class="qa-btn qa-sync" on:click={syncHoldingsNow} disabled={holdingsSyncing} data-gtm-area="passport" data-gtm-action="sync_holdings">
              {holdingsSyncing ? 'SYNCING...' : 'SYNC HOLDINGS'}
            </button>
          {/if}
          {#if !wallet.connected}
            <button class="qa-btn qa-wallet" on:click={openWalletModal} data-gtm-area="passport" data-gtm-action="connect_wallet">
              CONNECT WALLET
            </button>
          {/if}
        </div>
      </div>

      {#if showFocusInsights}
        <div class="focus-strip">
          {#each focusCards as card, index (card.key)}
            <div class={`focus-item ${card.primary || index === 0 ? 'focus-item-primary' : ''} ${focusToneClass(card.tone)}`}>
              <span class="focus-k">{card.key}</span>
              <span class="focus-v">{card.value}</span>
              <span class="focus-sub">{card.sub}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ═══ TAB CONTENT ═══ -->
      <div class="tab-content">

        <!-- ════ PROFILE TAB ════ -->
        {#if activeTab === 'profile'}
          <div class="profile-tab">
            <section class="content-panel">
              <div class="section-header">PERFORMANCE SNAPSHOT</div>
              <div class="metrics-grid metrics-primary">
                <div class="metric-card"><div class="mc-icon">🎯</div><div class="mc-value" class:up={stats.winRate >= 50}>{stats.winRate}%</div><div class="mc-label">WIN RATE</div></div>
                <div class="metric-card"><div class="mc-icon">💰</div><div class="mc-value" style="color:{pnlColor(stats.totalPnL)}">{pnlPrefix(stats.totalPnL)}{stats.totalPnL.toFixed(1)}%</div><div class="mc-label">TOTAL PnL</div></div>
                <div class="metric-card"><div class="mc-icon">⚔️</div><div class="mc-value">{stats.totalMatches}</div><div class="mc-label">MATCHES</div></div>
                <div class="metric-card"><div class="mc-icon">🔥</div><div class="mc-value fire">{stats.bestStreak}</div><div class="mc-label">BEST STREAK</div></div>
              </div>

              <details class="detail-block">
                <summary>MORE PERFORMANCE METRICS</summary>
                <div class="metrics-grid metrics-detail">
                  <div class="metric-card"><div class="mc-icon">🧭</div><div class="mc-value">{stats.directionAccuracy}%</div><div class="mc-label">DIRECTION ACC</div></div>
                  <div class="metric-card"><div class="mc-icon">💡</div><div class="mc-value">{stats.avgConfidence}%</div><div class="mc-label">AVG CONFIDENCE</div></div>
                  <div class="metric-card"><div class="mc-icon">📌</div><div class="mc-value">{stats.trackedSignals}</div><div class="mc-label">TRACKED</div></div>
                  <div class="metric-card"><div class="mc-icon">🤖</div><div class="mc-value">{stats.agentWins}</div><div class="mc-label">AGENT WINS</div></div>
                </div>
              </details>

              <div class="summary-line">
                {stats.totalMatches > 0
                  ? `${gState.wins}W-${gState.losses}L | ${pnlPrefix(stats.totalPnL)}${stats.totalPnL.toFixed(1)}% PnL | 🔥 ${stats.streak}-streak`
                  : 'No matches yet — Start an Arena battle!'}
              </div>
            </section>

            <section class="content-panel">
              <details class="detail-block">
                <summary>BADGES ({earned.length}/{earned.length + locked.length})</summary>
                <div class="badges-grid">
                  {#each earned as badge}
                    <div class="badge-card earned">
                      <span class="badge-icon">{badge.icon}</span>
                      <span class="badge-name">{badge.name}</span>
                      <span class="badge-date">{badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : ''}</span>
                    </div>
                  {/each}
                  {#each locked as badge}
                    <div class="badge-card locked">
                      <span class="badge-icon">🔒</span>
                      <span class="badge-name">{badge.name}</span>
                      <span class="badge-desc">{badge.description}</span>
                    </div>
                  {/each}
                </div>
              </details>
            </section>
          </div>

        <!-- ════ WALLET TAB ════ -->
        {:else if activeTab === 'wallet'}
          <div class="wallet-tab">
            <section class="content-panel">
              <div class="vb-card">
                <div class="vb-header"><span class="vb-icon">🏦</span><span class="vb-title">VIRTUAL BALANCE</span></div>
                <div class="vb-amount">${profile.balance.virtual.toLocaleString()}</div>
                {#if !wallet.connected}
                  <button class="vb-connect" on:click={openWalletModal}>CONNECT WALLET FOR DEFI</button>
                {:else}
                  <div class="vb-connected"><span class="vbc-dot"></span>Wallet Connected · {wallet.chain} · {wallet.balance.toLocaleString()} USDT</div>
                {/if}
              </div>
            </section>

            <section class="content-panel">
              <div class="holdings-status" class:live={holdingsState === 'live'}>
                <span class="hs-dot"></span>
                <span>{holdingsStatusMessage}</span>
              </div>

              <div class="wallet-kpis">
                <div class="wk-item"><span class="wk-k">ASSETS</span><span class="wk-v">{effectiveHoldings.length}</span></div>
                <div class="wk-item"><span class="wk-k">TOTAL VALUE</span><span class="wk-v">${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>
                <div class="wk-item"><span class="wk-k">HOLDINGS PnL</span><span class="wk-v" style="color:{pnlColor(totalPnl)}">{pnlPrefix(totalPnlPct)}{totalPnlPct.toFixed(2)}%</span></div>
              </div>

              <details class="detail-block">
                <summary>HOLDINGS BREAKDOWN</summary>
                <div class="holdings-body">
                  <div class="donut-section">
                    <div class="st">ALLOCATION</div>
                    <div class="donut-wrap">
                      <svg viewBox="0 0 200 200">
                        {#each effectiveHoldings as asset, i}
                          {@const offset = effectiveHoldings.slice(0, i).reduce((s, a) => s + a.allocation * 100, 0)}
                          {@const pct = asset.allocation * 100}
                          <circle cx="100" cy="100" r="70" fill="none" stroke={asset.color} stroke-width="30"
                            stroke-dasharray="{pct * 4.4} {(100 - pct) * 4.4}"
                            stroke-dashoffset="{-offset * 4.4}" transform="rotate(-90 100 100)" />
                        {/each}
                        <circle cx="100" cy="100" r="55" fill="#0a0a1a" />
                        <text x="100" y="95" text-anchor="middle" fill="#fff" font-size="16" font-weight="900" font-family="var(--fd)">{effectiveHoldings.length}</text>
                        <text x="100" y="112" text-anchor="middle" fill="#888" font-size="9" font-family="var(--fm)">ASSETS</text>
                      </svg>
                    </div>
                    <div class="legend">
                      {#each holdingsPreview as asset}
                        <div class="legend-item"><span class="li-dot" style="background:{asset.color}"></span><span class="li-name">{asset.symbol}</span><span class="li-pct">{(asset.allocation * 100).toFixed(0)}%</span></div>
                      {/each}
                      {#if holdingsOverflow.length > 0}
                        <details class="detail-block nested-detail compact-detail">
                          <summary>MORE ASSETS ({holdingsOverflow.length})</summary>
                          <div class="legend overflow-legend">
                            {#each holdingsOverflow as asset}
                              <div class="legend-item"><span class="li-dot" style="background:{asset.color}"></span><span class="li-name">{asset.symbol}</span><span class="li-pct">{(asset.allocation * 100).toFixed(0)}%</span></div>
                            {/each}
                          </div>
                        </details>
                      {/if}
                    </div>
                  </div>

                  <div class="table-section">
                    <div class="st">HOLDINGS</div>
                    <div class="htable">
                      <div class="hrow header-row"><span class="hc asset-col">ASSET</span><span class="hc">AMOUNT</span><span class="hc">VALUE</span><span class="hc">PnL</span></div>
                      {#each holdingsPreview as asset}
                        {@const assetPnl = calcPnL(asset)}
                        {@const value = asset.amount * asset.currentPrice}
                        <div class="hrow">
                          <div class="hc asset-col"><span class="ai" style="background:{asset.color}">{asset.icon}</span><div><div class="an">{asset.symbol}</div><div class="af">{asset.name}</div></div></div>
                          <span class="hc num">{asset.amount.toLocaleString()}</span>
                          <span class="hc num">${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                          <span class="hc num" style="color:{pnlColor(assetPnl.amount)}">{pnlPrefix(assetPnl.percent)}{assetPnl.percent.toFixed(1)}%</span>
                        </div>
                      {/each}
                    </div>
                    {#if holdingsOverflow.length > 0}
                      <details class="detail-block nested-detail compact-detail">
                        <summary>MORE HOLDINGS ({holdingsOverflow.length})</summary>
                        <div class="htable">
                          {#each holdingsOverflow as asset}
                            {@const assetPnl = calcPnL(asset)}
                            {@const value = asset.amount * asset.currentPrice}
                            <div class="hrow">
                              <div class="hc asset-col"><span class="ai" style="background:{asset.color}">{asset.icon}</span><div><div class="an">{asset.symbol}</div><div class="af">{asset.name}</div></div></div>
                              <span class="hc num">{asset.amount.toLocaleString()}</span>
                              <span class="hc num">${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                              <span class="hc num" style="color:{pnlColor(assetPnl.amount)}">{pnlPrefix(assetPnl.percent)}{assetPnl.percent.toFixed(1)}%</span>
                            </div>
                          {/each}
                        </div>
                      </details>
                    {/if}
                  </div>
                </div>
              </details>
            </section>
          </div>

        <!-- ════ POSITIONS TAB ════ -->
        {:else if activeTab === 'positions'}
          <div class="positions-tab">
            <section class="content-panel">
              <div class="pos-summary">
                <div class="ps-item"><div class="psi-label">OPEN</div><div class="psi-value">{opens.length}</div></div>
                <div class="ps-item"><div class="psi-label">UNREALIZED</div><div class="psi-value" style="color:{pnlColor(unrealizedPnl)}">{pnlPrefix(unrealizedPnl)}{unrealizedPnl.toFixed(2)}%</div></div>
                <div class="ps-item"><div class="psi-label">TRACKED</div><div class="psi-value" style="color:#ff8c3b">{tracked.length}</div></div>
                <div class="ps-item"><div class="psi-label">TOTAL PnL</div><div class="psi-value" style="color:{pnlColor(pnl)}">{pnlPrefix(pnl)}{pnl.toFixed(2)}%</div></div>
              </div>
            </section>

            <section class="content-panel list-panel">
              {#if opens.length > 0}
                <div class="pos-section-title">OPEN TRADES</div>
                {#each openPreview as trade (trade.id)}
                  <div class="pos-row">
                    <div class="pr-left">
                      <span class="pr-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>{trade.dir === 'LONG' ? '▲' : '▼'}{trade.dir}</span>
                      <span class="pr-pair">{trade.pair}</span>
                      <span class="pr-src">{trade.source}</span>
                    </div>
                    <div class="pr-right">
                      <span class="pr-entry">${Math.round(trade.entry).toLocaleString()}</span>
                      <span class="pr-pnl" style="color:{pnlColor(trade.pnlPercent)}">{pnlPrefix(trade.pnlPercent)}{trade.pnlPercent.toFixed(2)}%</span>
                      <span class="pr-time">{timeSince(trade.openedAt)}</span>
                    </div>
                  </div>
                {/each}
                {#if openOverflow.length > 0}
                  <details class="detail-block detail-spaced">
                    <summary>MORE OPEN TRADES ({openOverflow.length})</summary>
                    {#each openOverflow as trade (trade.id)}
                      <div class="pos-row">
                        <div class="pr-left">
                          <span class="pr-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>{trade.dir === 'LONG' ? '▲' : '▼'}{trade.dir}</span>
                          <span class="pr-pair">{trade.pair}</span>
                          <span class="pr-src">{trade.source}</span>
                        </div>
                        <div class="pr-right">
                          <span class="pr-entry">${Math.round(trade.entry).toLocaleString()}</span>
                          <span class="pr-pnl" style="color:{pnlColor(trade.pnlPercent)}">{pnlPrefix(trade.pnlPercent)}{trade.pnlPercent.toFixed(2)}%</span>
                          <span class="pr-time">{timeSince(trade.openedAt)}</span>
                        </div>
                      </div>
                    {/each}
                  </details>
                {/if}
              {:else}
                <EmptyState image={CHARACTER_ART.tradeActions} title="NO OPEN POSITIONS" subtitle="Use QUICK LONG/SHORT in the Terminal to start trading" ctaText="GO TO TERMINAL →" ctaHref="/terminal" icon="📊" variant="cyan" compact />
              {/if}

              {#if tracked.length > 0}
                <details class="detail-block detail-spaced">
                  <summary>TRACKED SIGNALS ({tracked.length})</summary>
                  {#each tracked as sig (sig.id)}
                    <div class="pos-row tracked">
                      <div class="pr-left">
                        <span class="pr-dir" class:long={sig.dir === 'LONG'} class:short={sig.dir === 'SHORT'}>{sig.dir === 'LONG' ? '▲' : '▼'}{sig.dir}</span>
                        <span class="pr-pair">{sig.pair}</span>
                        <span class="pr-src">📌 {sig.source}</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{pnlColor(sig.pnlPercent)}">{pnlPrefix(sig.pnlPercent)}{sig.pnlPercent.toFixed(2)}%</span>
                        <span class="pr-time">{timeSince(sig.trackedAt)}</span>
                      </div>
                    </div>
                  {/each}
                </details>
              {/if}

              {#if closed.length > 0}
                <details class="detail-block detail-spaced">
                  <summary>RECENTLY CLOSED ({closed.length})</summary>
                  {#each closed.slice(0, 10) as trade (trade.id)}
                    <div class="pos-row closed">
                      <div class="pr-left">
                        <span class="pr-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>{trade.dir === 'LONG' ? '▲' : '▼'}</span>
                        <span class="pr-pair">{trade.pair}</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{pnlColor(trade.closePnl || 0)}">{pnlPrefix(trade.closePnl || 0)}{(trade.closePnl || 0).toFixed(2)}%</span>
                      </div>
                    </div>
                  {/each}
                </details>
              {/if}
            </section>
          </div>

        <!-- ════ ARENA TAB ════ -->
        {:else if activeTab === 'arena'}
          <div class="arena-tab">
            <section class="content-panel">
              <div class="arena-stats">
                <div class="as-item"><div class="asi-val">{records.length}</div><div class="asi-label">MATCHES</div></div>
                <div class="as-item"><div class="asi-val" style="color:#00ff88">{wr}%</div><div class="asi-label">WIN RATE</div></div>
                <div class="as-item"><div class="asi-val" style="color:#ff8c3b">🔥 {bStreak}</div><div class="asi-label">BEST STREAK</div></div>
                <div class="as-item"><div class="asi-val" style="color:#ffd060">{gState.lp.toLocaleString()}</div><div class="asi-label">LP EARNED</div></div>
              </div>
            </section>

            <section class="content-panel">
              <div class="section-header">AI LEARNING PIPELINE</div>

              <div class="ml-action-row">
                <button class="qa-btn qa-sync" on:click={hydrateLearningPanel} disabled={learningRefreshing}>
                  {learningRefreshing ? 'REFRESHING...' : 'REFRESH'}
                </button>
                <button class="qa-btn qa-terminal" on:click={runLearningWorkerNow} disabled={learningActionRunning}>
                  RUN WORKER
                </button>
                <button class="qa-btn qa-arena" on:click={queueLearningRetrainNow} disabled={learningActionRunning}>
                  QUEUE RETRAIN
                </button>
                <button class="qa-btn qa-wallet" on:click={generateLearningReportNow} disabled={learningActionRunning}>
                  GENERATE REPORT
                </button>
              </div>

              {#if learningActionMessage}
                <div class="ml-info-line">{learningActionMessage}</div>
              {/if}

              {#if learningErrorMessage}
                <div class="ml-error-line">{learningErrorMessage}</div>
              {/if}

              <div class="metrics-grid metrics-detail">
                <div class="metric-card">
                  <div class="mc-icon">📦</div>
                  <div class="mc-value" style="color:{statusColor(learningPipelineState)}">{learningPipelineState}</div>
                  <div class="mc-label">PIPELINE</div>
                </div>
                <div class="metric-card">
                  <div class="mc-icon">⏳</div>
                  <div class="mc-value">{learningStatusRemote?.outbox.pending ?? 0}</div>
                  <div class="mc-label">OUTBOX PENDING</div>
                </div>
                <div class="metric-card">
                  <div class="mc-icon">🛠️</div>
                  <div class="mc-value">{learningStatusRemote?.trainJobs.running ?? 0}</div>
                  <div class="mc-label">TRAIN RUNNING</div>
                </div>
                <div class="metric-card">
                  <div class="mc-icon">🧾</div>
                  <div class="mc-value">{learningReportsRemote.length}</div>
                  <div class="mc-label">REPORTS</div>
                </div>
              </div>

              <div class="summary-line">{latestLearningStatusLine}</div>

              <details class="detail-block">
                <summary>LEARNING REPORTS ({learningReportsRemote.length})</summary>
                {#if learningReportsRemote.length === 0}
                  <div class="ml-empty-row">
                    {learningHydrated
                      ? 'No report snapshot yet. Use GENERATE REPORT to create the first analysis.'
                      : 'Loading reports...'}
                  </div>
                {:else}
                  {#each learningReportsRemote as report (report.reportId)}
                    <div class="pos-row">
                      <div class="pr-left">
                        <span class="pr-pair">{report.reportType.toUpperCase()}</span>
                        <span class="pr-src">{report.modelName}:{report.modelVersion}</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{statusColor(report.status)}">{report.status.toUpperCase()}</span>
                        <span class="pr-time">{formatDateTime(report.createdAt)}</span>
                      </div>
                    </div>
                    <div class="ml-summary-preview">{compactSummary(report.summary)}</div>
                  {/each}
                {/if}
              </details>

              <details class="detail-block">
                <summary>DATASETS ({learningDatasetsRemote.length})</summary>
                {#if learningDatasetsRemote.length === 0}
                  <div class="ml-empty-row">No dataset versions found yet.</div>
                {:else}
                  {#each learningDatasetsRemote as dataset (dataset.datasetVersionId)}
                    <div class="pos-row">
                      <div class="pr-left">
                        <span class="pr-pair">{dataset.versionLabel}</span>
                        <span class="pr-src">{dataset.datasetType.toUpperCase()} · {dataset.sampleCount} samples</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{statusColor(dataset.status)}">{dataset.status.toUpperCase()}</span>
                        <span class="pr-time">{formatAgo(dataset.createdAt)}</span>
                      </div>
                    </div>
                  {/each}
                {/if}
              </details>

              <details class="detail-block">
                <summary>TRAIN JOBS ({learningTrainJobsRemote.length})</summary>
                {#if learningTrainJobsRemote.length === 0}
                  <div class="ml-empty-row">No train jobs yet.</div>
                {:else}
                  {#each learningTrainJobsRemote as job (job.trainJobId)}
                    <div class="pos-row">
                      <div class="pr-left">
                        <span class="pr-pair">{job.trainType.toUpperCase()} · {job.modelRole.toUpperCase()}</span>
                        <span class="pr-src">{job.targetModelVersion}</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{statusColor(job.status)}">{job.status.toUpperCase()}</span>
                        <span class="pr-time">{formatAgo(job.createdAt)}</span>
                      </div>
                    </div>
                  {/each}
                {/if}
              </details>

              <details class="detail-block">
                <summary>EVAL REPORTS ({learningEvalsRemote.length})</summary>
                {#if learningEvalsRemote.length === 0}
                  <div class="ml-empty-row">No evaluation reports yet.</div>
                {:else}
                  {#each learningEvalsRemote as evalReport (evalReport.evalId)}
                    <div class="pos-row">
                      <div class="pr-left">
                        <span class="pr-pair">{evalReport.evalScope.toUpperCase()}</span>
                        <span class="pr-src">{evalReport.modelVersion}</span>
                      </div>
                      <div class="pr-right">
                        <span class="pr-pnl" style="color:{statusColor(evalReport.gateResult)}">{evalReport.gateResult.toUpperCase()}</span>
                        <span class="pr-time">{formatAgo(evalReport.createdAt)}</span>
                      </div>
                    </div>
                    <div class="ml-metric-preview">{evalMetricsPreview(evalReport.metrics)}</div>
                  {/each}
                {/if}
              </details>

              {#if !learningOpsConnected && learningHydrated}
                <div class="ml-empty-row">
                  Learning pipeline rows are empty. This is expected before outbox worker and first train/report cycle.
                </div>
              {/if}
            </section>

            <section class="content-panel">
              <details class="detail-block">
                <summary>AGENT SQUAD ({AGDEFS.length})</summary>
                <div class="agent-perf-grid">
                  {#each AGDEFS as ag}
                    {@const ags = agStats[ag.id]}
                    <div class="agent-perf-card" style="border-left-color:{ag.color}">
                      <div class="apc-head">
                        {#if ag.img?.def}
                          <img src={ag.img.def} alt={ag.name} class="apc-img" loading="lazy" />
                        {:else}
                          <span class="apc-icon">{ag.icon}</span>
                        {/if}
                        <div>
                          <div class="apc-name" style="color:{ag.color}">{ag.name}</div>
                          <div class="apc-role">{ag.role}</div>
                        </div>
                        <div class="apc-level">Lv.{ags?.level || 1}</div>
                      </div>
                      <div class="apc-bar-wrap">
                        <div class="apc-bar" style="width:{Math.min((ags?.xp || 0) / (((ags?.level || 1) + 1) * 100) * 100, 100)}%;background:{ag.color}"></div>
                      </div>
                      <div class="apc-xp">XP: {ags?.xp || 0} / {((ags?.level || 1) + 1) * 100}</div>
                    </div>
                  {/each}
                </div>
              </details>
            </section>

            <section class="content-panel list-panel">
              {#if records.length > 0}
                <details class="detail-block">
                  <summary>MATCH HISTORY ({Math.min(records.length, 20)})</summary>
                  {#each matchPreview as match (match.id)}
                    <div class="match-row" class:win={match.win} class:loss={!match.win}>
                      <div class="mr-left">
                        <span class="mr-result" class:win={match.win}>{match.win ? 'WIN' : 'LOSS'}</span>
                        <span class="mr-num">#{match.matchN}</span>
                        <span class="mr-time">{timeSince(match.timestamp)}</span>
                      </div>
                      <div class="mr-right">
                        <span class="mr-lp" class:plus={match.lp >= 0} class:minus={match.lp < 0}>{match.lp >= 0 ? '+' : ''}{match.lp} LP</span>
                        {#if match.hypothesis}
                          <span class="mr-hyp" class:long={match.hypothesis.dir === 'LONG'} class:short={match.hypothesis.dir === 'SHORT'}>{match.hypothesis.dir}</span>
                        {/if}
                        <span class="mr-agents">
                          {#each (match.agentVotes || []).slice(0, 3) as vote}
                            <span class="mr-agent-dot" style="background:{vote.color}" title="{vote.name}: {vote.dir}"></span>
                          {/each}
                        </span>
                      </div>
                    </div>
                  {/each}
                  {#if records.length > MATCH_PREVIEW_LIMIT}
                    <details class="detail-block nested-detail">
                      <summary>OLDER MATCHES ({Math.min(records.length - MATCH_PREVIEW_LIMIT, 12)})</summary>
                      {#each records.slice(MATCH_PREVIEW_LIMIT, 20) as match (match.id)}
                        <div class="match-row" class:win={match.win} class:loss={!match.win}>
                          <div class="mr-left">
                            <span class="mr-result" class:win={match.win}>{match.win ? 'WIN' : 'LOSS'}</span>
                            <span class="mr-num">#{match.matchN}</span>
                            <span class="mr-time">{timeSince(match.timestamp)}</span>
                          </div>
                          <div class="mr-right">
                            <span class="mr-lp" class:plus={match.lp >= 0} class:minus={match.lp < 0}>{match.lp >= 0 ? '+' : ''}{match.lp} LP</span>
                            {#if match.hypothesis}
                              <span class="mr-hyp" class:long={match.hypothesis.dir === 'LONG'} class:short={match.hypothesis.dir === 'SHORT'}>{match.hypothesis.dir}</span>
                            {/if}
                            <span class="mr-agents">
                              {#each (match.agentVotes || []).slice(0, 3) as vote}
                                <span class="mr-agent-dot" style="background:{vote.color}" title="{vote.name}: {vote.dir}"></span>
                              {/each}
                            </span>
                          </div>
                        </div>
                      {/each}
                    </details>
                  {/if}
                </details>
              {:else}
                <EmptyState image={CHARACTER_ART.actionVictory} title="NO ARENA MATCHES YET" subtitle="Challenge the AI agents!" ctaText="GO TO ARENA →" ctaHref="/arena" icon="⚔️" variant="pink" compact />
              {/if}
            </section>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .passport-page {
    --sp-bg: #031611;
    --sp-bg2: #0a2b20;
    --sp-pk: #ff8c79;
    --sp-pk-l: #ffc8c1;
    --sp-w: #f7dcd6;
    --sp-dim: rgba(247, 220, 214, 0.5);
    --sp-soft: rgba(255, 140, 121, 0.15);
    --sp-soft-2: rgba(255, 140, 121, 0.1);
    --sp-line: rgba(255, 140, 121, 0.3);
    --sp-green: #9dcdb9;
    --sp-red: #ff725d;
    --sp-gold: #f7dcd6;
    --sp-space-1: 4px;
    --sp-space-2: 6px;
    --sp-space-3: 8px;
    --sp-space-4: 10px;
    --sp-space-5: 12px;
    --sp-space-6: 14px;
    --sp-font-display: 'Orbitron', 'Space Grotesk', sans-serif;
    --sp-font-label: 'Space Grotesk', sans-serif;
    --sp-font-body: 'Space Grotesk', sans-serif;
    --fp: var(--sp-font-label);
    --fd: var(--sp-font-display);
    --fm: var(--sp-font-body);
    height: 100%;
    overflow: hidden;
    position: relative;
    display: flex;
    justify-content: center;
    background:
      radial-gradient(circle at 8% 12%, rgba(255, 140, 121, 0.2) 0%, rgba(255, 140, 121, 0) 38%),
      radial-gradient(circle at 84% 8%, rgba(157, 205, 185, 0.12) 0%, rgba(157, 205, 185, 0) 32%),
      linear-gradient(180deg, var(--sp-bg2), var(--sp-bg));
  }

  .passport-page::before {
    content: '';
    position: absolute;
    left: -20%;
    right: -20%;
    bottom: -14px;
    height: 32%;
    pointer-events: none;
    z-index: 0;
    background:
      linear-gradient(90deg, rgba(255, 140, 121, 0.14) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 140, 121, 0.14) 1px, transparent 1px);
    background-size: 56px 34px;
    transform: perspective(420px) rotateX(56deg);
    transform-origin: center top;
    opacity: 0.14;
  }

  .passport-page::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 31%;
    height: 2px;
    pointer-events: none;
    z-index: 1;
    background: rgba(255, 140, 121, 0.42);
    box-shadow: 0 0 10px rgba(255, 140, 121, 0.28), 0 0 20px rgba(255, 140, 121, 0.14);
  }

  .passport-sunburst {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.14;
    background:
      radial-gradient(1px 1px at 11% 18%, rgba(255, 255, 255, 0.58) 50%, transparent 50%),
      radial-gradient(1px 1px at 29% 52%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 41% 6%, rgba(255, 255, 255, 0.55) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 66% 23%, rgba(255, 255, 255, 0.55) 50%, transparent 50%),
      radial-gradient(1px 1px at 84% 68%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1.4px 1.4px at 7% 88%, rgba(255, 255, 255, 0.55) 50%, transparent 50%);
    background-size: 350px 350px;
  }

  .passport-halftone {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      transparent 0px,
      transparent 4px,
      rgba(0, 0, 0, 0.06) 4px,
      rgba(0, 0, 0, 0.06) 5px
    );
    opacity: 0.14;
  }

  .passport-scroll {
    position: relative;
    z-index: 3;
    width: 100%;
    max-width: 1080px;
    height: 100%;
    overflow-y: auto;
    padding: var(--sp-space-5) var(--sp-space-4) var(--sp-space-5);
    box-sizing: border-box;
  }

  .passport-scroll::-webkit-scrollbar {
    width: 4px;
  }

  .passport-scroll::-webkit-scrollbar-thumb {
    background: var(--sp-pk);
    border-radius: 4px;
  }

  .passport-card {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--sp-line);
    border-radius: 16px;
    background:
      radial-gradient(circle at 100% 0%, rgba(255, 140, 121, 0.16) 0%, rgba(255, 140, 121, 0) 35%),
      linear-gradient(180deg, rgba(9, 34, 25, 0.96) 0%, rgba(5, 20, 14, 0.98) 100%);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.36), inset 0 0 0 1px rgba(255, 140, 121, 0.2);
  }

  .card-ribbon {
    position: relative;
    z-index: 2;
    padding: var(--sp-space-2) var(--sp-space-4);
    background: rgba(0, 0, 0, 0.22);
    border-bottom: 1px solid var(--sp-line);
  }

  .ribbon-text {
    font-family: var(--fp);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.32px;
    color: var(--sp-pk-l);
  }

  .unified-header {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-space-3);
    padding: var(--sp-space-5);
    border-bottom: 1px solid var(--sp-line);
    background: rgba(8, 22, 14, 0.72);
  }

  .uh-left {
    display: flex;
    gap: var(--sp-space-2);
    min-width: 0;
    align-items: center;
  }

  .uh-right {
    display: flex;
    flex-direction: column;
    gap: var(--sp-space-2);
    width: min(430px, 100%);
    min-width: min(320px, 100%);
    align-items: stretch;
  }

  .doge-avatar {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--sp-line);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease;
  }

  .doge-avatar:hover {
    transform: translateY(-1px);
  }

  .doge-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .avatar-edit {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--sp-pk);
    color: #111;
  }

  .player-info {
    min-width: 0;
  }

  .player-name {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: clamp(17px, 2vw, 22px);
    font-weight: 700;
    letter-spacing: 0.06px;
  }

  .name-pen {
    font-size: 11px;
    opacity: 0.55;
  }

  .name-edit {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .name-input {
    width: 160px;
    border-radius: 7px;
    border: 1px solid var(--sp-line);
    background: rgba(0, 0, 0, 0.35);
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 11px;
    padding: 6px 8px;
    outline: none;
  }

  .name-save {
    border: 1px solid var(--sp-pk);
    background: rgba(255, 140, 121, 0.15);
    color: var(--sp-pk-l);
    border-radius: 7px;
    padding: 5px 8px;
    font-family: var(--fp);
    font-size: 10px;
    cursor: pointer;
  }

  .player-tier {
    margin-top: 2px;
    font-family: var(--fp);
    font-size: 10px;
    letter-spacing: 0.12px;
  }

  .player-addr {
    margin-top: 5px;
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 11px;
  }

  .connect-mini {
    margin-top: 5px;
    border: 1px solid var(--sp-pk);
    background: rgba(255, 140, 121, 0.12);
    color: var(--sp-pk-l);
    border-radius: 7px;
    padding: 5px 10px;
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.12px;
    cursor: pointer;
  }

  .port-val {
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: right;
  }

  .pv-label {
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.12px;
  }

  .pv-amount {
    margin-top: 2px;
    color: var(--sp-w);
    font-family: 'JetBrains Mono', monospace;
    font-size: clamp(22px, 2.8vw, 32px);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .pv-pnl {
    margin-top: 2px;
    font-family: var(--fp);
    font-size: 10px;
    letter-spacing: 0.08px;
  }

  .pv-pnl.up {
    color: var(--sp-green);
  }

  .pv-pnl.down {
    color: var(--sp-red);
  }

  .uh-stats {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--sp-space-2);
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .uh-stats::-webkit-scrollbar {
    display: none;
  }

  .uhs {
    flex: 1 0 0;
    min-width: 72px;
    padding: var(--sp-space-2) 7px;
    border-radius: 8px;
    border: 1px solid var(--sp-soft);
    background: rgba(0, 0, 0, 0.25);
    text-align: center;
  }

  .uhs-val {
    display: block;
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.05;
  }

  .uhs-lbl {
    display: block;
    margin-top: 4px;
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 8px;
    letter-spacing: 0.18px;
  }

  .passport-stamp {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid rgba(255, 140, 121, 0.42);
    border-radius: 8px;
    color: var(--sp-pk-l);
    background: rgba(255, 140, 121, 0.08);
    transform: rotate(8deg);
    font-family: var(--fp);
  }

  .stamp-text {
    font-size: 6px;
    letter-spacing: 1px;
  }

  .stamp-icon {
    font-size: 6px;
    opacity: 0.8;
  }

  .avatar-picker {
    margin: var(--sp-space-2) var(--sp-space-4) var(--sp-space-3);
    padding: var(--sp-space-2);
    border-radius: 10px;
    border: 1px solid var(--sp-line);
    background: rgba(0, 0, 0, 0.22);
  }

  .ap-title {
    margin-bottom: 8px;
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 7px;
    letter-spacing: 1px;
  }

  .ap-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }

  .ap-opt {
    border: 1px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    background: none;
    cursor: pointer;
    aspect-ratio: 1;
  }

  .ap-opt:hover,
  .ap-opt.selected {
    border-color: var(--sp-pk);
  }

  .ap-opt img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .tab-bar {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 9;
    background: rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--sp-line);
    border-bottom: 1px solid var(--sp-line);
  }

  .tab-btn {
    position: relative;
    flex: 1;
    min-height: 48px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--sp-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-space-2);
    font-family: var(--fp);
    font-size: 10px;
    letter-spacing: 0.12px;
    cursor: pointer;
  }

  .tab-btn:hover {
    color: var(--sp-w);
    background: rgba(255, 140, 121, 0.06);
  }

  .tab-btn.active {
    color: var(--sp-pk-l);
    border-bottom-color: var(--sp-pk);
    background: rgba(255, 140, 121, 0.08);
    box-shadow: inset 0 -2px 0 rgba(255, 140, 121, 0.6);
  }

  .tab-icon {
    font-size: 16px;
    line-height: 1;
  }

  .tab-label {
    font-size: 10px;
    letter-spacing: 0.1px;
  }

  .tab-badge {
    position: absolute;
    top: 5px;
    right: 8px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--sp-pk);
    color: #111;
    font-family: var(--fp);
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .control-rail {
    position: sticky;
    top: 48px;
    z-index: 8;
    padding: var(--sp-space-2) var(--sp-space-3);
    border-bottom: 1px solid var(--sp-soft);
    background: rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(8px);
  }

  .quick-actions {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--sp-space-2);
    overflow-x: auto;
    padding-bottom: var(--sp-space-1);
  }

  .qa-btn {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0 12px;
    text-decoration: none;
    white-space: nowrap;
    font-family: var(--fp);
    font-size: 10px;
    letter-spacing: 0.08px;
  }

  .qa-btn {
    border: 1px solid var(--sp-line);
    color: var(--sp-w);
    background: rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }

  .qa-btn:hover {
    background: rgba(255, 140, 121, 0.12);
    border-color: rgba(255, 140, 121, 0.42);
  }

  .qa-terminal {
    color: var(--sp-pk-l);
  }

  .qa-arena {
    color: var(--sp-green);
  }

  .qa-sync {
    color: #8bd8ff;
  }

  .qa-sync:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .qa-btn:disabled {
    opacity: 0.62;
    cursor: default;
  }

  .qa-wallet {
    color: #cbefff;
  }

  .focus-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-space-2);
    padding: var(--sp-space-3) var(--sp-space-3) var(--sp-space-4);
    border-bottom: 1px solid var(--sp-soft);
    background: linear-gradient(180deg, rgba(8, 23, 16, 0.72), rgba(6, 18, 13, 0.62));
  }

  .focus-item {
    border: 1px solid var(--sp-soft);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.24);
    padding: var(--sp-space-2) var(--sp-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--sp-space-2);
    min-height: 78px;
  }

  .focus-item-primary {
    border-color: rgba(255, 140, 121, 0.42);
    background: rgba(255, 140, 121, 0.1);
  }

  .focus-k {
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.08px;
  }

  .focus-v {
    color: var(--sp-w);
    font-family: var(--fd);
    font-size: clamp(14px, 1.8vw, 18px);
    line-height: 1.05;
  }

  .focus-sub {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 11px;
    line-height: 1.32;
  }

  .focus-good {
    border-color: rgba(157, 205, 185, 0.34);
    background: rgba(157, 205, 185, 0.08);
  }

  .focus-good .focus-v {
    color: var(--sp-green);
  }

  .focus-warn {
    border-color: rgba(255, 208, 96, 0.34);
    background: rgba(255, 208, 96, 0.08);
  }

  .focus-warn .focus-v {
    color: #ffd060;
  }

  .focus-bad {
    border-color: rgba(255, 114, 93, 0.42);
    background: rgba(255, 114, 93, 0.1);
  }

  .focus-bad .focus-v {
    color: var(--sp-red);
  }

  .focus-neutral {
    border-color: var(--sp-soft);
    background: rgba(255, 255, 255, 0.02);
  }

  .tab-content {
    padding: var(--sp-space-5);
    background: linear-gradient(180deg, rgba(11, 32, 21, 0.66), rgba(7, 18, 13, 0.88));
  }

  .profile-tab,
  .wallet-tab,
  .positions-tab,
  .arena-tab {
    display: flex;
    flex-direction: column;
    gap: var(--sp-space-2);
  }

  .content-panel {
    border: 1px solid var(--sp-soft);
    border-radius: 12px;
    padding: var(--sp-space-5);
    background: rgba(0, 0, 0, 0.44);
  }

  .list-panel {
    padding-top: 8px;
  }

  .section-header {
    margin-bottom: var(--sp-space-3);
    color: var(--sp-pk-l);
    font-family: var(--fp);
    font-size: 12px;
    letter-spacing: 0.12px;
    border-left: 3px solid var(--sp-pk);
    padding-left: 8px;
  }

  .metrics-grid,
  .pos-summary,
  .arena-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-space-3);
  }

  .metric-card,
  .ps-item,
  .as-item,
  .wk-item {
    border: 1px solid var(--sp-soft);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.02);
    padding: var(--sp-space-3) var(--sp-space-2);
    text-align: center;
  }

  .metrics-detail {
    margin-top: 8px;
  }

  .mc-icon {
    font-size: 16px;
    margin-bottom: 6px;
  }

  .mc-value,
  .psi-value,
  .asi-val,
  .wk-v {
    color: var(--sp-w);
    font-family: var(--fd);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.1;
  }

  .mc-value.up {
    color: var(--sp-green);
  }

  .mc-value.fire {
    color: var(--sp-gold);
  }

  .mc-label,
  .psi-label,
  .asi-label,
  .wk-k {
    margin-top: 4px;
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.08px;
  }

  .summary-line {
    margin-top: var(--sp-space-3);
    padding: var(--sp-space-2) var(--sp-space-3);
    border-radius: 8px;
    border: 1px dashed var(--sp-soft);
    color: var(--sp-w);
    text-align: center;
    font-family: var(--fm);
    font-size: 12px;
  }

  .ml-action-row {
    margin-top: var(--sp-space-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-space-2);
  }

  .ml-info-line,
  .ml-error-line,
  .ml-empty-row {
    margin-top: var(--sp-space-2);
    border-radius: 8px;
    padding: var(--sp-space-2) var(--sp-space-3);
    font-family: var(--fm);
    font-size: 11px;
    line-height: 1.35;
  }

  .ml-info-line {
    color: #a9f0ff;
    border: 1px solid rgba(139, 216, 255, 0.28);
    background: rgba(139, 216, 255, 0.08);
  }

  .ml-error-line {
    color: #ffd2ca;
    border: 1px solid rgba(255, 114, 93, 0.34);
    background: rgba(255, 114, 93, 0.08);
  }

  .ml-empty-row {
    color: var(--sp-dim);
    border: 1px dashed var(--sp-soft);
    background: rgba(255, 255, 255, 0.02);
  }

  .ml-summary-preview,
  .ml-metric-preview {
    margin: 0 var(--sp-space-3) var(--sp-space-3);
    border-radius: 7px;
    border: 1px solid var(--sp-soft);
    background: rgba(0, 0, 0, 0.2);
    padding: var(--sp-space-2) var(--sp-space-3);
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 11px;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .detail-block {
    margin-top: var(--sp-space-2);
    border: 1px solid var(--sp-soft);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  .detail-block summary {
    list-style: none;
    cursor: pointer;
    user-select: none;
    padding: var(--sp-space-2) var(--sp-space-3);
    color: var(--sp-pk-l);
    font-family: var(--fp);
    font-size: 11px;
    letter-spacing: 0.08px;
    border-bottom: 1px solid transparent;
  }

  .detail-block[open] summary {
    border-bottom-color: var(--sp-soft);
    background: rgba(255, 140, 121, 0.08);
  }

  .detail-block summary::-webkit-details-marker {
    display: none;
  }

  .detail-block summary::before {
    content: '▸';
    margin-right: 7px;
    display: inline-block;
    transition: transform 0.12s ease;
  }

  .detail-block[open] summary::before {
    transform: rotate(90deg);
  }

  .detail-spaced {
    margin-top: var(--sp-space-3);
  }

  .agent-perf-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
  }

  .agent-perf-card {
    border: 1px solid var(--sp-soft);
    border-left-width: 3px;
    border-radius: 8px;
    padding: 9px;
    background: rgba(0, 0, 0, 0.2);
  }

  .apc-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
  }

  .apc-img {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    object-fit: cover;
  }

  .apc-icon {
    font-size: 16px;
  }

  .apc-name {
    font-family: var(--fm);
    font-size: 11px;
    font-weight: 700;
  }

  .apc-role {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 9px;
  }

  .apc-level {
    margin-left: auto;
    border-radius: 7px;
    padding: 2px 6px;
    color: var(--sp-pk-l);
    border: 1px solid var(--sp-soft);
    font-family: var(--fp);
    font-size: 8px;
  }

  .apc-bar-wrap {
    height: 5px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    margin-bottom: 4px;
  }

  .apc-bar {
    height: 100%;
    border-radius: 999px;
  }

  .apc-xp {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 9px;
  }

  .badges-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
  }

  .badge-card {
    border: 1px solid var(--sp-soft);
    border-radius: 8px;
    text-align: center;
    padding: 9px 6px;
    background: rgba(0, 0, 0, 0.2);
  }

  .badge-card.earned {
    background: rgba(157, 205, 185, 0.09);
    border-color: rgba(157, 205, 185, 0.26);
  }

  .badge-card.locked {
    opacity: 0.62;
  }

  .badge-icon {
    display: block;
    font-size: 16px;
    margin-bottom: 3px;
  }

  .badge-name {
    display: block;
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 10px;
  }

  .badge-date,
  .badge-desc {
    display: block;
    margin-top: 3px;
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 9px;
  }

  .vb-card {
    border: 1px solid var(--sp-line);
    border-radius: 10px;
    background: rgba(255, 140, 121, 0.08);
    padding: var(--sp-space-4);
  }

  .vb-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .vb-icon {
    font-size: 13px;
  }

  .vb-title {
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.2px;
  }

  .vb-amount {
    margin-top: 5px;
    color: var(--sp-pk-l);
    font-family: var(--sp-font-display);
    font-size: clamp(20px, 2.5vw, 26px);
    line-height: 1.1;
  }

  .vb-connect {
    margin-top: var(--sp-space-3);
    border: 1px solid var(--sp-pk);
    background: rgba(255, 140, 121, 0.16);
    color: var(--sp-pk-l);
    border-radius: 8px;
    padding: var(--sp-space-2) var(--sp-space-3);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.2px;
    cursor: pointer;
  }

  .vb-connected {
    margin-top: var(--sp-space-2);
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .vbc-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--sp-green);
    box-shadow: 0 0 5px rgba(157, 205, 185, 0.7);
  }

  .holdings-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    margin-bottom: var(--sp-space-2);
    border: 1px solid var(--sp-soft);
    border-radius: 999px;
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 10px;
  }

  .holdings-status.live {
    border-color: rgba(157, 205, 185, 0.32);
    color: var(--sp-green);
  }

  .hs-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--sp-pk);
  }

  .holdings-status.live .hs-dot {
    background: var(--sp-green);
  }

  .wallet-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-space-2);
  }

  .holdings-body {
    display: grid;
    grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
  }

  .st {
    padding: var(--sp-space-2) var(--sp-space-3);
    border-bottom: 1px solid var(--sp-soft);
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.2px;
  }

  .donut-section {
    border-right: 1px solid var(--sp-soft);
  }

  .donut-wrap {
    padding: var(--sp-space-2) var(--sp-space-3);
  }

  .donut-wrap svg {
    width: 100%;
    max-width: 170px;
    display: block;
    margin: 0 auto;
  }

  .legend {
    padding: 0 var(--sp-space-2) var(--sp-space-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .overflow-legend {
    padding-top: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 10px;
  }

  .li-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .li-name {
    font-weight: 700;
  }

  .li-pct {
    margin-left: auto;
    color: var(--sp-dim);
  }

  .table-section {
    overflow-x: auto;
  }

  .htable {
    min-width: 450px;
    padding: 0 var(--sp-space-2) var(--sp-space-2);
  }

  .hrow {
    display: grid;
    grid-template-columns: 1.8fr 1fr 1fr 1fr;
    gap: var(--sp-space-2);
    align-items: center;
    padding: var(--sp-space-2) var(--sp-space-2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .hrow:not(.header-row):hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .header-row {
    color: var(--sp-dim);
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.08px;
  }

  .hc {
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 12px;
  }

  .hc.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .asset-col {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .ai {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
  }

  .an {
    color: var(--sp-w);
    font-family: var(--fd);
    font-size: 11px;
  }

  .af {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 10px;
    margin-top: 2px;
  }

  .pos-section-title {
    margin-bottom: 6px;
    color: var(--sp-pk-l);
    font-family: var(--fp);
    font-size: 10px;
    letter-spacing: 0.2px;
  }

  .pos-row,
  .match-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-space-2);
    padding: var(--sp-space-2) var(--sp-space-2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 7px;
  }

  .pos-row:hover,
  .match-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .pos-row.tracked {
    background: rgba(255, 140, 121, 0.08);
  }

  .pos-row.closed {
    opacity: 0.67;
  }

  .pr-left,
  .mr-left {
    display: flex;
    align-items: center;
    gap: var(--sp-space-2);
    min-width: 0;
  }

  .pr-dir,
  .mr-result {
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.08px;
    border-radius: 6px;
    padding: 4px 8px;
    border: 1px solid;
    flex-shrink: 0;
  }

  .pr-dir.long {
    color: var(--sp-green);
    border-color: rgba(157, 205, 185, 0.35);
    background: rgba(157, 205, 185, 0.1);
  }

  .pr-dir.short {
    color: var(--sp-red);
    border-color: rgba(255, 114, 93, 0.35);
    background: rgba(255, 114, 93, 0.1);
  }

  .pr-pair {
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 12px;
    font-weight: 700;
  }

  .pr-src {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    white-space: nowrap;
  }

  .pr-right,
  .mr-right {
    display: flex;
    align-items: center;
    gap: var(--sp-space-2);
    flex-shrink: 0;
  }

  .pr-entry,
  .pr-time,
  .mr-time {
    color: var(--sp-dim);
    font-family: var(--fm);
    font-size: 11px;
  }

  .pr-pnl,
  .mr-lp {
    font-family: var(--fd);
    font-size: 12px;
    min-width: 56px;
    text-align: right;
  }

  .match-row.win {
    border-left: 2px solid var(--sp-green);
  }

  .match-row.loss {
    border-left: 2px solid var(--sp-red);
  }

  .mr-result {
    border: none;
  }

  .mr-result.win {
    color: var(--sp-green);
    background: rgba(157, 205, 185, 0.1);
  }

  .mr-result:not(.win) {
    color: var(--sp-red);
    background: rgba(255, 114, 93, 0.12);
  }

  .mr-num {
    color: var(--sp-w);
    font-family: var(--fm);
    font-size: 10px;
  }

  .mr-lp.plus {
    color: var(--sp-green);
  }

  .mr-lp.minus {
    color: var(--sp-red);
  }

  .mr-hyp {
    font-family: var(--fp);
    font-size: 9px;
    letter-spacing: 0.08px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid;
  }

  .mr-hyp.long {
    color: var(--sp-green);
    border-color: rgba(157, 205, 185, 0.36);
  }

  .mr-hyp.short {
    color: var(--sp-red);
    border-color: rgba(255, 114, 93, 0.36);
  }

  .mr-agents {
    display: flex;
    gap: 4px;
  }

  .mr-agent-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .nested-detail {
    margin: var(--sp-space-1) var(--sp-space-2) var(--sp-space-2);
    border-style: dashed;
  }

  .compact-detail {
    margin: var(--sp-space-1) 0 0;
  }

  @media (max-width: 980px) {
    .passport-scroll {
      padding: var(--sp-space-2);
    }

    .unified-header {
      grid-template-columns: 1fr;
    }

    .uh-right {
      min-width: 0;
      width: 100%;
      gap: var(--sp-space-2);
      align-items: stretch;
    }

    .port-val {
      text-align: left;
    }

    .focus-strip,
    .metrics-grid,
    .pos-summary,
    .arena-stats,
    .wallet-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .control-rail {
      position: relative;
      top: auto;
      z-index: 1;
      padding: var(--sp-space-2) var(--sp-space-3);
      backdrop-filter: none;
    }

    .ap-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .agent-perf-grid,
    .badges-grid {
      grid-template-columns: 1fr;
    }

    .uh-right {
      gap: var(--sp-space-2);
      min-width: 0;
      width: 100%;
    }

    .uh-stats {
      width: 100%;
      gap: 5px;
      justify-content: flex-start;
    }

    .pv-amount {
      font-size: clamp(20px, 7.8vw, 28px);
    }

    .uhs {
      min-width: 66px;
      padding: 6px 4px;
      border-radius: 7px;
    }

    .uhs-val {
      font-size: 13px;
    }

    .uhs-lbl {
      font-size: 8px;
      margin-top: 3px;
    }

    .quick-actions {
      justify-content: flex-start;
    }

    .focus-strip {
      grid-template-columns: 1fr;
    }

    .holdings-body {
      grid-template-columns: 1fr;
    }

    .donut-section {
      border-right: none;
      border-bottom: 1px solid var(--sp-soft);
    }

    .ap-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .pos-row,
    .match-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .pr-right,
    .mr-right {
      width: 100%;
      justify-content: space-between;
    }

    .passport-stamp {
      position: absolute;
      top: 8px;
      right: 10px;
      transform: rotate(0deg);
      margin-top: 0;
    }
  }
</style>
