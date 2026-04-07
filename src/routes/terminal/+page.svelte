<script lang="ts">
  import { onMount } from 'svelte';
  import DataCard from '../../components/cogochi/DataCard.svelte';
  import CgChart from '../../components/cogochi/CgChart.svelte';

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
    | { type: 'scan_list'; items: any[]; sort: string; sector: string };

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
    | { kind: 'chart_ref'; symbol: string; timeframe: string };

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

  // Chart overlay data (Sprint 1)
  let currentAnnotations: any[] = $state([]);
  let currentIndicators: any = $state(null);

  // Conversation history for LLM context
  let chatHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

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
          }
        }
      }
    }
    return entries;
  });

  // ─── Init ─────────────────────────────────────────────────
  onMount(() => {
    const hour = new Date().getHours();
    let greeting: string;
    if (hour >= 6 && hour < 12) greeting = '좋은 아침! 뭐 볼까? 종목이랑 타임프레임 알려줘.';
    else if (hour >= 12 && hour < 18) greeting = '오후야! BTC 4H 분석해볼까?';
    else if (hour >= 18 && hour < 24) greeting = '오늘 시장 좀 움직였어. 같이 볼까?';
    else greeting = '아직 안 자? 시장은 쉬지 않지. 뭐 봐줄까?';
    messages = [{ role: 'douni', text: greeting }];
  });

  // ─── Send via FC Pipeline ─────────────────────────────────
  async function handleSend() {
    const text = inputText.trim();
    if (!text || isThinking) return;

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
      let pendingAnalysis: any = null;

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
                // Show thinking indicator while tool runs
                messages = [...messages, { role: 'douni', thinking: true } as MessageType];
                scrollToBottom();
              }
              break;

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
                pendingAnalysis = event.data;
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
              messages = [...messages, { role: 'douni', text: `Error: ${event.message}` }];
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
      messages = messages.filter(m => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: `Error: ${err.message}` }];
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
    currentSymbol = data.symbol || currentSymbol;
    currentTf = data.timeframe || currentTf;
    currentPrice = data.price || currentPrice;
    currentChange = data.change24h || currentChange;
    currentSnapshot = data;
    if (data.chart) currentChartData = data.chart;
    if (data.derivatives) currentDeriv = data.derivatives;
    if (data.annotations) currentAnnotations = data.annotations;
    if (data.indicators) currentIndicators = data.indicators;

    // Build metrics from analysis data
    const metrics: MetricItem[] = [];
    if (data.l2?.fr != null) {
      const fr = data.l2.fr;
      const frPct = (fr * 100).toFixed(4);
      const frHot = Math.abs(fr) > 0.0005;
      metrics.push({
        title: 'Funding Rate', value: `${frPct}%`,
        subtext: frHot ? (fr > 0 ? '롱 과열' : '숏 과열') : '보통',
        trend: frHot ? 'danger' : 'neutral',
        chartData: [0.01, 0.02, 0.03, 0.02, 0.03, 0.04, 0.03, Math.abs(fr) * 100],
      });
    }
    if (data.l7?.fear_greed != null) {
      const fg = data.l7.fear_greed;
      metrics.push({
        title: 'Fear & Greed', value: `${fg}`,
        subtext: fg < 25 ? 'Extreme Fear' : fg < 40 ? 'Fear' : fg > 75 ? 'Extreme Greed' : fg > 60 ? 'Greed' : 'Neutral',
        trend: fg < 30 ? 'bear' : fg > 70 ? 'danger' : 'neutral',
        chartData: [40, 35, 30, 25, 20, 18, 15, fg],
      });
    }
    if (data.derivatives?.oi != null) {
      const oi = data.derivatives.oi;
      metrics.push({
        title: 'OI', value: oi >= 1e6 ? `${(oi/1e6).toFixed(0)}M` : `${(oi/1e3).toFixed(0)}K`,
        subtext: '미결제약정', trend: 'neutral',
        chartData: [80, 85, 82, 88, 90, 87, 92, 95],
      });
    }
    if (data.derivatives?.lsRatio != null) {
      const ls = data.derivatives.lsRatio;
      metrics.push({
        title: 'L/S Ratio', value: ls.toFixed(2),
        subtext: ls > 1.1 ? '롱 과밀' : ls < 0.9 ? '숏 과밀' : '균형',
        trend: ls > 1.1 ? 'bear' : ls < 0.9 ? 'bull' : 'neutral',
        chartData: [1.0, 1.05, 1.1, 1.08, 1.12, 1.15, 1.1, ls],
      });
    }

    // Add chart widget
    if (data.chart && data.chart.length > 0) {
      messages = [...messages, {
        role: 'douni', text: '',
        widgets: [{ type: 'chart', symbol: currentSymbol, timeframe: currentTf.toUpperCase(), chartData: data.chart }],
      }];
    }

    // Add metrics widget
    if (metrics.length > 0) {
      messages = [...messages, { role: 'douni', text: '', widgets: [{ type: 'metrics', items: metrics }] }];
    }

    // Add layers widget
    const sortedLayers = layers.length > 0
      ? layers.filter(l => l.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 6)
      : [];
    if (sortedLayers.length > 0 && data.alphaScore != null) {
      messages = [...messages, {
        role: 'douni', text: '',
        widgets: [{ type: 'layers', items: sortedLayers, alphaScore: data.alphaScore, alphaLabel: data.alphaLabel || 'NEUTRAL' }],
      }];
    }

    // Add feedback action buttons
    const dir = data.alphaScore >= 10 ? 'LONG' : data.alphaScore <= -10 ? 'SHORT' : 'LONG';
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
      messages = messages.filter(m => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: `Error: ${err.message}` }];
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
</script>

<svelte:head><title>Cogochi Terminal</title></svelte:head>

<div class="terminal-root">
  <!-- ─── HEADER BAR ─── -->
  <header class="header-bar">
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
  </header>

  <!-- ─── MAIN CONTENT: FEED + CHART ─── -->
  <div class="main-content">
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
          {/if}
        {/each}
      </div>
    </div>

    <!-- CHART PANEL (always visible) -->
    <aside class="chart-panel">
      {#if currentSnapshot && currentChartData.length > 0}
        <div class="cp-header">
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
        <div class="cp-chart">
          <CgChart data={currentChartData} currentPrice={currentPrice} annotations={currentAnnotations} indicators={currentIndicators} />
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

  <!-- ─── INPUT BAR ─── -->
  <div class="input-bar">
    <div class="input-box">
      <input
        type="text"
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="BTC 4H / ETH 1D / scan top gainers"
        disabled={isThinking}
      />
      <button type="button" class="send-btn" onclick={handleSend} disabled={isThinking || !inputText.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 14V2M8 2L3 7M8 2L13 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</div>

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
      <div class="mbot">
        <button type="button" class="mbtn" onclick={() => showPatternModal = false}>Cancel</button>
        <button type="button" class="mbtn sv" onclick={() => showPatternModal = false}>Save to Scanner</button>
      </div>
    </div>
  </div>
{/if}

<style>
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

  /* ═══ MAIN CONTENT ═══ */
  .main-content {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
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
    background: var(--sc-bg-1, #0b1220);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .cp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--sc-line-soft);
    flex-shrink: 0;
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
  .cp-chart {
    flex: 1;
    min-height: 200px;
    padding: 4px;
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
    background: var(--sc-bg-1, #0b1220);
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
  }
</style>
