<script lang="ts">
  import { onMount } from 'svelte';
  import DataCard from '../../components/cogochi/DataCard.svelte';
  import CgChart from '../../components/cogochi/CgChart.svelte';
  import CgLayerPanel from '../../components/cogochi/CgLayerPanel.svelte';

  // ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  type MessageType =
    | { role: 'user'; text: string }
    | { role: 'douni'; text: string; widgets?: Widget[] }
    | { role: 'douni'; thinking: true };
  type Widget =
    | { type: 'chart'; symbol: string; timeframe: string; chartData?: any[] }
    | { type: 'metrics'; items: MetricItem[] }
    | { type: 'layers'; items: LayerItem[]; alphaScore: number; alphaLabel: string }
    | { type: 'actions'; patternName: string; direction: 'LONG' | 'SHORT'; conditions: string[] };
  interface MetricItem { title: string; value: string; subtext: string; trend: 'bull' | 'bear' | 'neutral' | 'danger'; chartData: number[]; }
  interface LayerItem { id: string; name: string; value: string; score: number; }

  // ━━━ State ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let messages = $state<MessageType[]>([]);
  let inputText = $state('');
  let isThinking = $state(false);
  let chatContainer: HTMLDivElement | undefined = $state();
  let showPatternModal = $state(false);
  let chartPanelOpen = $state(false);

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
  let chatHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const coins = ['BTC','ETH','SOL','DOGE','XRP','ADA','AVAX','BNB'];
  const tfs = ['15m','1h','4h','1d'];

  // ━━━ Resize State ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let leftWidth = $state(260);
  let rightWidth = $state(380);
  let isDraggingLeft = $state(false);
  let isDraggingRight = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const LEFT_MIN = 200;
  const LEFT_MAX = 400;
  const RIGHT_MIN = 280;
  const RIGHT_MAX = 600;

  function startDragLeft(e: MouseEvent) {
    e.preventDefault();
    isDraggingLeft = true;
    const startX = e.clientX;
    const startW = leftWidth;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      leftWidth = Math.max(LEFT_MIN, Math.min(LEFT_MAX, startW + delta));
    }
    function onUp() {
      isDraggingLeft = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startDragRight(e: MouseEvent) {
    e.preventDefault();
    isDraggingRight = true;
    const startX = e.clientX;
    const startW = rightWidth;

    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      rightWidth = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, startW + delta));
    }
    function onUp() {
      isDraggingRight = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ━━━ Init ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onMount(() => {
    const h = new Date().getHours();
    const g = h >= 6 && h < 12
      ? 'Good morning. What shall we analyze?'
      : h < 18
        ? 'Afternoon session. Try: BTC 4H'
        : h < 24
          ? 'Evening. Markets moved today.'
          : 'Late session active.';
    messages = [{ role: 'douni', text: g }];
  });

  // ━━━ API ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let analyzeId = 0; // guard against double-calls
  async function analyzeSymbol(sym: string, tf: string) {
    if (isThinking) return; // prevent double-click
    const thisId = ++analyzeId;
    isThinking = true;
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();
    try {
      const res = await fetch(`/api/cogochi/analyze?symbol=${sym}&tf=${tf}`);
      if (thisId !== analyzeId) return; // stale call
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const s = data.snapshot;
      currentSymbol = sym; currentTf = tf; currentSnapshot = s;
      currentChartData = data.chart || []; currentPrice = data.price || 0;
      currentChange = data.change24h || 0; currentDeriv = data.derivatives || {};

      // Build all result messages at once
      const fr = currentDeriv?.funding, oi = currentDeriv?.oi, ls = currentDeriv?.lsRatio, fg = currentDeriv?.fearGreed;
      const resultMsgs: MessageType[] = [];

      // 1) Chart widget
      resultMsgs.push({ role: 'douni', text: `${sym.replace('USDT','')} ${tf.toUpperCase()} scanned.`, widgets: [{ type: 'chart', symbol: sym, timeframe: tf.toUpperCase(), chartData: data.chart }] });

      // 2) Metrics
      const metrics: MetricItem[] = [];
      if (fr != null) metrics.push({ title: 'FUNDING', value: `${(fr*100).toFixed(4)}%`, subtext: Math.abs(fr) > 0.0005 ? (fr > 0 ? 'Long overheat' : 'Short overheat') : 'Normal', trend: Math.abs(fr) > 0.0005 ? 'danger' : 'neutral', chartData: [0.01,0.02,0.03,0.02,0.03,0.04,0.03,Math.abs(fr)*100] });
      if (oi != null) metrics.push({ title: 'OI', value: oi >= 1e6 ? `${(oi/1e6).toFixed(0)}M` : `${(oi/1e3).toFixed(0)}K`, subtext: 'Open Interest', trend: 'neutral', chartData: [80,85,82,88,90,87,92,95] });
      if (ls != null) metrics.push({ title: 'L/S', value: ls.toFixed(2), subtext: ls > 1.1 ? 'Long crowded' : ls < 0.9 ? 'Short crowded' : 'Balanced', trend: ls > 1.1 ? 'bear' : ls < 0.9 ? 'bull' : 'neutral', chartData: [1.0,1.05,1.1,1.08,1.12,1.15,1.1,ls] });
      if (fg != null) metrics.push({ title: 'F&G', value: `${fg}`, subtext: fg < 25 ? 'Extreme Fear' : fg < 40 ? 'Fear' : fg > 75 ? 'Greed' : 'Neutral', trend: fg < 30 ? 'bear' : fg > 70 ? 'danger' : 'neutral', chartData: [40,35,30,25,20,18,15,fg] });
      if (metrics.length) resultMsgs.push({ role: 'douni', text: '', widgets: [{ type: 'metrics', items: metrics }] });

      // 3) Top layers
      const topLayers = [
        { id: 'L01', name: 'Wyckoff', value: s.l1.phase, score: s.l1.score },
        { id: 'L02', name: 'Supply', value: `FR ${fr != null ? (fr*100).toFixed(3)+'%' : '—'}`, score: s.l2.score },
        { id: 'L10', name: 'MTF', value: s.l10.mtf_confluence, score: s.l10.score },
        { id: 'L11', name: 'CVD', value: s.l11.cvd_state, score: s.l11.score },
        { id: 'L07', name: 'F&G', value: `${fg ?? '—'}`, score: s.l7.score },
      ].filter(l => l.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5);
      resultMsgs.push({ role: 'douni', text: '', widgets: [{ type: 'layers', items: topLayers, alphaScore: s.alphaScore, alphaLabel: s.alphaLabel }] });

      // 4) Analysis + actions
      const dir = s.alphaScore > 20 ? 'BULLISH' : s.alphaScore < -20 ? 'BEARISH' : 'NEUTRAL';
      const conds: string[] = [];
      if (Math.abs(s.l11.score) >= 5) conds.push(`l11.cvd_state = ${s.l11.cvd_state}`);
      if (Math.abs(s.l1.score) >= 10) conds.push(`l1.phase = ${s.l1.phase}`);
      if (Math.abs(s.l10.score) >= 10) conds.push(`l10.mtf = ${s.l10.mtf_confluence}`);
      if (fr != null && Math.abs(fr) > 0.0003) conds.push(`l2.fr ${fr > 0 ? '>' : '<'} ${Math.abs(fr).toFixed(4)}`);
      patternConditions = conds; patternDirection = s.alphaScore >= 0 ? 'LONG' : 'SHORT';
      patternName = topLayers.slice(0,2).map(l => l.value).join('+');
      resultMsgs.push({ role: 'douni', text: `Alpha ${s.alphaScore} — ${dir}\nWyckoff: ${s.l1.phase}\nMTF: ${s.l10.mtf_confluence}${s.l11.cvd_state !== 'NEUTRAL' ? '\nCVD: ' + s.l11.cvd_state : ''}`, widgets: conds.length ? [{ type: 'actions', patternName, direction: patternDirection, conditions: conds }] : undefined });

      // Apply all messages in one batch (remove thinking + add results)
      if (thisId !== analyzeId) return; // stale check
      messages = [...messages.filter(m => !('thinking' in m)), ...resultMsgs];
      chartPanelOpen = true; isThinking = false; scrollToBottom();
    } catch (err: any) {
      if (thisId !== analyzeId) return;
      messages = [...messages.filter(m => !('thinking' in m)), { role: 'douni', text: `ERR: ${err.message}` }];
      isThinking = false; scrollToBottom();
    }
  }

  function handleSend() {
    const text = inputText.trim(); if (!text || isThinking) return;
    messages = [...messages, { role: 'user', text }]; inputText = '';

    // 1) Exact match: "BTC 4H"
    const exact = text.match(/\b(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|DOT|LINK|BNB|OP|ARB|PEPE|WIF)\b.*?\b(1m|5m|15m|1h|4h|1d|1w)\b/i);
    if (exact) {
      analyzeAndChat(exact[1].toUpperCase() + 'USDT', exact[2].toLowerCase(), text);
      return;
    }

    // 2) Coin mentioned without timeframe → infer TF from context
    const coinMatch = text.match(/\b(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|DOT|LINK|BNB|OP|ARB|PEPE|WIF|비트코인|이더리움|솔라나|도지)\b/i);
    if (coinMatch) {
      const coinMap: Record<string, string> = {
        '비트코인': 'BTC', '이더리움': 'ETH', '솔라나': 'SOL', '도지': 'DOGE',
      };
      const coin = coinMap[coinMatch[1]] || coinMatch[1].toUpperCase();

      // Infer timeframe from natural language
      let tf = currentTf || '4h'; // default to current or 4h
      if (/한달|1달|월|monthly/i.test(text)) tf = '1d';
      else if (/일주일|주간|weekly|1주/i.test(text)) tf = '1d';
      else if (/일봉|데일리|daily/i.test(text)) tf = '1d';
      else if (/1시간|한시간/i.test(text)) tf = '1h';
      else if (/15분/i.test(text)) tf = '15m';

      analyzeAndChat(coin + 'USDT', tf, text);
      return;
    }

    // 3) Pattern save
    if (text.includes('패턴') && text.includes('저장')) {
      showPatternModal = true;
      return;
    }

    // 4) Analysis-related keywords without coin → use current coin or prompt
    const analysisWords = /분석|봐줘|봐봐|찾아|검색|스캔|확인|어때|어떰|징조|이상|특이|시그널|signal/i;
    if (analysisWords.test(text) && currentSymbol) {
      // Re-analyze current symbol and let DOUNI interpret with the new question
      analyzeAndChat(currentSymbol, currentTf || '4h', text);
      return;
    }

    // 5) General conversation → send to DOUNI LLM
    sendToDouni(text);
  }

  async function analyzeAndChat(sym: string, tf: string, originalText: string) {
    await analyzeSymbol(sym, tf);
    // After analysis, ask DOUNI to interpret the results
    if (currentSnapshot) {
      await sendToDouni(originalText);
    }
  }

  async function sendToDouni(text: string) {
    isThinking = true;
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();

    chatHistory = [...chatHistory, { role: 'user', content: text }];

    try {
      const res = await fetch('/api/cogochi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10),
          snapshot: currentSnapshot || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

      // Remove thinking, add empty message for streaming
      messages = [...messages.filter(m => !('thinking' in m)), { role: 'douni', text: '' }];
      const msgIdx = messages.length - 1;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.t) {
              fullText += parsed.t;
              messages = messages.map((m, i) =>
                i === msgIdx ? { ...m, text: fullText } : m
              );
              scrollToBottom();
            }
            if (parsed.error) throw new Error(parsed.error);
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      chatHistory = [...chatHistory, { role: 'assistant', content: fullText }];
      isThinking = false;
    } catch (err: any) {
      messages = [...messages.filter(m => !('thinking' in m)), { role: 'douni', text: `ERR: ${err.message}` }];
      isThinking = false; scrollToBottom();
    }
  }

  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  function scrollToBottom() { requestAnimationFrame(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' })); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }
  function scoreColor(s: number) { return s <= -15 ? 'var(--cg-red)' : s < 0 ? 'var(--cg-orange)' : s === 0 ? 'var(--cg-text-muted)' : s <= 15 ? 'var(--cg-cyan)' : 'var(--cg-cyan)'; }
  function alphaColor(s: number) { return s >= 20 ? 'var(--cg-cyan)' : s <= -20 ? 'var(--cg-red)' : 'var(--cg-text-dim)'; }
</script>

<svelte:head><title>Cogochi Terminal</title></svelte:head>

<div
  class="root"
  class:dragging={isDraggingLeft || isDraggingRight}
  bind:this={rootEl}
>
  <!-- ━━━ LEFT: Signal Panel ━━━ -->
  <aside class="panel panel-left" style="width:{leftWidth}px">
    <div class="panel-header">
      <span class="ph-title">SIGNALS</span>
      <span class="ph-badge">{currentSnapshot ? '15L' : '—'}</span>
    </div>
    <div class="panel-body">
      <CgLayerPanel snapshot={currentSnapshot} />

      <!-- Derivatives -->
      <div class="deriv-section">
        <div class="section-label">DERIVATIVES</div>
        <div class="deriv-grid">
          <div class="dg-cell">
            <span class="dg-k">FR</span>
            <span class="dg-v" class:warn={currentDeriv?.funding && Math.abs(currentDeriv.funding) > 0.0005}>
              {currentDeriv?.funding != null ? (currentDeriv.funding * 100).toFixed(4) + '%' : '—'}
            </span>
          </div>
          <div class="dg-cell">
            <span class="dg-k">OI</span>
            <span class="dg-v">
              {currentDeriv?.oi != null ? (currentDeriv.oi >= 1e6 ? (currentDeriv.oi/1e6).toFixed(0)+'M' : (currentDeriv.oi/1e3).toFixed(0)+'K') : '—'}
            </span>
          </div>
          <div class="dg-cell">
            <span class="dg-k">L/S</span>
            <span class="dg-v" class:warn={currentDeriv?.lsRatio > 1.15}>
              {currentDeriv?.lsRatio?.toFixed(2) ?? '—'}
            </span>
          </div>
          <div class="dg-cell">
            <span class="dg-k">F&G</span>
            <span class="dg-v">{currentDeriv?.fearGreed ?? '—'}</span>
          </div>
        </div>
      </div>

      <!-- Quick Scan -->
      <div class="qs-section">
        <div class="section-label">QUICK SCAN</div>
        <div class="qs-pills">
          {#each coins as c}
            <button
              class="qs-pill"
              class:active={currentSymbol === c+'USDT'}
              onclick={() => analyzeSymbol(c+'USDT', currentTf || '4h')}
            >{c}</button>
          {/each}
        </div>
        <div class="qs-pills">
          {#each tfs as t}
            <button
              class="qs-pill tf"
              class:active={currentTf === t}
              onclick={() => analyzeSymbol(currentSymbol || 'BTCUSDT', t)}
            >{t.toUpperCase()}</button>
          {/each}
        </div>
      </div>
    </div>
  </aside>

  <!-- Drag handle left -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drag-handle" class:active={isDraggingLeft} onmousedown={startDragLeft}>
    <div class="drag-line"></div>
  </div>

  <!-- ━━━ CENTER: Console ━━━ -->
  <main class="panel panel-center">
    <div class="panel-header">
      <span class="ph-title">CONSOLE</span>
      {#if currentSymbol}
        <span class="ph-sym">{currentSymbol.replace('USDT','')}</span>
        <span class="ph-tf">{currentTf.toUpperCase()}</span>
        {#if currentPrice > 0}
          <span class="ph-price">${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          <span class="ph-chg" class:up={currentChange >= 0} class:dn={currentChange < 0}>
            {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
          </span>
        {/if}
      {/if}
      <button class="ph-toggle" onclick={() => chartPanelOpen = !chartPanelOpen}>
        {chartPanelOpen ? '◧' : '◨'} CHART
      </button>
    </div>

    <div class="console-scroll" bind:this={chatContainer}>
      <div class="console-inner">
        {#each messages as msg}
          {#if 'thinking' in msg}
            <div class="msg sys">
              <span class="msg-prefix">◈</span>
              <div class="thinking-dots"><span></span><span></span><span></span></div>
            </div>
          {:else if msg.role === 'user'}
            <div class="msg user">
              <span class="msg-prefix">›</span>
              <span class="msg-text">{msg.text}</span>
            </div>
          {:else}
            <div class="msg douni">
              <span class="msg-prefix">◈</span>
              <div class="msg-body">
                {#if msg.text}<div class="msg-text">{msg.text}</div>{/if}
                {#if msg.widgets}
                  {#each msg.widgets as widget}
                    {#if widget.type === 'chart'}
                      <button class="w-chart-btn" onclick={() => chartPanelOpen = !chartPanelOpen}>
                        <span class="wcb-sym">{widget.symbol.replace('USDT','')}</span>
                        <span class="wcb-tf">{widget.timeframe}</span>
                        {#if widget.chartData?.length}
                          {@const cds = widget.chartData}
                          {@const mn = Math.min(...cds.map((c: any) => c.l))}
                          {@const mx = Math.max(...cds.map((c: any) => c.h))}
                          {@const rg = mx - mn || 1}
                          <svg viewBox="0 0 {cds.length * 4} 40" class="wcb-mini" preserveAspectRatio="none">
                            {#each cds as c, i}
                              {@const x = i * 4 + 2}
                              {@const up = c.c >= c.o}
                              <line x1={x} y1={38-((c.h-mn)/rg)*34} x2={x} y2={38-((c.l-mn)/rg)*34} stroke={up ? 'var(--cg-cyan)' : 'var(--cg-red)'} stroke-width="0.5" opacity="0.5"/>
                              <rect x={x-1} y={38-((Math.max(c.o,c.c)-mn)/rg)*34} width="2" height={Math.max(Math.abs(c.c-c.o)/rg*34, 0.5)} fill={up ? 'var(--cg-cyan)' : 'var(--cg-red)'} opacity="0.7"/>
                            {/each}
                          </svg>
                        {/if}
                        <span class="wcb-action">{chartPanelOpen ? 'HIDE' : 'VIEW'} →</span>
                      </button>
                    {:else if widget.type === 'metrics'}
                      <div class="w-metrics">
                        {#each widget.items as item}
                          <DataCard title={item.title} value={item.value} subtext={item.subtext} trend={item.trend} chartData={item.chartData} />
                        {/each}
                      </div>
                    {:else if widget.type === 'layers'}
                      <div class="w-layers">
                        <div class="wl-header">
                          <span class="wl-label">ALPHA</span>
                          <span class="wl-score" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaScore}</span>
                          <span class="wl-tag" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaLabel}</span>
                        </div>
                        {#each widget.items as layer}
                          <div class="wl-row">
                            <span class="wl-id">{layer.id}</span>
                            <span class="wl-name">{layer.name}</span>
                            <span class="wl-val">{layer.value}</span>
                            <div class="wl-bar-bg"><div class="wl-bar" style="width:{Math.min(Math.abs(layer.score)*2.5,100)}%;background:{scoreColor(layer.score)}"></div></div>
                            <span class="wl-s" style="color:{scoreColor(layer.score)}">{layer.score>0?'+':''}{layer.score}</span>
                          </div>
                        {/each}
                      </div>
                    {:else if widget.type === 'actions'}
                      <div class="w-actions">
                        <button class="wa agree">✓ AGREE</button>
                        <button class="wa disagree">✗ DISAGREE</button>
                        <button class="wa save" onclick={() => showPatternModal = true}>◈ SAVE PATTERN</button>
                      </div>
                    {/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Input -->
    <div class="input-area">
      <div class="input-row">
        <span class="input-prompt">›</span>
        <input
          type="text"
          bind:value={inputText}
          onkeydown={handleKeydown}
          placeholder="BTC 4H, ETH 1D..."
          disabled={isThinking}
        />
        <button class="input-send" onclick={handleSend} disabled={isThinking || !inputText.trim()}>
          ↵
        </button>
      </div>
    </div>
  </main>

  <!-- Drag handle right (only when chart open) -->
  {#if chartPanelOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="drag-handle" class:active={isDraggingRight} onmousedown={startDragRight}>
      <div class="drag-line"></div>
    </div>
  {/if}

  <!-- ━━━ RIGHT: Chart Panel (ALWAYS rendered, CSS toggle) ━━━ -->
  <aside
    class="panel panel-right"
    class:open={chartPanelOpen}
    style="width:{chartPanelOpen ? rightWidth : 0}px"
  >
    <div class="panel-header">
      <span class="ph-title">CHART</span>
      {#if currentSymbol}
        <span class="ph-sym">{currentSymbol.replace('USDT','')}</span>
        <span class="ph-tf">{currentTf.toUpperCase()}</span>
      {/if}
      {#if currentSnapshot}
        <span class="ph-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">
          α{currentSnapshot.alphaScore}
        </span>
      {/if}
      <button class="ph-close" onclick={() => chartPanelOpen = false}>✕</button>
    </div>
    <div class="chart-area">
      <CgChart data={currentChartData} currentPrice={currentPrice} visible={chartPanelOpen} />
    </div>
    {#if currentSnapshot}
      <div class="chart-info">
        <div class="ci-row"><span class="ci-k">Wyckoff</span><span class="ci-v" style="color:{scoreColor(currentSnapshot.l1.score)}">{currentSnapshot.l1.phase}</span></div>
        <div class="ci-row"><span class="ci-k">CVD</span><span class="ci-v" style="color:{scoreColor(currentSnapshot.l11.score)}">{currentSnapshot.l11.cvd_state}</span></div>
        <div class="ci-row"><span class="ci-k">MTF</span><span class="ci-v" style="color:{scoreColor(currentSnapshot.l10.score)}">{currentSnapshot.l10.mtf_confluence}</span></div>
        <div class="ci-row"><span class="ci-k">BB</span><span class="ci-v">{currentSnapshot.l14.bb_squeeze ? '● SQZ' : `w:${currentSnapshot.l14.bb_width}`}</span></div>
        <div class="ci-row"><span class="ci-k">ATR</span><span class="ci-v">{currentSnapshot.l15.atr_pct}%</span></div>
        <div class="ci-row"><span class="ci-k">Regime</span><span class="ci-v">{currentSnapshot.regime}</span></div>
      </div>
    {/if}
  </aside>
</div>

<!-- ━━━ Pattern Modal ━━━ -->
{#if showPatternModal}
  <!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showPatternModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">SAVE PATTERN</span>
        <button class="modal-close" onclick={() => showPatternModal = false}>✕</button>
      </div>
      <div class="modal-body">
        <div class="mf">
          <label class="mf-label">PATTERN NAME</label>
          <input class="mf-input" type="text" value={patternName} />
        </div>
        <div class="mf">
          <label class="mf-label">DIRECTION</label>
          <div class="mf-dir">
            <button class="dir-btn" class:active={patternDirection==='LONG'} onclick={() => patternDirection='LONG'}>LONG ▲</button>
            <button class="dir-btn" class:active={patternDirection==='SHORT'} onclick={() => patternDirection='SHORT'}>SHORT ▼</button>
          </div>
        </div>
        <div class="mf">
          <label class="mf-label">CONDITIONS ({patternConditions.length})</label>
          {#each patternConditions as c}
            <div class="cond-row">{c}</div>
          {/each}
          {#if !patternConditions.length}
            <div class="cond-row dim">Run analysis to auto-generate conditions</div>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button class="m-btn" onclick={() => showPatternModal = false}>CANCEL</button>
        <button class="m-btn primary" onclick={() => showPatternModal = false}>SAVE → SCANNER</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ━━━ Root Layout ━━━ */
  .root {
    display: flex;
    height: 100%;
    background: var(--cg-bg, #06060b);
    overflow: hidden;
    font-family: var(--font-sans, 'IBM Plex Sans', sans-serif);
  }

  .root.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .root.dragging * {
    pointer-events: none;
  }

  .root.dragging .drag-handle {
    pointer-events: auto;
  }

  /* ━━━ Panels ━━━ */
  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-left {
    flex-shrink: 0;
    background: var(--cg-surface, #0a0a11);
    border-right: 1px solid var(--cg-border, #16162a);
  }

  .panel-center {
    flex: 1;
    min-width: 320px;
  }

  .panel-right {
    flex-shrink: 0;
    background: var(--cg-surface, #0a0a11);
    border-left: 1px solid var(--cg-border, #16162a);
    overflow: hidden;
  }

  .panel-right:not(.open) {
    width: 0 !important;
    border-left: none;
  }

  /* ━━━ Panel Headers ━━━ */
  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-bottom: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    user-select: none;
  }

  .ph-title {
    font-weight: 700;
    color: var(--cg-text-muted, #383860);
    letter-spacing: 1.5px;
    font-size: 9px;
  }

  .ph-badge {
    font-size: 8px;
    font-weight: 700;
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0,229,255,0.08);
    padding: 1px 5px;
    border-radius: 2px;
    letter-spacing: 0.5px;
  }

  .ph-sym {
    font-weight: 700;
    color: var(--cg-text, #c8c8e0);
    font-size: 11px;
  }

  .ph-tf {
    font-size: 9px;
    color: var(--cg-text-dim, #505078);
    background: var(--cg-surface-2, #0e0e17);
    padding: 1px 5px;
    border-radius: 2px;
  }

  .ph-price {
    color: var(--cg-text, #c8c8e0);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .ph-chg {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ph-chg.up { color: var(--cg-cyan, #00e5ff); }
  .ph-chg.dn { color: var(--cg-red, #ff3860); }

  .ph-alpha {
    font-weight: 700;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .ph-toggle {
    margin-left: auto;
    background: none;
    border: 1px solid var(--cg-border, #16162a);
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: all 0.12s;
  }

  .ph-toggle:hover {
    color: var(--cg-cyan, #00e5ff);
    border-color: var(--cg-cyan, #00e5ff);
    background: rgba(0,229,255,0.04);
  }

  .ph-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--cg-text-muted, #383860);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
    transition: color 0.12s;
  }
  .ph-close:hover { color: var(--cg-text, #c8c8e0); }

  /* ━━━ Drag Handles ━━━ */
  .drag-handle {
    width: 5px;
    cursor: col-resize;
    background: transparent;
    position: relative;
    flex-shrink: 0;
    z-index: 10;
    transition: background 0.12s;
  }

  .drag-handle:hover, .drag-handle.active {
    background: rgba(0, 229, 255, 0.06);
  }

  .drag-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--cg-border, #16162a);
    transition: background 0.12s;
  }

  .drag-handle:hover .drag-line, .drag-handle.active .drag-line {
    background: var(--cg-cyan, #00e5ff);
    opacity: 0.5;
  }

  /* ━━━ Left Panel Body ━━━ */
  .panel-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .section-label {
    padding: 8px 12px 4px;
    font-family: var(--font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
  }

  .deriv-section {
    border-top: 1px solid var(--cg-border, #16162a);
    margin-top: auto;
  }

  .deriv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0 4px 4px;
  }

  .dg-cell {
    padding: 4px 8px;
  }

  .dg-k {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 8px;
    font-weight: 600;
    color: var(--cg-text-muted, #383860);
    letter-spacing: 1px;
    margin-bottom: 2px;
  }

  .dg-v {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--cg-text, #c8c8e0);
    font-variant-numeric: tabular-nums;
  }

  .dg-v.warn { color: var(--cg-red, #ff3860); }

  .qs-section {
    border-top: 1px solid var(--cg-border, #16162a);
    padding-bottom: 8px;
  }

  .qs-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px 12px;
  }

  .qs-pill {
    padding: 3px 8px;
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.1s;
    letter-spacing: 0.5px;
  }

  .qs-pill:hover { color: var(--cg-text, #c8c8e0); border-color: var(--cg-border-strong, #1e1e38); }
  .qs-pill.active { color: var(--cg-cyan, #00e5ff); border-color: rgba(0,229,255,0.3); background: rgba(0,229,255,0.04); }

  /* ━━━ Console (Center) ━━━ */
  .console-scroll {
    flex: 1;
    overflow-y: auto;
  }

  .console-inner {
    max-width: 680px;
    margin: 0 auto;
    padding: 16px 16px 80px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .msg {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.6;
  }

  .msg-prefix {
    flex-shrink: 0;
    width: 14px;
    color: var(--cg-text-muted, #383860);
    font-size: 11px;
    margin-top: 1px;
  }

  .msg.user .msg-prefix { color: var(--cg-cyan, #00e5ff); }
  .msg.douni .msg-prefix { color: var(--cg-text-muted, #383860); }

  .msg-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .msg-text {
    color: var(--cg-text, #c8c8e0);
    white-space: pre-line;
    word-break: break-word;
  }

  .msg.user .msg-text {
    color: var(--cg-cyan, #00e5ff);
  }

  /* Thinking dots */
  .thinking-dots {
    display: flex;
    gap: 4px;
    padding: 2px 0;
  }

  .thinking-dots span {
    width: 5px;
    height: 5px;
    background: var(--cg-text-dim, #505078);
    border-radius: 50%;
    animation: blink 1.4s infinite ease-in-out both;
  }

  .thinking-dots span:nth-child(1) { animation-delay: -0.32s; }
  .thinking-dots span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes blink {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  /* Chart widget button */
  .w-chart-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    transition: all 0.12s;
    width: 100%;
    text-align: left;
    font-family: var(--font-mono, monospace);
  }

  .w-chart-btn:hover {
    border-color: var(--cg-cyan, #00e5ff);
    background: rgba(0,229,255,0.02);
  }

  .wcb-sym { font-weight: 700; color: var(--cg-text, #c8c8e0); font-size: 11px; }
  .wcb-tf { font-size: 9px; color: var(--cg-text-dim, #505078); }
  .wcb-mini { height: 28px; flex: 1; min-width: 80px; }
  .wcb-action { font-size: 9px; color: var(--cg-cyan, #00e5ff); font-weight: 600; letter-spacing: 0.5px; flex-shrink: 0; }

  /* Metrics */
  .w-metrics {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* Layers widget */
  .w-layers {
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    padding: 8px 10px;
  }

  .wl-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
  }

  .wl-label {
    font-size: 8px;
    font-weight: 700;
    color: var(--cg-text-muted, #383860);
    letter-spacing: 1.5px;
  }

  .wl-score {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .wl-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .wl-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border-bottom: 1px solid var(--cg-border, #16162a);
    font-family: var(--font-mono, monospace);
  }

  .wl-row:last-child { border-bottom: none; }
  .wl-id { font-size: 9px; font-weight: 600; color: var(--cg-text-muted, #383860); min-width: 26px; }
  .wl-name { font-size: 10px; color: var(--cg-text-dim, #505078); min-width: 48px; }
  .wl-val { flex: 1; font-size: 9px; color: var(--cg-text-dim, #505078); }
  .wl-bar-bg { width: 48px; height: 3px; background: var(--cg-bg, #06060b); border-radius: 1px; overflow: hidden; }
  .wl-bar { height: 100%; border-radius: 1px; transition: width 0.3s; }
  .wl-s { font-size: 9px; font-weight: 700; min-width: 28px; text-align: right; }

  /* Actions */
  .w-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .wa {
    padding: 5px 12px;
    border-radius: 3px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid var(--cg-border, #16162a);
    background: var(--cg-surface-2, #0e0e17);
    color: var(--cg-text-dim, #505078);
    transition: all 0.12s;
    letter-spacing: 0.5px;
  }

  .wa:hover { color: var(--cg-text, #c8c8e0); border-color: var(--cg-border-strong, #1e1e38); }
  .wa.agree:hover { color: var(--cg-cyan, #00e5ff); border-color: rgba(0,229,255,0.4); background: rgba(0,229,255,0.04); }
  .wa.disagree:hover { color: var(--cg-red, #ff3860); border-color: rgba(255,56,96,0.4); background: rgba(255,56,96,0.04); }
  .wa.save {
    background: rgba(0,229,255,0.08);
    border-color: rgba(0,229,255,0.2);
    color: var(--cg-cyan, #00e5ff);
  }
  .wa.save:hover {
    background: rgba(0,229,255,0.15);
    border-color: rgba(0,229,255,0.4);
  }

  /* ━━━ Input Area ━━━ */
  .input-area {
    padding: 8px 16px 12px;
    border-top: 1px solid var(--cg-border, #16162a);
  }

  .input-row {
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--cg-surface, #0a0a11);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    padding: 0 4px 0 12px;
    transition: border-color 0.12s;
  }

  .input-row:focus-within {
    border-color: var(--cg-border-strong, #1e1e38);
  }

  .input-prompt {
    color: var(--cg-cyan, #00e5ff);
    font-family: var(--font-mono, monospace);
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .input-row input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--cg-text, #c8c8e0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    outline: none;
    padding: 8px 0;
  }

  .input-row input::placeholder {
    color: var(--cg-text-muted, #383860);
  }

  .input-send {
    width: 28px;
    height: 28px;
    background: var(--cg-cyan, #00e5ff);
    color: var(--cg-bg, #06060b);
    border: none;
    border-radius: 3px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.12s;
  }

  .input-send:disabled { opacity: 0.15; cursor: default; }

  /* ━━━ Right Panel ━━━ */
  .chart-area {
    flex: 1;
    min-height: 240px;
    height: 0; /* flex-basis trick: forces flex item to respect flex: 1 within overflow:hidden parent */
    padding: 2px;
    overflow: hidden;
  }

  .chart-info {
    padding: 8px 12px;
    border-top: 1px solid var(--cg-border, #16162a);
    overflow-y: auto;
    font-family: var(--font-mono, monospace);
  }

  .ci-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    border-bottom: 1px solid var(--cg-border, #16162a);
    font-size: 10px;
  }

  .ci-row:last-child { border-bottom: none; }
  .ci-k { color: var(--cg-text-muted, #383860); font-weight: 600; letter-spacing: 0.5px; }
  .ci-v { color: var(--cg-text, #c8c8e0); font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ━━━ Modal ━━━ */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: var(--cg-surface, #0a0a11);
    border: 1px solid var(--cg-border-strong, #1e1e38);
    border-radius: 6px;
    width: 420px;
    max-width: 90vw;
    font-family: var(--font-mono, monospace);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--cg-border, #16162a);
  }

  .modal-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-dim, #505078);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--cg-text-muted, #383860);
    font-size: 14px;
    cursor: pointer;
    padding: 2px 4px;
  }
  .modal-close:hover { color: var(--cg-text, #c8c8e0); }

  .modal-body {
    padding: 16px;
  }

  .mf {
    margin-bottom: 14px;
  }

  .mf-label {
    display: block;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
    margin-bottom: 6px;
  }

  .mf-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--cg-bg, #06060b);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
    color: var(--cg-text, #c8c8e0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .mf-input:focus { border-color: var(--cg-border-strong, #1e1e38); }

  .mf-dir {
    display: flex;
    gap: 6px;
  }

  .dir-btn {
    flex: 1;
    padding: 8px;
    border: 1px solid var(--cg-border, #16162a);
    background: var(--cg-bg, #06060b);
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .dir-btn.active {
    border-color: var(--cg-cyan, #00e5ff);
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0,229,255,0.04);
  }

  .cond-row {
    padding: 6px 10px;
    background: var(--cg-bg, #06060b);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
    font-size: 10px;
    color: var(--cg-text, #c8c8e0);
    margin-bottom: 4px;
    letter-spacing: 0.3px;
  }

  .cond-row.dim { color: var(--cg-text-muted, #383860); }

  .modal-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--cg-border, #16162a);
  }

  .m-btn {
    padding: 7px 16px;
    background: transparent;
    border: 1px solid var(--cg-border, #16162a);
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: all 0.12s;
  }

  .m-btn:hover { color: var(--cg-text, #c8c8e0); border-color: var(--cg-border-strong, #1e1e38); }

  .m-btn.primary {
    background: rgba(0,229,255,0.1);
    border-color: rgba(0,229,255,0.3);
    color: var(--cg-cyan, #00e5ff);
  }

  .m-btn.primary:hover {
    background: rgba(0,229,255,0.18);
    border-color: rgba(0,229,255,0.5);
  }

  /* ━━━ Scrollbars ━━━ */
  .console-scroll::-webkit-scrollbar,
  .panel-body::-webkit-scrollbar,
  .chart-info::-webkit-scrollbar {
    width: 3px;
  }

  .console-scroll::-webkit-scrollbar-thumb,
  .panel-body::-webkit-scrollbar-thumb,
  .chart-info::-webkit-scrollbar-thumb {
    background: var(--cg-border, #16162a);
    border-radius: 2px;
  }
</style>
