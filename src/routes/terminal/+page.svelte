<script lang="ts">
  import { onMount } from 'svelte';
  import { safeParseResearchBlockEnvelope, type ResearchBlockEnvelope } from '$lib/contracts';
  import type { ChallengeAnswers, ParsedQuery } from '$lib/contracts';
  import {
    parseBlockSearchWithHints,
    summarizeParsedQuery
  } from '$lib/terminal/blockSearchParser';
  import { buildBlockSearchPreview } from '$lib/terminal/blockSearchPreview';
  import DataCard from '../../components/cogochi/DataCard.svelte';
  import QuickPanel from '../../components/cogochi/QuickPanel.svelte';
  import SingleAssetBoard from '../../components/terminal/SingleAssetBoard.svelte';
  import WorkspaceCompareBlock from '../../components/terminal/WorkspaceCompareBlock.svelte';
  import ResearchBlockRenderer from '../../components/terminal/research/ResearchBlockRenderer.svelte';
  import WalletIntelShell from '../../components/wallet-intel/WalletIntelShell.svelte';
  import { buildPassportWalletLink } from '$lib/utils/deepLinks';
  import {
    buildCompareRunLabel,
    buildWorkspaceComparePreviewQuery,
    createWorkspaceCompareId,
    formatTerminalCompareSymbol,
    parseWorkspaceCompareIntent,
    parseWorkspaceCompareMutation,
    type WorkspaceCompareBlock as WorkspaceCompareBlockData,
    type WorkspaceCompareIntent,
    type WorkspaceCompareMutation,
  } from '$lib/terminal/workspaceCompare';
  import {
    buildWalletIntelDataset,
    findWalletMarketToken,
    interpretWalletCommand,
    isWalletIdentifierLike,
    normalizeWalletModeInput,
    walletIntelApiPath,
    walletDeepLink,
  } from '$lib/wallet-intel/walletIntelController';
  import type {
    WalletIntelApiMeta,
    WalletIntelApiResult,
    WalletIntelDataset,
    WalletIntelTab,
    WalletModeInput,
  } from '$lib/wallet-intel/walletIntelTypes';
  import { clampLeftWidth, clampRightWidth } from '../../components/terminal/terminalLayoutController';

  // ─── Types ────────────────────────────────────────────────
  type MessageType =
    | { role: 'user'; text: string }
    | { role: 'douni'; text: string; widgets?: Widget[] }
    | { role: 'douni'; thinking: true };

  type Widget =
    | { type: 'chart'; symbol: string; timeframe: string; chartData?: any[] }
    | { type: 'compare'; blockId: string }
    | { type: 'metrics'; items: MetricItem[] }
    | { type: 'layers'; items: LayerItem[]; alphaScore: number; alphaLabel: string }
    | { type: 'actions'; patternName: string; direction: 'LONG' | 'SHORT'; conditions: string[] }
    | { type: 'scan_list'; items: any[]; sort: string; sector: string }
    | { type: 'research_block'; envelope: ResearchBlockEnvelope };

  interface MetricItem {
    title: string; value: string; subtext: string;
    trend: 'bull' | 'bear' | 'neutral' | 'danger';
    chartData: number[];
  }

  interface LayerItem {
    id: string; name: string; value: string; score: number;
  }

  // ─── SSE Event Types ─────────────────────────────────────
  type SSEEvent =
    | { type: 'text_delta'; text: string }
    | { type: 'tool_call'; name: string; args: Record<string, unknown> }
    | { type: 'tool_result'; name: string; data: any }
    | { type: 'research_block'; payload: ResearchBlockEnvelope }
    | { type: 'layer_result'; layer: string; score: number; signal: string; detail?: string }
    | { type: 'chart_action'; action: string; payload: Record<string, unknown> }
    | { type: 'pattern_draft'; name: string; conditions: unknown[]; requiresConfirmation: boolean }
    | { type: 'done'; provider: string; totalTokens?: number }
    | { type: 'error'; message: string };

  // ─── Feed Entry Types ─────────────────────────────────────
  type FeedEntry =
    | { kind: 'query'; text: string }
    | { kind: 'text'; text: string }
    | { kind: 'thinking' }
    | { kind: 'compare'; blockId: string; block: WorkspaceCompareBlockData }
    | { kind: 'metrics'; items: MetricItem[] }
    | { kind: 'layers'; items: LayerItem[]; alphaScore: number; alphaLabel: string }
    | { kind: 'compare'; blockId: string; block: WorkspaceCompareBlockData }
    | { kind: 'scan'; items: any[]; sort: string; sector: string }
    | { kind: 'actions'; patternName: string; direction: 'LONG' | 'SHORT'; conditions: string[] }
    | { kind: 'chart_ref'; symbol: string; timeframe: string }
    | { kind: 'research_block'; envelope: ResearchBlockEnvelope };

  type PanelDragTarget = 'left' | 'right';
  type PanelDragState = {
    target: PanelDragTarget;
    startX: number;
    startLeftWidth: number;
    startRightWidth: number;
  };
  type MobileTerminalMode = 'scanner' | 'workspace' | 'insight';
  type WizardToastState = { slug: string; href: string };

  // ─── State ────────────────────────────────────────────────
  let messages = $state<MessageType[]>([]);
  let inputText = $state('');
  let isThinking = $state(false);
  let feedContainer: HTMLDivElement | undefined = $state();
  let showPatternModal = $state(false);
  let leftPaneWidth = $state(320);
  let rightPaneWidth = $state(380);
  let panelDragState = $state<PanelDragState | null>(null);
  let mobileTerminalMode = $state<MobileTerminalMode>('workspace');

  // Current analysis data
  let currentSymbol = $state('');
  let currentTf = $state('');
  let currentSnapshot: any = $state(null);
  let currentChartData: any[] = $state([]);
  let currentPrice = $state(0);
  let currentChange = $state(0);
  let currentDeriv: any = $state(null);
  let patternConditions = $state<string[]>([]);
  let patternDirection = $state<'LONG' | 'SHORT'>('SHORT');
  let patternName = $state('');

  // Quick Panel state
  let quickPanelCollapsed = $state(false);
  let quickPanelScanning = $state(false);
  let quickPanelItems = $state<Array<{symbol: string; alphaScore: number; alphaLabel: string; price: number; change24h: number; flags: string[]}>>([]);
  let quickPanelSelected = $state('');

  // Chart overlay data (Sprint 1)
  let currentAnnotations: any[] = $state([]);
  let currentIndicators: any = $state(null);
  let focusedResearchBlock = $state<ResearchBlockEnvelope | null>(null);
  let compareBlocks = $state<WorkspaceCompareBlockData[]>([]);
  let selectedCompareBlockId = $state<string | null>(null);
  let workspaceRunLabel = $state('');
  let walletMode = $state(false);
  let walletInput = $state<WalletModeInput | null>(null);
  let walletDataset = $state<WalletIntelDataset | null>(null);
  let walletSelectedTab = $state<WalletIntelTab>('flow');
  let walletSelectedNodeId = $state('');
  let walletSelectedTokenSymbol = $state('');
  let walletCommandNote = $state('');
  let walletDossierHref = $state('');

  // Conversation history — compressed format (Cursor-style token management)
  // assistant analysis turns are stored as semantic summaries, not full text
  type ChatHistoryEntry = {
    role: 'user' | 'assistant';
    content: string;
    meta?: { symbol?: string; tf?: string; alphaScore?: number; direction?: 'LONG'|'SHORT'|'NEUTRAL'; kind?: 'analysis'|'scan'|'social'|'convo' };
  };
  let chatHistory = $state<ChatHistoryEntry[]>([]);
  /** Unix ms when currentSnapshot was last computed */
  let snapshotTs = $state<number | null>(null);
  const walletSelectedToken = $derived(
    walletDataset ? findWalletMarketToken(walletDataset, walletSelectedTokenSymbol) : null
  );
  const terminalLayoutStyle = $derived(
    `--terminal-scanner-pane:${leftPaneWidth}px; --terminal-inspector-pane:${rightPaneWidth}px;`
  );
  const selectedCompareBlock = $derived(
    selectedCompareBlockId ? compareBlocks.find((block) => block.id === selectedCompareBlockId) ?? null : null
  );
  // ─── Zoom #1: Block Search Parser State ─────────────────────
  //
  // `parsedQuery` is the live output of the keyword-first parser. It updates
  // whenever `inputText` changes via the $effect below. When confidence is
  // 'high' the permanent `💾 Save` button appears next to the input. Modal
  // open + POST to /api/wizard are gated on the same state.
  //
  // The existing `pattern_draft` SSE path from the LLM is untouched — that
  // flow still populates `patternName` + `patternConditions` independently.
  let parsedQuery = $state<ParsedQuery | null>(null);
  let parsedHint = $state<string>('');
  let isSavingChallenge = $state<boolean>(false);
  let wizardToast = $state<WizardToastState | null>(null);
  let wizardError = $state<string | null>(null);
  let wizardDraftQuery = $state<ParsedQuery | null>(null);
  let wizardToastTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const text = inputText.trim();
    if (text.length === 0) {
      parsedQuery = null;
      parsedHint = '';
      return;
    }
    const { query } = parseBlockSearchWithHints(text);
    parsedQuery = query;
    parsedHint = query.confidence === 'high' ? summarizeParsedQuery(query) : '';
  });

  const activeBlockSearchPreview = $derived.by(() =>
    buildBlockSearchPreview({
      parsedQuery,
      currentSymbol,
      currentTimeframe: currentTf || '4h',
      chartData: currentChartData,
      snapshot: currentSnapshot,
      indicators: currentIndicators,
      price: currentPrice,
    })
  );
  const activeSaveQuery = $derived.by(() => resolveSaveQuery());

  function slugifyFromQuery(q: ParsedQuery): string {
    const sym = (q.symbol ?? 'pattern').toLowerCase().replace(/[^a-z0-9]/g, '');
    const stamp = Date.now().toString(36).slice(-5);
    return `${sym || 'pattern'}-${stamp}`;
  }

  function resolveSaveQuery(queryOverride: ParsedQuery | null = null): ParsedQuery | null {
    const candidate = queryOverride ?? wizardDraftQuery ?? parsedQuery;
    return candidate && candidate.confidence === 'high' && candidate.blocks.length > 0
      ? candidate
      : null;
  }

  function dismissWizardToast() {
    if (wizardToastTimer) {
      clearTimeout(wizardToastTimer);
      wizardToastTimer = null;
    }
    wizardToast = null;
  }

  function showWizardToast(slug: string) {
    dismissWizardToast();
    wizardToast = { slug, href: `/lab?slug=${encodeURIComponent(slug)}` };
    wizardToastTimer = setTimeout(() => {
      wizardToast = null;
      wizardToastTimer = null;
    }, 6000);
  }

  function openLabFromToast() {
    if (!wizardToast || typeof window === 'undefined') return;
    window.location.assign(wizardToast.href);
  }

  function closeChallengeModal() {
    showPatternModal = false;
    wizardError = null;
  }

  function openChallengeModalFromQuery(queryOverride: ParsedQuery | null = null) {
    const query = resolveSaveQuery(queryOverride);
    if (!query) return;
    wizardDraftQuery = query;
    patternName = slugifyFromQuery(query);
    patternDirection = query.direction === 'short' ? 'SHORT' : 'LONG';
    patternConditions = query.blocks.map(
      (b) => `${b.role}: ${b.function}  (${b.source_token})`
    );
    wizardError = null;
    dismissWizardToast();
    showPatternModal = true;
  }

  async function handleWizardSave() {
    const query = resolveSaveQuery();
    if (!query) {
      // No parsed blocks → fall back to the old no-op close behavior so the
      // existing LLM `pattern_draft` flow keeps working.
      closeChallengeModal();
      return;
    }
    if (isSavingChallenge) return;
    isSavingChallenge = true;
    wizardError = null;

    const slug = (patternName || slugifyFromQuery(query))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);

    const description = query.raw.trim().slice(0, 280) || 'parsed from /terminal search';
    const direction = query.direction === 'short' ? 'short' : 'long';
    const timeframe = query.timeframe ?? '1h';

    try {
      const res = await fetch('/api/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          description,
          direction,
          timeframe,
          blocks: query.blocks
        })
      });
      const payload = (await res.json()) as
        | { ok: true; answers: ChallengeAnswers }
        | { ok: false; error: string; reason?: string };

      if (!res.ok || !payload.ok) {
        const reason =
          ('reason' in payload && payload.reason) ||
          ('error' in payload && payload.error) ||
          `HTTP ${res.status}`;
        wizardError = `Save failed: ${reason}`;
        return;
      }

      showWizardToast(payload.answers.identity.name);
      closeChallengeModal();
    } catch (err) {
      console.error('[terminal] /api/wizard error:', err);
      wizardError = `Save failed: ${err instanceof Error ? err.message : 'network error'}`;
    } finally {
      isSavingChallenge = false;
    }
  }

  // ─── Derived: Feed Entries ────────────────────────────────
  let feedEntries = $derived.by(() => {
    const entries: FeedEntry[] = [];
    for (const msg of messages) {
      if ('thinking' in msg) {
        entries.push({ kind: 'thinking' });
        continue;
      }
      if (msg.role === 'user') {
        entries.push({ kind: 'query', text: msg.text });
        continue;
      }
      // douni message
      if (msg.text) {
        entries.push({ kind: 'text', text: msg.text });
      }
      if (msg.widgets) {
        for (const w of msg.widgets) {
          switch (w.type) {
            case 'chart':
              entries.push({ kind: 'chart_ref', symbol: w.symbol, timeframe: w.timeframe });
              break;
            case 'compare': {
              const block = compareBlocks.find((candidate) => candidate.id === w.blockId);
              if (block) {
                entries.push({ kind: 'compare', blockId: w.blockId, block });
              }
              break;
            }
            case 'metrics':
              entries.push({ kind: 'metrics', items: w.items });
              break;
            case 'layers':
              entries.push({ kind: 'layers', items: w.items, alphaScore: w.alphaScore, alphaLabel: w.alphaLabel });
              break;
            case 'scan_list':
              entries.push({ kind: 'scan', items: w.items, sort: w.sort, sector: w.sector });
              break;
            case 'actions':
              entries.push({ kind: 'actions', patternName: w.patternName, direction: w.direction, conditions: w.conditions });
              break;
            case 'research_block':
              entries.push({ kind: 'research_block', envelope: w.envelope });
              break;
          }
        }
      }
    }
    return entries;
  });

  // ─── Init: LLM-generated greeting (locale-aware) ──────────
  onMount(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (e: PointerEvent) => {
      const state = panelDragState;
      if (!state) return;

      if (state.target === 'left') {
        leftPaneWidth = clampLeftWidth(state.startLeftWidth + (e.clientX - state.startX));
      } else if (focusedResearchBlock) {
        rightPaneWidth = clampRightWidth(state.startRightWidth - (e.clientX - state.startX));
      }
    };

    const stopDrag = () => {
      if (!panelDragState) return;
      panelDragState = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      stopDrag();
    };
  });

  onMount(async () => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const walletAddress = params?.get('address');
    const seededQuery = params?.get('q')?.trim() ?? '';
    const walletModeRequested = params?.get('mode') === 'wallet';
    if (walletAddress && (walletModeRequested || isWalletIdentifierLike(walletAddress))) {
      await activateWalletMode(normalizeWalletModeInput(walletAddress, params?.get('chain') || 'eth'), {
        updateUrl: false,
        note: 'Deep-linked wallet investigation loaded.',
      });
      return;
    }

    if (seededQuery.length > 0) {
      inputText = seededQuery;
    }

    const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'ko-KR';
    const isKorean = locale.toLowerCase().startsWith('ko');
    const fallback = isKorean ? '어 왔네, 오늘 뭐 볼래?' : "hey there, anything on your radar?";

    messages = [{ role: 'douni', thinking: true } as MessageType];

    try {
      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '', greeting: true, locale }),
      });

      if (!res.ok || !res.body) throw new Error(`Greeting failed: ${res.status}`);

      let streamingText = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const event: SSEEvent = JSON.parse(raw);
            if (event.type === 'text_delta') {
              streamingText += event.text;
              messages = [{ role: 'douni', text: streamingText }];
            }
          } catch { /* skip malformed */ }
        }
      }

      if (!streamingText.trim()) {
        messages = [{ role: 'douni', text: fallback }];
      }
    } catch {
      messages = [{ role: 'douni', text: fallback }];
    }
  });

  // ─── Friendly error messages ──────────────────────────────
  function friendlyError(raw: string): string {
    const m = (raw || '').toLowerCase();
    if (m.includes('402') || m.includes('insufficient') || m.includes('depleted') || m.includes('unpurchased')) {
      return 'AI provider 잔액이 비었어. 다른 provider로 자동 전환 시도 중... 안 되면 관리자한테 알려줘.';
    }
    if (m.includes('429') || m.includes('rate limit') || m.includes('queue_exceeded') || m.includes('too_many_requests')) {
      return 'AI가 지금 많이 바빠. 몇 초 뒤 다시 한 번 쳐줘.';
    }
    if (m.includes('no llm provider') || m.includes('no tool-calling')) {
      return 'AI provider가 설정 안 돼 있어. .env 확인해줘.';
    }
    if (m.includes('timeout') || m.includes('aborted')) {
      return 'AI 응답이 너무 오래 걸려서 끊었어. 다시 시도해줘.';
    }
    if (m.includes('fetch failed') || m.includes('network') || m.includes('enotfound')) {
      return '네트워크 문제인 것 같아. 연결 확인하고 다시.';
    }
    return 'AI가 잠깐 쉬는 중이야. 다시 한 번 시도해줘.';
  }

  // ─── Quick Panel Handlers ────────────────────────────────
  function normalizeTerminalSymbol(symbol: string): string {
    return symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  }

  async function handleQuickScan(preset: string) {
    quickPanelScanning = true;
    try {
      const topN = preset === 'top5' ? 5 : preset === 'top30' ? 30 : 10;
      const res = await fetch('/api/cogochi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'topN', topN, preset }),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = await res.json();
      if (data.results) {
        quickPanelItems = data.results.map((r: any) => ({
          symbol: r.symbol,
          alphaScore: r.alphaScore ?? r.snapshot?.alphaScore ?? 0,
          alphaLabel: r.alphaLabel ?? r.snapshot?.alphaLabel ?? 'NEUTRAL',
          price: r.price,
          change24h: r.change24h,
          flags: extractFlags(r.snapshot || r),
        }));
      }
    } catch (err: any) {
      console.error('Quick scan failed:', err);
    } finally {
      quickPanelScanning = false;
    }
  }

  function normalizeAnalysisPayload(data: any, symbolHint?: string, timeframeHint?: string) {
    if (data?.snapshot) {
      return {
        symbol: symbolHint ?? data.snapshot?.symbol ?? data.snapshot?.pair ?? currentSymbol,
        timeframe: timeframeHint ?? currentTf ?? '4h',
        price: data.price ?? currentPrice,
        change24h: data.change24h ?? currentChange,
        chart: data.chart ?? [],
        derivatives: data.derivatives ?? null,
        annotations: data.annotations ?? [],
        indicators: data.indicators ?? null,
        researchBlocks: data.researchBlocks ?? [],
        ...data.snapshot,
      };
    }
    return data;
  }

  function syncCurrentAnalysis(data: any) {
    selectedCompareBlockId = null;
    currentSymbol = data.symbol || currentSymbol;
    currentTf = data.timeframe || currentTf || '4h';
    workspaceRunLabel = currentSymbol ? `${formatTerminalCompareSymbol(currentSymbol)} ${currentTf.toUpperCase()}` : '';
    currentPrice = data.price ?? currentPrice;
    currentChange = data.change24h ?? currentChange;
    currentSnapshot = data;
    currentChartData = data.chart ?? currentChartData;
    currentDeriv = data.derivatives ?? currentDeriv;
    currentAnnotations = data.annotations ?? [];
    currentIndicators = data.indicators ?? null;
    snapshotTs = Date.now();
  }

  function clearCurrentAnalysisStage() {
    currentSymbol = '';
    currentSnapshot = null;
    currentChartData = [];
    currentPrice = 0;
    currentChange = 0;
    currentDeriv = null;
    currentAnnotations = [];
    currentIndicators = null;
    snapshotTs = null;
  }

  function upsertCompareBlock(block: WorkspaceCompareBlockData) {
    const existingIndex = compareBlocks.findIndex((candidate) => candidate.id === block.id);
    if (existingIndex === -1) {
      compareBlocks = [...compareBlocks, block];
      return;
    }

    compareBlocks = compareBlocks.map((candidate) => (candidate.id === block.id ? block : candidate));
  }

  function selectCompareBlock(blockId: string) {
    selectedCompareBlockId = blockId;
    const block = compareBlocks.find((candidate) => candidate.id === blockId);
    if (!block) return;

    focusedResearchBlock = null;
    mobileTerminalMode = 'workspace';
    workspaceRunLabel = buildCompareRunLabel(block.symbols, block.timeframe);
  }

  async function fetchCompareCard(symbol: string, timeframe: WorkspaceCompareIntent['timeframe']) {
    const res = await fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${timeframe}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `Compare fetch failed: ${res.status}`);
    }

    const normalized = normalizeAnalysisPayload(data, symbol, timeframe);
    return {
      symbol,
      timeframe,
      price: normalized.price ?? 0,
      change24h: normalized.change24h ?? 0,
      chartData: normalized.chart ?? [],
      snapshot: normalized,
      derivatives: normalized.derivatives ?? null,
      annotations: normalized.annotations ?? [],
      indicators: normalized.indicators ?? null,
    };
  }

  async function materializeCompareBlock(params: {
    id: string;
    query: string;
    symbols: string[];
    timeframe: WorkspaceCompareIntent['timeframe'];
    focusTerms: string[];
    previous?: WorkspaceCompareBlockData | null;
  }): Promise<WorkspaceCompareBlockData> {
    const normalizedSymbols = Array.from(new Set(params.symbols)).slice(0, 4);
    const reusableCards = new Map(
      (params.previous?.cards ?? [])
        .filter((card) => card.timeframe === params.timeframe)
        .map((card) => [card.symbol, card] as const)
    );
    const symbolsToFetch = normalizedSymbols.filter((symbol) => !reusableCards.has(symbol));

    const settled = await Promise.allSettled(
      symbolsToFetch.map(async (symbol) => ({
        symbol,
        card: await fetchCompareCard(symbol, params.timeframe),
      }))
    );

    const fetchedCards = new Map(
      settled.flatMap((result) =>
        result.status === 'fulfilled' ? [[result.value.symbol, result.value.card] as const] : []
      )
    );
    const failedSymbols = settled.flatMap((result, index) =>
      result.status === 'rejected' ? [symbolsToFetch[index]] : []
    );
    const cards = normalizedSymbols.flatMap((symbol) => {
      const reusable = reusableCards.get(symbol);
      if (reusable) return [reusable];
      const fetched = fetchedCards.get(symbol);
      return fetched ? [fetched] : [];
    });

    if (cards.length < 2) {
      throw new Error('Need at least two valid symbols to compare');
    }

    return {
      id: params.id,
      query: params.query,
      timeframe: params.timeframe,
      symbols: normalizedSymbols,
      focusTerms: params.focusTerms,
      previewQuery: buildWorkspaceComparePreviewQuery({
        raw: params.query,
        timeframe: params.timeframe,
        focusTerms: params.focusTerms,
        previous: params.previous?.previewQuery ?? null,
      }),
      cards,
      failedSymbols,
    };
  }

  async function buildCompareBlock(intent: WorkspaceCompareIntent): Promise<WorkspaceCompareBlockData> {
    return materializeCompareBlock({
      id: createWorkspaceCompareId(),
      query: intent.raw,
      symbols: intent.symbols,
      timeframe: intent.timeframe,
      focusTerms: intent.focusTerms,
    });
  }

  async function applyCompareMutation(
    block: WorkspaceCompareBlockData,
    mutation: WorkspaceCompareMutation
  ): Promise<WorkspaceCompareBlockData> {
    const nextSymbols = mutation.nextSymbols ?? block.symbols;
    if (nextSymbols.length < 2) {
      throw new Error('Compare blocks need at least two symbols');
    }

    return materializeCompareBlock({
      id: block.id,
      query: mutation.raw,
      symbols: nextSymbols,
      timeframe: mutation.timeframe ?? block.timeframe,
      focusTerms: mutation.focusTerms.length > 0 ? mutation.focusTerms : block.focusTerms,
      previous: block,
    });
  }

  function buildCompareNarrative(block: WorkspaceCompareBlockData) {
    const alphaLeader = [...block.cards]
      .sort((a, b) => (b.snapshot?.alphaScore ?? -Infinity) - (a.snapshot?.alphaScore ?? -Infinity))[0];
    const crowdingLeader = [...block.cards]
      .filter((card) => typeof card.derivatives?.funding === 'number')
      .sort((a, b) => Math.abs(b.derivatives.funding) - Math.abs(a.derivatives.funding))[0];

    const segments = [
      `Compared ${block.symbols.map(formatTerminalCompareSymbol).join(', ')} on ${block.timeframe.toUpperCase()}.`,
    ];

    if (alphaLeader?.snapshot?.alphaScore != null) {
      segments.push(
        `${formatTerminalCompareSymbol(alphaLeader.symbol)} leads alpha at ${alphaLeader.snapshot.alphaScore > 0 ? '+' : ''}${alphaLeader.snapshot.alphaScore}.`
      );
    }

    if (crowdingLeader?.derivatives?.funding != null) {
      segments.push(
        `${formatTerminalCompareSymbol(crowdingLeader.symbol)} shows the most crowded funding at ${(crowdingLeader.derivatives.funding * 100).toFixed(4)}%.`
      );
    }

    if (block.failedSymbols.length > 0) {
      segments.push(`Skipped ${block.failedSymbols.map(formatTerminalCompareSymbol).join(', ')}.`);
    }

    return segments.join(' ');
  }

  async function handleCompareIntent(text: string, intent: WorkspaceCompareIntent) {
    messages = [...messages, { role: 'user', text }];
    inputText = '';
    isThinking = true;
    focusedResearchBlock = null;

    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();
    chatHistory = [...chatHistory, { role: 'user', content: text }];

    try {
      const block = await buildCompareBlock(intent);
      clearCurrentAnalysisStage();
      currentTf = intent.timeframe;
      upsertCompareBlock(block);
      selectCompareBlock(block.id);
      messages = messages.filter((m) => !('thinking' in m));
      const narrative = buildCompareNarrative(block);
      messages = [
        ...messages,
        {
          role: 'douni',
          text: narrative,
          widgets: [{ type: 'compare', blockId: block.id }],
        },
      ];
      chatHistory = [...chatHistory, { role: 'assistant', content: narrative, meta: { kind: 'analysis' } }];
    } catch (err: any) {
      console.error('[terminal] compare intent error:', err);
      messages = messages.filter((m) => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: friendlyError(err?.message ?? '') }];
    } finally {
      isThinking = false;
      scrollToBottom();
    }
  }

  async function handleCompareMutation(
    text: string,
    block: WorkspaceCompareBlockData,
    mutation: WorkspaceCompareMutation
  ) {
    messages = [...messages, { role: 'user', text }];
    inputText = '';
    isThinking = true;
    focusedResearchBlock = null;

    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();
    chatHistory = [...chatHistory, { role: 'user', content: text }];

    try {
      const nextBlock = await applyCompareMutation(block, mutation);
      clearCurrentAnalysisStage();
      currentTf = nextBlock.timeframe;
      upsertCompareBlock(nextBlock);
      selectCompareBlock(nextBlock.id);
      messages = messages.filter((m) => !('thinking' in m));
      const narrative = `Updated ${nextBlock.symbols.map(formatTerminalCompareSymbol).join(', ')} compare: ${mutation.summary}.`;
      messages = [...messages, { role: 'douni', text: narrative }];
      chatHistory = [...chatHistory, { role: 'assistant', content: narrative, meta: { kind: 'analysis' } }];
    } catch (err: any) {
      console.error('[terminal] compare mutation error:', err);
      messages = messages.filter((m) => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: friendlyError(err?.message ?? '') }];
    } finally {
      isThinking = false;
      scrollToBottom();
    }
  }


  function deriveLayerItems(data: any): LayerItem[] {
    const candidates: LayerItem[] = [
      { id: 'L1', name: 'Wyckoff', value: data.l1?.phase ?? '--', score: data.l1?.score ?? 0 },
      { id: 'L2', name: 'Flow', value: data.l2?.detail ?? (data.l2?.fr != null ? `FR ${(data.l2.fr * 100).toFixed(3)}%` : '--'), score: data.l2?.score ?? 0 },
      { id: 'L7', name: 'F&G', value: data.l7?.label ?? `${data.l7?.fear_greed ?? '--'}`, score: data.l7?.score ?? 0 },
      { id: 'L10', name: 'MTF', value: data.l10?.label ?? data.l10?.mtf_confluence ?? '--', score: data.l10?.score ?? 0 },
      { id: 'L11', name: 'CVD', value: data.l11?.cvd_state ?? '--', score: data.l11?.score ?? 0 },
      { id: 'L13', name: 'Breakout', value: data.l13?.label ?? '--', score: data.l13?.score ?? 0 },
      { id: 'L14', name: 'BB', value: data.l14?.label ?? '--', score: data.l14?.score ?? 0 },
      { id: 'L15', name: 'ATR', value: data.l15?.atr_pct != null ? `${data.l15.atr_pct}%` : '--', score: data.l15?.score ?? 0 },
      { id: 'L18', name: '5m Mom', value: data.l18?.label ?? '--', score: data.l18?.score ?? 0 },
      { id: 'L19', name: 'OI Acc', value: data.l19?.label ?? '--', score: data.l19?.score ?? 0 },
    ];
    return candidates
      .filter((item) => item.score !== 0)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6);
  }

  async function handleQuickPreview(symbol: string) {
    quickPanelSelected = normalizeTerminalSymbol(symbol);
    selectedCompareBlockId = null;
    focusedResearchBlock = null;
    mobileTerminalMode = 'workspace';
    try {
      const fullSymbol = normalizeTerminalSymbol(symbol);
      const tf = currentTf || '4h';
      const res = await fetch(`/api/cogochi/analyze?symbol=${fullSymbol}&tf=${tf}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Preview failed: ${res.status}`);
      syncCurrentAnalysis(normalizeAnalysisPayload(data, fullSymbol, tf));
    } catch (err) {
      console.error('Quick preview failed:', err);
    }
  }

  function extractFlags(snap: any): string[] {
    const flags: string[] = [];
    if (snap?.l1?.phase && /accum|distrib/i.test(snap.l1.phase)) flags.push('wyckoff');
    if (snap?.l10?.mtf_confluence === 'TRIPLE') flags.push('mtf_triple');
    if (snap?.l14?.bb_squeeze) flags.push('bb_squeeze');
    if (snap?.l2?.fr != null && Math.abs(snap.l2.fr) > 0.001) flags.push('fr_extreme');
    if (snap?.hasWyckoff) flags.push('wyckoff');
    if (snap?.hasMTF) flags.push('mtf_triple');
    if (snap?.hasSqueeze) flags.push('bb_squeeze');
    if (snap?.extremeFR) flags.push('fr_extreme');
    if (snap?.hasLiqAlert) flags.push('liq_alert');
    return [...new Set(flags)];
  }

  async function handleQuickAnalyze(symbol: string) {
    const fullSymbol = normalizeTerminalSymbol(symbol);
    await handleQuickPreview(fullSymbol);
    mobileTerminalMode = 'workspace';
    inputText = `${fullSymbol.replace('USDT', '')} ${currentTf || '4h'}`;
    await handleSend();
  }


  // ─── Send via FC Pipeline ─────────────────────────────────
  async function handleSend() {
    const text = inputText.trim();
    if (!text || isThinking) return;
    const saveableQuery = resolveSaveQuery(parsedQuery);

    if (walletMode && walletDataset) {
      inputText = '';
      const result = interpretWalletCommand(text, walletDataset);
      if (result.nextInput) {
        await activateWalletMode(result.nextInput, { note: result.note });
        return;
      }
      if (result.exit) {
        exitWalletMode();
        return;
      }
      if (result.tab) walletSelectedTab = result.tab;
      if (result.tokenSymbol) walletSelectedTokenSymbol = result.tokenSymbol;
      walletCommandNote = result.note;
      return;
    }

    if (isWalletIdentifierLike(text)) {
      inputText = '';
      await activateWalletMode(normalizeWalletModeInput(text), {
        note: 'Address-led investigation loaded from terminal input.',
      });
      return;
    }

    const compareIntent = parseWorkspaceCompareIntent(text);
    if (compareIntent) {
      await handleCompareIntent(text, compareIntent);
      return;
    }

    const compareMutation = parseWorkspaceCompareMutation(text, selectedCompareBlock);
    if (compareMutation && selectedCompareBlock) {
      await handleCompareMutation(text, selectedCompareBlock, compareMutation);
      return;
    }

    // Capture parsed query BEFORE clearing inputText (effect will nullify it)
    const capturedParsedQuery = parsedQuery;

    messages = [...messages, { role: 'user', text }];
    if (saveableQuery) {
      wizardDraftQuery = saveableQuery;
    }
    inputText = '';
    isThinking = true;
    mobileTerminalMode = 'workspace';

    // Add thinking bubble
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();

    // Track history for LLM context
    chatHistory = [...chatHistory, { role: 'user', content: text }];

    // ── Pre-fetch analysis in parallel ────────────────────────
    // Detect symbol/TF from parsed query or fall back to current context.
    // This ensures panels update for any coin regardless of whether the LLM
    // decides to call the analyze_market tool.
    const detectedSym = capturedParsedQuery?.symbol
      ? normalizeTerminalSymbol(capturedParsedQuery.symbol)
      : (currentSymbol || null);
    const detectedTf = capturedParsedQuery?.timeframe ?? currentTf ?? '4h';

    let prefetchedAnalysis: any = null;
    const analyzePromise: Promise<void> = detectedSym
      ? fetch(`/api/cogochi/analyze?symbol=${encodeURIComponent(detectedSym)}&tf=${encodeURIComponent(detectedTf)}`)
          .then(r => r.json())
          .then(data => { if (!data.error) prefetchedAnalysis = data; })
          .catch(() => {})
      : Promise.resolve();

    try {
      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory,            // already depth-capped + compressed
          snapshot: currentSnapshot || undefined,
          snapshotTs: snapshotTs ?? undefined,
          detectedSymbol: detectedSym ?? undefined,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      // Remove thinking bubble, prepare streaming response
      messages = messages.filter(m => !('thinking' in m));

      let streamingText = '';
      const pendingLayers: LayerItem[] = [];
      let analyzeToolResultReceived = false;
      let scanResultReceived = false;
      let socialResultReceived = false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;

          let event: SSEEvent;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {
            case 'text_delta':
              streamingText += event.text;
              // Update last douni message with streaming text
              updateStreamingMessage(streamingText);
              break;

            case 'tool_call':
              if (event.name === 'analyze_market' || event.name === 'check_social' || event.name === 'scan_market') {
                if (event.name === 'analyze_market') {
                  focusedResearchBlock = null;
                }
                // Show thinking indicator while tool runs
                messages = [...messages, { role: 'douni', thinking: true } as MessageType];
                scrollToBottom();
              }
              break;

            case 'research_block': {
              const parsed = safeParseResearchBlockEnvelope(event.payload);
              if (!parsed.success) break;

              messages = [
                ...messages.filter(m => !('thinking' in m)),
                { role: 'douni', text: '', widgets: [{ type: 'research_block', envelope: parsed.data }] }
              ];
              scrollToBottom();
              break;
            }

            case 'layer_result':
              pendingLayers.push({
                id: event.layer,
                name: layerName(event.layer),
                value: event.signal,
                score: event.score,
              });
              break;

            case 'tool_result':
              if (event.name === 'analyze_market' && event.data) {
                analyzeToolResultReceived = true;
                messages = messages.filter(m => !('thinking' in m));
                applyAnalysisResult(event.data, pendingLayers, event.data?.symbol, event.data?.timeframe);
                streamingText = '';
              } else if (event.name === 'check_social' && event.data) {
                socialResultReceived = true;
                messages = messages.filter(m => !('thinking' in m));
                applySocialResult(event.data);
                streamingText = '';
              } else if (event.name === 'scan_market' && event.data) {
                scanResultReceived = true;
                messages = messages.filter(m => !('thinking' in m));
                applyScanResult(event.data);
                streamingText = '';
              }
              break;

            case 'chart_action':
              handleChartAction(event.action, event.payload);
              break;

            case 'pattern_draft':
              wizardDraftQuery = null;
              patternName = event.name;
              patternConditions = (event.conditions as any[]).map(c =>
                `${c.field} ${c.operator} ${c.value}`
              );
              wizardError = null;
              showPatternModal = true;
              break;

            case 'error':
              console.error('[terminal] stream error:', event.message);
              messages = messages.filter(m => !('thinking' in m));
              messages = [...messages, { role: 'douni', text: friendlyError(event.message) }];
              scrollToBottom();
              break;

            case 'done':
              // Finalize
              break;
          }
        }
      }

      // Finalize: compress + store assistant turn (Cursor-style token management)
      if (streamingText) {
        const alpha = currentSnapshot?.alphaScore as number | undefined;
        const dir: 'LONG' | 'SHORT' | 'NEUTRAL' = alpha != null ? (alpha >= 10 ? 'LONG' : alpha <= -10 ? 'SHORT' : 'NEUTRAL') : 'NEUTRAL';
        const scoreStr = alpha != null ? (alpha > 0 ? `+${alpha}` : `${alpha}`) : '';

        let compressed: string;
        let entryMeta: ChatHistoryEntry['meta'];

        if (analyzeToolResultReceived) {
          compressed = `[${currentSymbol || '?'} ${currentTf || '?'} ${dir}${scoreStr}: ${streamingText.slice(0, 60).replace(/\n/g, ' ')}]`;
          entryMeta = { symbol: currentSymbol, tf: currentTf, alphaScore: alpha, direction: dir, kind: 'analysis' };
        } else if (scanResultReceived) {
          compressed = `[SCAN: ${streamingText.slice(0, 80).replace(/\n/g, ' ')}]`;
          entryMeta = { kind: 'scan' };
        } else if (socialResultReceived) {
          compressed = `[SOCIAL ${detectedSym ?? ''}: ${streamingText.slice(0, 60).replace(/\n/g, ' ')}]`;
          entryMeta = { kind: 'social' };
        } else {
          compressed = streamingText.slice(0, 100);
          entryMeta = { kind: 'convo' };
        }

        chatHistory = [...chatHistory, { role: 'assistant', content: compressed, meta: entryMeta }];
      }

      // ── Fallback: apply pre-fetched analysis if LLM didn't call the tool ──
      // Waits for parallel analyze fetch to settle, then applies panels
      // so the user always sees chart + metrics regardless of LLM behavior.
      await analyzePromise;
      if (!analyzeToolResultReceived && prefetchedAnalysis && detectedSym) {
        messages = messages.filter(m => !('thinking' in m));
        applyAnalysisResult(prefetchedAnalysis, pendingLayers, detectedSym, detectedTf);
      }

    } catch (err: any) {
      console.error('[terminal] handleSend error:', err);
      messages = messages.filter(m => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: friendlyError(err?.message ?? '') }];
    } finally {
      isThinking = false;
      scrollToBottom();
    }
  }

  // ─── Streaming Text Update ─────────────────────────────────
  function updateStreamingMessage(text: string) {
    const last = messages[messages.length - 1];
    if (last && last.role === 'douni' && !('thinking' in last)) {
      // Update existing bubble
      messages = [...messages.slice(0, -1), { ...last, text }];
    } else {
      // Remove thinking + add new text bubble
      messages = [...messages.filter(m => !('thinking' in m)), { role: 'douni', text }];
    }
    scrollToBottom();
  }

  // ─── Apply Analysis Result ─────────────────────────────────
  function applyAnalysisResult(data: any, layers: LayerItem[], symbolHint?: string, timeframeHint?: string) {
    const normalized = normalizeAnalysisPayload(data, symbolHint, timeframeHint);
    syncCurrentAnalysis(normalized);
    const researchBlocks: ResearchBlockEnvelope[] = Array.isArray(normalized.researchBlocks)
      ? normalized.researchBlocks.flatMap((payload: unknown) => {
          const parsed = safeParseResearchBlockEnvelope(payload);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const hasResearchBlocks = researchBlocks.length > 0;

    if (hasResearchBlocks) {
      focusedResearchBlock = null;
    }

    // Build metrics from analysis data
    const metrics: MetricItem[] = [];
    if (normalized.l2?.fr != null) {
      const fr = normalized.l2.fr;
      const frPct = (fr * 100).toFixed(4);
      const frHot = Math.abs(fr) > 0.0005;
      metrics.push({
        title: 'Funding Rate', value: `${frPct}%`,
        subtext: frHot ? (fr > 0 ? '롱 과열' : '숏 과열') : '보통',
        trend: frHot ? 'danger' : 'neutral',
        chartData: [0.01, 0.02, 0.03, 0.02, 0.03, 0.04, 0.03, Math.abs(fr) * 100],
      });
    }
    if (normalized.l7?.fear_greed != null) {
      const fg = normalized.l7.fear_greed;
      metrics.push({
        title: 'Fear & Greed', value: `${fg}`,
        subtext: fg < 25 ? 'Extreme Fear' : fg < 40 ? 'Fear' : fg > 75 ? 'Extreme Greed' : fg > 60 ? 'Greed' : 'Neutral',
        trend: fg < 30 ? 'bear' : fg > 70 ? 'danger' : 'neutral',
        chartData: [40, 35, 30, 25, 20, 18, 15, fg],
      });
    }
    if (normalized.derivatives?.oi != null) {
      const oi = normalized.derivatives.oi;
      metrics.push({
        title: 'OI', value: oi >= 1e6 ? `${(oi/1e6).toFixed(0)}M` : `${(oi/1e3).toFixed(0)}K`,
        subtext: '미결제약정', trend: 'neutral',
        chartData: [80, 85, 82, 88, 90, 87, 92, 95],
      });
    }
    if (normalized.derivatives?.lsRatio != null) {
      const ls = normalized.derivatives.lsRatio;
      metrics.push({
        title: 'L/S Ratio', value: ls.toFixed(2),
        subtext: ls > 1.1 ? '롱 과밀' : ls < 0.9 ? '숏 과밀' : '균형',
        trend: ls > 1.1 ? 'bear' : ls < 0.9 ? 'bull' : 'neutral',
        chartData: [1.0, 1.05, 1.1, 1.08, 1.12, 1.15, 1.1, ls],
      });
    }

    // Add chart widget
    if (!hasResearchBlocks && normalized.chart && normalized.chart.length > 0) {
      messages = [...messages, {
        role: 'douni', text: '',
        widgets: [{ type: 'chart', symbol: currentSymbol, timeframe: currentTf.toUpperCase(), chartData: normalized.chart }],
      }];
    }

    // Add metrics widget
    if (!hasResearchBlocks && metrics.length > 0) {
      messages = [...messages, { role: 'douni', text: '', widgets: [{ type: 'metrics', items: metrics }] }];
    }

    // Add layers widget
    const baseLayers = layers.length > 0 ? layers : deriveLayerItems(normalized);
    const sortedLayers = baseLayers
      .filter((layer) => layer.score !== 0)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6);
    if (sortedLayers.length > 0 && normalized.alphaScore != null) {
      messages = [...messages, {
        role: 'douni', text: '',
        widgets: [{ type: 'layers', items: sortedLayers, alphaScore: normalized.alphaScore, alphaLabel: normalized.alphaLabel || 'NEUTRAL' }],
      }];
    }

    // Add feedback action buttons
    const dir = normalized.alphaScore >= 10 ? 'LONG' : normalized.alphaScore <= -10 ? 'SHORT' : 'LONG';
    messages = [...messages, {
      role: 'douni', text: '',
      widgets: [{ type: 'actions', patternName: `${currentSymbol} ${currentTf}`, direction: dir as 'LONG' | 'SHORT', conditions: [] }],
    }];

    scrollToBottom();
  }

  // ─── Apply Social Result ───────────────────────────────────
  function applySocialResult(data: any) {
    const metrics: MetricItem[] = [];
    // Sentiment Score (pseudo-sentiment from CoinGecko price change data)
    if (data.sentiment_score != null) {
      const s = data.sentiment_score;
      metrics.push({
        title: 'Sentiment', value: `${s}`,
        subtext: data.sentiment_label || (s > 60 ? 'Bullish' : s < 40 ? 'Bearish' : 'Neutral'),
        trend: s > 60 ? 'bull' : s < 40 ? 'bear' : 'neutral',
        chartData: [50, 48, 52, 55, 50, 53, 56, s],
      });
    }
    // Fear & Greed
    if (data.fear_greed != null) {
      const fg = data.fear_greed;
      metrics.push({
        title: 'Fear & Greed', value: `${fg}`,
        subtext: fg < 25 ? 'Extreme Fear' : fg < 40 ? 'Fear' : fg > 75 ? 'Extreme Greed' : fg > 60 ? 'Greed' : 'Neutral',
        trend: fg < 30 ? 'bear' : fg > 70 ? 'danger' : 'neutral',
        chartData: [40, 35, 30, 25, 20, 18, 15, fg],
      });
    }
    // Market Cap Rank
    if (data.market_cap_rank != null) {
      metrics.push({
        title: 'MCap Rank', value: `#${data.market_cap_rank}`,
        subtext: data.market_cap_rank <= 10 ? 'Top Tier' : data.market_cap_rank <= 50 ? 'Major' : 'Mid',
        trend: data.market_cap_rank <= 10 ? 'bull' : 'neutral',
        chartData: [100, 80, 60, 50, 40, 35, 30, data.market_cap_rank],
      });
    }
    // Community
    const comm = data.community;
    if (comm?.twitter_followers > 0) {
      const tw = comm.twitter_followers;
      const k = tw >= 1e6 ? `${(tw/1e6).toFixed(1)}M` : `${(tw/1e3).toFixed(0)}K`;
      metrics.push({
        title: 'Twitter', value: k,
        subtext: '팔로워 수', trend: 'neutral',
        chartData: [10, 15, 12, 18, 20, 22, 25, 30],
      });
    }
    // Trending badge
    if (data.is_trending) {
      metrics.push({
        title: 'Trending', value: data.trend_rank ? `#${data.trend_rank}` : 'HOT',
        subtext: 'CoinGecko Trending', trend: 'bull',
        chartData: [1, 2, 3, 5, 8, 12, 18, 25],
      });
    }
    if (metrics.length > 0) {
      messages = [...messages, { role: 'douni', text: '', widgets: [{ type: 'metrics', items: metrics }] }];
    }
    scrollToBottom();
  }

  // ─── Apply Scan Result ────────────────────────────────────
  function applyScanResult(data: any) {
    if (data.coins && data.coins.length > 0) {
      const items = data.coins.slice(0, 10).map((c: any) => ({
        rank: c.rank,
        symbol: c.symbol,
        name: c.name,
        price: c.price,
        change24h: c.change24h,
        market_cap: c.market_cap,
        volume_24h: c.volume_24h,
        is_trending: c.is_trending,
      }));
      messages = [...messages, {
        role: 'douni', text: '',
        widgets: [{ type: 'scan_list', items, sort: data.sort, sector: data.sector || 'all' }],
      }];

      // Also update QuickPanel
      if (data.coins) {
        quickPanelItems = data.coins.map((c: any) => ({
          symbol: c.symbol + (c.symbol.includes('USDT') ? '' : 'USDT'),
          alphaScore: c.alphaScore ?? 0,
          alphaLabel: c.alphaLabel ?? (c.change24h > 0 ? 'BULL' : 'BEAR'),
          price: c.price,
          change24h: c.change24h,
          flags: c.flags || [],
        }));
      }
    }
    // Add trending coins as text if available
    if (data.trending_coins?.length > 0) {
      const trendText = data.trending_coins.map((c: any) => `${c.symbol}`).join(', ');
      messages = [...messages, {
        role: 'douni', text: `Trending: ${trendText}`,
      }];
    }
    scrollToBottom();
  }

  // ─── Chart Action Handler ──────────────────────────────────
  function handleChartAction(action: string, payload: Record<string, unknown>) {
    if (action === 'change_symbol' && payload.symbol) {
      currentSymbol = payload.symbol as string;
    }
    if (action === 'change_timeframe' && payload.timeframe) {
      currentTf = payload.timeframe as string;
    }
  }

  // ─── Feedback ──────────────────────────────────────────────
  async function sendFeedback(result: 'correct' | 'incorrect') {
    const feedbackText = result === 'correct' ? '맞았어!' : '틀렸잖아';
    messages = [...messages, { role: 'user', text: feedbackText }];
    chatHistory = [...chatHistory, { role: 'user', content: feedbackText }];

    // Send via FC endpoint — DOUNI will call submit_feedback tool
    isThinking = true;
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();

    try {
      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: feedbackText,
          history: chatHistory.slice(-10),
          snapshot: currentSnapshot || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Feedback failed');

      messages = messages.filter(m => !('thinking' in m));
      let streamingText = '';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const event: SSEEvent = JSON.parse(raw);
            if (event.type === 'text_delta') {
              streamingText += event.text;
              updateStreamingMessage(streamingText);
            }
          } catch { /* skip */ }
        }
      }

      if (streamingText) {
        chatHistory = [...chatHistory, { role: 'assistant', content: streamingText }];
      }
    } catch (err: any) {
      console.error('[terminal] sendFeedback error:', err);
      messages = messages.filter(m => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: friendlyError(err?.message ?? '') }];
    } finally {
      isThinking = false;
      scrollToBottom();
    }
  }

  // ─── Layer Name Map ────────────────────────────────────────
  function layerName(id: string): string {
    const map: Record<string, string> = {
      L1: 'Wyckoff', L2: 'Supply/Demand', L3: 'V-Surge', L4: 'Order Book',
      L5: 'Basis', L6: 'Macro Flow', L7: 'F&G', L8: 'Kimchi',
      L9: 'Liquidation', L10: 'MTF', L11: 'CVD', L12: 'Sector',
      L13: 'Breakout', L14: 'BB', L15: 'ATR',
    };
    return map[id] || id;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => feedContainer?.scrollTo({ top: feedContainer.scrollHeight, behavior: 'smooth' }));
  }
  function isDesktopLayout() {
    return typeof window !== 'undefined' && window.innerWidth > 1024;
  }
  function startPanelDrag(target: PanelDragTarget, e: PointerEvent) {
    if (!isDesktopLayout()) return;
    panelDragState = {
      target,
      startX: e.clientX,
      startLeftWidth: leftPaneWidth,
      startRightWidth: rightPaneWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }
  function getWheelResizeDelta(e: WheelEvent) {
    const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return 0;
    const step = e.shiftKey ? 40 : 20;
    return rawDelta > 0 ? step : -step;
  }
  function resizeDesktopPane(target: PanelDragTarget, signedDelta: number) {
    if (!isDesktopLayout() || signedDelta === 0) return;
    if (target === 'left') {
      leftPaneWidth = clampLeftWidth(leftPaneWidth + signedDelta);
      return;
    }
    if (focusedResearchBlock) {
      rightPaneWidth = clampRightWidth(rightPaneWidth + signedDelta);
    }
  }
  function handleDividerWheel(target: PanelDragTarget, e: WheelEvent) {
    const signedDelta = getWheelResizeDelta(e);
    if (signedDelta === 0) return;
    e.preventDefault();
    resizeDesktopPane(target, signedDelta);
  }
  function handleDividerKeydown(target: PanelDragTarget, e: KeyboardEvent) {
    if (!isDesktopLayout()) return;
    const step = e.shiftKey ? 40 : 20;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      resizeDesktopPane(target, -step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      resizeDesktopPane(target, step);
    }
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }
  function scoreColor(s: number): string {
    if (s <= -15) return 'var(--sc-bad)';
    if (s < 0) return 'var(--sc-warn)';
    if (s === 0) return 'var(--sc-text-3)';
    if (s <= 15) return 'var(--sc-good)';
    return 'var(--sc-good)';
  }
  function alphaColor(s: number): string {
    if (s >= 20) return 'var(--sc-good)';
    if (s <= -20) return 'var(--sc-bad)';
    return 'var(--sc-text-2)';
  }
  function layerCellBg(score: number): string {
    const intensity = Math.min(0.25, 0.06 + Math.abs(score) / 80);
    if (score > 0) return `rgba(173, 202, 124, ${intensity})`;
    if (score < 0) return `rgba(207, 127, 143, ${intensity})`;
    return 'rgba(255,255,255,0.02)';
  }
  function layerBorderColor(score: number): string {
    if (score > 0) return 'var(--sc-good)';
    if (score < 0) return 'var(--sc-bad)';
    return 'var(--sc-text-3)';
  }

  function focusResearchBlock(envelope: ResearchBlockEnvelope) {
    focusedResearchBlock = envelope;
    mobileTerminalMode = 'insight';
  }

  function clearResearchFocus() {
    focusedResearchBlock = null;
    if (mobileTerminalMode === 'insight') {
      mobileTerminalMode = 'workspace';
    }
  }

  function formatWalletIntelMetaNote(meta: WalletIntelApiResult['meta']): string {
    const sourceLabel = meta.source === 'etherscan' ? 'raw-backed' : 'synthetic fallback';
    return `${sourceLabel} · ${meta.reason} · ${meta.detail}`;
  }

  function normalizeWalletIntelMeta(meta: unknown): WalletIntelApiMeta {
    if (
      meta &&
      typeof meta === 'object' &&
      'source' in meta &&
      'reason' in meta &&
      'detail' in meta &&
      typeof meta.source === 'string' &&
      typeof meta.reason === 'string' &&
      typeof meta.detail === 'string'
    ) {
      return meta as WalletIntelApiMeta;
    }

    return {
      source: 'synthetic',
      reason: 'local_api_fallback',
      detail: 'wallet-intel response did not include provider metadata, so terminal used local deterministic scaffolding.',
    };
  }

  async function loadWalletIntelDataset(input: WalletModeInput): Promise<WalletIntelApiResult> {
    try {
      const response = await fetch(walletIntelApiPath(input));
      const payload = await response.json();
      const meta = normalizeWalletIntelMeta(payload?.meta);

      if (!response.ok) {
        return {
          data: buildWalletIntelDataset(input),
          meta,
        };
      }

      if (!payload?.ok || !payload?.data) {
        throw new Error('invalid wallet intel payload');
      }

      return {
        data: payload.data as WalletIntelDataset,
        meta,
      };
    } catch (error) {
      console.error('[terminal] wallet intel api fallback:', error);
      return {
        data: buildWalletIntelDataset(input),
        meta: {
          source: 'synthetic',
          reason: 'local_api_fallback',
          detail: 'terminal could not read /api/wallet/intel, so it fell back to local deterministic scaffolding.',
        },
      };
    }
  }

  async function activateWalletMode(
    nextInput: WalletModeInput,
    options: { updateUrl?: boolean; note?: string } = {}
  ) {
    const result = await loadWalletIntelDataset(nextInput);
    const dataset = result.data;
    walletInput = nextInput;
    walletDataset = dataset;
    walletMode = true;
    walletSelectedTab = 'flow';
    walletSelectedNodeId = dataset.flowLayers[0]?.id ?? dataset.graph.nodes[0]?.id ?? '';
    walletSelectedTokenSymbol = dataset.market.tokens[0]?.symbol ?? '';
    walletCommandNote = options.note
      ? `${options.note} ${formatWalletIntelMetaNote(result.meta)}`
      : `${nextInput.identifier} wallet context loaded. ${formatWalletIntelMetaNote(result.meta)}`;
    walletDossierHref = buildPassportWalletLink(nextInput.chain, nextInput.identifier);
    focusedResearchBlock = null;

    if (options.updateUrl !== false && typeof window !== 'undefined') {
      window.history.replaceState({}, '', walletDeepLink(nextInput));
    }
  }

  function exitWalletMode() {
    walletMode = false;
    walletInput = null;
    walletDataset = null;
    walletSelectedTab = 'flow';
    walletSelectedNodeId = '';
    walletSelectedTokenSymbol = '';
    walletCommandNote = '';
    walletDossierHref = '';
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/terminal');
    }
  }

  function handleWalletTabSelect(tab: WalletIntelTab) {
    walletSelectedTab = tab;
    if (!walletDataset) return;
    if (tab === 'flow') {
      walletSelectedNodeId = walletDataset.flowLayers[0]?.id ?? walletSelectedNodeId;
      return;
    }
    if (tab === 'bubble') {
      walletSelectedNodeId = walletDataset.graph.nodes[0]?.id ?? walletSelectedNodeId;
      return;
    }
    walletSelectedNodeId = walletDataset.clusters[0]?.id ?? walletSelectedNodeId;
  }

  function handleWalletNodeSelect(id: string) {
    walletSelectedNodeId = id;
    if (!walletDataset) return;

    if (walletDataset.flowLayers.some((layer) => layer.id === id)) {
      walletSelectedTab = 'flow';
      walletCommandNote = 'Flow layer focus updated.';
      return;
    }

    const graphNode = walletDataset.graph.nodes.find((node) => node.id === id);
    if (graphNode) {
      walletSelectedTab = 'bubble';
      if (graphNode.tokenSymbol) {
        walletSelectedTokenSymbol = graphNode.tokenSymbol;
      }
      walletCommandNote = `${graphNode.shortLabel} node selected.`;
      return;
    }

    if (walletDataset.clusters.some((cluster) => cluster.id === id)) {
      walletSelectedTab = 'cluster';
      walletCommandNote = 'Cluster focus updated.';
    }
  }

  function handleWalletTokenSelect(symbol: string) {
    walletSelectedTokenSymbol = symbol;
    walletCommandNote = `${symbol} market overlay selected.`;
  }
</script>

<svelte:head><title>Cogochi Terminal</title></svelte:head>

<div class="terminal-root">
  <!-- ─── HEADER BAR ─── -->
  <header class="header-bar">
    {#if walletMode && walletDataset}
      <div class="hb-left wallet-head-left">
        <span class="hb-symbol">WALLET</span>
        <span class="hb-tf">{walletDataset.identity.chain}</span>
        <span class="hb-wallet-address">{walletDataset.identity.displayAddress}</span>
      </div>
      <div class="hb-center wallet-head-center">
        <span class="hb-price">{walletDataset.identity.label}</span>
        {#if walletSelectedToken}
          <span class="hb-change" class:up={walletSelectedToken.changePct >= 0} class:dn={walletSelectedToken.changePct < 0}>
            {walletSelectedToken.symbol} {walletSelectedToken.changePct >= 0 ? '+' : ''}{walletSelectedToken.changePct.toFixed(2)}%
          </span>
        {/if}
      </div>
      <div class="hb-right wallet-head-right">
        <span class="hb-alpha-label">CONF</span>
        <span class="hb-alpha">{walletDataset.identity.confidence}%</span>
      </div>
    {:else}
      <div class="hb-left">
        {#if currentSymbol}
          <span class="hb-symbol">{currentSymbol.replace('USDT','')}</span>
          <span class="hb-tf">{currentTf.toUpperCase()}</span>
        {:else}
          <span class="hb-symbol">TERMINAL</span>
        {/if}
      </div>
      <div class="hb-center">
        {#if currentPrice > 0}
          <span class="hb-price">${currentPrice.toLocaleString(undefined,{maximumFractionDigits:1})}</span>
          <span class="hb-change" class:up={currentChange >= 0} class:dn={currentChange < 0}>
            {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
          </span>
        {:else}
          <span class="hb-note">Search a ticker, wallet, or saved setup.</span>
        {/if}
      </div>
      <div class="hb-right">
        {#if currentSnapshot?.alphaScore != null}
          <span class="hb-alpha-label">ALPHA</span>
          <span class="hb-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">
            {currentSnapshot.alphaScore > 0 ? '+' : ''}{currentSnapshot.alphaScore}
          </span>
        {:else}
          <span class="hb-status-chip">Live workspace</span>
        {/if}
      </div>
    {/if}
  </header>

  <!-- ─── MAIN CONTENT: QUICK PANEL + FEED + CHART ─── -->
  {#if walletMode && walletDataset}
    <div class="main-content wallet-main-content">
      <WalletIntelShell
        dataset={walletDataset}
        selectedTab={walletSelectedTab}
        selectedNodeId={walletSelectedNodeId}
        selectedTokenSymbol={walletSelectedTokenSymbol}
        commandNote={walletCommandNote}
        dossierHref={walletDossierHref}
        onTabSelect={handleWalletTabSelect}
        onNodeSelect={handleWalletNodeSelect}
        onTokenSelect={handleWalletTokenSelect}
        onExit={exitWalletMode}
      />
    </div>
  {:else}
    <div class="mobile-mode-tabs" role="tablist" aria-label="Terminal mode">
      <button type="button" class:active={mobileTerminalMode === 'scanner'} onclick={() => mobileTerminalMode = 'scanner'}>Scanner</button>
      <button type="button" class:active={mobileTerminalMode === 'workspace'} onclick={() => mobileTerminalMode = 'workspace'}>Workspace</button>
      <button
        type="button"
        class:active={mobileTerminalMode === 'insight'}
        disabled={!focusedResearchBlock}
        onclick={() => { if (focusedResearchBlock) mobileTerminalMode = 'insight'; }}
      >
        Insight
      </button>
    </div>

    <div class="main-content terminal-workspace" class:inspector-open={focusedResearchBlock != null} style={terminalLayoutStyle}>
      <section class="scanner-rail main-panel main-panel-left" class:mobile-active={mobileTerminalMode === 'scanner'}>
        <div class="pane-titlebar">
          <div>
            <span class="pane-kicker">Scanner</span>
            <strong>Watchlists, presets, signals.</strong>
          </div>
          <span class="pane-state">{quickPanelScanning ? 'scanning' : `${quickPanelItems.length} rows`}</span>
        </div>

        <div class="scanner-quick">
          <QuickPanel
            items={quickPanelItems}
            scanning={quickPanelScanning}
            selectedSymbol={quickPanelSelected}
            collapsed={quickPanelCollapsed}
            onScan={handleQuickScan}
            onPreview={(symbol) => { void handleQuickPreview(symbol); }}
            onAnalyze={(symbol) => { void handleQuickAnalyze(symbol); }}
            onToggle={() => quickPanelCollapsed = !quickPanelCollapsed}
          />
        </div>
      </section>

      <button
        type="button"
        class="panel-divider panel-divider-left"
        aria-label="Resize scanner rail"
        onpointerdown={(e) => startPanelDrag('left', e)}
        onwheel={(e) => handleDividerWheel('left', e)}
        onkeydown={(e) => handleDividerKeydown('left', e)}
      ></button>

      <section class="multimodal-workspace main-panel main-panel-center" class:mobile-active={mobileTerminalMode === 'workspace'}>
        <div class="pane-titlebar">
          <div>
            <span class="pane-kicker">Multimodal</span>
            <strong>Search, render, compare, decide.</strong>
          </div>
          <span class="pane-state">{isThinking ? 'rendering' : workspaceRunLabel || 'idle'}</span>
        </div>

        <div class="workspace-body">
          <div class="workspace-flow data-feed" bind:this={feedContainer}>
            <div class="workspace-flow-inner">
              {#if feedEntries.length === 0}
                <section class="feed-start-panel">
                  <div class="feed-start-copy">
                    <span class="feed-start-kicker">START HERE</span>
                    <h2>Keep the chart and the question in one place.</h2>
                    <p>
                      Ask for a symbol, timeframe, wallet flow, or saved setup. Terminal should feel like
                      one guided workspace, not three competing panes.
                    </p>
                  </div>
                  <div class="feed-start-actions">
                    <button type="button" class="feed-start-chip" onclick={() => inputText = 'BTC 4H reclaim after selloff'}>
                      BTC 4H reclaim
                    </button>
                    <button type="button" class="feed-start-chip" onclick={() => inputText = 'ETH 1D squeeze with funding spike'}>
                      ETH 1D squeeze
                    </button>
                    <button type="button" class="feed-start-chip" onclick={() => inputText = '0x742d35... wallet flow'}>
                      Wallet flow
                    </button>
                    <button type="button" class="feed-start-chip" onclick={() => inputText = 'SOL range breakdown with OI shift'}>
                      SOL range breakdown
                    </button>
                  </div>
                </section>
              {/if}
              {#if currentSnapshot && currentChartData.length > 0}
                <section class="workspace-stage workspace-card">
                  <SingleAssetBoard
                    symbol={currentSymbol}
                    timeframe={currentTf}
                    price={currentPrice}
                    change={currentChange}
                    snapshot={currentSnapshot}
                    chartData={currentChartData}
                    annotations={currentAnnotations}
                    indicators={currentIndicators}
                    derivatives={currentDeriv}
                    preview={activeBlockSearchPreview}
                  />
                </section>
              {/if}

              {#if feedEntries.length > 0}
                <section class="workspace-results">
                  <div class="feed-inner">
              {#each feedEntries as entry}
                {#if entry.kind === 'query'}
                  <div class="fe fe-query">
                    <span class="fe-query-arrow">&gt;</span>
                    <span class="fe-query-text">{entry.text}</span>
                  </div>

                {:else if entry.kind === 'text'}
                  <div class="fe fe-text">
                    <p class="fe-text-body">{entry.text}</p>
                  </div>

                {:else if entry.kind === 'thinking'}
                  <div class="fe fe-thinking">
                    <div class="thinking-bar"></div>
                    <span class="thinking-label">Analyzing...</span>
                  </div>

                {:else if entry.kind === 'metrics'}
                  <div class="fe fe-metrics">
                    {#each entry.items as item}
                      <DataCard title={item.title} value={item.value} subtext={item.subtext} trend={item.trend} chartData={item.chartData} />
                    {/each}
                  </div>

                {:else if entry.kind === 'compare'}
                  <div class="fe fe-compare">
                    <WorkspaceCompareBlock
                      block={entry.block}
                      selected={selectedCompareBlockId === entry.blockId}
                      onSelect={selectCompareBlock}
                    />
                  </div>

                {:else if entry.kind === 'layers'}
                  <div class="fe fe-layers">
                    <div class="layers-header">
                      <span class="layers-label">ALPHA SCORE</span>
                      <span class="layers-score" style="color:{alphaColor(entry.alphaScore)}">{entry.alphaScore}</span>
                      <span class="layers-tag" style="color:{alphaColor(entry.alphaScore)}">{entry.alphaLabel}</span>
                    </div>
                    <div class="treemap-grid">
                      {#each entry.items as layer}
                        {@const absScore = Math.abs(layer.score)}
                        <div
                          class="treemap-cell"
                          style="flex:{Math.max(absScore, 3)};background:{layerCellBg(layer.score)};border-left:2px solid {layerBorderColor(layer.score)}"
                        >
                          <span class="tm-id">{layer.id}</span>
                          <span class="tm-name">{layer.name}</span>
                          <span class="tm-signal">{layer.value}</span>
                          <span class="tm-score" style="color:{scoreColor(layer.score)}">{layer.score > 0 ? '+' : ''}{layer.score}</span>
                        </div>
                      {/each}
                    </div>
                  </div>

                {:else if entry.kind === 'scan'}
                  <div class="fe fe-scan">
                    <div class="scan-header">
                      <span class="scan-title">Market Scan</span>
                      <span class="scan-meta">{entry.sort} / {entry.sector}</span>
                    </div>
                    {#each entry.items as coin}
                      <div class="scan-row">
                        <span class="sr-rank">#{coin.rank}</span>
                        <span class="sr-sym">{coin.symbol}</span>
                        <span class="sr-name">{coin.name}</span>
                        {#if coin.price != null}
                          <span class="sr-price">${coin.price >= 1 ? coin.price.toLocaleString(undefined, {maximumFractionDigits: 1}) : coin.price.toFixed(4)}</span>
                        {/if}
                        {#if coin.change24h != null}
                          <span class="sr-change" class:up={coin.change24h >= 0} class:dn={coin.change24h < 0}>
                            {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(1)}%
                          </span>
                        {/if}
                        {#if coin.is_trending}
                          <span class="sr-trending"></span>
                        {/if}
                      </div>
                    {/each}
                  </div>

                {:else if entry.kind === 'actions'}
                  <div class="fe fe-actions">
                    <button type="button" class="action-btn action-correct" onclick={() => sendFeedback('correct')}>CORRECT</button>
                    <button type="button" class="action-btn action-incorrect" onclick={() => sendFeedback('incorrect')}>INCORRECT</button>
                    <button
                      type="button"
                      class="action-btn action-save"
                      onclick={() => openChallengeModalFromQuery()}
                      disabled={!activeSaveQuery}
                      title={activeSaveQuery ? 'Save the current parsed query as a challenge' : 'Use the parsed query save button after a high-confidence block search'}
                    >
                      SAVE PATTERN
                    </button>
                  </div>

                {:else if entry.kind === 'chart_ref'}
                  <div class="fe fe-chart-ref">
                    <span class="cr-label">Chart loaded</span>
                    <span class="cr-sym">{entry.symbol.replace('USDT','')}</span>
                    <span class="cr-tf">{entry.timeframe}</span>
                  </div>

                {:else if entry.kind === 'research_block'}
                  <div class="fe fe-research">
                    <ResearchBlockRenderer envelope={entry.envelope} interactive={true} onSelect={focusResearchBlock} />
                  </div>
                {/if}
              {/each}
                  </div>
                </section>
              {/if}
            </div>
          </div>
        </div>
      </section>

      {#if focusedResearchBlock}
        <button
          type="button"
          class="panel-divider panel-divider-right"
          aria-label="Resize inspector"
          onpointerdown={(e) => startPanelDrag('right', e)}
          onwheel={(e) => handleDividerWheel('right', e)}
          onkeydown={(e) => handleDividerKeydown('right', e)}
        ></button>

        <aside class="inspector-panel main-panel main-panel-right" class:mobile-active={mobileTerminalMode === 'insight'}>
          <div class="cp-header cp-header-focus">
            <div class="cp-focus-stack">
              <div class="cp-focus-meta">
                <span class="cp-sym">{focusedResearchBlock.symbol.replace('USDT','')}</span>
                <span class="cp-tf">{focusedResearchBlock.timeframe.toUpperCase()}</span>
                <span class="cp-focus-label">{focusedResearchBlock.block.kind.replaceAll('_', ' ')}</span>
              </div>
              <div class="cp-focus-ribbon">
                {#if focusedResearchBlock.block.kind === 'heatmap_flow_chart'}
                  <span class="cp-mini-chip">walls {focusedResearchBlock.block.cells.length}</span>
                  <span class="cp-mini-chip">events {focusedResearchBlock.block.markers.length}</span>
                  <span class="cp-mini-chip">tracks {focusedResearchBlock.block.lowerPane?.series?.length ?? 0}</span>
                {/if}
              </div>
            </div>
            <button type="button" class="cp-reset" onclick={clearResearchFocus}>CLOSE</button>
          </div>
          <div class="cp-focus-body">
            <ResearchBlockRenderer envelope={focusedResearchBlock} presentation="focus" />
          </div>
        </aside>
      {/if}
    </div>
  {/if}

  <!-- ─── INPUT BAR ─── -->
  <div class="input-bar">
    <div class="input-box">
      <input
        type="text"
        class="query-input"
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder={walletMode ? '0x... / vitalik.eth / flow / bubble / cluster / ETH' : 'BTC 4H / ETH 1D / 10% 랠리 3일 볼밴 확장'}
        disabled={isThinking}
      />
      {#if parsedQuery && parsedQuery.confidence === 'high'}
        <button
          type="button"
          class="wizard-save-btn"
          onclick={() => openChallengeModalFromQuery()}
          disabled={isThinking}
          title="Save parsed query as a challenge"
        >
          💾 Save
        </button>
      {/if}
      <button type="button" class="send-btn" onclick={handleSend} disabled={isThinking || !inputText.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 14V2M8 2L3 7M8 2L13 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    {#if parsedHint}
      <div class="parsed-hint" data-confidence={parsedQuery?.confidence}>
        parsed: {parsedHint}
      </div>
    {/if}
  </div>
</div>

{#if wizardToast}
  <div class="wizard-toast" role="status">
    <div class="wizard-toast-copy">
      <span class="wizard-toast-kicker">Saved challenge</span>
      <strong>{wizardToast.slug}</strong>
    </div>
    <button type="button" class="wizard-toast-action" onclick={openLabFromToast}>Open in Lab</button>
    <button type="button" class="wizard-toast-dismiss" onclick={dismissWizardToast} aria-label="Dismiss saved challenge toast">✕</button>
  </div>
{/if}

<!-- ─── PATTERN MODAL ─── -->
{#if showPatternModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-bg" onclick={closeChallengeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <h3>Save Challenge</h3>
      <div class="mf">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label for="pattern-name">Challenge Name</label>
        <input id="pattern-name" type="text" bind:value={patternName} />
      </div>
      {#if activeSaveQuery}
        <div class="wizard-summary-card">
          <div class="wizard-summary-head">
            <span class="wizard-summary-kicker">Inferred from query</span>
            <strong>{activeSaveQuery.raw}</strong>
          </div>
          <div class="wizard-summary-meta">
            <span>{activeSaveQuery.direction ?? 'long'} bias</span>
            <span>{(activeSaveQuery.timeframe ?? '1h').toUpperCase()}</span>
            <span>{activeSaveQuery.blocks.length} blocks</span>
            <span>{(activeSaveQuery.symbol?.replace('USDT', '') ?? currentSymbol.replace('USDT', '')) || 'market'}</span>
          </div>
          <div class="wizard-summary-blocks">
            {#each activeSaveQuery.blocks as block}
              <div class="wizard-block-pill">
                <span>{block.role}</span>
                <strong>{block.function}</strong>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="wizard-note">
          Day-1 save works only from a parsed block-search query. Re-open this from the input `Save` button after a high-confidence query parse.
        </div>
      {/if}
      {#if wizardError}
        <div class="wizard-error">{wizardError}</div>
      {/if}
      <div class="mbot">
        <button type="button" class="mbtn" onclick={closeChallengeModal}>Cancel</button>
        <button
          type="button"
          class="mbtn sv"
          onclick={handleWizardSave}
          disabled={isSavingChallenge || !activeSaveQuery}
        >
          {isSavingChallenge ? 'Saving…' : 'Save Challenge'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ═══ ZOOM #1 — BLOCK SEARCH PARSER UI ═══ */
  .wizard-save-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    margin-right: 6px;
    border: 1px solid var(--sc-accent, #adca7c);
    border-radius: 4px;
    background: rgba(173, 202, 124, 0.12);
    color: var(--sc-accent, #adca7c);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: background 120ms ease;
  }
  .wizard-save-btn:hover:not(:disabled) {
    background: rgba(173, 202, 124, 0.22);
  }
  .wizard-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .parsed-hint {
    margin-top: 6px;
    padding: 0 4px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.5));
    letter-spacing: 0.3px;
  }
  .parsed-hint[data-confidence='high'] {
    color: var(--sc-accent, #adca7c);
  }
  .wizard-toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: min(92vw, 460px);
    padding: 12px 14px;
    background: rgba(173, 202, 124, 0.95);
    color: #0b1220;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }
  .wizard-toast-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .wizard-toast-kicker,
  .wizard-summary-kicker {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.72;
  }
  .wizard-toast-copy strong {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    line-height: 1.3;
  }
  .wizard-toast-action,
  .wizard-toast-dismiss {
    border: 1px solid rgba(11, 18, 32, 0.18);
    background: rgba(11, 18, 32, 0.08);
    color: #0b1220;
    border-radius: 8px;
    cursor: pointer;
  }
  .wizard-toast-action {
    min-height: 34px;
    padding: 0 12px;
    white-space: nowrap;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .wizard-toast-dismiss {
    width: 34px;
    height: 34px;
    font-size: 14px;
    line-height: 1;
  }
  .wizard-error {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(207, 127, 143, 0.1);
    border: 1px solid rgba(207, 127, 143, 0.4);
    border-radius: 4px;
    color: var(--sc-bad, #cf7f8f);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
  }

  /* ═══ ROOT LAYOUT ═══ */
  .terminal-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sc-bg-0, #050914);
    color: var(--sc-text-0, #f7f2ea);
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
  }

  /* ═══ HEADER BAR ═══ */
  .header-bar {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background: var(--sc-bg-1, #0b1220);
    flex-shrink: 0;
  }
  .hb-left { display: flex; align-items: center; gap: 8px; }
  .wallet-head-left,
  .wallet-head-center,
  .wallet-head-right {
    min-width: 0;
  }
  .hb-symbol {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 22px;
    letter-spacing: 1px;
    color: var(--sc-text-0);
  }
  .hb-tf {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3);
    background: var(--sc-bg-2, #111b2c);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .hb-center { display: flex; align-items: center; gap: 8px; }
  .wallet-head-center { justify-content: center; }
  .hb-price {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--sc-text-0);
  }
  .hb-change {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 12px;
    font-weight: 700;
  }
  .hb-change.up { color: var(--sc-good, #adca7c); }
  .hb-change.dn { color: var(--sc-bad, #cf7f8f); }
  .hb-note {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 12px;
    color: rgba(247, 242, 234, 0.6);
  }
  .hb-right { display: flex; align-items: center; gap: 6px; }
  .wallet-head-right { white-space: nowrap; }
  .hb-alpha-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }
  .hb-alpha {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 16px;
    font-weight: 800;
  }
  .hb-status-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(249, 216, 194, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(247, 242, 234, 0.62);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .hb-wallet-address {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.74);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 360px;
  }

  /* ═══ MAIN CONTENT ═══ */
  .mobile-mode-tabs {
    display: none;
  }
  .main-content {
    flex: 1;
    display: grid;
    grid-template-columns: var(--terminal-scanner-pane) 4px minmax(520px, 1fr);
    min-height: 0;
    overflow: hidden;
  }
  .main-content.inspector-open {
    grid-template-columns: var(--terminal-scanner-pane) 4px minmax(420px, 1fr) 4px var(--terminal-inspector-pane);
  }
  .main-panel {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .main-panel-left { grid-column: 1; }
  .main-panel-center { grid-column: 3; }
  .main-panel-right { grid-column: 5; }
  .scanner-rail {
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top left, rgba(219, 154, 159, 0.06), transparent 28%),
      linear-gradient(180deg, rgba(10, 12, 16, 0.98), rgba(8, 10, 14, 0.99));
    border-right: 1px solid rgba(255, 255, 255, 0.04);
  }
  .multimodal-workspace {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background:
      radial-gradient(circle at top center, rgba(173, 202, 124, 0.06), transparent 24%),
      linear-gradient(180deg, rgba(12, 15, 20, 0.98), rgba(8, 10, 14, 0.99));
  }
  .pane-titlebar {
    min-height: 56px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background: rgba(255, 255, 255, 0.02);
  }
  .pane-titlebar div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .pane-kicker,
  .pane-state {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(219, 154, 159, 0.82);
  }
  .pane-titlebar strong {
    color: var(--sc-text-0, #f7f2ea);
    font-size: 14px;
    line-height: 1.2;
  }
  .pane-state {
    color: var(--sc-text-3);
    white-space: nowrap;
  }
  .scanner-quick {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  :global(.scanner-quick .qp) {
    width: 100%;
    height: 100%;
    border-right: 0;
    background: rgba(11, 18, 32, 0.42);
  }
  :global(.scanner-quick .qp-expand) {
    position: static;
    transform: none;
    width: 100%;
    min-height: 36px;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }
  .workspace-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .workspace-flow {
    flex: 1;
    min-height: 0;
  }
  .workspace-flow-inner {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px 18px 96px;
    width: min(100%, 980px);
    margin: 0 auto;
  }
  .workspace-card {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .workspace-stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .workspace-results {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panel-divider {
    position: relative;
    width: 4px;
    border: 0;
    padding: 0;
    margin: 0;
    background: rgba(255, 255, 255, 0.04);
    cursor: col-resize;
    touch-action: none;
    transition: background 0.14s ease;
    z-index: 2;
  }
  .panel-divider::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(219, 154, 159, 0.08), rgba(173, 202, 124, 0.08));
    opacity: 0;
    transition: opacity 0.14s ease;
  }
  .panel-divider:hover,
  .panel-divider:focus-visible {
    background: rgba(255, 255, 255, 0.09);
    outline: none;
  }
  .panel-divider:hover::after,
  .panel-divider:focus-visible::after {
    opacity: 1;
  }
  .panel-divider-left { grid-column: 2; }
  .panel-divider-right { grid-column: 4; }
  .inspector-panel {
    grid-column: 5;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.08), transparent 28%),
      linear-gradient(180deg, rgba(14, 12, 15, 0.98), rgba(7, 8, 11, 0.99));
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .wallet-main-content {
    padding: 14px;
    overflow: auto;
  }
  .wallet-main-content :global(.wallet-shell) {
    width: 100%;
    flex: 1 1 auto;
  }

  /* ═══ DATA FEED ═══ */
  .data-feed {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
    min-height: 0;
  }
  .feed-inner {
    max-width: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .feed-start-panel {
    display: grid;
    gap: 18px;
    padding: 22px;
    border-radius: 24px;
    border: 1px solid rgba(249, 216, 194, 0.12);
    background:
      linear-gradient(180deg, rgba(18, 18, 20, 0.88), rgba(10, 10, 12, 0.84)),
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.08), transparent 42%);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.12);
  }
  .feed-start-copy {
    display: grid;
    gap: 10px;
  }
  .feed-start-kicker,
  .feed-start-chip {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .feed-start-kicker {
    font-size: 10px;
    color: rgba(219, 154, 159, 0.9);
  }
  .feed-start-copy h2 {
    margin: 0;
    color: rgba(250, 247, 235, 0.98);
    font-size: clamp(1.5rem, 3.2vw, 2.1rem);
    line-height: 1.02;
    letter-spacing: -0.05em;
  }
  .feed-start-copy p {
    margin: 0;
    color: rgba(250, 247, 235, 0.68);
    font-size: 0.98rem;
    line-height: 1.64;
  }
  .feed-start-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .feed-start-chip {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.76);
    font-size: 10px;
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      background var(--sc-duration-fast),
      border-color var(--sc-duration-fast);
  }
  .feed-start-chip:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(219, 154, 159, 0.24);
  }

  /* ─── Feed Entry base ─── */
  .fe {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    animation: sc-slide-up 0.15s ease;
  }

  /* ─── Query ─── */
  .fe-query {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .fe-query-arrow {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    color: var(--sc-text-3);
    flex-shrink: 0;
  }
  .fe-query-text {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 15px;
    color: var(--sc-text-1);
  }

  /* ─── Text ─── */
  .fe-text-body {
    margin: 0;
    font-size: 15px;
    line-height: 1.72;
    color: var(--sc-text-1);
    white-space: pre-line;
  }

  .fe-research {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .fe-compare {
    padding: 2px 0 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* ─── Thinking ─── */
  .fe-thinking {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
  }
  .thinking-bar {
    width: 120px;
    height: 2px;
    background: var(--sc-bg-2);
    border-radius: 1px;
    overflow: hidden;
    position: relative;
  }
  .thinking-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 40%;
    background: var(--sc-accent, #db9a9f);
    border-radius: 1px;
    animation: pulse-slide 1.4s ease-in-out infinite;
  }
  @keyframes pulse-slide {
    0% { left: -40%; opacity: 0.4; }
    50% { opacity: 1; }
    100% { left: 100%; opacity: 0.4; }
  }
  .thinking-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
  }

  /* ─── Metrics Grid ─── */
  .fe-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
  }

  /* ─── Layers / Treemap ─── */
  .fe-layers {
    padding: 6px 0;
  }
  .layers-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }
  .layers-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }
  .layers-score {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 28px;
    line-height: 1;
  }
  .layers-tag {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
  }
  .treemap-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .treemap-cell {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 8px;
    border-radius: 3px;
    min-width: 70px;
    min-height: 58px;
    justify-content: space-between;
  }
  .tm-id {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    color: var(--sc-text-3);
  }
  .tm-name {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-1);
    font-weight: 600;
  }
  .tm-signal {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-2);
  }
  .tm-score {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    font-weight: 800;
  }

  /* ─── Scan Table ─── */
  .fe-scan {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
  }
  .scan-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--sc-line-soft);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .scan-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 18px;
    letter-spacing: 0.5px;
    color: var(--sc-text-0);
  }
  .scan-meta {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: var(--sc-text-3);
  }
  .scan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--sc-line-soft);
    font-size: 12px;
  }
  .scan-row:last-child { border-bottom: none; }
  .sr-rank {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3);
    min-width: 24px;
    font-weight: 700;
  }
  .sr-sym {
    font-weight: 800;
    color: var(--sc-text-0);
    min-width: 48px;
    font-size: 12px;
  }
  .sr-name {
    color: var(--sc-text-3);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }
  .sr-price {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    color: var(--sc-text-1);
    min-width: 64px;
    text-align: right;
    font-size: 12px;
  }
  .sr-change {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-weight: 700;
    min-width: 52px;
    text-align: right;
    font-size: 11px;
  }
  .sr-change.up { color: var(--sc-good, #adca7c); }
  .sr-change.dn { color: var(--sc-bad, #cf7f8f); }
  .sr-trending {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sc-good, #adca7c);
    flex-shrink: 0;
  }

  /* ─── Actions ─── */
  .fe-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 2px 0;
  }
  .action-btn {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    background: transparent;
    border: 1px solid var(--sc-line-soft);
    color: var(--sc-text-2);
  }
  .action-btn:hover { color: var(--sc-text-0); }
  .action-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
  .action-correct:hover {
    color: var(--sc-good, #adca7c);
    border-color: var(--sc-good, #adca7c);
    background: rgba(173, 202, 124, 0.08);
  }
  .action-incorrect:hover {
    color: var(--sc-bad, #cf7f8f);
    border-color: var(--sc-bad, #cf7f8f);
    background: rgba(207, 127, 143, 0.08);
  }
  .action-save {
    border-style: dashed;
  }
  .action-save:hover {
    border-style: solid;
    color: var(--sc-text-0);
  }

  /* ─── Chart Reference (inline in feed) ─── */
  .fe-chart-ref {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
  }
  .cr-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: var(--sc-text-3);
  }
  .cr-sym {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-1);
  }
  .cr-tf {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3);
    background: var(--sc-bg-2);
    padding: 1px 5px;
    border-radius: 2px;
  }

  /* ═══ WORKSPACE STAGE ═══ */
  .workspace-stage {
    width: 100%;
    flex-shrink: 0;
    background:
      radial-gradient(circle at top right, rgba(54, 215, 255, 0.05), transparent 28%),
      linear-gradient(180deg, rgba(7, 14, 25, 0.7), rgba(4, 10, 18, 0.38));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .cp-header-focus {
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .cp-focus-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .cp-focus-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .cp-focus-ribbon {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cp-focus-label {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }

  .cp-reset {
    min-height: 30px;
    padding: 0 10px;
    border-radius: 10px;
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background: rgba(255, 255, 255, 0.03);
    color: var(--sc-text-1, #d9d3cb);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .cp-focus-body {
    flex: 1;
    min-height: 0;
    padding: 12px 14px 16px;
    overflow: auto;
  }
  .cp-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 0 12px;
    border-bottom: 0;
    flex-shrink: 0;
    background: transparent;
  }
  .cp-sym {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 20px;
    color: var(--sc-text-0);
  }
  .cp-tf {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3);
    background: var(--sc-bg-2);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .cp-mini-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid rgba(39, 63, 86, 0.78);
    border-radius: 999px;
    background: rgba(7, 16, 28, 0.92);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(176, 205, 228, 0.74);
  }
  .cp-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px;
  }
  .workspace-empty-card {
    min-height: 320px;
    background:
      radial-gradient(circle at top center, rgba(173, 202, 124, 0.04), transparent 30%),
      linear-gradient(180deg, rgba(7, 14, 25, 0.42), rgba(4, 10, 18, 0.16));
  }
  .cp-empty-label {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 24px;
    color: var(--sc-text-3);
    letter-spacing: 1px;
  }
  .cp-empty-hint {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-3);
    max-width: 420px;
    text-align: center;
    line-height: 1.6;
  }

  /* ═══ INPUT BAR ═══ */
  .input-bar {
    padding: 8px 20px 12px;
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background: var(--sc-bg-0, #050914);
    flex-shrink: 0;
  }
  .input-box {
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    gap: 8px;
    background: var(--sc-bg-1, #0b1220);
    border: 1px solid var(--sc-line-soft);
    border-radius: 6px;
    padding: 4px 4px 4px 14px;
    align-items: center;
  }
  .input-box input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--sc-text-0, #f7f2ea);
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 13px;
    outline: none;
    padding: 8px 0;
  }
  .input-box input::placeholder { color: var(--sc-text-3); }
  .send-btn {
    width: 36px;
    height: 36px;
    background: var(--sc-accent, #db9a9f);
    color: var(--sc-bg-0, #050914);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
  }
  .send-btn:disabled { opacity: 0.3; cursor: default; }

  /* ═══ MODAL ═══ */
  .modal-bg {
    position: fixed;
    inset: 0;
    background: var(--sc-overlay, rgba(4, 8, 14, 0.88));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-box {
    background: var(--sc-bg-1, #0b1220);
    border: 1px solid var(--sc-line);
    border-radius: 8px;
    padding: 24px;
    width: 420px;
    max-width: 90vw;
  }
  .modal-box h3 {
    margin: 0 0 20px;
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 22px;
    color: var(--sc-text-0);
    letter-spacing: 0.5px;
  }
  .mf { margin-bottom: 14px; }
  .mf label {
    display: block;
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: var(--sc-text-3);
    margin-bottom: 6px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .mf input {
    width: 100%;
    padding: 10px 12px;
    background: var(--sc-bg-0);
    border: 1px solid var(--sc-line-soft);
    border-radius: 4px;
    color: var(--sc-text-0);
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .wizard-summary-card,
  .wizard-note {
    padding: 12px 14px;
    background: var(--sc-bg-0);
    border: 1px solid var(--sc-line-soft);
    border-radius: 8px;
  }
  .wizard-summary-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wizard-summary-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .wizard-summary-head strong {
    font-size: 14px;
    line-height: 1.5;
    color: var(--sc-text-0);
  }
  .wizard-summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .wizard-summary-meta span,
  .wizard-block-pill,
  .wizard-note {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: var(--sc-text-2);
  }
  .wizard-summary-meta span {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .wizard-summary-blocks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .wizard-block-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(219, 154, 159, 0.08);
    border: 1px solid rgba(219, 154, 159, 0.14);
  }
  .wizard-block-pill strong {
    color: var(--sc-text-0);
  }
  .wizard-note {
    line-height: 1.6;
  }
  .mbot { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
  .mbtn {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--sc-line-soft);
    color: var(--sc-text-2);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 12px;
  }
  .mbtn.sv {
    background: var(--sc-accent, #db9a9f);
    border: none;
    color: var(--sc-bg-0);
    font-weight: 700;
  }
  .mbtn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  /* ═══ SCROLLBAR ═══ */
  .data-feed::-webkit-scrollbar { width: 4px; }
  .data-feed::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 1024px) {
    .wizard-toast {
      left: 12px;
      right: 12px;
      bottom: 92px;
      transform: none;
      min-width: 0;
    }
    .mobile-mode-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
      background: rgba(5, 9, 14, 0.96);
    }
    .mobile-mode-tabs button {
      min-height: 36px;
      border-radius: 8px;
      border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
      background: rgba(255, 255, 255, 0.03);
      color: var(--sc-text-2, rgba(247, 242, 234, 0.72));
      font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
      font-size: 12px;
      font-weight: 700;
    }
    .mobile-mode-tabs button.active {
      border-color: rgba(219, 154, 159, 0.46);
      background: rgba(219, 154, 159, 0.12);
      color: var(--sc-text-0, #f7f2ea);
    }
    .mobile-mode-tabs button:disabled {
      opacity: 0.38;
    }
    .main-content {
      display: block;
      position: relative;
    }
    .panel-divider {
      display: none;
    }
    .scanner-rail,
    .multimodal-workspace {
      display: none;
      width: 100%;
      height: 100%;
      border-left: none;
      border-top: none;
      max-height: none;
    }
    .inspector-panel {
      display: none;
      width: 100%;
      height: 100%;
      border-left: none;
    }
    .scanner-rail.mobile-active,
    .multimodal-workspace.mobile-active,
    .inspector-panel.mobile-active {
      display: flex;
    }
    .scanner-quick {
      flex: 1;
    }
    .workspace-flow-inner {
      padding: 12px 12px 96px;
      width: 100%;
    }
    .workspace-body {
      display: flex;
      flex-direction: column;
    }
    .workspace-stage {
      min-height: 220px;
      flex: 0 0 auto;
    }
    .header-bar {
      height: auto;
      margin: 14px 14px 0;
      padding: 14px 16px;
      gap: 10px;
      align-items: flex-start;
      border: 1px solid rgba(249, 216, 194, 0.1);
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(16, 16, 18, 0.9), rgba(10, 10, 12, 0.86)),
        radial-gradient(circle at top right, rgba(219, 154, 159, 0.05), transparent 36%);
      box-shadow: 0 16px 38px rgba(0, 0, 0, 0.14);
    }
    .hb-left,
    .hb-center,
    .hb-right {
      min-width: 0;
    }
    .wallet-head-left {
      flex-wrap: wrap;
    }
    .hb-wallet-address {
      max-width: 100%;
      white-space: normal;
      overflow: visible;
    }
    .feed-start-panel {
      margin: 0 0 4px;
    }
    .input-bar {
      position: sticky;
      bottom: calc(var(--sc-mobile-nav-h, 64px) + 10px);
      z-index: 4;
      padding: 0 14px 10px;
      border-top: none;
      background: transparent;
    }
    .input-box {
      max-width: none;
      padding: 8px 8px 8px 16px;
      border-radius: 22px;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.16);
    }
  }

  @media (max-width: 768px) {
    .terminal-root {
      height: 100%;
      background:
        linear-gradient(180deg, rgba(0, 0, 0, 0.98), rgba(4, 4, 6, 1)),
        radial-gradient(circle at top left, rgba(219, 154, 159, 0.08), transparent 36%);
    }
    .header-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
    .hb-left,
    .hb-center,
    .hb-right {
      justify-content: space-between;
    }
    .hb-note {
      line-height: 1.5;
    }
    .feed-start-panel {
      padding: 20px;
      gap: 16px;
      border-radius: 22px;
    }
    .feed-start-copy h2 {
      font-size: clamp(1.44rem, 7vw, 1.92rem);
    }
    .feed-start-copy p {
      font-size: 0.94rem;
    }
    .cp-header {
      padding: 14px;
    }
    .cp-chart {
      min-height: 200px;
      padding: 8px;
    }
    .cp-stats {
      grid-template-columns: repeat(2, 1fr);
    }
    .fe-actions {
      flex-wrap: wrap;
    }
    .action-btn {
      flex: 1 1 calc(50% - 6px);
      justify-content: center;
    }
  }

  @media (max-width: 540px) {
    .main-content {
      padding: 12px;
      gap: 10px;
    }
    .header-bar {
      margin: 12px 12px 0;
      padding: 12px 14px;
      border-radius: 20px;
    }
    .hb-symbol {
      font-size: 18px;
    }
    .hb-note {
      font-size: 11px;
    }
    .data-feed,
    .chart-panel {
      border-radius: 20px;
    }
    .feed-inner {
      padding: 12px 12px 16px;
    }
    .feed-start-panel {
      padding: 18px;
      border-radius: 20px;
    }
    .feed-start-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .feed-start-chip {
      width: 100%;
      justify-content: center;
    }
    .input-bar {
      bottom: calc(var(--sc-mobile-nav-h, 64px) + 8px);
      padding: 0 12px 8px;
    }
    .input-box {
      padding: 6px 6px 6px 14px;
      border-radius: 20px;
    }
    .send-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
    }
  }
</style>
