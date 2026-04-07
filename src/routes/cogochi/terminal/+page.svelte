<script lang="ts">
  import { onMount } from 'svelte';
  import DataCard from '../../../components/cogochi/DataCard.svelte';
  import CgChart from '../../../components/cogochi/CgChart.svelte';

  // ─── Types ────────────────────────────────────────────────
  type MessageType =
    | { role: 'user'; text: string }
    | { role: 'douni'; text: string; widgets?: Widget[] }
    | { role: 'douni'; thinking: true };

  type Widget =
    | { type: 'chart'; symbol: string; timeframe: string; chartData?: any[] }
    | { type: 'metrics'; items: MetricItem[] }
    | { type: 'layers'; items: LayerItem[]; alphaScore: number; alphaLabel: string }
    | { type: 'actions'; patternName: string; direction: 'LONG' | 'SHORT'; conditions: string[] };

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

  // ─── State ────────────────────────────────────────────────
  let messages = $state<MessageType[]>([]);
  let inputText = $state('');
  let isThinking = $state(false);
  let chatContainer: HTMLDivElement | undefined = $state();
  let showPatternModal = $state(false);
  let showChart = $state(false);

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

  // Conversation history for LLM context
  let chatHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

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
              if (event.name === 'analyze_market') {
                // Show thinking indicator while analyzing
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
                // Remove thinking bubble
                messages = messages.filter(m => !('thinking' in m));
                // Update state with analysis data
                applyAnalysisResult(event.data, pendingLayers);
                // Reset streaming text for the follow-up LLM response
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
              messages = [...messages, { role: 'douni', text: `❌ ${event.message}` }];
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
      messages = [...messages, { role: 'douni', text: `❌ ${err.message}` }];
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
    currentSnapshot = data;

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

    // Show chart
    showChart = true;
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

  // ─── Layer Name Map ────────────────────────────────────────
  function layerName(id: string): string {
    const map: Record<string, string> = {
      L1: '와이코프', L2: '수급', L3: 'V-Surge', L4: '호가창',
      L5: 'Basis', L6: '대형흐름', L7: 'F&G', L8: '김프',
      L9: '청산', L10: 'MTF', L11: 'CVD', L12: '섹터',
      L13: '돌파', L14: 'BB', L15: 'ATR',
    };
    return map[id] || id;
  }

  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  function scrollToBottom() {
    requestAnimationFrame(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' }));
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }
  function scoreColor(s: number): string {
    if (s <= -15) return '#f43f5e';
    if (s < 0) return '#f97316';
    if (s === 0) return '#475569';
    if (s <= 15) return '#0ea5e9';
    return '#22d3ee';
  }
  function alphaColor(s: number): string {
    if (s >= 20) return '#22d3ee';
    if (s <= -20) return '#f43f5e';
    return '#94a3b8';
  }
</script>

<svelte:head><title>Cogochi Terminal</title></svelte:head>

<div class="terminal-root">
  <!-- Main Chat -->
  <div class="chat-main" class:with-panel={showChart}>
    <div class="chat-scroll" bind:this={chatContainer}>
      <div class="chat-inner">
        {#each messages as msg}
          {#if 'thinking' in msg}
            <div class="msg-row douni">
              <div class="avatar">🐦</div>
              <div class="bubble douni"><div class="dots"><span class="d"></span><span class="d"></span><span class="d"></span></div></div>
            </div>
          {:else if msg.role === 'user'}
            <div class="msg-row user">
              <div class="bubble user">{msg.text}</div>
            </div>
          {:else}
            <div class="msg-row douni">
              <div class="avatar">🐦</div>
              <div class="bubble-group">
                {#if msg.text}
                  <div class="bubble douni">{msg.text}</div>
                {/if}
                {#if msg.widgets}
                  {#each msg.widgets as widget}
                    {#if widget.type === 'chart'}
                      <div class="w-chart" onclick={() => showChart = !showChart}>
                        <div class="wc-head">
                          <span class="wc-sym">{widget.symbol.replace('USDT','')}</span>
                          <span class="wc-tf">{widget.timeframe}</span>
                          {#if currentPrice > 0}
                            <span class="wc-price">${currentPrice.toLocaleString(undefined,{maximumFractionDigits:1})}</span>
                            <span class="wc-chg" class:up={currentChange >= 0} class:dn={currentChange < 0}>{currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%</span>
                          {/if}
                          <span class="wc-expand">📈 {showChart ? '닫기' : '열기'}</span>
                        </div>
                        {#if widget.chartData && widget.chartData.length > 0}
                          {@const cds = widget.chartData}
                          {@const mn = Math.min(...cds.map((c: any) => c.l))}
                          {@const mx = Math.max(...cds.map((c: any) => c.h))}
                          {@const rg = mx - mn || 1}
                          <svg viewBox="0 0 {cds.length * 6} 80" class="wc-mini" preserveAspectRatio="none">
                            {#each cds as c, i}
                              {@const x = i * 6 + 3}
                              {@const up = c.c >= c.o}
                              <line x1={x} y1={76 - ((c.h - mn) / rg) * 72} x2={x} y2={76 - ((c.l - mn) / rg) * 72} stroke={up ? '#22d3ee' : '#f43f5e'} stroke-width="0.8"/>
                              <rect x={x-2} y={76 - ((Math.max(c.o,c.c) - mn) / rg) * 72} width="4" height={Math.max(Math.abs(c.c-c.o) / rg * 72, 0.5)} fill={up ? '#22d3ee' : '#f43f5e'}/>
                            {/each}
                          </svg>
                        {/if}
                      </div>

                    {:else if widget.type === 'metrics'}
                      <div class="w-metrics">
                        {#each widget.items as item}
                          <DataCard title={item.title} value={item.value} subtext={item.subtext} trend={item.trend} chartData={item.chartData} />
                        {/each}
                      </div>

                    {:else if widget.type === 'layers'}
                      <div class="w-layers">
                        <div class="wl-head">Alpha Score: <span class="wl-val" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaScore}</span> <span class="wl-lbl" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaLabel}</span></div>
                        {#each widget.items as layer}
                          <div class="wl-row">
                            <span class="wl-id">{layer.id}</span>
                            <span class="wl-name">{layer.name}</span>
                            <span class="wl-v">{layer.value}</span>
                            <div class="wl-bar-bg"><div class="wl-bar" style="width:{Math.min(Math.abs(layer.score)*2.5,100)}%;background:{scoreColor(layer.score)}"></div></div>
                            <span class="wl-s" style="color:{scoreColor(layer.score)}">{layer.score > 0 ? '+' : ''}{layer.score}</span>
                          </div>
                        {/each}
                      </div>

                    {:else if widget.type === 'actions'}
                      <div class="w-actions">
                        <button class="wa agree">✓ 맞아</button>
                        <button class="wa disagree">✗ 아니야</button>
                        <button class="wa save" onclick={() => showPatternModal = true}>📌 패턴 저장</button>
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

    <div class="input-bar">
      <div class="input-box">
        <input type="text" bind:value={inputText} onkeydown={handleKeydown} placeholder="BTC 어때? / ETH 1D 분석해줘 / 뭐든 물어봐" disabled={isThinking} />
        <button class="send" onclick={handleSend} disabled={isThinking || !inputText.trim()}>↑</button>
      </div>
    </div>
  </div>

  <!-- Side Panel -->
  {#if showChart && currentSnapshot}
    <div class="side-panel">
      <div class="sp-head">
        <span class="sp-sym">{currentSymbol.replace('USDT','')}</span>
        <span class="sp-tf">{currentTf.toUpperCase()}</span>
        <span class="sp-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">{currentSnapshot.alphaScore} {currentSnapshot.alphaLabel}</span>
        <button class="sp-close" onclick={() => showChart = false}>✕</button>
      </div>
      <div class="sp-chart">
        <CgChart data={currentChartData} currentPrice={currentPrice} />
      </div>
      <div class="sp-info">
        <div class="sp-row"><span>와이코프</span><span style="color:{scoreColor(currentSnapshot.l1.score)}">{currentSnapshot.l1.phase}</span></div>
        <div class="sp-row"><span>CVD</span><span style="color:{scoreColor(currentSnapshot.l11.score)}">{currentSnapshot.l11.cvd_state}</span></div>
        <div class="sp-row"><span>MTF</span><span style="color:{scoreColor(currentSnapshot.l10.score)}">{currentSnapshot.l10.mtf_confluence}</span></div>
        <div class="sp-row"><span>Funding</span><span style="color:{currentDeriv?.funding > 0.0005 ? '#f43f5e' : currentDeriv?.funding < -0.0005 ? '#22d3ee' : '#94a3b8'}">{currentDeriv?.funding != null ? (currentDeriv.funding * 100).toFixed(4) + '%' : '—'}</span></div>
        <div class="sp-row"><span>OI</span><span>{currentDeriv?.oi != null ? (currentDeriv.oi >= 1e6 ? (currentDeriv.oi/1e6).toFixed(0)+'M' : (currentDeriv.oi/1e3).toFixed(0)+'K') : '—'}</span></div>
        <div class="sp-row"><span>L/S</span><span style="color:{currentDeriv?.lsRatio > 1.1 ? '#f43f5e' : currentDeriv?.lsRatio < 0.9 ? '#22d3ee' : '#94a3b8'}">{currentDeriv?.lsRatio?.toFixed(2) ?? '—'}</span></div>
        <div class="sp-row"><span>BB</span><span>{currentSnapshot.l14.bb_squeeze ? '🔴 SQUEEZE' : `w:${currentSnapshot.l14.bb_width}`}</span></div>
        <div class="sp-row"><span>ATR</span><span>{currentSnapshot.l15.atr_pct}%</span></div>
        <div class="sp-row"><span>Regime</span><span>{currentSnapshot.regime}</span></div>
      </div>
    </div>
  {/if}
</div>

<!-- Pattern Modal -->
{#if showPatternModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-bg" onclick={() => showPatternModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <h3>📌 패턴 저장</h3>
      <div class="mf"><label>패턴 이름</label><input type="text" value={patternName} /></div>
      <div class="mf">
        <label>방향</label>
        <div class="mdir">
          <button class="md" class:act={patternDirection === 'LONG'} onclick={() => patternDirection = 'LONG'}>LONG ▲</button>
          <button class="md" class:act={patternDirection === 'SHORT'} onclick={() => patternDirection = 'SHORT'}>SHORT ▼</button>
        </div>
      </div>
      <div class="mf">
        <label>조건 ({patternConditions.length}개)</label>
        {#each patternConditions as c}
          <div class="mc">{c}</div>
        {/each}
        {#if patternConditions.length === 0}
          <div class="mc" style="color:#475569">분석 후 조건이 자동 생성됩니다</div>
        {/if}
      </div>
      <div class="mbot">
        <button class="mbtn" onclick={() => showPatternModal = false}>취소</button>
        <button class="mbtn sv" onclick={() => showPatternModal = false}>저장 → Scanner</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .terminal-root { display: flex; height: 100%; background: #08080d; }
  .chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; transition: all 0.3s; }
  .chat-scroll { flex: 1; overflow-y: auto; }
  .chat-inner { max-width: 680px; margin: 0 auto; padding: 24px 20px 120px; display: flex; flex-direction: column; gap: 16px; }
  .msg-row { display: flex; gap: 10px; }
  .msg-row.user { justify-content: flex-end; }
  .msg-row.douni { align-items: flex-start; }
  .avatar { width: 32px; height: 32px; background: #1a1a3e; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; margin-top: 2px; }
  .bubble-group { display: flex; flex-direction: column; gap: 10px; max-width: 580px; min-width: 0; }
  .bubble { padding: 10px 16px; border-radius: 18px; font-size: 14px; line-height: 1.6; white-space: pre-line; }
  .bubble.user { background: #3b82f6; color: white; border-bottom-right-radius: 6px; max-width: 360px; }
  .bubble.douni { background: #14142a; color: #d0d0f0; border-bottom-left-radius: 6px; }
  .dots { display: flex; gap: 5px; padding: 4px 2px; }
  .d { width: 7px; height: 7px; background: #5858a0; border-radius: 50%; animation: bn 1.4s infinite ease-in-out both; }
  .d:nth-child(1) { animation-delay: -0.32s; }
  .d:nth-child(2) { animation-delay: -0.16s; }
  @keyframes bn { 0%,80%,100% { transform: scale(0); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }

  .w-chart { background: #0c0c18; border: 1px solid #1e1e35; border-radius: 14px; overflow: hidden; cursor: pointer; transition: border-color 0.15s; }
  .w-chart:hover { border-color: #3b82f6; }
  .wc-head { padding: 8px 12px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #1a1a2e; }
  .wc-sym { font-weight: 800; font-size: 13px; color: #e0e0ff; }
  .wc-tf { font-size: 10px; color: #5858a0; background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
  .wc-price { color: #e2e8f0; font-weight: 600; font-size: 12px; }
  .wc-chg { font-size: 11px; font-weight: 600; }
  .wc-chg.up { color: #22d3ee; }
  .wc-chg.dn { color: #f43f5e; }
  .wc-expand { margin-left: auto; font-size: 11px; color: #3b82f6; }
  .wc-mini { width: 100%; height: 80px; display: block; padding: 6px 4px; }

  .w-metrics { display: flex; gap: 8px; flex-wrap: wrap; }
  .w-layers { background: #0c0c18; border: 1px solid #1e1e35; border-radius: 14px; padding: 12px; }
  .wl-head { font-size: 12px; color: #7878a0; margin-bottom: 8px; font-weight: 600; }
  .wl-val { font-size: 20px; font-weight: 900; }
  .wl-lbl { font-size: 10px; font-weight: 700; margin-left: 4px; }
  .wl-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #0f0f1a; }
  .wl-row:last-child { border-bottom: none; }
  .wl-id { font-size: 10px; font-weight: 700; color: #5858a0; min-width: 26px; font-family: 'JetBrains Mono', monospace; }
  .wl-name { font-size: 11px; color: #a0a0c0; min-width: 42px; }
  .wl-v { flex: 1; font-size: 10px; color: #7878a0; font-family: 'JetBrains Mono', monospace; }
  .wl-bar-bg { width: 44px; height: 4px; background: #12121e; border-radius: 2px; overflow: hidden; }
  .wl-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .wl-s { font-size: 10px; font-weight: 700; min-width: 28px; text-align: right; font-family: 'JetBrains Mono', monospace; }

  .w-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .wa { padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #2a2a4e; background: #12121e; color: #a0a0c0; transition: all 0.15s; }
  .wa:hover { background: #1a1a3e; color: #e0e0ff; }
  .wa.agree:hover { background: rgba(34,211,238,0.15); border-color: #22d3ee; color: #22d3ee; }
  .wa.disagree:hover { background: rgba(244,63,94,0.15); border-color: #f43f5e; color: #f43f5e; }
  .wa.save { background: linear-gradient(135deg,#3b82f6,#6366f1); border-color: transparent; color: white; }

  .input-bar { padding: 12px 20px 16px; }
  .input-box { max-width: 680px; margin: 0 auto; display: flex; gap: 8px; background: #12121e; border: 1px solid #2a2a4e; border-radius: 14px; padding: 4px 4px 4px 16px; align-items: center; }
  .input-box input { flex: 1; background: transparent; border: none; color: #d0d0f0; font-size: 14px; outline: none; padding: 8px 0; }
  .input-box input::placeholder { color: #3a3a5e; }
  .send { width: 36px; height: 36px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-size: 18px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
  .send:disabled { opacity: 0.3; }

  .side-panel { width: 380px; border-left: 1px solid #1a1a2e; background: #0a0a12; display: flex; flex-direction: column; flex-shrink: 0; animation: slideIn 0.3s ease; }
  @keyframes slideIn { from { width: 0; opacity: 0; } to { width: 380px; opacity: 1; } }
  .sp-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #1a1a2e; }
  .sp-sym { font-weight: 800; font-size: 15px; color: #e0e0ff; }
  .sp-tf { font-size: 11px; color: #5858a0; background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
  .sp-alpha { margin-left: auto; font-size: 12px; font-weight: 800; }
  .sp-close { background: none; border: none; color: #5858a0; font-size: 16px; cursor: pointer; padding: 4px 8px; }
  .sp-close:hover { color: #e0e0ff; }
  .sp-chart { height: 280px; padding: 4px; }
  .sp-info { padding: 12px 16px; flex: 1; overflow-y: auto; }
  .sp-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #12121e; font-size: 13px; color: #a0a0c0; }

  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal-box { background: #12121e; border: 1px solid #2a2a4e; border-radius: 16px; padding: 28px; width: 420px; max-width: 90vw; }
  .modal-box h3 { margin: 0 0 20px; color: #e0e0ff; font-size: 18px; }
  .mf { margin-bottom: 16px; }
  .mf label { display: block; font-size: 12px; color: #7878a0; margin-bottom: 6px; font-weight: 600; }
  .mf input { width: 100%; padding: 10px 14px; background: #0a0a14; border: 1px solid #2a2a4e; border-radius: 8px; color: #d0d0f0; font-size: 14px; outline: none; box-sizing: border-box; }
  .mdir { display: flex; gap: 8px; }
  .md { flex: 1; padding: 10px; border: 1px solid #2a2a4e; background: #0a0a14; color: #7878a0; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .md.act { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }
  .mc { padding: 8px 12px; background: #0a0a14; border: 1px solid #1a1a2e; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #a0a0c0; margin-bottom: 4px; }
  .mbot { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
  .mbtn { padding: 10px 20px; background: transparent; border: 1px solid #2a2a4e; color: #7878a0; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .mbtn.sv { background: linear-gradient(135deg,#3b82f6,#6366f1); border: none; color: white; font-weight: 700; }
  .chat-scroll::-webkit-scrollbar { width: 4px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: #2a2a4e; border-radius: 2px; }
</style>
