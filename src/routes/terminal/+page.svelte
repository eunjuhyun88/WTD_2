<script lang="ts">
  import { onMount } from 'svelte';
  import { safeParseResearchBlockEnvelope, type ResearchBlockEnvelope } from '$lib/contracts';
  import type { ChallengeAnswers, ParsedQuery } from '$lib/contracts';
  import {
    parseBlockSearchWithHints,
    summarizeParsedQuery
  } from '$lib/terminal/blockSearchParser';
  import DataCard from '../../components/cogochi/DataCard.svelte';
  import CgChart from '../../components/cogochi/CgChart.svelte';
  import QuickPanel from '../../components/cogochi/QuickPanel.svelte';
  import ResearchBlockRenderer from '../../components/terminal/research/ResearchBlockRenderer.svelte';
  import WalletIntelShell from '../../components/wallet-intel/WalletIntelShell.svelte';
  import { buildPassportWalletLink } from '$lib/utils/deepLinks';
  import {
    buildWalletIntelDataset,
    findWalletMarketToken,
    interpretWalletCommand,
    isWalletIdentifierLike,
    normalizeWalletModeInput,
    walletIntelApiPath,
    walletDeepLink,
  } from '$lib/wallet-intel/walletIntelController';
  import type { WalletIntelDataset, WalletIntelTab, WalletModeInput } from '$lib/wallet-intel/walletIntelTypes';

  // ─── Types ────────────────────────────────────────────────
  type MessageType =
    | { role: 'user'; text: string }
    | { role: 'douni'; text: string; widgets?: Widget[] }
    | { role: 'douni'; thinking: true };

  type Widget =
    | { type: 'chart'; symbol: string; timeframe: string; chartData?: any[] }
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
    | { kind: 'metrics'; items: MetricItem[] }
    | { kind: 'layers'; items: LayerItem[]; alphaScore: number; alphaLabel: string }
    | { kind: 'scan'; items: any[]; sort: string; sector: string }
    | { kind: 'actions'; patternName: string; direction: 'LONG' | 'SHORT'; conditions: string[] }
    | { kind: 'chart_ref'; symbol: string; timeframe: string }
    | { kind: 'research_block'; envelope: ResearchBlockEnvelope };

  // ─── State ────────────────────────────────────────────────
  let messages = $state<MessageType[]>([]);
  let inputText = $state('');
  let isThinking = $state(false);
  let feedContainer: HTMLDivElement | undefined = $state();
  let showPatternModal = $state(false);

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
  let walletMode = $state(false);
  let walletInput = $state<WalletModeInput | null>(null);
  let walletDataset = $state<WalletIntelDataset | null>(null);
  let walletSelectedTab = $state<WalletIntelTab>('flow');
  let walletSelectedNodeId = $state('');
  let walletSelectedTokenSymbol = $state('');
  let walletCommandNote = $state('');
  let walletDossierHref = $state('');

  // Conversation history for LLM context
  let chatHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const walletSelectedToken = $derived(
    walletDataset ? findWalletMarketToken(walletDataset, walletSelectedTokenSymbol) : null
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
  let wizardToast = $state<string | null>(null);
  let wizardError = $state<string | null>(null);

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

  function slugifyFromQuery(q: ParsedQuery): string {
    const sym = (q.symbol ?? 'pattern').toLowerCase().replace(/[^a-z0-9]/g, '');
    const stamp = Date.now().toString(36).slice(-5);
    return `${sym || 'pattern'}-${stamp}`;
  }

  function openChallengeModalFromQuery() {
    if (!parsedQuery || parsedQuery.confidence !== 'high') return;
    patternName = slugifyFromQuery(parsedQuery);
    patternDirection = parsedQuery.direction === 'short' ? 'SHORT' : 'LONG';
    patternConditions = parsedQuery.blocks.map(
      (b) => `${b.role}: ${b.function}  (${b.source_token})`
    );
    wizardError = null;
    wizardToast = null;
    showPatternModal = true;
  }

  async function handleWizardSave() {
    if (!parsedQuery || parsedQuery.blocks.length === 0) {
      // No parsed blocks → fall back to the old no-op close behavior so the
      // existing LLM `pattern_draft` flow keeps working.
      showPatternModal = false;
      return;
    }
    if (isSavingChallenge) return;
    isSavingChallenge = true;
    wizardError = null;

    const slug = (patternName || slugifyFromQuery(parsedQuery))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);

    const description = parsedQuery.raw.trim().slice(0, 280) || 'parsed from /terminal search';
    const direction = patternDirection === 'SHORT' ? 'short' : 'long';
    const timeframe = parsedQuery.timeframe ?? '1h';

    try {
      const res = await fetch('/api/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          description,
          direction,
          timeframe,
          blocks: parsedQuery.blocks
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

      wizardToast = `Saved ${payload.answers.identity.name} — open /lab?slug=${payload.answers.identity.name}`;
      showPatternModal = false;
      // Auto-dismiss toast after 6s.
      setTimeout(() => {
        if (wizardToast) wizardToast = null;
      }, 6000);
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
  onMount(async () => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const walletAddress = params?.get('address');
    const walletModeRequested = params?.get('mode') === 'wallet';
    if (walletAddress && (walletModeRequested || isWalletIdentifierLike(walletAddress))) {
      await activateWalletMode(normalizeWalletModeInput(walletAddress, params?.get('chain') || 'eth'), {
        updateUrl: false,
        note: 'Deep-linked wallet investigation loaded.',
      });
      return;
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
    currentSymbol = data.symbol || currentSymbol;
    currentTf = data.timeframe || currentTf || '4h';
    currentPrice = data.price ?? currentPrice;
    currentChange = data.change24h ?? currentChange;
    currentSnapshot = data;
    currentChartData = data.chart ?? currentChartData;
    currentDeriv = data.derivatives ?? currentDeriv;
    currentAnnotations = data.annotations ?? [];
    currentIndicators = data.indicators ?? null;
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
    inputText = `${fullSymbol.replace('USDT', '')} ${currentTf || '4h'}`;
    await handleSend();
  }

  // ─── Send via FC Pipeline ─────────────────────────────────
  async function handleSend() {
    const text = inputText.trim();
    if (!text || isThinking) return;

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

    messages = [...messages, { role: 'user', text }];
    inputText = '';
    isThinking = true;

    // Add thinking bubble
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();

    // Track history for LLM context
    chatHistory = [...chatHistory, { role: 'user', content: text }];

    try {
      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10),
          snapshot: currentSnapshot || undefined,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      // Remove thinking bubble, prepare streaming response
      messages = messages.filter(m => !('thinking' in m));

      let streamingText = '';
      const pendingLayers: LayerItem[] = [];
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
              if (!focusedResearchBlock || parsed.data.block.kind === 'inline_price_chart') {
                focusedResearchBlock = parsed.data;
              }
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
                messages = messages.filter(m => !('thinking' in m));
                applyAnalysisResult(event.data, pendingLayers);
                streamingText = '';
              } else if (event.name === 'check_social' && event.data) {
                messages = messages.filter(m => !('thinking' in m));
                applySocialResult(event.data);
                streamingText = '';
              } else if (event.name === 'scan_market' && event.data) {
                messages = messages.filter(m => !('thinking' in m));
                applyScanResult(event.data);
                streamingText = '';
              }
              break;

            case 'chart_action':
              handleChartAction(event.action, event.payload);
              break;

            case 'pattern_draft':
              patternName = event.name;
              patternConditions = (event.conditions as any[]).map(c =>
                `${c.field} ${c.operator} ${c.value}`
              );
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

      // Finalize: ensure last text message is in history
      if (streamingText) {
        chatHistory = [...chatHistory, { role: 'assistant', content: streamingText }];
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
  function applyAnalysisResult(data: any, layers: LayerItem[]) {
    const normalized = normalizeAnalysisPayload(data);
    syncCurrentAnalysis(normalized);
    const researchBlocks: ResearchBlockEnvelope[] = Array.isArray(normalized.researchBlocks)
      ? normalized.researchBlocks.flatMap((payload: unknown) => {
          const parsed = safeParseResearchBlockEnvelope(payload);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const hasResearchBlocks = researchBlocks.length > 0;

    if (hasResearchBlocks) {
      if (!focusedResearchBlock) {
        focusedResearchBlock = researchBlocks.find((block) => block.block.kind === 'inline_price_chart') ?? researchBlocks[0];
      }
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
  }

  function clearResearchFocus() {
    focusedResearchBlock = null;
  }

  async function loadWalletIntelDataset(input: WalletModeInput): Promise<WalletIntelDataset> {
    try {
      const response = await fetch(walletIntelApiPath(input));
      if (!response.ok) throw new Error(`wallet intel http ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok || !payload?.data) throw new Error('invalid wallet intel payload');
      return payload.data as WalletIntelDataset;
    } catch (error) {
      console.error('[terminal] wallet intel api fallback:', error);
      return buildWalletIntelDataset(input);
    }
  }

  async function activateWalletMode(
    nextInput: WalletModeInput,
    options: { updateUrl?: boolean; note?: string } = {}
  ) {
    const dataset = await loadWalletIntelDataset(nextInput);
    walletInput = nextInput;
    walletDataset = dataset;
    walletMode = true;
    walletSelectedTab = 'flow';
    walletSelectedNodeId = dataset.flowLayers[0]?.id ?? dataset.graph.nodes[0]?.id ?? '';
    walletSelectedTokenSymbol = dataset.market.tokens[0]?.symbol ?? '';
    walletCommandNote = options.note ?? `${nextInput.identifier} wallet context loaded.`;
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
        {/if}
      </div>
      <div class="hb-right">
        {#if currentSnapshot?.alphaScore != null}
          <span class="hb-alpha-label">ALPHA</span>
          <span class="hb-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">
            {currentSnapshot.alphaScore > 0 ? '+' : ''}{currentSnapshot.alphaScore}
          </span>
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
    <div class="main-content">
    <!-- QUICK PANEL -->
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

    <!-- DATA FEED -->
    <div class="data-feed" bind:this={feedContainer}>
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
              <button type="button" class="action-btn action-save" onclick={() => showPatternModal = true}>SAVE PATTERN</button>
            </div>

          {:else if entry.kind === 'chart_ref'}
            <!-- Chart reference: no inline rendering, chart is always in side panel -->
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
    </div>

    <!-- CHART PANEL (always visible) -->
    <aside class="chart-panel">
      {#if focusedResearchBlock}
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
          <button type="button" class="cp-reset" onclick={clearResearchFocus}>SHOW PRICE</button>
        </div>
        <div class="cp-focus-body">
          <ResearchBlockRenderer envelope={focusedResearchBlock} presentation="focus" />
        </div>
      {:else if currentSnapshot && currentChartData.length > 0}
        <div class="cp-header">
          <div class="cp-price-stack">
            <div class="cp-primary-row">
              <span class="cp-sym">{currentSymbol.replace('USDT','')}</span>
              <span class="cp-tf">{currentTf.toUpperCase()}</span>
              {#if currentPrice > 0}
                <span class="cp-price">${currentPrice.toLocaleString(undefined,{maximumFractionDigits:1})}</span>
                <span class="cp-change" class:up={currentChange >= 0} class:dn={currentChange < 0}>
                  {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
                </span>
              {/if}
              {#if currentSnapshot.alphaScore != null}
                <span class="cp-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">
                  a:{currentSnapshot.alphaScore > 0 ? '+' : ''}{currentSnapshot.alphaScore}
                </span>
              {/if}
            </div>
            <div class="cp-ribbon">
              <span class="cp-mini-chip">regime {currentSnapshot.regime ?? '--'}</span>
              <span class="cp-mini-chip">cvd {currentSnapshot.l11?.cvd_state ?? '--'}</span>
              <span class="cp-mini-chip">mtf {currentSnapshot.l10?.mtf_confluence ?? '--'}</span>
              <span class="cp-mini-chip">bb {currentSnapshot.l14?.bb_squeeze ? 'SQZ' : 'OPEN'}</span>
            </div>
          </div>
          <div class="cp-header-side">
            <span class="cp-side-label">terminal chart</span>
            <span class="cp-side-value">{currentChartData.length} bars</span>
          </div>
        </div>
        <div class="cp-chart">
          <CgChart
            data={currentChartData}
            currentPrice={currentPrice}
            annotations={currentAnnotations}
            indicators={currentIndicators}
            symbol={currentSymbol}
            timeframe={currentTf}
            changePct={currentChange}
            snapshot={currentSnapshot}
            derivatives={currentDeriv}
          />
        </div>
        <div class="cp-stats">
          <div class="qs-cell">
            <span class="qs-label">Funding</span>
            <span class="qs-value" style="color:{currentDeriv?.funding > 0.0005 ? 'var(--sc-bad)' : currentDeriv?.funding < -0.0005 ? 'var(--sc-good)' : 'var(--sc-text-2)'}">
              {currentDeriv?.funding != null ? (currentDeriv.funding * 100).toFixed(4) + '%' : '--'}
            </span>
          </div>
          <div class="qs-cell">
            <span class="qs-label">OI</span>
            <span class="qs-value">
              {currentDeriv?.oi != null ? (currentDeriv.oi >= 1e6 ? (currentDeriv.oi/1e6).toFixed(0)+'M' : (currentDeriv.oi/1e3).toFixed(0)+'K') : '--'}
            </span>
          </div>
          <div class="qs-cell">
            <span class="qs-label">L/S</span>
            <span class="qs-value" style="color:{currentDeriv?.lsRatio > 1.1 ? 'var(--sc-bad)' : currentDeriv?.lsRatio < 0.9 ? 'var(--sc-good)' : 'var(--sc-text-2)'}">
              {currentDeriv?.lsRatio?.toFixed(2) ?? '--'}
            </span>
          </div>
          <div class="qs-cell">
            <span class="qs-label">BB</span>
            <span class="qs-value">
              {currentSnapshot.l14?.bb_squeeze ? 'SQUEEZE' : currentSnapshot.l14?.bb_width != null ? `w:${currentSnapshot.l14.bb_width}` : '--'}
            </span>
          </div>
          <div class="qs-cell">
            <span class="qs-label">ATR</span>
            <span class="qs-value">{currentSnapshot.l15?.atr_pct != null ? currentSnapshot.l15.atr_pct + '%' : '--'}</span>
          </div>
          <div class="qs-cell">
            <span class="qs-label">Regime</span>
            <span class="qs-value">{currentSnapshot.regime ?? '--'}</span>
          </div>
        </div>
      {:else}
        <div class="cp-empty">
          <span class="cp-empty-label">No analysis yet</span>
          <span class="cp-empty-hint">Ask DOUNI to analyze a symbol</span>
        </div>
      {/if}
    </aside>
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
          onclick={openChallengeModalFromQuery}
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
  <div class="wizard-toast" role="status">{wizardToast}</div>
{/if}

<!-- ─── PATTERN MODAL ─── -->
{#if showPatternModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-bg" onclick={() => showPatternModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <h3>Save Pattern</h3>
      <div class="mf">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label for="pattern-name">Pattern Name</label>
        <input id="pattern-name" type="text" value={patternName} />
      </div>
      <div class="mf">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="mf-label">Direction</label>
        <div class="mdir">
          <button type="button" class="md" class:act={patternDirection === 'LONG'} onclick={() => patternDirection = 'LONG'}>LONG</button>
          <button type="button" class="md" class:act={patternDirection === 'SHORT'} onclick={() => patternDirection = 'SHORT'}>SHORT</button>
        </div>
      </div>
      <div class="mf">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="mf-label">Conditions ({patternConditions.length})</label>
        {#each patternConditions as c}
          <div class="mc">{c}</div>
        {/each}
        {#if patternConditions.length === 0}
          <div class="mc" style="color:var(--sc-text-3)">Conditions auto-generated after analysis</div>
        {/if}
      </div>
      {#if wizardError}
        <div class="wizard-error">{wizardError}</div>
      {/if}
      <div class="mbot">
        <button type="button" class="mbtn" onclick={() => showPatternModal = false}>Cancel</button>
        <button
          type="button"
          class="mbtn sv"
          onclick={handleWizardSave}
          disabled={isSavingChallenge}
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
    padding: 10px 18px;
    background: rgba(173, 202, 124, 0.95);
    color: #0b1220;
    border-radius: 6px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
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
  .main-content {
    flex: 1;
    display: flex;
    min-height: 0;
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
  }
  .feed-inner {
    max-width: 720px;
    padding: 8px 16px 80px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ─── Feed Entry base ─── */
  .fe {
    padding: 6px 0;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.08));
    animation: sc-slide-up 0.15s ease;
  }
  .fe:last-child { border-bottom: none; }

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
    font-size: 13px;
    color: var(--sc-text-2);
  }

  /* ─── Text ─── */
  .fe-text-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    color: var(--sc-text-1);
    white-space: pre-line;
  }

  .fe-research {
    padding: 12px 0 14px;
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
    gap: 4px;
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
    background: var(--sc-bg-1, #0b1220);
    border: 1px solid var(--sc-line-soft);
    border-radius: 6px;
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
    padding: 8px 0;
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

  /* ═══ CHART PANEL ═══ */
  .chart-panel {
    width: 420px;
    flex-shrink: 0;
    border-left: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background:
      radial-gradient(circle at top right, rgba(54, 215, 255, 0.06), transparent 28%),
      linear-gradient(180deg, rgba(7, 14, 25, 0.98), rgba(4, 10, 18, 0.99));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cp-header-focus {
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .cp-focus-stack,
  .cp-price-stack {
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

  .cp-focus-ribbon,
  .cp-ribbon {
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
    padding: 12px 14px 16px;
    overflow: auto;
  }
  .cp-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--sc-line-soft);
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(8, 17, 29, 0.92), rgba(5, 11, 19, 0.84));
  }
  .cp-primary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
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
  .cp-price {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--sc-text-0);
    margin-left: auto;
  }
  .cp-change {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
  }
  .cp-change.up { color: var(--sc-good, #adca7c); }
  .cp-change.dn { color: var(--sc-bad, #cf7f8f); }
  .cp-alpha {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 800;
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
  .cp-header-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    padding-top: 2px;
  }
  .cp-side-label {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }
  .cp-side-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-1);
  }
  .cp-chart {
    flex: 1;
    min-height: 200px;
    padding: 6px;
    background: linear-gradient(180deg, rgba(4, 10, 17, 0.3), rgba(4, 10, 17, 0));
  }
  .cp-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--sc-line-soft);
    border-top: 1px solid var(--sc-line-soft);
    flex-shrink: 0;
  }
  .qs-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: rgba(5, 12, 21, 0.98);
  }
  .qs-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 9px;
    color: var(--sc-text-3);
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .qs-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--sc-text-1);
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
  .cp-empty-label {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 22px;
    color: var(--sc-text-3);
    letter-spacing: 1px;
  }
  .cp-empty-hint {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-3);
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
  .mf label, .mf .mf-label {
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
  .mdir { display: flex; gap: 8px; }
  .md {
    flex: 1;
    padding: 10px;
    border: 1px solid var(--sc-line-soft);
    background: var(--sc-bg-0);
    color: var(--sc-text-2);
    border-radius: 4px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .md.act {
    border-color: var(--sc-accent);
    color: var(--sc-accent);
    background: rgba(219, 154, 159, 0.08);
  }
  .mc {
    padding: 8px 12px;
    background: var(--sc-bg-0);
    border: 1px solid var(--sc-line-soft);
    border-radius: 4px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: var(--sc-text-2);
    margin-bottom: 4px;
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

  /* ═══ SCROLLBAR ═══ */
  .data-feed::-webkit-scrollbar { width: 4px; }
  .data-feed::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 1024px) {
    .main-content { flex-direction: column; }
    .chart-panel {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--sc-line-soft);
      max-height: 380px;
    }
    .cp-chart { min-height: 160px; }
    .header-bar {
      height: auto;
      padding: 10px 14px;
      gap: 10px;
      align-items: flex-start;
    }
    .wallet-head-left {
      flex-wrap: wrap;
    }
    .hb-wallet-address {
      max-width: 100%;
      white-space: normal;
      overflow: visible;
    }
  }
</style>
