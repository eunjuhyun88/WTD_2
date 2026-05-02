<script lang="ts">
  import type { Headline } from '$lib/data/warroom';
  import VerdictCard from '../workspace/VerdictCard.svelte';
  import { communityPosts, hydrateCommunityPosts, likeCommunityPost } from '$lib/stores/communityStore';
  import { openTrades, closeQuickTrade, hydrateQuickTrades } from '$lib/stores/quickTradeStore';
  import { activePairState } from '$lib/stores/activePairStore';
  import { predictMarkets, loadPolymarkets } from '$lib/stores/predictStore';
  import {
    polymarketPositions,
    gmxPositions,
    pendingPositions,
    hydratePositions,
    pollPendingPositions,
    positionsLoading,
    positionsError,
    positionsLastSyncedAt,
  } from '$lib/stores/positionStore';
  import { fetchUiStateApi, updateUiStateApi } from '$lib/api/preferencesApi';
  import { parseOutcomePrices } from '$lib/api/polymarket';
  import PolymarketBetPanel from './connectors/PolymarketBetPanel.svelte';
  import GmxTradePanel from './connectors/GmxTradePanel.svelte';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import {
    scoreColor,
    dirIcon,
    dirColor,
    policyBiasLabel,
    policyBiasClass,
    shadowSourceLabel,
    shadowExecuteLabel,
    scoreBreakdownText,
    fmtTrendPrice,
    fmtTrendVol,
    formatRelativeTime,
    getTokenAliases,
    apiErrorMessage,
  } from './intelHelpers';

  const dispatch = createEventDispatcher();

  // Chat props (passed from terminal page)
  export let chatMessages: { from: string; icon: string; color: string; text: string; time: string; isUser: boolean; isSystem?: boolean }[] = [];
  export let isTyping = false;
  export let prioritizeChat = false;
  export let chatFocusKey = 0;
  export let chatTradeReady = false;
  export let chatConnectionStatus: 'connected' | 'degraded' | 'disconnected' = 'connected';
  export let densityMode: 'essential' | 'pro' = 'essential';
  type ScanHighlight = {
    agent: string;
    vote: 'long' | 'short' | 'neutral';
    conf: number;
    note: string;
  };
  type ScanBrief = {
    pair: string;
    timeframe: string;
    token: string;
    createdAt: number;
    label: string;
    consensus: 'long' | 'short' | 'neutral';
    avgConfidence: number;
    summary: string;
    highlights: ScanHighlight[];
  };
  export let latestScan: ScanBrief | null = null;

  type FeedFilter = 'all' | 'news' | 'events' | 'flow' | 'trending' | 'community';
  let activeTab: 'chat' | 'feed' | 'positions' = 'chat';
  let feedFilter: FeedFilter = 'trending';
  const FEED_FILTER_OPTIONS_ALL: Array<{ key: FeedFilter; label: string }> = [
    { key: 'all', label: 'ALL' },
    { key: 'flow', label: 'FLOW' },
    { key: 'events', label: 'EVENTS' },
    { key: 'trending', label: 'TRENDING' },
    { key: 'news', label: 'NEWS' },
    { key: 'community', label: 'COMMUNITY' },
  ];
  const FEED_FILTER_OPTIONS_ESSENTIAL: Array<{ key: FeedFilter; label: string }> = [
    { key: 'trending', label: 'TRENDING' },
    { key: 'news', label: 'NEWS' },
    { key: 'events', label: 'EVENTS' },
  ];
  let feedFilterOptions: Array<{ key: FeedFilter; label: string }> = FEED_FILTER_OPTIONS_ALL;
  let posView: 'mine' | 'markets' = 'mine';
  let betMarket: any = null; // market to open in BetPanel
  let showGmxPanel = false;  // GmxTradePanel visibility
  let tabCollapsed = false;
  let _uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let _positionsPollTimer: ReturnType<typeof setInterval> | null = null;
  let _positionsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let _positionsLastRefreshAt = 0;
  let _positionVisibilityListener: (() => void) | null = null;

  const POSITIONS_MIN_REFRESH_MS = 8_000;
  const POSITIONS_PENDING_POLL_MS = 6_000;
  const POSITIONS_FULL_REFRESH_MS = 30_000;

  type PositionTradeRow = {
    id: string;
    pair: string;
    dir: 'LONG' | 'SHORT';
    entry: number;
    pnlPercent: number;
    demo?: boolean;
  };

  type PositionMarketRow = {
    id: string;
    asset: string;
    direction: string;
    amountUsdc: number | null;
    pnlPercent: number;
    pnlUsdc: number | null;
    status: string;
    meta: Record<string, unknown>;
    demo?: boolean;
  };

  const DEMO_QUICK_TRADES: PositionTradeRow[] = [
    { id: 'demo-trade-btc', pair: 'BTC/USDT', dir: 'LONG', entry: 103450, pnlPercent: 1.8, demo: true },
    { id: 'demo-trade-sol', pair: 'SOL/USDT', dir: 'SHORT', entry: 184.2, pnlPercent: -0.7, demo: true },
  ];

  const DEMO_GMX_POSITIONS: PositionMarketRow[] = [
    {
      id: 'demo-gmx-eth',
      asset: 'ETH',
      direction: 'LONG',
      amountUsdc: 600,
      pnlPercent: 2.34,
      pnlUsdc: 14.04,
      status: 'open',
      meta: { leverage: 5 },
      demo: true,
    },
  ];

  const DEMO_POLYMARKET_POSITIONS: PositionMarketRow[] = [
    {
      id: 'demo-poly-1',
      asset: 'BTC closes above $105k this week?',
      direction: 'YES',
      amountUsdc: 120,
      pnlPercent: 6.1,
      pnlUsdc: 7.32,
      status: 'filled',
      meta: {},
      demo: true,
    },
  ];

  // ═══ Live data from API (replaces hardcoded) ═══
  interface HeadlineEx extends Headline {
    interactions?: number;
    importance?: number;
    network?: string;
    creator?: string;
  }
  let liveHeadlines: HeadlineEx[] = [];
  let headlineOffset = 0;
  let headlineHasMore = true;
  let headlineLoading = false;
  let headlineSortBy: 'importance' | 'time' = 'importance';
  let liveEvents: Array<{ id: string; tag: string; level: string; text: string; source: string; createdAt: number }> = [];
  let liveFlows: Array<{ id: string; label: string; addr: string; amt: string; isBuy: boolean; source?: string }> = [];
  let dataLoaded = { headlines: false, events: false, flow: false, trending: false };

  // ═══ Onchain Alerts (텔레그램 봇 스타일 대시보드) ═══
  interface OnchainData {
    mvrv: { value: number | null; zone: string | null; nupl: number | null };
    whale: { count: number; netflow: number; ratio: number };
    liquidation: { longTotal1h: number; shortTotal1h: number; total1h: number; dominance: string };
    exchangeFlow: { netflow24h: number | null; direction: string };
    alerts: Array<{ id: string; category: string; severity: string; title: string; body: string }>;
    fetchedAt: number;
  }
  let onchainData: OnchainData | null = null;
  let onchainLoading = false;
  let _onchainTimer: ReturnType<typeof setInterval> | null = null;

  const MVRV_ZONE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    deep_value:    { label: 'Deep Value',    emoji: '🟣', color: '#a855f7' },
    undervalued:   { label: 'Undervalued',   emoji: '🔵', color: '#3b82f6' },
    fair_value:    { label: 'Fair Value',    emoji: '🟢', color: '#22c55e' },
    optimism:      { label: 'Optimism',      emoji: '🟡', color: '#eab308' },
    greed:         { label: 'Greed',         emoji: '🟠', color: '#f97316' },
    extreme_greed: { label: 'Extreme Greed', emoji: '🔴', color: '#ef4444' },
  };

  async function fetchOnchainData() {
    try {
      onchainLoading = !onchainData; // only show loading on first fetch
      const res = await fetch('/api/market/alerts/onchain', { signal: AbortSignal.timeout(12000) });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok && json?.data) {
        onchainData = json.data;
      }
    } catch { /* silent */ }
    onchainLoading = false;
  }

  function fmtUsd(v: number | null): string {
    if (v == null) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }

  // ═══ Trending data ═══
  interface TrendingCoin { rank: number; symbol: string; name: string; price: number; change1h: number; change24h: number; change7d: number; volume24h: number; sentiment?: number | null; socialVolume?: number | null; galaxyScore?: number | null; }
  interface GainerLoser extends TrendingCoin { direction: 'gainer' | 'loser'; }
  type TrendTab = 'hot' | 'gainers' | 'dex' | 'picks';
  const TREND_TAB_OPTIONS_ALL: Array<{ key: TrendTab; label: string; icon: string }> = [
    { key: 'picks', label: 'PICKS', icon: '🎯' },
    { key: 'hot', label: 'HOT', icon: '🔥' },
    { key: 'gainers', label: 'GAINERS', icon: '📈' },
    { key: 'dex', label: 'DEX', icon: '💎' },
  ];
  const TREND_TAB_OPTIONS_ESSENTIAL: Array<{ key: TrendTab; label: string; icon: string }> = [
    { key: 'picks', label: 'PICKS', icon: '🎯' },
    { key: 'hot', label: 'HOT', icon: '🔥' },
  ];
  interface DexHot {
    chainId: string;
    tokenAddress: string;
    url: string;
    description: string | null;
    icon: string | null;
    source: 'boost' | 'profile';
    symbol?: string | null;
    name?: string | null;
    priceUsd?: number | null;
    change24h?: number | null;
    volume24h?: number | null;
    liquidityUsd?: number | null;
  }
  let trendingCoins: TrendingCoin[] = [];
  let trendGainers: GainerLoser[] = [];
  let trendLosers: GainerLoser[] = [];
  let trendDexHot: DexHot[] = [];
  let trendSubTab: TrendTab = 'picks';
  let trendTabOptions: Array<{ key: TrendTab; label: string; icon: string }> = TREND_TAB_OPTIONS_ALL;
  let trendLoading = false;
  let trendUpdatedAt = 0;
  let dexChainFilter = 'all';

  const TREND_BASIS: Record<TrendTab, string> = {
    picks: 'Source: /api/terminal/opportunity-scan · 기준: 모멘텀/거래량/소셜/매크로/온체인 복합 점수',
    hot: 'Source: CMC trending/latest (fallback: volume_24h desc) + LunarCrush 상위 10개 소셜 보강',
    gainers: 'Source: CMC gainers-losers 24h (fallback: listings %24h 정렬)',
    dex: 'Source: DexScreener boosts top + profiles latest · chain:address dedup · token market 메타 보강',
  };

  // ═══ Opportunity Scanner (TOP PICKS) ═══
  interface OpScore {
    symbol: string; name: string; price: number;
    change1h: number; change24h: number; change7d: number;
    volume24h: number; marketCap: number;
    momentumScore: number; volumeScore: number; socialScore: number;
    macroScore: number; onchainScore: number; totalScore: number;
    direction: 'long' | 'short' | 'neutral'; confidence: number;
    reasons: string[]; alerts: string[];
    sentiment?: number | null; galaxyScore?: number | null;
    compositeScore?: number | null;
  }
  interface OpAlert { symbol: string; type: string; severity: string; message: string; score: number; }
  let topPicks: OpScore[] = [];
  let opAlerts: OpAlert[] = [];
  let macroRegime = '';
  let picksLoading = false;
  let picksScanTime = 0;
  let picksLoaded = false;

  // ═══ Intel Policy v3 (server-evaluated) ═══
  type PolicyPanel = 'headlines' | 'events' | 'flow' | 'trending' | 'picks';
  interface PolicyScores {
    actionability: number;
    timeliness: number;
    reliability: number;
    relevance: number;
    helpfulness: number;
  }
  interface PolicyGate {
    weightedScore: number;
    pass: boolean;
    visibility: 'full' | 'low_impact' | 'hidden';
    blockers: string[];
    scores: PolicyScores;
  }
  interface PolicyCard {
    id: string;
    panel: PolicyPanel;
    title: string;
    source: string;
    createdAt: number;
    bias: 'long' | 'short' | 'wait';
    confidence: number;
    what: string;
    soWhat: string;
    nowWhat: string;
    why: string;
    helpfulnessWhy: string;
    visualAid: string | null;
    gate: PolicyGate;
  }
  interface PolicyDecision {
    bias: 'long' | 'short' | 'wait';
    confidence: number;
    edgePct: number;
    qualityGateScore: number;
    coveragePct: number;
    reasons: string[];
    blockers: string[];
    shouldTrade: boolean;
  }

  interface ShadowProposal {
    bias: 'long' | 'short' | 'wait';
    confidence: number;
    horizonMin: number;
    rationale: string[];
    risks: string[];
    nowWhat: string;
  }

  interface ShadowEnforcedDecision {
    bias: 'long' | 'short' | 'wait';
    wouldTrade: boolean;
    shouldExecute: boolean;
    reasons: string[];
  }

  interface ShadowDecision {
    mode: 'shadow';
    generatedAt: number;
    source: 'llm' | 'fallback';
    fallbackReason: 'provider_unavailable' | 'llm_call_failed' | null;
    provider: string | null;
    model: string | null;
    proposal: ShadowProposal;
    enforced: ShadowEnforcedDecision;
  }

  interface ShadowRuntime {
    available: boolean;
    providers: string[];
    preferred: string | null;
  }

  let policyDecision: PolicyDecision | null = null;
  let policyPanels: Record<PolicyPanel, PolicyCard[]> = {
    headlines: [],
    events: [],
    flow: [],
    trending: [],
    picks: [],
  };
  let policyLoading = false;
  let policyLoaded = false;
  let policyUpdatedAt = 0;
  let policySummary: { pair: string; timeframe: string; domainsUsed: string[]; avgHelpfulness: number } | null = null;
  let policyCardsForTab: PolicyCard[] = [];
  let shadowDecision: ShadowDecision | null = null;
  let shadowRuntime: ShadowRuntime | null = null;
  let shadowExecutionEnabled = false;
  let shadowLoading = false;
  let shadowExecLoading = false;
  let shadowExecMessage = '';
  let shadowExecError = '';

  // Chat input (local)
  let chatInput = '';
  let chatEl: HTMLDivElement;
  let _lastChatFocusKey = 0;
  let showDebugModel = false;
  let opens: PositionTradeRow[] = [];
  let openCount = 0;
  let latestScanTime = '';
  let livePositionCount = 0;
  let hasLivePositions = false;
  let useDemoPositions = false;
  let displayTrades: PositionTradeRow[] = [];
  let displayGmxPositions: PositionMarketRow[] = [];
  let displayPolymarketPositions: PositionMarketRow[] = [];
  let displayOpenCount = 0;
  let displayGmxCount = 0;
  let displayPolymarketCount = 0;
  let positionCount = 0;
  let pendingCount = 0;
  let positionsSyncStatus = 'NOT SYNCED';
  let trendBasisText = TREND_BASIS.picks;
  let trendUpdatedLabel = '';
  let dexChains: string[] = ['all'];
  let filteredDexHot: DexHot[] = [];
  let currentToken = 'BTC';
  let tokenAliases: string[] = [];
  let headlineSource: HeadlineEx[] = [];
  let filteredHeadlines: HeadlineEx[] = [];
  let displayHeadlines: HeadlineEx[] = [];
  let visibleHeadlines: HeadlineEx[] = [];
  let visibleTopPicks: OpScore[] = [];
  let visibleTrendingCoins: TrendingCoin[] = [];
  let visibleTrendGainers: GainerLoser[] = [];
  let visibleTrendLosers: GainerLoser[] = [];
  let visibleDexHot: DexHot[] = [];

  function setTab(tab: 'chat' | 'feed' | 'positions') {
    if (activeTab === tab) {
      tabCollapsed = !tabCollapsed;
    } else {
      activeTab = tab;
      tabCollapsed = false;
      queueUiStateSave({ terminalActiveTab: activeTab });
    }
  }
  function setFeedFilter(f: FeedFilter) {
    feedFilter = f;
    queueUiStateSave({ terminalFeedFilter: feedFilter });
    if (f === 'trending') { fetchTopPicks(); fetchTrendingData(); }
  }

  function activateTrendTab(tab: TrendTab) {
    trendSubTab = tab;
    if (tab === 'picks') fetchTopPicks();
  }

  function queueUiStateSave(partial: Record<string, unknown>) {
    if (_uiStateSaveTimer) clearTimeout(_uiStateSaveTimer);
    _uiStateSaveTimer = setTimeout(() => {
      void updateUiStateApi(partial);
    }, 260);
  }

  async function syncPositions(force = false) {
    const now = Date.now();
    if (!force && now - _positionsLastRefreshAt < POSITIONS_MIN_REFRESH_MS) return;
    _positionsLastRefreshAt = now;
    await hydratePositions();
    await pollPendingPositions();
  }

  function syncPendingIfVisible() {
    if (activeTab !== 'positions') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    void pollPendingPositions();
  }

  function refreshPositionsNow() {
    void syncPositions(true);
  }

  function startPositionSyncLoop() {
    if (_positionsPollTimer) clearInterval(_positionsPollTimer);
    if (_positionsRefreshTimer) clearInterval(_positionsRefreshTimer);

    _positionsPollTimer = setInterval(() => {
      syncPendingIfVisible();
    }, POSITIONS_PENDING_POLL_MS);

    _positionsRefreshTimer = setInterval(() => {
      if (activeTab !== 'positions') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void syncPositions(true);
    }, POSITIONS_FULL_REFRESH_MS);
  }

  function handleClosePos(id: string) {
    const trade = opens.find(t => t.id === id);
    if (!trade) return;
    const state = $activePairState;
    const token = trade.pair.split('/')[0] as keyof typeof state.prices;
    const price = state.prices[token] || state.prices.BTC;
    closeQuickTrade(id, price);
  }

  let _isComposing = false;

  function sendChat() {
    if (!chatInput.trim()) return;
    dispatch('sendchat', { text: chatInput });
    chatInput = '';
  }
  function chatKey(e: KeyboardEvent) {
    // 한글 IME 조합 중에는 Enter 무시 (이중 전송 방지)
    if (e.isComposing || _isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  }

  // Auto-scroll chat when messages change
  $: if (chatMessages.length && chatEl) {
    setTimeout(() => { if (chatEl) chatEl.scrollTop = chatEl.scrollHeight; }, 50);
  }

  $: if (chatFocusKey !== _lastChatFocusKey) {
    _lastChatFocusKey = chatFocusKey;
    activeTab = 'chat';
    tabCollapsed = false;
  }

  $: opens = $openTrades;
  $: openCount = opens.length;
  $: latestScanTime = latestScan ? new Date(latestScan.createdAt).toTimeString().slice(0, 5) : '';
  $: livePositionCount = openCount + $gmxPositions.length + $polymarketPositions.length;
  $: hasLivePositions = livePositionCount > 0;
  $: useDemoPositions = !!$positionsError && !$positionsLoading && !hasLivePositions;
  $: displayTrades = useDemoPositions ? DEMO_QUICK_TRADES : opens;
  $: displayGmxPositions = useDemoPositions ? DEMO_GMX_POSITIONS : $gmxPositions;
  $: displayPolymarketPositions = useDemoPositions ? DEMO_POLYMARKET_POSITIONS : $polymarketPositions;
  $: displayOpenCount = displayTrades.length;
  $: displayGmxCount = displayGmxPositions.length;
  $: displayPolymarketCount = displayPolymarketPositions.length;
  $: positionCount = displayOpenCount + displayGmxCount + displayPolymarketCount;
  $: pendingCount = $pendingPositions.length;
  $: positionsSyncStatus = useDemoPositions
    ? 'DEMO MODE'
    : $positionsLoading
      ? 'SYNCING...'
      : $positionsError
        ? 'RETRY NEEDED'
        : $positionsLastSyncedAt
          ? `SYNCED ${formatRelativeTime($positionsLastSyncedAt)} AGO`
          : 'NOT SYNCED';
  $: trendBasisText = TREND_BASIS[trendSubTab];
  $: trendUpdatedLabel = trendUpdatedAt > 0 ? `${formatRelativeTime(trendUpdatedAt)} ago` : '';
  $: dexChains = ['all', ...Array.from(new Set(trendDexHot.map((token) => token.chainId)))];
  $: if (!dexChains.includes(dexChainFilter)) dexChainFilter = 'all';
  $: filteredDexHot = dexChainFilter === 'all'
    ? trendDexHot
    : trendDexHot.filter((token) => token.chainId === dexChainFilter);
  $: visibleTopPicks = densityMode === 'essential' ? topPicks.slice(0, 3) : topPicks.slice(0, 5);
  $: visibleTrendingCoins = densityMode === 'essential' ? trendingCoins.slice(0, 8) : trendingCoins;
  $: visibleTrendGainers = densityMode === 'essential' ? trendGainers.slice(0, 6) : trendGainers;
  $: visibleTrendLosers = densityMode === 'essential' ? trendLosers.slice(0, 6) : trendLosers;
  $: visibleDexHot = densityMode === 'essential' ? filteredDexHot.slice(0, 8) : filteredDexHot;
  $: feedFilterOptions = densityMode === 'essential' ? FEED_FILTER_OPTIONS_ESSENTIAL : FEED_FILTER_OPTIONS_ALL;
  $: trendTabOptions = densityMode === 'essential' ? TREND_TAB_OPTIONS_ESSENTIAL : TREND_TAB_OPTIONS_ALL;
  $: if (densityMode === 'essential' && (feedFilter === 'all' || feedFilter === 'flow' || feedFilter === 'community')) {
    setFeedFilter('trending');
  }
  $: if (densityMode === 'essential' && (trendSubTab === 'gainers' || trendSubTab === 'dex')) {
    trendSubTab = 'picks';
  }
  $: policyCardsForTab = feedFilter === 'news'
    ? policyPanels.headlines
    : feedFilter === 'events'
      ? policyPanels.events
      : feedFilter === 'flow'
        ? policyPanels.flow
        : feedFilter === 'trending'
          ? trendSubTab === 'picks'
            ? policyPanels.picks
            : policyPanels.trending
          : [];

  let _prevActiveTab: 'chat' | 'feed' | 'positions' = activeTab;
  $: {
    if (activeTab === 'positions' && _prevActiveTab !== 'positions') {
      void syncPositions(true);
    }
    _prevActiveTab = activeTab;
  }

  // ═══ Filter headlines by current chart ticker ═══
  $: currentToken = $activePairState.pair.split('/')[0] || 'BTC';
  $: tokenAliases = getTokenAliases(currentToken);
  $: headlineSource = liveHeadlines;
  $: filteredHeadlines = headlineSource.filter(hl =>
    tokenAliases.some(alias => hl.text.toLowerCase().includes(alias)) ||
    hl.text.toLowerCase().includes('crypto') ||
    hl.text.toLowerCase().includes('exchange') ||
    hl.text.toLowerCase().includes('market')
  );
  // Show all if no matches
  $: displayHeadlines = filteredHeadlines.length >= 2 ? filteredHeadlines : headlineSource;
  $: visibleHeadlines = densityMode === 'essential' ? displayHeadlines.slice(0, 8) : displayHeadlines;

  async function fetchLiveHeadlines(append = false) {
    if (headlineLoading) return;
    headlineLoading = true;
    try {
      const token = ($activePairState.pair || 'BTC/USDT').split('/')[0];
      const offset = append ? headlineOffset : 0;
      const res = await fetch(
        `/api/market/news?limit=20&offset=${offset}&token=${encodeURIComponent(token)}&sort=${headlineSortBy}&interval=1m`
      );
      const json = await res.json();
      if (json.ok && json.data?.records?.length > 0) {
        const newItems: HeadlineEx[] = json.data.records.map((r: any) => ({
          icon: r.sentiment === 'bullish' ? '📈' : r.sentiment === 'bearish' ? '📉' : '📊',
          time: formatRelativeTime(r.publishedAt),
          text: r.title || r.summary,
          bull: r.sentiment === 'bullish',
          link: r.link || '',
          interactions: r.interactions || 0,
          importance: r.importance || 0,
          network: r.network || 'rss',
          creator: r.creator || r.source || '',
        }));
        if (append) {
          liveHeadlines = [...liveHeadlines, ...newItems];
        } else {
          liveHeadlines = newItems;
        }
        headlineOffset = (json.data.offset ?? 0) + newItems.length;
        headlineHasMore = json.data.hasMore ?? false;
        dataLoaded.headlines = true;
        dataLoaded = dataLoaded;
      }
    } catch (e) {
      console.warn('[IntelPanel] Headlines API unavailable, using fallback');
    } finally {
      headlineLoading = false;
    }
  }

  function loadMoreHeadlines() {
    if (headlineHasMore && !headlineLoading) {
      fetchLiveHeadlines(true);
    }
  }

  function toggleHeadlineSort() {
    headlineSortBy = headlineSortBy === 'importance' ? 'time' : 'importance';
    headlineOffset = 0;
    headlineHasMore = true;
    fetchLiveHeadlines(false);
  }

  function handleHeadlineScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      loadMoreHeadlines();
    }
  }

  function applyPolicyPayload(raw: any) {
    const panels = raw?.panels ?? {};
    policyPanels = {
      headlines: Array.isArray(panels.headlines) ? panels.headlines : [],
      events: Array.isArray(panels.events) ? panels.events : [],
      flow: Array.isArray(panels.flow) ? panels.flow : [],
      trending: Array.isArray(panels.trending) ? panels.trending : [],
      picks: Array.isArray(panels.picks) ? panels.picks : [],
    };
    policyDecision = raw?.decision ?? null;
    policySummary = raw?.summary ?? null;
    policyUpdatedAt = Number(raw?.generatedAt ?? Date.now());
    policyLoaded = true;
  }

  async function fetchIntelPolicy() {
    if (policyLoading) return;
    policyLoading = true;
    shadowLoading = true;
    try {
      const pair = $activePairState.pair || 'BTC/USDT';
      const timeframe = $activePairState.timeframe || '4h';
      const qs = `pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`;

      const shadowRes = await fetch(`/api/terminal/intel-agent-shadow?${qs}`, {
        signal: AbortSignal.timeout(12000),
      });

      if (shadowRes.ok) {
        const shadowJson = await shadowRes.json();
        if (shadowJson?.ok && shadowJson?.data?.policy) {
          applyPolicyPayload(shadowJson.data.policy);
          shadowDecision = shadowJson.data.shadow ?? null;
          shadowRuntime = shadowJson.data.llm ?? null;
          shadowExecutionEnabled = Boolean(shadowJson.data.execution?.enabled);
          shadowLoading = false;
          return;
        }
      }

      const res = await fetch(`/api/terminal/intel-policy?${qs}`, {
        signal: AbortSignal.timeout(12000),
      });
      const json = await res.json();
      if (json?.ok && json?.data) {
        applyPolicyPayload(json.data);
        shadowDecision = null;
        shadowRuntime = null;
        shadowExecutionEnabled = false;
      }
    } catch (error) {
      console.warn('[IntelPanel] Intel policy API unavailable');
    } finally {
      policyLoading = false;
      shadowLoading = false;
    }
  }

  async function executeShadowTrade() {
    if (shadowExecLoading) return;
    if (!shadowDecision || !shadowDecision.enforced.shouldExecute) {
      shadowExecError = '실행 게이트를 통과한 상태가 아닙니다.';
      shadowExecMessage = '';
      return;
    }

    shadowExecLoading = true;
    shadowExecError = '';
    shadowExecMessage = '';

    try {
      const pair = $activePairState.pair || 'BTC/USDT';
      const timeframe = $activePairState.timeframe || '4h';
      const token = pair.split('/')[0] || 'BTC';
      const prices = ($activePairState.prices ?? {}) as Record<string, number>;
      const currentPrice = Number(prices[token] ?? prices.BTC ?? 0);

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error('현재가를 확인할 수 없습니다. 차트 로딩 후 다시 시도하세요.');
      }

      const response = await fetch('/api/terminal/intel-agent-shadow/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pair,
          timeframe,
          currentPrice,
          entry: currentPrice,
          refresh: true,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(apiErrorMessage(payload, `실행 실패 (${response.status})`));
      }

      await hydrateQuickTrades(true);
      const dir = String(payload?.data?.dir ?? '').toUpperCase();
      shadowExecMessage = `${dir || 'TRADE'} 실행 완료 · ${pair} @ ${currentPrice.toLocaleString()}`;
      shadowExecError = '';
      await fetchIntelPolicy();
    } catch (error: any) {
      shadowExecError = typeof error?.message === 'string' ? error.message : 'Shadow 실행 중 오류가 발생했습니다.';
      shadowExecMessage = '';
    } finally {
      shadowExecLoading = false;
    }
  }

  async function fetchLiveEvents() {
    try {
      const pair = $activePairState.pair || 'BTC/USDT';
      const res = await fetch(`/api/market/events?pair=${encodeURIComponent(pair)}`);
      const json = await res.json();
      if (json.ok && json.data?.records?.length > 0) {
        liveEvents = json.data.records;
        dataLoaded.events = true;
        dataLoaded = dataLoaded;
      }
    } catch (e) {
      console.warn('[IntelPanel] Events API unavailable, using fallback');
    }
  }

  async function fetchLiveFlow() {
    try {
      const pair = $activePairState.pair || 'BTC/USDT';
      const res = await fetch(`/api/market/flow?pair=${encodeURIComponent(pair)}`);
      const json = await res.json();
      if (json.ok && json.data) {
        const snap = json.data.snapshot || {};
        const flows: typeof liveFlows = [];
        if (snap.funding != null) {
          flows.push({
            id: 'funding',
            label: `Funding Rate ${snap.funding > 0 ? '↑' : '↓'}`,
            addr: json.data.pair,
            amt: `${(snap.funding * 100).toFixed(4)}%`,
            isBuy: snap.funding < 0,
            source: 'COINALYZE',
          });
        }
        if (snap.lsRatio != null) {
          flows.push({
            id: 'ls-ratio',
            label: 'Long / Short Ratio',
            addr: json.data.pair,
            amt: `${Number(snap.lsRatio).toFixed(2)}`,
            isBuy: Number(snap.lsRatio) < 1,
            source: 'COINALYZE',
          });
        }
        if (snap.liqLong24h || snap.liqShort24h) {
          flows.push({
            id: 'liq-long',
            label: '↙ Liquidations LONG 24h',
            addr: json.data.pair,
            amt: `$${Math.round(snap.liqLong24h || 0).toLocaleString()}`,
            isBuy: false,
            source: 'COINALYZE',
          });
          flows.push({
            id: 'liq-short',
            label: '↗ Liquidations SHORT 24h',
            addr: json.data.pair,
            amt: `$${Math.round(snap.liqShort24h || 0).toLocaleString()}`,
            isBuy: true,
            source: 'COINALYZE',
          });
        }
        if (snap.quoteVolume24h) {
          flows.push({
            id: 'volume',
            label: '↔ 24h Quote Volume',
            addr: json.data.pair,
            amt: `$${(snap.quoteVolume24h / 1e9).toFixed(2)}B`,
            isBuy: (snap.priceChangePct || 0) >= 0,
            source: 'BINANCE',
          });
        }
        if (snap.cmcMarketCap) {
          flows.push({
            id: 'cmc-mcap',
            label: 'Global Market Cap',
            addr: json.data.pair,
            amt: `$${(Number(snap.cmcMarketCap) / 1e9).toFixed(1)}B`,
            isBuy: (snap.cmcChange24hPct || 0) >= 0,
            source: 'CMC',
          });
        }
        if (snap.cmcChange24hPct != null) {
          const chg = Number(snap.cmcChange24hPct);
          flows.push({
            id: 'cmc-change',
            label: 'CMC 24h Change',
            addr: json.data.pair,
            amt: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
            isBuy: chg >= 0,
            source: 'CMC',
          });
        }
        if (flows.length === 0 && Array.isArray(json.data.records) && json.data.records.length > 0) {
          for (const rec of json.data.records.slice(0, 3)) {
            flows.push({
              id: `record-${rec.id}`,
              label: rec.agent || 'FLOW',
              addr: rec.pair || json.data.pair,
              amt: rec.text || '',
              isBuy: rec.vote === 'LONG',
              source: rec.source || 'UNKNOWN',
            });
          }
        }
        if (flows.length > 0) {
          liveFlows = flows;
          dataLoaded.flow = true;
          dataLoaded = dataLoaded;
        }
      }
    } catch (e) {
      console.warn('[IntelPanel] Flow API unavailable, using fallback');
    }
  }

  async function fetchTrendingData() {
    if (dataLoaded.trending || trendLoading) return;
    trendLoading = true;
    try {
      const res = await fetch('/api/market/trending?section=all&limit=15', { signal: AbortSignal.timeout(10000) });
      const json = await res.json();
      if (json.ok && json.data) {
        trendingCoins = json.data.trending ?? [];
        trendGainers = json.data.gainers ?? [];
        trendLosers = json.data.losers ?? [];
        trendDexHot = json.data.dexHot ?? [];
        trendUpdatedAt = Number(json.data.updatedAt ?? Date.now());
        dataLoaded.trending = true;
        dataLoaded = dataLoaded;
      }
    } catch (e) {
      console.warn('[IntelPanel] Trending API unavailable');
    } finally {
      trendLoading = false;
    }
  }

  async function fetchTopPicks() {
    if (picksLoaded || picksLoading) return;
    picksLoading = true;
    try {
      const res = await fetch('/api/terminal/opportunity-scan?limit=15', { signal: AbortSignal.timeout(15000) });
      const json = await res.json();
      if (json.ok && json.data) {
        topPicks = json.data.coins ?? [];
        opAlerts = json.data.alerts ?? [];
        macroRegime = json.data.macroBackdrop?.regime ?? '';
        picksScanTime = json.data.scanDurationMs ?? 0;
        picksLoaded = true;
      }
    } catch (e) {
      console.warn('[IntelPanel] Opportunity scan unavailable');
    } finally {
      picksLoading = false;
    }
  }

  // ═══ Pair 변경 시 Events/Flow 자동 refetch ═══
  let _prevPair = '';
  let _pairRefetchTimer: ReturnType<typeof setTimeout> | null = null;
  $: {
    const pair = $activePairState.pair || 'BTC/USDT';
    if (_prevPair && pair !== _prevPair) {
      // pair 바뀌면 debounce 후 refetch (빠른 전환 스팸 방지)
      if (_pairRefetchTimer) clearTimeout(_pairRefetchTimer);
      _pairRefetchTimer = setTimeout(() => {
        headlineOffset = 0;
        headlineHasMore = true;
        void Promise.allSettled([
          fetchIntelPolicy(),
          fetchLiveHeadlines(false),
          fetchLiveEvents(),
          fetchLiveFlow(),
        ]);
      }, 300);
    }
    _prevPair = pair;
  }

  // Crypto prediction markets for POSITIONS tab
  const CRYPTO_RX = /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|defi|web3)\b/i;
  $: cryptoMarkets = $predictMarkets
    .filter(m => CRYPTO_RX.test(m.question))
    .slice(0, 8);

  onMount(() => {
    loadPolymarkets();
    hydrateCommunityPosts();
    void syncPositions(true);
    startPositionSyncLoop();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden && activeTab === 'positions') {
        void syncPositions(true);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      _positionVisibilityListener = handleVisibility;
    }

    void (async () => {
      const ui = await fetchUiStateApi();
      // 채팅이 항상 최우선 — 저장된 상태보다 우선
      if (prioritizeChat) {
        activeTab = 'chat';
        tabCollapsed = false;
      } else {
        // 저장 상태 복원
        if (ui?.terminalActiveTab && ['chat', 'feed', 'positions'].includes(ui.terminalActiveTab)) {
          activeTab = ui.terminalActiveTab as typeof activeTab;
        }
        // legacy 'intel' → 'chat' 마이그레이션
        if ((activeTab as string) === 'intel') activeTab = 'chat';
      }
    })();

    // ── Load live market data (parallel) ──
    void Promise.allSettled([
      fetchIntelPolicy(),
      fetchLiveHeadlines(),
      fetchLiveEvents(),
      fetchLiveFlow(),
      fetchOnchainData(),
    ]);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      showDebugModel = params.get('debug') === '1' || params.get('debug') === 'true';
    }

    // Refresh onchain data every 2 min
    _onchainTimer = setInterval(() => void fetchOnchainData(), 120_000);
  });

  onDestroy(() => {
    if (_pairRefetchTimer) clearTimeout(_pairRefetchTimer);
    if (_uiStateSaveTimer) clearTimeout(_uiStateSaveTimer);
    if (_positionsPollTimer) clearInterval(_positionsPollTimer);
    if (_positionsRefreshTimer) clearInterval(_positionsRefreshTimer);
    if (_onchainTimer) clearInterval(_onchainTimer);
    if (_positionVisibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', _positionVisibilityListener);
    }
  });
</script>

<div class="intel-panel">
  <!-- Main Tabs with collapse toggle -->
  <div class="rp-tabs">
    <button class="rp-tab" class:active={activeTab === 'chat'} on:click={() => setTab('chat')}>CHAT</button>
    <button class="rp-tab" class:active={activeTab === 'feed'} on:click={() => setTab('feed')}>FEED</button>
    <button class="rp-tab" class:active={activeTab === 'positions'} on:click={() => setTab('positions')}>POSITIONS</button>
    <span class="rp-density-chip">{densityMode === 'essential' ? 'ESSENTIAL VIEW' : 'PRO VIEW'}</span>
    <button class="rp-collapse" on:click={() => tabCollapsed = !tabCollapsed} title={tabCollapsed ? 'Expand' : 'Collapse'}>
      {tabCollapsed ? '▲' : '▼'}
    </button>
    <button class="rp-panel-collapse" on:click={() => dispatch('collapse')} title="Collapse panel">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="1" y="2" width="14" height="12" rx="1.5"/>
        <line x1="10" y1="2" x2="10" y2="14"/>
      </svg>
    </button>
  </div>

  <!-- Tab Content (collapsible) -->
  {#if !tabCollapsed}
    <div class="rp-body-wrap">
      {#if activeTab === 'chat'}
        <VerdictCard
          bias={shadowDecision?.enforced.bias ?? policyDecision?.bias ?? 'wait'}
          confidence={shadowDecision?.proposal.confidence ?? policyDecision?.confidence ?? 0}
          pair={$activePairState.pair || 'BTC/USDT'}
          timeframe={$activePairState.timeframe || '4h'}
          reason={shadowDecision?.proposal.nowWhat ?? policyDecision?.reasons?.[0] ?? ''}
          edgePct={policyDecision?.edgePct ?? null}
          gateScore={policyDecision?.qualityGateScore ?? null}
          shouldExecute={shadowDecision?.enforced.shouldExecute ?? false}
          model={shadowDecision && showDebugModel ? shadowSourceLabel(shadowDecision) : null}
          showModelMeta={showDebugModel}
          loading={policyLoading || shadowLoading}
          executionEnabled={shadowExecutionEnabled}
          on:execute={executeShadowTrade}
        />

        <div class="rp-body chat-mode">
            <div class="ac-section ac-embedded">
              <div class="ac-header">
                <span class="ac-title">🤖 AGENT CHAT <span class="ac-status-dot ac-status-{chatConnectionStatus}" title="{chatConnectionStatus === 'connected' ? 'Connected' : chatConnectionStatus === 'degraded' ? 'Degraded' : 'Disconnected'}"></span></span>
                <button
                  class="ac-trade-btn"
                  class:ready={chatTradeReady}
                  on:click={() => dispatch('gototrade')}
                  disabled={!chatTradeReady}
                  title={chatTradeReady ? 'Move to chart and start drag trade planner' : 'Ask in chat first to unlock trade action'}
                >
                  TRADE ON CHART
                </button>
              </div>
              <!-- scan-brief 제거: 스캔 데이터는 채팅 패널에 표시하지 않음 -->
              <div class="ac-msgs" bind:this={chatEl}>
                {#each chatMessages as msg}
                  {#if msg.isSystem}
                    <div class="ac-sys">{msg.icon} {msg.text}</div>
                  {:else if msg.isUser}
                    <div class="ac-row ac-right">
                      <div class="ac-bub ac-bub-user">
                        <span class="ac-txt">{msg.text}</span>
                      </div>
                    </div>
                  {:else}
                    <div class="ac-row ac-left">
                      <span class="ac-av" style="border-color:{msg.color}">{msg.icon}</span>
                      <div class="ac-bub ac-bub-agent">
                        <span class="ac-name" style="color:{msg.color}">{msg.from}</span>
                        <span class="ac-txt">{msg.text}</span>
                      </div>
                    </div>
                  {/if}
                {/each}
                {#if isTyping}
                  <div class="ac-row ac-left">
                    <span class="ac-av" style="border-color:#ff2d9b">🧠</span>
                    <div class="ac-bub ac-bub-agent"><span class="ac-dots"><span></span><span></span><span></span></span></div>
                  </div>
                {/if}
              </div>
              <div class="ac-input">
                <input type="text" bind:value={chatInput} on:keydown={chatKey} on:compositionstart={() => _isComposing = true} on:compositionend={() => _isComposing = false} placeholder="@STRUCTURE @FLOW @DERIV ..." />
                <button class="ac-send" on:click={sendChat} disabled={!chatInput.trim()}>⚡</button>
              </div>
            </div>
        </div>

      {:else if activeTab === 'feed'}
        <!-- Feed filter chips -->
        <div class="feed-chips">
          {#each feedFilterOptions as option (option.key)}
            <button class="feed-chip" class:active={feedFilter === option.key} on:click={() => setFeedFilter(option.key)}>{option.label}</button>
          {/each}
        </div>

        <div class="rp-body">
          {#if feedFilter === 'all' || feedFilter === 'news'}
            {#if policyCardsForTab.length > 0}
              <div class="policy-cards-wrap">
                {#each policyCardsForTab as card (card.id)}
                  <div class="policy-card">
                    <div class="policy-card-head">
                      <span class="policy-card-title">{card.title}</span>
                      <span class="policy-card-bias {policyBiasClass(card.bias)}">{policyBiasLabel(card.bias)}</span>
                    </div>
                    <div class="policy-card-row"><strong>What:</strong> {card.what}</div>
                    <div class="policy-card-row"><strong>So What:</strong> {card.soWhat}</div>
                    <div class="policy-card-row"><strong>Now What:</strong> {card.nowWhat}</div>
                    <div class="policy-card-row"><strong>Why:</strong> {card.why}</div>
                    <div class="policy-card-row"><strong>Help WHY:</strong> {card.helpfulnessWhy}</div>
                    <div class="policy-card-score">
                      <span>Gate {card.gate.weightedScore.toFixed(1)}</span>
                      <span>{scoreBreakdownText(card.gate.scores)}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="hl-header-bar">
              <span class="hl-ticker-badge">{currentToken} NEWS</span>
              <button class="hl-sort-btn" on:click={toggleHeadlineSort} title="Toggle sort">
                {headlineSortBy === 'importance' ? '🔥 HOT' : '🕐 NEW'}
              </button>
            </div>
            <div class="hl-list hl-scrollable" on:scroll={handleHeadlineScroll}>
              {#if visibleHeadlines.length === 0 && !headlineLoading}
                <div class="flow-empty">No headlines yet</div>
              {/if}
              {#each visibleHeadlines as hl}
                {#if hl.link}
                  <a class="hl-row hl-linked" href={hl.link} target="_blank" rel="noopener noreferrer">
                    <span class="hl-icon">{hl.icon}</span>
                    <div class="hl-main">
                      <span class="hl-txt" class:bull={hl.bull}>{hl.text}</span>
                      <div class="hl-meta">
                        <span class="hl-time">{hl.time}</span>
                        {#if hl.network && hl.network !== 'rss'}
                          <span class="hl-net">{hl.network}</span>
                        {/if}
                        {#if densityMode === 'pro' && hl.interactions && hl.interactions > 0}
                          <span class="hl-engage">🔥 {hl.interactions > 1000 ? `${(hl.interactions / 1000).toFixed(1)}K` : hl.interactions}</span>
                        {/if}
                        {#if densityMode === 'pro' && hl.creator && hl.network !== 'rss'}
                          <span class="hl-creator">@{hl.creator.slice(0, 15)}</span>
                        {/if}
                      </div>
                    </div>
                    <span class="hl-ext">&#8599;</span>
                  </a>
                {:else}
                  <div class="hl-row">
                    <span class="hl-icon">{hl.icon}</span>
                    <div class="hl-main">
                      <span class="hl-txt" class:bull={hl.bull}>{hl.text}</span>
                      <div class="hl-meta">
                        <span class="hl-time">{hl.time}</span>
                        {#if hl.network && hl.network !== 'rss'}
                          <span class="hl-net">{hl.network}</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}
              {/each}
              {#if headlineLoading}
                <div class="hl-loading">Loading more...</div>
              {/if}
              {#if densityMode === 'pro' && !headlineHasMore && visibleHeadlines.length > 0}
                <div class="hl-end">— end of headlines —</div>
              {/if}
            </div>
          {/if}

          {#if feedFilter === 'all' || feedFilter === 'events'}
            <div class="ev-list">
              {#if liveEvents.length === 0}
                <div class="flow-empty">Loading events...</div>
              {/if}
              {#each liveEvents as ev}
                <div class="ev-card" style="border-left-color:{ev.level === 'warning' ? '#ff8c3b' : '#3b9eff'}">
                  <div class="ev-head">
                    <span class="ev-tag" style="background:{ev.tag === 'DERIV' ? '#ff8c3b' : ev.tag === 'ON-CHAIN' ? '#00e68a' : ev.tag === 'SOCIAL' ? '#8b5cf6' : '#3b9eff'};color:#000">{ev.tag}</span>
                    <span class="ev-etime">{formatRelativeTime(ev.createdAt)}</span>
                  </div>
                  <div class="ev-body">{ev.text}</div>
                  <span class="ev-src">{ev.source}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if feedFilter === 'all' || feedFilter === 'trending'}
            <div class="trend-panel">
              <div class="trend-sub-tabs">
                {#each trendTabOptions as option (option.key)}
                  <button class="trend-sub" class:active={trendSubTab === option.key} on:click={() => activateTrendTab(option.key)}>{option.icon} {option.label}</button>
                {/each}
              </div>
              <div class="trend-meta">
                <span class="trend-basis">{trendBasisText}</span>
                {#if trendUpdatedLabel}
                  <span class="trend-updated">updated {trendUpdatedLabel}</span>
                {/if}
              </div>

              {#if trendSubTab === 'picks'}
                <div class="picks-panel">
                  {#if picksLoading}
                    <div class="trend-loading">⏳ 멀티-에셋 스캔 중... ({topPicks.length > 0 ? '갱신' : '분석'})</div>
                  {:else if topPicks.length > 0}
                    <!-- Macro regime banner -->
                    <div class="picks-macro" class:risk-on={macroRegime === 'risk-on'} class:risk-off={macroRegime === 'risk-off'}>
                      매크로: <strong>{macroRegime === 'risk-on' ? '🟢 RISK-ON' : macroRegime === 'risk-off' ? '🔴 RISK-OFF' : '🟡 NEUTRAL'}</strong>
                      {#if picksScanTime > 0}<span class="picks-time">({(picksScanTime / 1000).toFixed(1)}s)</span>{/if}
                    </div>

                    <!-- Alerts banner -->
                    {#if opAlerts.length > 0}
                      <div class="picks-alerts">
                        {#each opAlerts.slice(0, 3) as alert}
                          <div class="pa-row" class:critical={alert.severity === 'critical'} class:warning={alert.severity === 'warning'}>
                            <span class="pa-msg">{alert.message}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Top 5 ranked picks -->
                    <div class="picks-section-lbl">🎯 TOP OPPORTUNITIES</div>
                    {#each visibleTopPicks as pick, i (pick.symbol)}
                      <div class="pick-card">
                        <div class="pick-head">
                          <span class="pick-rank" style="color:{scoreColor(pick.totalScore)}">#{i + 1}</span>
                          <span class="pick-sym">{pick.symbol}</span>
                          <span class="pick-dir" style="color:{dirColor(pick.direction)}">{dirIcon(pick.direction)} {pick.direction.toUpperCase()}</span>
                          <span class="pick-score" style="color:{scoreColor(pick.totalScore)}">{pick.totalScore}/100</span>
                        </div>
                        <div class="pick-price">
                          {fmtTrendPrice(pick.price)}
                          <span class="trend-chg" class:up={pick.change24h >= 0} class:dn={pick.change24h < 0}>
                            {pick.change24h >= 0 ? '+' : ''}{pick.change24h.toFixed(1)}%
                          </span>
                        </div>
                        <div class="pick-bar">
                          <div class="pb-seg mom" style="width:{pick.momentumScore}px" title="Momentum {pick.momentumScore}/25"></div>
                          <div class="pb-seg vol" style="width:{pick.volumeScore}px" title="Volume {pick.volumeScore}/20"></div>
                          <div class="pb-seg soc" style="width:{pick.socialScore}px" title="Social {pick.socialScore}/20"></div>
                          <div class="pb-seg mac" style="width:{pick.macroScore}px" title="Macro {pick.macroScore}/15"></div>
                          <div class="pb-seg onc" style="width:{pick.onchainScore}px" title="OnChain {pick.onchainScore}/20"></div>
                        </div>
                        <div class="pick-reasons">
                          {#each pick.reasons as reason}
                            <span class="pr-tag">{reason}</span>
                          {/each}
                          {#if pick.compositeScore != null}
                            <span class="pr-tag cs-chip" title="Perp composite: funding + LS ratio">
                              CS {Math.round(pick.compositeScore * 100)}%
                            </span>
                          {/if}
                        </div>
                        {#if pick.alerts.length > 0}
                          <div class="pick-alerts">
                            {#each pick.alerts.slice(0, 2) as a}<span class="pa-mini">{a}</span>{/each}
                          </div>
                        {/if}
                      </div>
                    {/each}

                    <!-- Rescan button -->
                    <button class="picks-rescan" on:click={() => { picksLoaded = false; fetchTopPicks(); }}>
                      🔄 다시 스캔
                    </button>
                  {:else}
                    <div class="trend-empty">🎯 PICKS 탭을 누르면 자동으로 트렌딩 코인을 분석합니다</div>
                  {/if}
                </div>

              {:else if trendLoading}
                <div class="trend-loading">Loading trending data...</div>
              {:else if trendSubTab === 'hot'}
                <div class="trend-list">
                  {#each visibleTrendingCoins as coin, i (coin.symbol + i)}
                    <div class="trend-row">
                      <span class="trend-rank">#{coin.rank}</span>
                      <div class="trend-coin">
                        <span class="trend-sym">{coin.symbol}</span>
                        <span class="trend-name">{coin.name}</span>
                      </div>
                      <div class="trend-data">
                        <span class="trend-price">{fmtTrendPrice(coin.price)}</span>
                        <span class="trend-chg" class:up={coin.change24h >= 0} class:dn={coin.change24h < 0}>
                          {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(1)}%
                        </span>
                      </div>
                      {#if densityMode === 'pro'}
                        <div class="trend-social">
                          {#if coin.socialVolume != null && coin.socialVolume > 0}
                            <span class="trend-soc" title="Social volume">💬 {coin.socialVolume > 1000 ? (coin.socialVolume / 1000).toFixed(0) + 'K' : coin.socialVolume}</span>
                          {/if}
                          {#if coin.galaxyScore != null && coin.galaxyScore > 0}
                            <span class="trend-galaxy" title="Galaxy Score">⭐ {coin.galaxyScore}</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                  {#if visibleTrendingCoins.length === 0}
                    <div class="trend-empty">No trending data available</div>
                  {/if}
                </div>

              {:else if trendSubTab === 'gainers'}
                <div class="trend-list">
                  {#if visibleTrendGainers.length > 0}
                    <div class="trend-section-lbl up">▲ TOP GAINERS 24H</div>
                    {#each visibleTrendGainers as coin, i (coin.symbol + '-g-' + i)}
                      <div class="trend-row gainer">
                        <span class="trend-rank">#{i + 1}</span>
                        <div class="trend-coin">
                          <span class="trend-sym">{coin.symbol}</span>
                          <span class="trend-name">{coin.name}</span>
                        </div>
                        <div class="trend-data">
                          <span class="trend-price">{fmtTrendPrice(coin.price)}</span>
                          <span class="trend-chg up">+{coin.change24h.toFixed(1)}%</span>
                        </div>
                        <span class="trend-vol">{fmtTrendVol(coin.volume24h)}</span>
                      </div>
                    {/each}
                  {/if}
                  {#if visibleTrendLosers.length > 0}
                    <div class="trend-section-lbl dn">▼ TOP LOSERS 24H</div>
                    {#each visibleTrendLosers as coin, i (coin.symbol + '-l-' + i)}
                      <div class="trend-row loser">
                        <span class="trend-rank">#{i + 1}</span>
                        <div class="trend-coin">
                          <span class="trend-sym">{coin.symbol}</span>
                          <span class="trend-name">{coin.name}</span>
                        </div>
                        <div class="trend-data">
                          <span class="trend-price">{fmtTrendPrice(coin.price)}</span>
                          <span class="trend-chg dn">{coin.change24h.toFixed(1)}%</span>
                        </div>
                        <span class="trend-vol">{fmtTrendVol(coin.volume24h)}</span>
                      </div>
                    {/each}
                  {/if}
                  {#if visibleTrendGainers.length === 0 && visibleTrendLosers.length === 0}
                    <div class="trend-empty">No gainers/losers data</div>
                  {/if}
                </div>

              {:else if trendSubTab === 'dex'}
                <div class="trend-list">
                  <div class="trend-section-lbl">💎 DEX HOT TOKENS</div>
                  <div class="dex-chain-filters">
                    {#each dexChains as chainId}
                      <button class="dex-chain-btn" class:active={dexChainFilter === chainId} on:click={() => dexChainFilter = chainId}>
                        {chainId.toUpperCase()}
                      </button>
                    {/each}
                  </div>
                  {#each visibleDexHot as token, i (token.chainId + token.tokenAddress)}
                    <a class="trend-row dex-row" href={token.url} target="_blank" rel="noopener">
                      <span class="trend-rank">#{i + 1}</span>
                      {#if token.icon}
                        <img class="dex-icon" src={token.icon} alt="" width="18" height="18" loading="lazy" />
                      {/if}
                      <div class="trend-coin">
                        <span class="trend-sym">{token.symbol || token.chainId.toUpperCase()}</span>
                        <span class="trend-name">{token.name || `${token.tokenAddress.slice(0, 6)}...${token.tokenAddress.slice(-4)}`}</span>
                        <span class="dex-addr">{token.chainId}:{token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}</span>
                      </div>
                      <div class="dex-metrics">
                        {#if token.priceUsd != null}
                          <span class="dex-price">{fmtTrendPrice(Number(token.priceUsd))}</span>
                        {/if}
                        {#if token.change24h != null}
                          <span class="trend-chg" class:up={Number(token.change24h) >= 0} class:dn={Number(token.change24h) < 0}>
                            {Number(token.change24h) >= 0 ? '+' : ''}{Number(token.change24h).toFixed(1)}%
                          </span>
                        {/if}
                        {#if token.volume24h != null}
                          <span class="dex-vol">Vol {fmtTrendVol(Number(token.volume24h))}</span>
                        {/if}
                      </div>
                      {#if token.description}
                        <span class="dex-desc">{token.description.slice(0, 40)}{token.description.length > 40 ? '...' : ''}</span>
                      {/if}
                      <span class="dex-source">{token.source === 'boost' ? 'BOOST' : 'PROFILE'}</span>
                      <span class="dex-link">↗</span>
                    </a>
                  {/each}
                  {#if visibleDexHot.length === 0}
                    <div class="trend-empty">No DEX trending data</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          {#if feedFilter === 'all' || feedFilter === 'flow'}
            <!-- ═══ Onchain Dashboard (텔레그램 봇 스타일) ═══ -->
            <div class="oc-dashboard">
              <div class="oc-header">ON-CHAIN SIGNALS</div>
              {#if onchainLoading && !onchainData}
                <div class="oc-loading">Loading on-chain data...</div>
              {:else if onchainData}
                {#if onchainData.mvrv}
                  {@const zoneInfo = MVRV_ZONE_LABELS[onchainData.mvrv.zone ?? ''] ?? { label: '—', emoji: '⚪', color: '#666' }}
                  {@const nuplVal = onchainData.mvrv.nupl}
                  {@const nuplColor = nuplVal == null ? '#666' : nuplVal > 0.5 ? '#ef4444' : nuplVal > 0.25 ? '#f97316' : nuplVal > 0 ? '#22c55e' : '#3b82f6'}
                  {@const mvrvGauge = onchainData.mvrv.value == null ? 0 : Math.max(0, Math.min(100, onchainData.mvrv.value * 22))}
                  {@const nuplGauge = nuplVal == null ? 0 : Math.max(0, Math.min(100, (nuplVal + 1) * 50))}
                  {@const wNet = onchainData.whale.netflow}
                  {@const wBullish = wNet < 0}
                  {@const ef = onchainData.exchangeFlow.netflow24h}
                  {@const efOut = ef != null && ef < 0}
                  <div class="oc-grid">
                    <div class="oc-card">
                      <div class="oc-card-lbl">MVRV</div>
                      <div class="oc-card-val" style="color:{zoneInfo.color}">{onchainData.mvrv.value?.toFixed(3) ?? '—'}</div>
                      <div class="oc-mini-gauge">
                        <span style="width:{mvrvGauge}%;background:{zoneInfo.color};"></span>
                      </div>
                      <div class="oc-card-tag" style="background:{zoneInfo.color}20;color:{zoneInfo.color}">{zoneInfo.emoji} {zoneInfo.label}</div>
                    </div>

                    <div class="oc-card">
                      <div class="oc-card-lbl">NUPL</div>
                      <div class="oc-card-val" style="color:{nuplColor}">{nuplVal?.toFixed(3) ?? '—'}</div>
                      <div class="oc-mini-gauge">
                        <span style="width:{nuplGauge}%;background:{nuplColor};"></span>
                      </div>
                      <div class="oc-card-sub">{nuplVal == null ? '' : nuplVal > 0.5 ? 'Euphoria' : nuplVal > 0.25 ? 'Belief' : nuplVal > 0 ? 'Hope' : 'Capitulation'}</div>
                    </div>

                    <div class="oc-card">
                      <div class="oc-card-lbl">🐋 WHALE</div>
                      <div class="oc-card-val" style="color:{wBullish ? '#22c55e' : '#ef4444'}">{onchainData.whale.count}건</div>
                      <div class="oc-card-sub" style="color:{wBullish ? '#22c55e' : '#ef4444'}">{wBullish ? '순매수' : '순매도'} {fmtUsd(Math.abs(wNet))}</div>
                    </div>

                    <div class="oc-card">
                      <div class="oc-card-lbl">🏦 EX FLOW</div>
                      <div class="oc-card-val" style="color:{ef == null ? '#666' : efOut ? '#22c55e' : '#ef4444'}">{ef != null ? (efOut ? '−' : '+') : ''}{fmtUsd(ef != null ? Math.abs(ef) : null)}</div>
                      <div class="oc-card-sub">{efOut ? 'Outflow (Bullish)' : ef != null && ef > 0 ? 'Inflow (Bearish)' : '—'}</div>
                    </div>
                  </div>
                {/if}

                <!-- Liquidation bar -->
                {#if onchainData.liquidation.total1h > 0}
                  {@const longPct = onchainData.liquidation.total1h > 0 ? (onchainData.liquidation.longTotal1h / onchainData.liquidation.total1h) * 100 : 50}
                  <div class="oc-liq">
                    <div class="oc-liq-header">
                      <span>💀 LIQUIDATIONS (1H)</span>
                      <span class="oc-liq-total">{fmtUsd(onchainData.liquidation.total1h)}</span>
                    </div>
                    <div class="oc-liq-bar">
                      <div class="oc-liq-long" style="width:{longPct}%"><span>L {longPct.toFixed(0)}%</span></div>
                      <div class="oc-liq-short" style="width:{100 - longPct}%"><span>S {(100 - longPct).toFixed(0)}%</span></div>
                    </div>
                  </div>
                {/if}

                <!-- Active alerts -->
                {#if onchainData.alerts.length > 0}
                  <div class="oc-alerts">
                    {#each onchainData.alerts.slice(0, 4) as alert (alert.id)}
                      <div class="oc-alert oc-alert-{alert.severity}">
                        <span class="oc-alert-title">{alert.title}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>

            <div class="flow-list">
              <div class="flow-section-lbl">SMART MONEY FLOWS (24H)</div>
              {#if liveFlows.length === 0}
                <div class="flow-empty">Loading flow data...</div>
              {/if}
              {#each liveFlows as flow (flow.id)}
                <div class="flow-row">
                  <div class="flow-dir" class:buy={flow.isBuy} class:sell={!flow.isBuy}>{flow.isBuy ? '↑' : '↓'}</div>
                  <div class="flow-info">
                    <div class="flow-lbl">{flow.label}</div>
                    <div class="flow-addr">{flow.addr}</div>
                    {#if flow.source}
                      <div class="flow-src">{flow.source}</div>
                    {/if}
                  </div>
                  <div class="flow-amt" class:buy={flow.isBuy} class:sell={!flow.isBuy}>{flow.amt}</div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- COMMUNITY (inside feed) -->
          {#if feedFilter === 'all' || feedFilter === 'community'}
            {#each $communityPosts as post (post.id)}
              <div class="comm-post user-post">
                <div class="comm-head">
                  <div class="comm-avatar" style="background:{post.avatarColor}20;color:{post.avatarColor}">{post.avatar}</div>
                  <span class="comm-name">{post.author}</span>
                  <span class="comm-time">now</span>
                </div>
                <div class="comm-txt">{post.text}</div>
                <div class="comm-actions">
                  {#if post.signal}
                    <span class="comm-sig {post.signal}">{post.signal.toUpperCase()}</span>
                  {/if}
                  <button class="comm-react" on:click={() => likeCommunityPost(post.id)}>👍</button>
                  <button class="comm-react" on:click={() => likeCommunityPost(post.id)}>🔥</button>
                </div>
              </div>
            {/each}
            {#if $communityPosts.length === 0 && feedFilter === 'community'}
              <div class="flow-empty">No community posts yet.</div>
            {/if}
          {/if}
        </div>

      {:else if activeTab === 'positions'}
        <!-- Position sub-tabs -->
        <div class="pos-view-tabs">
          <button class="pos-view-tab" class:active={posView === 'mine'} on:click={() => posView = 'mine'}>
            MY POSITIONS
            {#if positionCount > 0}<span class="pos-view-cnt">{positionCount}</span>{/if}
          </button>
          <button class="pos-view-tab" class:active={posView === 'markets'} on:click={() => posView = 'markets'}>
            MARKETS
          </button>
        </div>

        <div class="rp-body">
          {#if posView === 'mine'}
            <div class="pos-sync-row">
              <span
                class="pos-sync-badge"
                class:loading={$positionsLoading}
                class:error={!!$positionsError}
                class:ok={!$positionsLoading && !$positionsError}
                class:demo={useDemoPositions}
              >
                {positionsSyncStatus}
              </span>
              {#if pendingCount > 0}
                <span class="pos-sync-pending">{pendingCount} pending</span>
              {/if}
              <span class="pos-sync-total">{positionCount} total</span>
              <button class="pos-sync-btn" on:click={refreshPositionsNow} disabled={$positionsLoading}>
                REFRESH
              </button>
            </div>

            {#if $positionsError}
              <div class="pos-sync-error-msg">
                <div class="pos-sync-error-text">
                  <span class="pos-sync-error-title">포지션 동기화에 실패했습니다</span>
                  <span class="pos-sync-error-body">{$positionsError}</span>
                  {#if useDemoPositions}
                    <span class="pos-sync-error-note">연결 복구 전까지 데모 포지션을 표시합니다.</span>
                  {/if}
                </div>
                <div class="pos-sync-error-actions">
                  {#if !$positionsLoading}
                    <button class="pos-sync-inline-btn" on:click={refreshPositionsNow}>RETRY</button>
                  {/if}
                  <button class="pos-sync-inline-btn ghost" on:click={() => { posView = 'markets'; }}>MARKETS</button>
                </div>
              </div>
            {/if}

            <!-- TRADES -->
            {#if displayOpenCount > 0}
              <div class="pos-header">
                <span class="pos-title">📊 TRADES</span>
                <span class="pos-cnt">{displayOpenCount}</span>
              </div>
              {#each displayTrades as trade (trade.id)}
                <div class="pos-row" class:demo={!!trade.demo}>
                  <span class="pos-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>
                    {trade.dir === 'LONG' ? '▲' : '▼'}
                  </span>
                  <div class="pos-info">
                    <span class="pos-pair">{trade.pair}</span>
                    <span class="pos-entry">${Math.round(trade.entry).toLocaleString()}</span>
                  </div>
                  <span class="pos-pnl" style="color:{trade.pnlPercent >= 0 ? 'var(--grn)' : 'var(--red)'}">
                    {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
                  </span>
                  {#if trade.demo}
                    <span class="pos-status-badge demo">DEMO</span>
                  {:else}
                    <button class="pos-close" on:click={() => handleClosePos(trade.id)}>CLOSE</button>
                  {/if}
                </div>
              {/each}
            {/if}

            <!-- PERPS -->
            {#if displayGmxCount > 0}
              <div class="pos-header">
                <span class="pos-title">⚡ PERPS</span>
                <span class="pos-cnt">{displayGmxCount}</span>
              </div>
              {#each displayGmxPositions as pos (pos.id)}
                <div class="pos-row gmx-row" class:demo={!!pos.demo}>
                  <span class="pos-dir" class:long={pos.direction === 'LONG'} class:short={pos.direction === 'SHORT'}>
                    {pos.direction === 'LONG' ? '▲' : '▼'}
                  </span>
                  <div class="pos-info">
                    <span class="pos-pair">{pos.asset}</span>
                    <span class="pos-entry">
                      {pos.direction} · {pos.meta?.leverage ?? ''}x · ${pos.amountUsdc?.toFixed(0) ?? '0'} USDC
                    </span>
                  </div>
                  <div class="gmx-pnl-col">
                    <span class="pos-pnl" style="color:{pos.pnlPercent >= 0 ? 'var(--grn)' : 'var(--red)'}">
                      {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                    </span>
                    {#if pos.pnlUsdc != null}
                      <span class="gmx-pnl-usd" style="color:{pos.pnlUsdc >= 0 ? 'var(--grn)' : 'var(--red)'}">
                        {pos.pnlUsdc >= 0 ? '+' : ''}{pos.pnlUsdc.toFixed(2)}$
                      </span>
                    {/if}
                  </div>
                  <span class="pos-status-badge gmx-status" class:demo={!!pos.demo}>{pos.demo ? 'DEMO' : pos.status}</span>
                </div>
              {/each}
            {/if}
            <button class="gmx-open-btn" on:click={() => showGmxPanel = true}>
              ⚡ OPEN PERP POSITION
            </button>

            <!-- MARKET BETS -->
            {#if displayPolymarketCount > 0}
              <div class="pos-header">
                <span class="pos-title">🔮 MARKET BETS</span>
                <span class="pos-cnt">{displayPolymarketCount}</span>
              </div>
              {#each displayPolymarketPositions as pos (pos.id)}
                <div class="pos-row poly-row" class:demo={!!pos.demo}>
                  <span class="pos-dir" class:long={pos.direction === 'YES'} class:short={pos.direction === 'NO'}>
                    {pos.direction === 'YES' ? '↑' : '↓'}
                  </span>
                  <div class="pos-info">
                    <span class="pos-pair pos-market-q">{pos.asset.length > 40 ? pos.asset.slice(0, 40) + '…' : pos.asset}</span>
                    <span class="pos-entry">{pos.direction} · ${pos.amountUsdc?.toFixed(0)} USDC</span>
                  </div>
                  <span class="pos-pnl" style="color:{(pos.pnlUsdc ?? 0) >= 0 ? 'var(--grn)' : 'var(--red)'}">
                    {(pos.pnlUsdc ?? 0) >= 0 ? '+' : ''}{(pos.pnlUsdc ?? 0).toFixed(2)}$
                  </span>
                  <span class="pos-status-badge" class:demo={!!pos.demo}>{pos.demo ? 'DEMO' : pos.status}</span>
                </div>
              {/each}
            {/if}

            <!-- Empty state -->
            {#if !useDemoPositions && displayOpenCount === 0 && displayPolymarketCount === 0 && displayGmxCount === 0}
              <div class="pos-empty-state">
                <span class="pos-empty-icon">📊</span>
                <span class="pos-empty-txt">NO OPEN POSITIONS</span>
                <span class="pos-empty-sub">War Room 시그널을 차트에 적용하거나 바로 포지션을 생성할 수 있습니다.</span>
                <div class="pos-empty-actions">
                  <button class="pos-empty-btn primary" on:click={() => showGmxPanel = true}>OPEN PERP</button>
                  <button class="pos-empty-btn" on:click={() => { posView = 'markets'; }}>BROWSE MARKETS</button>
                </div>
              </div>
            {/if}

          {:else}
            <!-- BROWSE MARKETS -->
            {#if cryptoMarkets.length > 0}
              {#each cryptoMarkets.slice(0, 6) as market}
                {@const outcome = parseOutcomePrices(market.outcomePrices)}
                <div class="market-browse-card">
                  <div class="mb-q">{market.question.length > 60 ? market.question.slice(0, 60) + '…' : market.question}</div>
                  <div class="mb-odds">
                    <span class="mb-yes">YES {outcome.yes}¢</span>
                    <span class="mb-no">NO {outcome.no}¢</span>
                  </div>
                  <div class="mb-actions">
                    <button class="mb-bet" on:click={() => { betMarket = market; }}>BET USDC</button>
                    <a class="mb-link" href="https://polymarket.com/event/{market.slug}" target="_blank" rel="noopener noreferrer">↗</a>
                  </div>
                </div>
              {/each}
            {:else}
              <div class="pp-empty">Loading markets...</div>
            {/if}
          {/if}
        </div>

        <!-- Polymarket Bet Panel (slide-up) -->
        <PolymarketBetPanel market={betMarket} onClose={() => { betMarket = null; }} />

        <!-- GMX Trade Panel (slide-up) -->
        {#if showGmxPanel}
          <GmxTradePanel onClose={() => { showGmxPanel = false; }} />
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .intel-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--blk); overflow: hidden; }

  /* Global thin scrollbar for all scrollable children */
  .intel-panel :global(::-webkit-scrollbar) { width: 3px; height: 3px; }
  .intel-panel :global(::-webkit-scrollbar-thumb) { background: rgba(255,255,255,.1); border-radius: 3px; }
  .intel-panel :global(::-webkit-scrollbar-track) { background: transparent; }

  /* Removed: policy-decision-banner, shadow-decision-banner — replaced by VerdictCard */
  .policy-cards-wrap {
    display: grid;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    max-height: 240px;
    overflow: auto;
  }
  .policy-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 7px 8px;
    display: grid;
    gap: 4px;
  }
  .policy-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .policy-card-title {
    font-size: 10px;
    letter-spacing: 0.9px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.86);
  }
  .policy-card-bias {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .policy-card-bias.long { color: #00e676; border-color: rgba(0, 230, 118, 0.4); }
  .policy-card-bias.short { color: #ff5252; border-color: rgba(255, 82, 82, 0.4); }
  .policy-card-bias.wait { color: #ffd54f; border-color: rgba(255, 213, 79, 0.4); }
  .policy-card-row {
    font-size: 11px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.82);
  }
  .policy-card-row strong {
    color: rgba(232,150,125, 0.84);
    font-weight: 700;
    margin-right: 4px;
  }
  .policy-card-score {
    margin-top: 2px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.68);
  }

  /* ── Tabs ── */
  .rp-tabs { display: flex; border-bottom: 3px solid var(--yel); flex-shrink: 0; }
  .rp-tab {
    flex: 1; padding: 8px 3px;
    font-family: var(--fm); font-size: 11px; font-weight: 800; letter-spacing: 1.8px; text-align: center;
    background: none; border: none; cursor: pointer; transition: all .15s;
  }
  .rp-tab.active { background: rgba(232,150,125,0.15); color: #E8967D; }
  .rp-tab:not(.active) { color: rgba(255,255,255,.6); }
  .rp-tab:not(.active):hover { color: var(--yel); }
  .rp-density-chip {
    margin-left: auto;
    align-self: center;
    margin-right: 4px;
    font: 700 8px/1 var(--fm);
    letter-spacing: .7px;
    color: rgba(255,255,255,.56);
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 999px;
    background: rgba(255,255,255,.05);
    padding: 2px 6px;
    white-space: nowrap;
  }
  .rp-collapse {
    width: 28px; flex-shrink: 0;
    background: rgba(232,150,125,.08); border: none; border-left: 1px solid rgba(232,150,125,.15);
    color: var(--yel); font-size: 10px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .rp-collapse:hover { background: rgba(232,150,125,.2); }
  .rp-panel-collapse {
    width: 24px; flex-shrink: 0;
    background: rgba(255,255,255,.03); border: none; border-left: 1px solid rgba(232,150,125,.1);
    color: rgba(232,150,125,.68); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .12s; padding: 0;
  }
  .rp-panel-collapse:hover { background: rgba(232,150,125,.15); color: var(--yel); }

  /* Feed filter chips */
  .feed-chips {
    display: flex; gap: 4px; padding: 6px 8px; flex-shrink: 0;
    border-bottom: 1px solid rgba(232,150,125,.1);
    overflow-x: auto; scrollbar-width: none;
  }
  .feed-chips::-webkit-scrollbar { display: none; }
  .feed-chip {
    padding: 3px 10px; border-radius: 12px;
    font-family: var(--fm); font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
    color: rgba(255,255,255,.5); cursor: pointer; white-space: nowrap;
    transition: all .15s;
  }
  .feed-chip:hover { background: rgba(232,150,125,.06); color: rgba(255,255,255,.7); }
  .feed-chip.active { background: rgba(232,150,125,.12); color: var(--yel); border-color: rgba(232,150,125,.3); }

  /* ── Position View Tabs ── */
  .pos-view-tabs {
    display: flex; gap: 0; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .pos-view-tab {
    flex: 1; padding: 7px 0; text-align: center;
    font-family: var(--fm); font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
    color: rgba(255,255,255,.4); background: none; border: none; cursor: pointer;
    border-bottom: 2px solid transparent; transition: all .12s;
    display: flex; align-items: center; justify-content: center; gap: 5px;
  }
  .pos-view-tab:hover { color: rgba(255,255,255,.6); background: rgba(255,255,255,.02); }
  .pos-view-tab.active { color: #fff; border-bottom-color: var(--yel, #E8967D); }
  .pos-view-cnt {
    font-size: 8px; font-weight: 800;
    background: rgba(232,150,125,.15); color: var(--yel, #E8967D);
    padding: 1px 5px; border-radius: 8px; min-width: 16px;
  }

  /* ── Tab Content Wrapper ── */
  .rp-body-wrap { flex: 1 1 auto; overflow: hidden; display: flex; flex-direction: column; min-height: 72px; }
  .rp-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.08) transparent;
  }
  .rp-body::-webkit-scrollbar { width: 3px; }
  .rp-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 3px; }
  .rp-body::-webkit-scrollbar-track { background: transparent; }
  .rp-body.chat-mode { padding: 0; overflow: hidden; }

  /* ── Headlines ── */
  .hl-header-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px;
    background: rgba(232,150,125,.06);
    border-bottom: 1px solid rgba(232,150,125,.1);
  }
  .hl-ticker-badge {
    font-family: var(--fm); font-size: 8px; font-weight: 900;
    letter-spacing: 1.5px; color: var(--yel);
  }
  .hl-sort-btn {
    font-family: var(--fm); font-size: 7px; font-weight: 800;
    letter-spacing: .5px; padding: 2px 6px;
    background: rgba(255,255,255,.05); border: 1px solid rgba(232,150,125,.2);
    border-radius: 3px; color: rgba(232,150,125,.7); cursor: pointer;
    transition: all .12s;
  }
  .hl-sort-btn:hover { background: rgba(232,150,125,.12); color: var(--yel); }
  .hl-list { display: flex; flex-direction: column; min-height: 0; }
  .hl-scrollable {
    flex: 1 1 auto;
    min-height: 140px;
    overflow-y: auto;
    max-height: none;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .hl-scrollable::-webkit-scrollbar { width: 2px; }
  .hl-scrollable::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
  .hl-row { display: flex; gap: 6px; padding: 7px 8px; border-bottom: 1px solid rgba(232,150,125,.08); cursor: pointer; align-items: flex-start; }
  .hl-row:hover { background: rgba(232,150,125,.03); }
  .hl-icon { font-size: 10px; flex-shrink: 0; width: 16px; padding-top: 1px; }
  .hl-main { flex: 1; min-width: 0; }
  .hl-txt { font-family: var(--fm); font-size: 11px; line-height: 1.45; color: rgba(255,255,255,.8); display: block; }
  .hl-txt.bull { color: var(--grn); }
  .hl-meta { display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap; }
  .hl-time { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.3); }
  .hl-net {
    font-family: var(--fm); font-size: 7px; font-weight: 700; letter-spacing: .5px;
    color: rgba(139,92,246,.7); background: rgba(139,92,246,.1);
    padding: 0 4px; border-radius: 2px;
  }
  .hl-engage {
    font-family: var(--fm); font-size: 7px; font-weight: 700;
    color: rgba(255,140,59,.8);
  }
  .hl-creator {
    font-family: var(--fm); font-size: 7px;
    color: rgba(255,255,255,.3);
  }
  a.hl-linked { text-decoration: none; color: inherit; }
  .hl-linked:hover .hl-txt { text-decoration: underline; }
  .hl-ext { font-size: 10px; opacity: 0; transition: opacity .15s; flex-shrink: 0; color: rgba(232,150,125,.6); padding-top: 1px; }
  .hl-linked:hover .hl-ext { opacity: 1; }
  .hl-loading, .hl-end {
    font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.3);
    text-align: center; padding: 10px 0; letter-spacing: 1px;
  }

  /* ── Events ── */
  .ev-list { display: flex; flex-direction: column; gap: 5px; }
  .ev-card { border-left: 2px solid; padding: 6px 8px; background: rgba(255,255,255,.03); }
  .ev-head { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
  .ev-tag { font-family: var(--fm); font-size: 9px; font-weight: 700; padding: 2px 5px; }
  .ev-etime { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.6); }
  .ev-body { font-family: var(--fm); font-size: 11px; line-height: 1.45; color: rgba(255,255,255,.8); }
  .ev-src { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.3); display: block; margin-top: 3px; }

  /* ── Flow ── */
  /* ── Onchain Dashboard ── */
  .oc-dashboard { margin-bottom: 8px; }
  .oc-header { font-family: var(--fm); font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #a78bfa; padding: 4px 0 6px; border-bottom: 1px solid rgba(255,255,255,.1); }
  .oc-loading { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.4); text-align: center; padding: 12px 0; }
  .oc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; }
  .oc-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); padding: 7px 8px; display: flex; flex-direction: column; gap: 2px; }
  .oc-card-lbl { font-family: var(--fm); font-size: 8px; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,.5); }
  .oc-card-val { font-family: var(--fm); font-size: 15px; font-weight: 800; line-height: 1.1; }
  .oc-mini-gauge {
    height: 4px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    overflow: hidden;
    margin-top: 1px;
  }
  .oc-mini-gauge > span {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width .2s ease;
  }
  .oc-card-tag { font-family: var(--fm); font-size: 8px; font-weight: 600; padding: 1px 5px; border-radius: 2px; display: inline-block; width: fit-content; letter-spacing: .3px; }
  .oc-card-sub { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.55); letter-spacing: .3px; }

  .oc-liq { margin-top: 6px; }
  .oc-liq-header { display: flex; justify-content: space-between; align-items: center; font-family: var(--fm); font-size: 9px; font-weight: 700; color: rgba(255,255,255,.7); letter-spacing: .5px; margin-bottom: 3px; }
  .oc-liq-total { color: rgba(255,255,255,.5); }
  .oc-liq-bar { display: flex; height: 16px; border-radius: 2px; overflow: hidden; }
  .oc-liq-long { background: #ef444480; display: flex; align-items: center; justify-content: center; min-width: 20px; transition: width .3s; }
  .oc-liq-short { background: #22c55e80; display: flex; align-items: center; justify-content: center; min-width: 20px; transition: width .3s; }
  .oc-liq-long span, .oc-liq-short span { font-family: var(--fm); font-size: 8px; font-weight: 700; color: #fff; letter-spacing: .3px; }

  .oc-alerts { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
  .oc-alert { font-family: var(--fm); font-size: 9px; padding: 4px 7px; border-radius: 2px; border-left: 2px solid; }
  .oc-alert-critical { background: rgba(239,68,68,.12); border-color: #ef4444; color: #fca5a5; }
  .oc-alert-alert { background: rgba(249,115,22,.1); border-color: #f97316; color: #fdba74; }
  .oc-alert-info { background: rgba(59,130,246,.08); border-color: #3b82f6; color: #93c5fd; }
  .oc-alert-title { font-weight: 600; letter-spacing: .3px; }

  .flow-list { display: flex; flex-direction: column; gap: 4px; }
  .flow-empty { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.4); text-align: center; padding: 16px 0; letter-spacing: .5px; }
  .flow-section-lbl { font-family: var(--fm); font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: var(--grn); padding: 4px 0 5px; border-bottom: 1px solid rgba(255,255,255,.1); }
  .flow-row { display: flex; align-items: center; gap: 6px; padding: 5px 7px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); }
  .flow-dir { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
  .flow-dir.sell { color: var(--red); } .flow-dir.buy { color: var(--grn); }
  .flow-info { flex: 1; min-width: 0; }
  .flow-lbl { font-family: var(--fm); font-size: 11px; color: rgba(255,255,255,.8); }
  .flow-addr { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.6); }
  .flow-src { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.38); letter-spacing: .6px; margin-top: 1px; }
  .flow-amt { font-family: var(--fm); font-size: 10px; font-weight: 700; flex-shrink: 0; }
  .flow-amt.sell { color: var(--red); } .flow-amt.buy { color: var(--grn); }

  /* ── Community ── */
  .community-body { gap: 0; }
  .comm-post { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .comm-head { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; }
  .comm-avatar { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; border: 1px solid rgba(255,255,255,.2); }
  .comm-name { font-family: var(--fm); font-size: 11px; font-weight: 700; color: #fff; }
  .comm-time { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.3); margin-left: auto; }
  .comm-txt { font-family: var(--fm); font-size: 11px; line-height: 1.45; color: rgba(255,255,255,.8); }
  .comm-sig { display: inline-block; font-family: var(--fm); font-size: 9px; font-weight: 700; padding: 2px 7px; border: 1px solid; margin-top: 3px; }
  .comm-sig.long { color: var(--grn); border-color: rgba(0,255,136,.3); }
  .comm-sig.short { color: var(--red); border-color: rgba(255,45,85,.3); }
  .user-post { border-left: 2px solid var(--yel); }

  /* Community Reactions */
  .comm-actions {
    display: flex; align-items: center; gap: 4px; margin-top: 3px;
  }
  .comm-react {
    font-size: 11px; background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.14); border-radius: 4px;
    padding: 2px 6px; cursor: pointer; transition: all .12s;
  }
  .comm-react:hover { background: rgba(232,150,125,.1); border-color: rgba(232,150,125,.25); }

  /* ── Positions ── */
  .pos-header {
    display: flex; align-items: center; gap: 6px;
    padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .pos-title {
    font-family: var(--fm); font-size: 10px; font-weight: 900;
    letter-spacing: 2px; color: var(--yel);
  }
  .pos-cnt {
    font-family: var(--fm); font-size: 8px; font-weight: 900;
    background: var(--yel); color: #000;
    padding: 1px 6px; border-radius: 8px;
  }
  .pos-row {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 6px;
    background: rgba(255,255,255,.02);
    border: 1px solid rgba(255,255,255,.06);
  }
  .pos-row.demo {
    border-color: rgba(232,150,125,.22);
    background: rgba(232,150,125,.06);
  }
  .pos-dir {
    font-family: var(--fm); font-size: 12px; font-weight: 900;
    width: 20px; text-align: center;
  }
  .pos-dir.long { color: var(--grn); }
  .pos-dir.short { color: var(--red); }
  .pos-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .pos-pair { font-family: var(--fd); font-size: 11px; font-weight: 900; color: #fff; letter-spacing: .5px; }
  .pos-entry { font-family: var(--fm); font-size: 10px; color: rgba(255,255,255,.6); }
  .pos-pnl {
    font-family: var(--fd); font-size: 13px; font-weight: 900;
    letter-spacing: .5px; min-width: 50px; text-align: right;
  }
  .pos-close {
    font-family: var(--fm); font-size: 8px; font-weight: 900;
    letter-spacing: 1px; padding: 4px 8px;
    background: rgba(255,45,85,.1); color: var(--red);
    border: 1px solid rgba(255,45,85,.3); border-radius: 3px;
    cursor: pointer; transition: all .12s;
  }
  .pos-close:hover { background: rgba(255,45,85,.25); border-color: var(--red); }

  .pos-empty-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px 10px;
    border: 1px dashed rgba(232,150,125,.22);
    background: rgba(232,150,125,.05);
    border-radius: 8px;
    color: rgba(255,255,255,.3);
  }
  .pos-empty-icon { font-size: 14px; opacity: .6; }
  .pos-empty-txt {
    font-family: var(--fm); font-size: 10px; font-weight: 700;
    letter-spacing: 1.5px;
  }
  .pos-empty-sub {
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(255,255,255,.58);
    line-height: 1.4;
  }
  .pos-empty-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pos-empty-btn {
    font: 700 8px/1 var(--fm);
    letter-spacing: .8px;
    padding: 6px 9px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 5px;
    background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.82);
    cursor: pointer;
  }
  .pos-empty-btn.primary {
    border-color: rgba(0,230,138,.34);
    background: rgba(0,230,138,.14);
    color: #d8ffef;
  }
  .pos-empty-btn:hover {
    background: rgba(232,150,125,.12);
    border-color: rgba(232,150,125,.34);
  }

  /* Removed: pos-sub-tabs (positions flattened — no sub-tabs) */

  .pos-sync-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    min-height: 20px;
  }
  .pos-sync-badge {
    font: 700 8px/1 var(--fm);
    letter-spacing: .7px;
    padding: 2px 6px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,.16);
    color: rgba(255,255,255,.65);
    background: rgba(255,255,255,.04);
    white-space: nowrap;
  }
  .pos-sync-badge.loading {
    color: rgba(232,150,125,.88);
    border-color: rgba(232,150,125,.28);
    background: rgba(232,150,125,.1);
  }
  .pos-sync-badge.error {
    color: rgba(255,95,130,.9);
    border-color: rgba(255,95,130,.34);
    background: rgba(255,95,130,.12);
  }
  .pos-sync-badge.demo {
    color: rgba(232,150,125,.95);
    border-color: rgba(232,150,125,.38);
    background: rgba(232,150,125,.16);
  }
  .pos-sync-badge.ok {
    color: rgba(0,230,138,.86);
    border-color: rgba(0,230,138,.26);
    background: rgba(0,230,138,.1);
  }
  .pos-sync-pending,
  .pos-sync-total {
    font: 700 8px/1 var(--fm);
    letter-spacing: .7px;
    color: rgba(255,255,255,.56);
    white-space: nowrap;
  }
  .pos-sync-total {
    margin-right: auto;
  }
  .pos-sync-btn {
    font: 700 8px/1 var(--fm);
    letter-spacing: .8px;
    padding: 4px 7px;
    color: rgba(232,150,125,.84);
    background: rgba(232,150,125,.08);
    border: 1px solid rgba(232,150,125,.24);
    border-radius: 4px;
    cursor: pointer;
    transition: all .12s;
  }
  .pos-sync-btn:hover:not(:disabled) {
    background: rgba(232,150,125,.16);
    border-color: rgba(232,150,125,.38);
  }
  .pos-sync-btn:disabled {
    opacity: .55;
    cursor: not-allowed;
  }
  .pos-sync-error-msg {
    margin-top: -2px;
    margin-bottom: 6px;
    font: 400 9px/1.35 var(--fm);
    color: rgba(255,120,120,.9);
    border-left: 2px solid rgba(255,120,120,.45);
    background: rgba(255,120,120,.08);
    padding: 5px 7px;
    display: flex;
    align-items: center;
    gap: 10px;
    word-break: break-word;
  }
  .pos-sync-error-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pos-sync-error-title {
    font: 700 8px/1 var(--fm);
    letter-spacing: .7px;
    color: rgba(255,180,180,.95);
  }
  .pos-sync-error-body {
    font: 400 9px/1.35 var(--fm);
    color: rgba(255,150,150,.9);
  }
  .pos-sync-error-note {
    font: 700 8px/1.25 var(--fm);
    letter-spacing: .5px;
    color: rgba(255,210,170,.92);
  }
  .pos-sync-error-actions {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .pos-sync-inline-btn {
    margin-left: 0;
    font: 700 8px/1 var(--fm);
    letter-spacing: .6px;
    border: 1px solid rgba(255,120,120,.34);
    border-radius: 3px;
    background: rgba(255,120,120,.14);
    color: rgba(255,160,160,.95);
    padding: 2px 6px;
    cursor: pointer;
  }
  .pos-sync-inline-btn.ghost {
    margin-left: 0;
    border-color: rgba(255,255,255,.24);
    background: rgba(255,255,255,.08);
    color: rgba(255,255,255,.84);
  }
  .pos-sync-inline-btn:hover {
    background: rgba(255,120,120,.2);
  }

  /* ── Polymarket position row ── */
  .poly-row .pos-entry { font-size: 9px; color: rgba(255,255,255,.35); }
  .pos-market-q { font-size: 10px; line-height: 1.2; }
  .pos-status-badge {
    font: 700 8px/1 var(--fm); padding: 2px 5px; border-radius: 3px;
    background: rgba(232,150,125,.1); color: rgba(232,150,125,.7); letter-spacing: .5px;
    text-transform: uppercase; flex-shrink: 0;
  }
  .pos-status-badge.demo {
    background: rgba(232,150,125,.2);
    color: rgba(255,227,196,.95);
    border: 1px solid rgba(232,150,125,.3);
  }

  /* ── Market Browse Card ── */
  .market-browse-card {
    padding: 8px; background: rgba(139,92,246,.05);
    border: 1px solid rgba(139,92,246,.15); border-radius: 6px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .market-browse-card:hover { border-color: rgba(139,92,246,.3); }
  .mb-q { font: 400 10px/1.3 var(--fm); color: rgba(255,255,255,.7); }
  .mb-odds { display: flex; gap: 8px; font: 700 10px/1 var(--fm); }
  .mb-yes { color: #00CC88; }
  .mb-no { color: #FF5E7A; }
  .mb-actions { display: flex; gap: 6px; align-items: center; }
  .mb-bet {
    flex: 1; padding: 5px 8px; border: 1px solid rgba(232,150,125,.3);
    border-radius: 4px; background: rgba(232,150,125,.08);
    color: var(--yel); font: 700 9px/1 var(--fm); cursor: pointer;
    letter-spacing: 1px; transition: all .15s;
  }
  .mb-bet:hover { background: rgba(232,150,125,.15); }
  .mb-link {
    padding: 4px 8px; font: 400 12px/1 var(--fm); color: rgba(255,255,255,.3);
    text-decoration: none; border-radius: 4px;
  }
  .mb-link:hover { color: rgba(255,255,255,.6); background: rgba(255,255,255,.05); }

  /* ── PREDICT in Positions tab (horizontal scroll, 1 card visible) ── */
  .pp-section {
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(139,92,246,.15);
    margin-bottom: 2px;
  }
  .pp-header {
    display: flex; align-items: center; gap: 6px;
    padding-bottom: 5px;
  }
  .pp-title {
    font-family: var(--fm); font-size: 10px; font-weight: 900;
    letter-spacing: 2px; color: #a78bfa;
  }
  .pp-cnt {
    font-family: var(--fm); font-size: 8px; font-weight: 900;
    background: rgba(139,92,246,.25); color: #c4b5fd;
    padding: 1px 5px; border-radius: 8px;
  }
  .pp-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
    overscroll-behavior-x: contain;
  }
  .pp-scroll::-webkit-scrollbar { display: none; }
  .pp-card {
    flex: 0 0 calc(100% - 4px);
    scroll-snap-align: start;
    min-width: 0;
    padding: 8px;
    background: rgba(139,92,246,.06);
    border: 1px solid rgba(139,92,246,.2);
    border-radius: 4px;
  }
  .pp-linked {
    display: block;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .pp-linked:hover {
    border-color: rgba(139,92,246,.45);
    background: rgba(139,92,246,.12);
  }
  .pp-ext {
    display: block;
    margin-top: 4px;
    font-family: var(--fm); font-size: 7px; font-weight: 700;
    letter-spacing: .5px;
    color: rgba(139,92,246,.5);
    text-align: right;
  }
  .pp-q {
    font-family: var(--fm); font-size: 10px; font-weight: 700;
    color: rgba(255,255,255,.84); line-height: 1.35;
    margin-bottom: 6px;
  }
  .pp-bar-wrap {
    height: 4px; background: rgba(255,45,85,.2);
    border-radius: 2px; overflow: hidden; margin-bottom: 4px;
  }
  .pp-bar-yes {
    height: 100%; background: #00e68a; border-radius: 2px;
    transition: width .3s;
  }
  .pp-odds {
    display: flex; justify-content: space-between;
    font-family: var(--fm); font-size: 9px; font-weight: 800;
  }
  .pp-yes { color: var(--grn); }
  .pp-no { color: var(--red); }
  .pp-hint {
    text-align: center; padding: 3px 0 0;
    font-family: var(--fm); font-size: 8px;
    color: rgba(255,255,255,.42); letter-spacing: 1.6px;
  }
  .pp-empty {
    font-family: var(--fm); font-size: 9px;
    color: rgba(255,255,255,.5); padding: 8px 0;
  }

  /* ═══ AGENT CHAT (inside INTEL tab) ═══ */
  .ac-section {
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    min-height: 0;
    background: rgba(0,0,0,.3);
  }
  .ac-section.ac-embedded { border-top: 0; }
  .ac-status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-left: 4px;
    vertical-align: middle;
  }
  .ac-status-connected { background: #00ff88; box-shadow: 0 0 4px #00ff88; }
  .ac-status-degraded { background: #ffaa00; box-shadow: 0 0 4px #ffaa00; animation: pulse-dot 2s infinite; }
  .ac-status-disconnected { background: #ff2d55; box-shadow: 0 0 4px #ff2d55; animation: pulse-dot 1.5s infinite; }
  @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  .ac-header {
    display: flex; align-items: center; gap: 6px;
    justify-content: space-between;
    padding: 5px 8px 3px;
    flex-shrink: 0;
  }
  /* Removed: scan-brief CSS (scan data now in chat messages) */
  .ac-title {
    font-family: var(--fm); font-size: 10px; font-weight: 900;
    letter-spacing: 2px; color: var(--yel);
  }
  .ac-trade-btn {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.58);
    border-radius: 999px;
    padding: 3px 8px;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .65px;
    white-space: nowrap;
    cursor: not-allowed;
    transition: all .12s ease;
  }
  .ac-trade-btn.ready {
    border-color: rgba(0, 255, 136, 0.46);
    background: rgba(0, 255, 136, 0.18);
    color: #d9ffe9;
    cursor: pointer;
  }
  .ac-trade-btn.ready:hover {
    border-color: rgba(0, 255, 136, 0.7);
    background: rgba(0, 255, 136, 0.28);
    color: #f4fff8;
  }
  .ac-trade-btn:disabled {
    opacity: 0.66;
  }
  .ac-msgs {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    min-height: 0;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .ac-msgs::-webkit-scrollbar { width: 2px; }
  .ac-msgs::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
  .ac-sys {
    font-family: var(--fm); font-size: 10px; color: rgba(255,255,255,.58);
    padding: 5px 8px; background: rgba(232,150,125,.04);
    border-left: 2px solid rgba(232,150,125,.2);
  }
  .ac-row { display: flex; gap: 5px; }
  .ac-right { justify-content: flex-end; }
  .ac-left { justify-content: flex-start; }
  .ac-av {
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; border: 1.5px solid; flex-shrink: 0;
    background: rgba(255,255,255,.03);
  }
  .ac-bub { max-width: 85%; padding: 6px 9px; border-radius: 6px; }
  .ac-bub-user { background: rgba(232,150,125,.12); border: 1px solid rgba(232,150,125,.2); margin-left: auto; }
  .ac-bub-agent { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
  .ac-name { font-family: var(--fm); font-size: 10px; font-weight: 800; letter-spacing: 1px; display: block; margin-bottom: 2px; }
  .ac-txt { font-family: var(--fm); font-size: 11px; color: rgba(255,255,255,.84); line-height: 1.5; white-space: pre-line; }
  .ac-dots { display: flex; gap: 3px; padding: 4px 0; }
  .ac-dots span { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.3); animation: dotBounce .6s infinite; }
  .ac-dots span:nth-child(2) { animation-delay: .15s; }
  .ac-dots span:nth-child(3) { animation-delay: .3s; }
  @keyframes dotBounce { 0%,100%{opacity:.3} 50%{opacity:1} }

  .ac-input {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px 8px;
    border-top: 1px solid rgba(255,255,255,.08);
    flex-shrink: 0;
    background: rgba(5, 9, 7, .85);
  }
  .ac-input input {
    flex: 1; height: 34px; background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 6px; padding: 0 10px;
    font-family: var(--fm); font-size: 11px;
    color: #fff; outline: none;
  }
  .ac-input input::placeholder { color: rgba(255,255,255,.3); }
  .ac-input input:focus { border-color: rgba(232,150,125,.5); background: rgba(255,255,255,.07); }
  .ac-send {
    width: 34px; height: 34px; background: var(--yel); color: #000;
    border: none; border-radius: 6px;
    font-size: 13px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    flex-shrink: 0; transition: opacity .12s;
  }
  .ac-send:hover { opacity: .85; }
  .ac-send:disabled { opacity: .25; cursor: not-allowed; }

  /* ── Trending Panel ── */
  .trend-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .trend-sub-tabs {
    display: flex; gap: 2px; padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .trend-sub {
    flex: 1; background: transparent; border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
    color: rgba(255,255,255,.55); font-size: 9px; font-family: var(--fm); font-weight: 700;
    letter-spacing: .5px; padding: 4px 0; cursor: pointer; transition: all .15s;
  }
  .trend-sub:hover { background: rgba(255,255,255,.04); color: rgba(255,255,255,.8); }
  .trend-sub.active { background: rgba(232,150,125,.08); color: var(--yel); border-color: rgba(232,150,125,.25); }
  .trend-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 5px;
    border-bottom: 1px solid rgba(255,255,255,.05);
    background: rgba(255,255,255,.02);
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .trend-basis {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.55);
    letter-spacing: .25px;
    line-height: 1.35;
    flex: 1;
    min-width: 0;
  }
  .trend-updated {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.42);
    white-space: nowrap;
  }

  .trend-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .trend-loading, .trend-empty {
    padding: 20px; text-align: center; color: rgba(255,255,255,.35); font-size: 10px; font-family: var(--fm);
  }

  .trend-row {
    display: flex; align-items: center; gap: 8px; padding: 7px 4px;
    border-bottom: 1px solid rgba(255,255,255,.03); transition: background .1s;
  }
  .trend-row:hover { background: rgba(255,255,255,.03); }
  .trend-rank {
    width: 22px; flex-shrink: 0; font-family: var(--fm); font-size: 9px; font-weight: 700;
    color: rgba(255,255,255,.3); text-align: right;
  }
  .trend-coin { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .trend-sym { font-family: var(--fm); font-size: 10px; font-weight: 800; color: #fff; letter-spacing: .3px; }
  .trend-name { font-size: 8px; color: rgba(255,255,255,.48); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trend-data { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .trend-price { font-family: var(--fm); font-size: 10px; color: rgba(255,255,255,.8); }
  .trend-chg { font-family: var(--fm); font-size: 9px; font-weight: 700; }
  .trend-chg.up { color: #00e676; }
  .trend-chg.dn { color: #ff1744; }
  .trend-vol { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.3); flex-shrink: 0; width: 48px; text-align: right; }
  .trend-social { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; gap: 1px; }
  .trend-soc, .trend-galaxy { font-size: 8px; color: rgba(255,255,255,.4); white-space: nowrap; }
  .trend-section-lbl {
    font-family: var(--fm); font-size: 9px; font-weight: 800; letter-spacing: 1px;
    padding: 6px 2px 3px; color: rgba(255,255,255,.45);
  }
  .trend-section-lbl.up { color: #00e676; }
  .trend-section-lbl.dn { color: #ff1744; }
  .trend-row.gainer { border-left: 2px solid rgba(0,230,118,.2); }
  .trend-row.loser { border-left: 2px solid rgba(255,23,68,.2); }

  /* DEX trending */
  .dex-row { text-decoration: none; color: inherit; }
  .dex-row:hover { background: rgba(232,150,125,.04); }
  .dex-icon { border-radius: 50%; flex-shrink: 0; }
  .dex-chain-filters {
    display: flex;
    gap: 4px;
    margin: 2px 0 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .dex-chain-btn {
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(255,255,255,.03);
    color: rgba(255,255,255,.5);
    font: 700 8px/1 var(--fm);
    letter-spacing: .6px;
    padding: 4px 7px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }
  .dex-chain-btn.active {
    color: var(--yel);
    border-color: rgba(232,150,125,.3);
    background: rgba(232,150,125,.1);
  }
  .dex-addr {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.32);
    line-height: 1.2;
  }
  .dex-metrics {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    gap: 1px;
    min-width: 58px;
  }
  .dex-price { font: 700 9px/1 var(--fm); color: rgba(255,255,255,.85); }
  .dex-vol { font: 400 8px/1 var(--fm); color: rgba(255,255,255,.42); }
  .dex-source {
    font: 700 7px/1 var(--fm);
    letter-spacing: .5px;
    color: rgba(232,150,125,.55);
    border: 1px solid rgba(232,150,125,.2);
    border-radius: 999px;
    padding: 2px 5px;
    flex-shrink: 0;
  }
  .dex-desc { font-size: 8px; color: rgba(255,255,255,.3); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dex-link { color: rgba(232,150,125,.5); font-size: 10px; flex-shrink: 0; }

  /* ── TOP PICKS (Opportunity Scanner) ── */
  .picks-panel {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .picks-panel::-webkit-scrollbar { width: 2px; }
  .picks-panel::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

  @supports (animation-timeline: view()) {
    .hl-row,
    .ev-card,
    .comm-post,
    .pos-row,
    .pick-card {
      animation-name: intelReveal;
      animation-duration: 1ms;
      animation-fill-mode: both;
      animation-timeline: view();
      animation-range: entry 0% cover 24%;
    }
  }
  @keyframes intelReveal {
    from {
      opacity: 0.4;
      transform: translateY(10px) scale(0.985);
      filter: saturate(0.88);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: saturate(1);
    }
  }

  .picks-macro {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-radius: 4px;
    font-family: var(--fm); font-size: 9px; font-weight: 700; letter-spacing: .5px;
    color: rgba(255,255,255,.7);
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  }
  .picks-macro.risk-on { background: rgba(0,230,118,.08); border-color: rgba(0,230,118,.2); color: #00e676; }
  .picks-macro.risk-off { background: rgba(255,23,68,.08); border-color: rgba(255,23,68,.2); color: #ff1744; }
  .picks-time { font-size: 8px; opacity: .5; margin-left: 4px; font-weight: 400; }

  .picks-alerts { display: flex; flex-direction: column; gap: 3px; }
  .pa-row {
    display: flex; align-items: center; gap: 4px;
    padding: 3px 6px; border-radius: 3px;
    font-family: var(--fm); font-size: 8px; font-weight: 600;
    background: rgba(255,140,59,.06); border-left: 2px solid rgba(255,140,59,.4);
    color: rgba(255,140,59,.85);
  }
  .pa-row.critical { background: rgba(255,23,68,.08); border-left-color: #ff1744; color: #ff5252; }
  .pa-row.warning { background: rgba(255,193,7,.06); border-left-color: rgba(255,193,7,.5); color: rgba(255,193,7,.85); }
  .pa-msg { line-height: 1.35; }

  .picks-section-lbl {
    font-family: var(--fm); font-size: 9px; font-weight: 800; letter-spacing: 1.2px;
    color: rgba(232,150,125,.65); padding: 2px 0;
  }

  .pick-card {
    padding: 7px 8px; border-radius: 5px;
    background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.06);
    transition: background .12s, border-color .12s;
  }
  .pick-card:hover { background: rgba(232,150,125,.04); border-color: rgba(232,150,125,.15); }

  .pick-head {
    display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
  }
  .pick-rank { font-family: var(--fd); font-size: 12px; font-weight: 900; min-width: 22px; }
  .pick-sym { font-family: var(--fm); font-size: 11px; font-weight: 900; color: #fff; letter-spacing: .5px; }
  .pick-dir { font-family: var(--fm); font-size: 9px; font-weight: 800; letter-spacing: .5px; margin-left: auto; }
  .pick-score { font-family: var(--fd); font-size: 12px; font-weight: 900; letter-spacing: .3px; }

  .pick-price {
    font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.55);
    display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
  }

  .pick-bar {
    display: flex; gap: 1px; height: 6px; border-radius: 3px; overflow: hidden;
    background: rgba(255,255,255,.04); margin-bottom: 4px;
  }
  .pb-seg { height: 100%; min-width: 1px; border-radius: 1px; }
  .pb-seg.mom { background: #ff9800; }
  .pb-seg.vol { background: #2196f3; }
  .pb-seg.soc { background: #e040fb; }
  .pb-seg.mac { background: #00e676; }
  .pb-seg.onc { background: #ffd600; }

  .pick-reasons { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 2px; }
  .pr-tag {
    font-family: var(--fm); font-size: 7px; font-weight: 600; letter-spacing: .3px;
    padding: 1px 5px; border-radius: 3px;
    background: rgba(255,255,255,.05); color: rgba(255,255,255,.55);
    border: 1px solid rgba(255,255,255,.06);
  }

  .cs-chip { background: rgba(99,179,237,.12); color: #63b3ed; border-color: rgba(99,179,237,.2); }

  .pick-alerts { display: flex; flex-wrap: wrap; gap: 3px; }
  .pa-mini {
    font-family: var(--fm); font-size: 7px; font-weight: 700;
    padding: 1px 4px; border-radius: 2px;
    background: rgba(255,140,59,.08); color: rgba(255,140,59,.75);
    border: 1px solid rgba(255,140,59,.15);
  }

  .picks-rescan {
    width: 100%; padding: 6px; margin-top: 2px;
    font-family: var(--fm); font-size: 9px; font-weight: 700; letter-spacing: .8px;
    background: rgba(232,150,125,.06); border: 1px solid rgba(232,150,125,.15);
    border-radius: 4px; color: rgba(232,150,125,.7); cursor: pointer;
    transition: all .15s;
  }
  .picks-rescan:hover { background: rgba(232,150,125,.12); color: var(--yel); border-color: rgba(232,150,125,.3); }

  /* ── GMX Perps ── */
  .gmx-row { border-left: 2px solid rgba(255,140,0,.25); }
  .gmx-pnl-col { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; min-width: 50px; }
  .gmx-pnl-usd { font-family: var(--fm); font-size: 8px; font-weight: 700; }
  .gmx-status {
    background: rgba(255,140,0,.1); color: rgba(255,140,0,.7);
  }
  .gmx-open-btn {
    width: 100%; padding: 8px 12px; margin-top: 4px;
    font-family: var(--fm); font-size: 10px; font-weight: 900;
    letter-spacing: 1.5px; text-align: center;
    background: rgba(255,140,0,.08); border: 1px solid rgba(255,140,0,.25);
    border-radius: 5px; color: #ff8c00; cursor: pointer;
    transition: all .15s;
  }
  .gmx-open-btn:hover { background: rgba(255,140,0,.15); border-color: rgba(255,140,0,.4); color: #ffa033; }

  /* Internal section resizing disabled.
     Panel sizing is controlled by terminal-level column resizers for consistency. */
  .rp-body,
  .ac-msgs,
  .hl-scrollable,
  .trend-list,
  .picks-panel,
  .pp-scroll {
    resize: none;
  }
</style>
