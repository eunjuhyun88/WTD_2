// Pillar data composable for TradeMode.
// Owns $state for all side-fetch payloads (venue divergence, liq clusters,
// indicator context, SSR, RV cone, funding, options, confluence, captures).
// The heavy initialBundle fetch (chart + analyze) stays in TradeMode because
// chartPayload and analyzeData are tightly coupled to ChartBoard lifecycle.

import {
  fetchConfluenceCurrent,
  fetchConfluenceHistory,
  fetchFundingFlip,
  fetchFundingHistory,
  fetchIndicatorContext,
  fetchLiqClusters,
  fetchOptionsSnapshot,
  fetchRecentCaptures,
  fetchRvCone,
  fetchSsr,
  fetchVenueDivergence,
  type ConfluenceHistoryEntry,
  type RecentCaptureSummary,
} from '$lib/api/terminalBackend';
import type {
  VenueDivergencePayload,
  LiqClusterPayload,
  IndicatorContextPayload,
  SsrPayload,
  RvConePayload,
  FundingFlipPayload,
  FundingHistoryPayload,
  OptionsSnapshotPayload,
} from '$lib/indicators/adapter';
import type { ConfluenceResult } from '$lib/confluence/types';

/**
 * Manages pillar-data fetching, polling, and reactive state for TradeMode.
 *
 * @param getSymbol   Reactive getter; all symbol-specific fetches re-run when it changes.
 * @param getTimeframe Reactive getter; confluence fetch uses this.
 */
export function useTradeData(
  getSymbol: () => string,
  getTimeframe: () => string
) {
  let venueDivergence = $state<VenueDivergencePayload | null>(null);
  let liqClusters = $state<LiqClusterPayload | null>(null);
  let indicatorContext = $state<IndicatorContextPayload | null>(null);
  let ssr = $state<SsrPayload | null>(null);
  let rvCone = $state<RvConePayload | null>(null);
  let fundingFlip = $state<FundingFlipPayload | null>(null);
  let fundingHistory = $state<FundingHistoryPayload | null>(null);
  let pastCaptures = $state<RecentCaptureSummary[]>([]);
  let optionsSnapshot = $state<OptionsSnapshotPayload | null>(null);
  let confluence = $state<ConfluenceResult | null>(null);
  let confluenceHistory = $state<ConfluenceHistoryEntry[]>([]);

  async function refreshVenueDivergence() {
    try { venueDivergence = await fetchVenueDivergence(getSymbol()); } catch { /* tolerate: next poll retries */ }
  }

  async function refreshLiqClusters() {
    try { liqClusters = await fetchLiqClusters(getSymbol(), '4h'); } catch { /* tolerate */ }
  }

  async function refreshIndicatorContext() {
    try { indicatorContext = await fetchIndicatorContext(getSymbol()); } catch { /* tolerate */ }
  }

  async function refreshSsr() {
    try { ssr = await fetchSsr(); } catch { /* tolerate */ }
  }

  async function refreshRvCone() {
    try { rvCone = await fetchRvCone(getSymbol()); } catch { /* tolerate */ }
  }

  async function refreshFundingFlip() {
    try { fundingFlip = await fetchFundingFlip(getSymbol()); } catch { /* tolerate */ }
  }

  async function refreshFundingHistory() {
    try { fundingHistory = await fetchFundingHistory(getSymbol(), 270); } catch { /* tolerate */ }
  }

  async function refreshPastCaptures() {
    try { pastCaptures = await fetchRecentCaptures(8); } catch { /* tolerate */ }
  }

  async function refreshOptionsSnapshot() {
    const sym = getSymbol();
    const currency = sym.startsWith('BTC') ? 'BTC' : sym.startsWith('ETH') ? 'ETH' : null;
    if (!currency) { optionsSnapshot = null; return; }
    try { optionsSnapshot = await fetchOptionsSnapshot(currency); } catch { /* tolerate */ }
  }

  async function refreshConfluence() {
    try { confluence = await fetchConfluenceCurrent(getSymbol(), getTimeframe()); } catch { /* tolerate */ }
  }

  async function refreshConfluenceHistory() {
    try { confluenceHistory = await fetchConfluenceHistory(getSymbol(), 96); } catch { /* tolerate */ }
  }

  $effect(() => {
    // Track symbol reactively — all state resets and re-fetches on symbol change.
    void getSymbol();

    venueDivergence = null;
    liqClusters = null;
    indicatorContext = null;
    ssr = null;
    rvCone = null;
    fundingFlip = null;
    fundingHistory = null;
    optionsSnapshot = null;
    confluence = null;
    confluenceHistory = [];

    void refreshVenueDivergence();
    void refreshLiqClusters();
    void refreshIndicatorContext();
    void refreshSsr();
    void refreshRvCone();
    void refreshFundingFlip();
    void refreshFundingHistory();
    void refreshOptionsSnapshot();
    void refreshConfluence();
    void refreshConfluenceHistory();
    void refreshPastCaptures();

    const fastIv = setInterval(() => {
      if (document.hidden) return;
      void refreshVenueDivergence();
      void refreshLiqClusters();
      void refreshConfluence();
      void refreshConfluenceHistory();
    }, 60_000);
    const slowIv = setInterval(() => { if (!document.hidden) void refreshIndicatorContext(); }, 5 * 60_000);
    const flipIv = setInterval(() => { if (!document.hidden) void refreshFundingFlip(); }, 5 * 60_000);
    const ssrIv  = setInterval(() => { if (!document.hidden) void refreshSsr(); }, 10 * 60_000);
    const rvIv   = setInterval(() => { if (!document.hidden) void refreshRvCone(); }, 30 * 60_000);
    const optIv  = setInterval(() => { if (!document.hidden) void refreshOptionsSnapshot(); }, 5 * 60_000);

    return () => {
      clearInterval(fastIv);
      clearInterval(slowIv);
      clearInterval(flipIv);
      clearInterval(ssrIv);
      clearInterval(rvIv);
      clearInterval(optIv);
    };
  });

  return {
    get venueDivergence() { return venueDivergence; },
    get liqClusters() { return liqClusters; },
    get indicatorContext() { return indicatorContext; },
    get ssr() { return ssr; },
    get rvCone() { return rvCone; },
    get fundingFlip() { return fundingFlip; },
    get fundingHistory() { return fundingHistory; },
    get pastCaptures() { return pastCaptures; },
    get optionsSnapshot() { return optionsSnapshot; },
    get confluence() { return confluence; },
    get confluenceHistory() { return confluenceHistory; },
    refreshVenueDivergence,
    refreshLiqClusters,
    refreshConfluence,
  };
}
