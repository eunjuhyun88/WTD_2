<script lang="ts">
  import { onMount } from 'svelte';
  import DataCard from '../../components/cogochi/DataCard.svelte';
  import CgChart from '../../components/cogochi/CgChart.svelte';
  import CgLayerPanel from '../../components/cogochi/CgLayerPanel.svelte';

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
  interface MetricItem { title: string; value: string; subtext: string; trend: 'bull' | 'bear' | 'neutral' | 'danger'; chartData: number[]; }
  interface LayerItem { id: string; name: string; value: string; score: number; }

  // ─── State ────────────────────────────────────────────────
  let messages = $state<MessageType[]>([]);
  let inputText = $state('');
  let isThinking = $state(false);
  let chatContainer: HTMLDivElement | undefined = $state();
  let showPatternModal = $state(false);
  let showSideChart = $state(false);

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

  const coins = ['BTC','ETH','SOL','DOGE','XRP','ADA','AVAX','BNB'];
  const tfs = ['15m','1h','4h','1d'];

  // ─── Init ─────────────────────────────────────────────────
  onMount(() => {
    const h = new Date().getHours();
    const g = h >= 6 && h < 12 ? '좋은 아침! 뭐 볼까?' : h < 18 ? '오후야! BTC 4H 분석해볼까?' : h < 24 ? '오늘 시장 좀 움직였어. 같이 볼까?' : '아직 안 자? 뭐 봐줄까?';
    messages = [{ role: 'douni', text: g }];
  });

  // ─── API ──────────────────────────────────────────────────
  async function analyzeSymbol(sym: string, tf: string) {
    isThinking = true;
    messages = [...messages, { role: 'douni', thinking: true } as MessageType];
    scrollToBottom();
    try {
      const res = await fetch(`/api/cogochi/analyze?symbol=${sym}&tf=${tf}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const s = data.snapshot;
      currentSymbol = sym; currentTf = tf; currentSnapshot = s;
      currentChartData = data.chart || []; currentPrice = data.price || 0;
      currentChange = data.change24h || 0; currentDeriv = data.derivatives || {};
      messages = messages.filter(m => !('thinking' in m));

      // 1) Chart widget
      messages = [...messages, { role: 'douni', text: `${sym.replace('USDT','')} ${tf.toUpperCase()} 봤어.`, widgets: [{ type: 'chart', symbol: sym, timeframe: tf.toUpperCase(), chartData: data.chart }] }];
      scrollToBottom();

      // 2) Metrics
      await delay(300);
      const fr = currentDeriv?.funding, oi = currentDeriv?.oi, ls = currentDeriv?.lsRatio, fg = currentDeriv?.fearGreed;
      const metrics: MetricItem[] = [];
      if (fr != null) metrics.push({ title: 'Funding', value: `${(fr*100).toFixed(4)}%`, subtext: Math.abs(fr) > 0.0005 ? (fr > 0 ? '롱 과열' : '숏 과열') : '보통', trend: Math.abs(fr) > 0.0005 ? 'danger' : 'neutral', chartData: [0.01,0.02,0.03,0.02,0.03,0.04,0.03,Math.abs(fr)*100] });
      if (oi != null) metrics.push({ title: 'OI', value: oi >= 1e6 ? `${(oi/1e6).toFixed(0)}M` : `${(oi/1e3).toFixed(0)}K`, subtext: '미결제약정', trend: 'neutral', chartData: [80,85,82,88,90,87,92,95] });
      if (ls != null) metrics.push({ title: 'L/S', value: ls.toFixed(2), subtext: ls > 1.1 ? '롱 과밀' : ls < 0.9 ? '숏 과밀' : '균형', trend: ls > 1.1 ? 'bear' : ls < 0.9 ? 'bull' : 'neutral', chartData: [1.0,1.05,1.1,1.08,1.12,1.15,1.1,ls] });
      if (fg != null) metrics.push({ title: 'F&G', value: `${fg}`, subtext: fg < 25 ? 'Extreme Fear' : fg < 40 ? 'Fear' : fg > 75 ? 'Extreme Greed' : 'Neutral', trend: fg < 30 ? 'bear' : fg > 70 ? 'danger' : 'neutral', chartData: [40,35,30,25,20,18,15,fg] });
      if (metrics.length) { messages = [...messages, { role: 'douni', text: '', widgets: [{ type: 'metrics', items: metrics }] }]; scrollToBottom(); }

      // 3) Top layers
      await delay(300);
      const topLayers = [
        { id: 'L1', name: '와이코프', value: s.l1.phase, score: s.l1.score },
        { id: 'L2', name: '수급', value: `FR ${fr != null ? (fr*100).toFixed(3)+'%' : '—'}`, score: s.l2.score },
        { id: 'L10', name: 'MTF', value: s.l10.mtf_confluence, score: s.l10.score },
        { id: 'L11', name: 'CVD', value: s.l11.cvd_state, score: s.l11.score },
        { id: 'L7', name: 'F&G', value: `${fg ?? '—'}`, score: s.l7.score },
      ].filter(l => l.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5);
      messages = [...messages, { role: 'douni', text: '', widgets: [{ type: 'layers', items: topLayers, alphaScore: s.alphaScore, alphaLabel: s.alphaLabel }] }];
      scrollToBottom();

      // 4) Analysis + actions
      await delay(400);
      const dir = s.alphaScore > 20 ? '불리시' : s.alphaScore < -20 ? '베어리시' : '중립';
      const conds: string[] = [];
      if (Math.abs(s.l11.score) >= 5) conds.push(`l11.cvd_state = ${s.l11.cvd_state}`);
      if (Math.abs(s.l1.score) >= 10) conds.push(`l1.phase = ${s.l1.phase}`);
      if (Math.abs(s.l10.score) >= 10) conds.push(`l10.mtf = ${s.l10.mtf_confluence}`);
      if (fr != null && Math.abs(fr) > 0.0003) conds.push(`l2.fr ${fr > 0 ? '>' : '<'} ${Math.abs(fr).toFixed(4)}`);
      patternConditions = conds; patternDirection = s.alphaScore >= 0 ? 'LONG' : 'SHORT';
      patternName = topLayers.slice(0,2).map(l => l.value).join('+');
      messages = [...messages, { role: 'douni', text: `Alpha ${s.alphaScore} — ${dir}.\n와이코프: ${s.l1.phase}\nMTF: ${s.l10.mtf_confluence}${s.l11.cvd_state !== 'NEUTRAL' ? '\nCVD: ' + s.l11.cvd_state : ''}`, widgets: conds.length ? [{ type: 'actions', patternName, direction: patternDirection, conditions: conds }] : undefined }];
      showSideChart = true; isThinking = false; scrollToBottom();
    } catch (err: any) {
      messages = messages.filter(m => !('thinking' in m));
      messages = [...messages, { role: 'douni', text: `❌ ${err.message}` }];
      isThinking = false; scrollToBottom();
    }
  }

  function handleSend() {
    const text = inputText.trim(); if (!text || isThinking) return;
    messages = [...messages, { role: 'user', text }]; inputText = '';
    const m = text.match(/\b(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|DOT|LINK|BNB|OP|ARB|PEPE|WIF)\b.*?\b(1m|5m|15m|1h|4h|1d|1w)\b/i);
    if (m) { analyzeSymbol(m[1].toUpperCase() + 'USDT', m[2].toLowerCase()); }
    else if (text.includes('패턴') && text.includes('저장')) { showPatternModal = true; }
    else { messages = [...messages, { role: 'douni', text: '종목+타임프레임으로 알려줘! 예: BTC 4H' }]; scrollToBottom(); }
  }

  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  function scrollToBottom() { requestAnimationFrame(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' })); }
  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }
  function scoreColor(s: number) { return s <= -15 ? '#f43f5e' : s < 0 ? '#f97316' : s === 0 ? '#475569' : s <= 15 ? '#0ea5e9' : '#22d3ee'; }
  function alphaColor(s: number) { return s >= 20 ? '#22d3ee' : s <= -20 ? '#f43f5e' : '#94a3b8'; }
</script>

<svelte:head><title>Cogochi Terminal</title></svelte:head>

<div class="root">
  <!-- ═══ LEFT: Layer Panel ═══ -->
  <aside class="col-left">
    <CgLayerPanel snapshot={currentSnapshot} />
    {#if currentDeriv}
      <div class="deriv-box">
        <div class="db-title">DERIVATIVES</div>
        <div class="db-grid">
          <div class="db-cell"><span class="db-k">Funding</span><span class="db-v" class:danger={currentDeriv.funding && Math.abs(currentDeriv.funding) > 0.0005}>{currentDeriv.funding != null ? (currentDeriv.funding * 100).toFixed(4) + '%' : '—'}</span></div>
          <div class="db-cell"><span class="db-k">OI</span><span class="db-v">{currentDeriv.oi != null ? (currentDeriv.oi >= 1e6 ? (currentDeriv.oi/1e6).toFixed(0)+'M' : (currentDeriv.oi/1e3).toFixed(0)+'K') : '—'}</span></div>
          <div class="db-cell"><span class="db-k">L/S</span><span class="db-v" class:danger={currentDeriv.lsRatio > 1.15}>{currentDeriv.lsRatio?.toFixed(2) ?? '—'}</span></div>
          <div class="db-cell"><span class="db-k">F&G</span><span class="db-v">{currentDeriv.fearGreed ?? '—'}</span></div>
        </div>
      </div>
    {/if}
    <div class="qs-box">
      <div class="db-title">QUICK SCAN</div>
      <div class="qs-row">{#each coins as c}<button class="qs-btn" class:active={currentSymbol === c+'USDT'} onclick={() => analyzeSymbol(c+'USDT', currentTf || '4h')}>{c}</button>{/each}</div>
      <div class="qs-row">{#each tfs as t}<button class="qs-btn" class:active={currentTf === t} onclick={() => analyzeSymbol(currentSymbol || 'BTCUSDT', t)}>{t.toUpperCase()}</button>{/each}</div>
    </div>
  </aside>

  <!-- ═══ CENTER: Chat ═══ -->
  <main class="col-center">
    <div class="chat-scroll" bind:this={chatContainer}>
      <div class="chat-inner">
        {#each messages as msg}
          {#if 'thinking' in msg}
            <div class="msg-row douni"><div class="avatar">🐦</div><div class="bubble douni"><div class="dots"><span class="d"></span><span class="d"></span><span class="d"></span></div></div></div>
          {:else if msg.role === 'user'}
            <div class="msg-row user"><div class="bubble user">{msg.text}</div></div>
          {:else}
            <div class="msg-row douni">
              <div class="avatar">🐦</div>
              <div class="bubble-group">
                {#if msg.text}<div class="bubble douni">{msg.text}</div>{/if}
                {#if msg.widgets}
                  {#each msg.widgets as widget}
                    {#if widget.type === 'chart'}
                      <div class="w-chart" onclick={() => showSideChart = !showSideChart}>
                        <div class="wc-head">
                          <span class="wc-sym">{widget.symbol.replace('USDT','')}</span>
                          <span class="wc-tf">{widget.timeframe}</span>
                          {#if currentPrice > 0}<span class="wc-price">${currentPrice.toLocaleString(undefined,{maximumFractionDigits:1})}</span><span class="wc-chg" class:up={currentChange>=0} class:dn={currentChange<0}>{currentChange>=0?'+':''}{currentChange.toFixed(2)}%</span>{/if}
                          <span class="wc-expand">📈 {showSideChart ? '닫기' : '열기'}</span>
                        </div>
                        {#if widget.chartData?.length}
                          {@const cds = widget.chartData}
                          {@const mn = Math.min(...cds.map((c: any) => c.l))}
                          {@const mx = Math.max(...cds.map((c: any) => c.h))}
                          {@const rg = mx - mn || 1}
                          <svg viewBox="0 0 {cds.length * 6} 80" class="wc-mini" preserveAspectRatio="none">
                            {#each cds as c, i}{@const x = i*6+3}{@const up = c.c >= c.o}
                              <line x1={x} y1={76-((c.h-mn)/rg)*72} x2={x} y2={76-((c.l-mn)/rg)*72} stroke={up?'#22d3ee':'#f43f5e'} stroke-width="0.8"/>
                              <rect x={x-2} y={76-((Math.max(c.o,c.c)-mn)/rg)*72} width="4" height={Math.max(Math.abs(c.c-c.o)/rg*72,0.5)} fill={up?'#22d3ee':'#f43f5e'}/>
                            {/each}
                          </svg>
                        {/if}
                      </div>
                    {:else if widget.type === 'metrics'}
                      <div class="w-metrics">{#each widget.items as item}<DataCard title={item.title} value={item.value} subtext={item.subtext} trend={item.trend} chartData={item.chartData} />{/each}</div>
                    {:else if widget.type === 'layers'}
                      <div class="w-layers">
                        <div class="wl-head">Alpha: <span class="wl-val" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaScore}</span> <span class="wl-lbl" style="color:{alphaColor(widget.alphaScore)}">{widget.alphaLabel}</span></div>
                        {#each widget.items as layer}
                          <div class="wl-row"><span class="wl-id">{layer.id}</span><span class="wl-name">{layer.name}</span><span class="wl-v">{layer.value}</span><div class="wl-bar-bg"><div class="wl-bar" style="width:{Math.min(Math.abs(layer.score)*2.5,100)}%;background:{scoreColor(layer.score)}"></div></div><span class="wl-s" style="color:{scoreColor(layer.score)}">{layer.score>0?'+':''}{layer.score}</span></div>
                        {/each}
                      </div>
                    {:else if widget.type === 'actions'}
                      <div class="w-actions"><button class="wa agree">✓ 맞아</button><button class="wa disagree">✗ 아니야</button><button class="wa save" onclick={() => showPatternModal = true}>📌 패턴 저장</button></div>
                    {/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <div class="input-bar"><div class="input-box"><input type="text" bind:value={inputText} onkeydown={handleKeydown} placeholder="BTC 4H 분석해줘..." disabled={isThinking} /><button class="send" onclick={handleSend} disabled={isThinking || !inputText.trim()}>↑</button></div></div>
  </main>

  <!-- ═══ RIGHT: Side Chart Panel (slides in) ═══ -->
  {#if showSideChart && currentSnapshot}
    <aside class="col-right">
      <div class="sp-head">
        <span class="sp-sym">{currentSymbol.replace('USDT','')}</span>
        <span class="sp-tf">{currentTf.toUpperCase()}</span>
        <span class="sp-alpha" style="color:{alphaColor(currentSnapshot.alphaScore)}">{currentSnapshot.alphaScore} {currentSnapshot.alphaLabel}</span>
        <button class="sp-close" onclick={() => showSideChart = false}>✕</button>
      </div>
      <div class="sp-chart"><CgChart data={currentChartData} currentPrice={currentPrice} /></div>
      <div class="sp-info">
        <div class="sp-row"><span>와이코프</span><span style="color:{scoreColor(currentSnapshot.l1.score)}">{currentSnapshot.l1.phase}</span></div>
        <div class="sp-row"><span>CVD</span><span style="color:{scoreColor(currentSnapshot.l11.score)}">{currentSnapshot.l11.cvd_state}</span></div>
        <div class="sp-row"><span>MTF</span><span style="color:{scoreColor(currentSnapshot.l10.score)}">{currentSnapshot.l10.mtf_confluence}</span></div>
        <div class="sp-row"><span>BB</span><span>{currentSnapshot.l14.bb_squeeze ? '🔴 SQZ' : `w:${currentSnapshot.l14.bb_width}`}</span></div>
        <div class="sp-row"><span>ATR</span><span>{currentSnapshot.l15.atr_pct}%</span></div>
        <div class="sp-row"><span>Regime</span><span>{currentSnapshot.regime}</span></div>
      </div>
    </aside>
  {/if}
</div>

{#if showPatternModal}
  <!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-bg" onclick={() => showPatternModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <h3>📌 패턴 저장</h3>
      <div class="mf"><label>패턴 이름</label><input type="text" value={patternName} /></div>
      <div class="mf"><label>방향</label><div class="mdir"><button class="md" class:act={patternDirection==='LONG'} onclick={() => patternDirection='LONG'}>LONG ▲</button><button class="md" class:act={patternDirection==='SHORT'} onclick={() => patternDirection='SHORT'}>SHORT ▼</button></div></div>
      <div class="mf"><label>조건 ({patternConditions.length}개)</label>{#each patternConditions as c}<div class="mc">{c}</div>{/each}{#if !patternConditions.length}<div class="mc dim">분석 후 조건이 자동 생성됩니다</div>{/if}</div>
      <div class="mbot"><button class="mbtn" onclick={() => showPatternModal = false}>취소</button><button class="mbtn sv" onclick={() => showPatternModal = false}>저장 → Scanner</button></div>
    </div>
  </div>
{/if}

<style>
  /* ═══ ROOT 3-COL ═══ */
  .root { display: flex; height: 100%; background: #08080d; }

  /* ═══ LEFT PANEL ═══ */
  .col-left { width: 280px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid #1a1a2e; background: #0a0a12; display: flex; flex-direction: column; }
  .deriv-box, .qs-box { border-top: 1px solid #1a1a2e; }
  .db-title { padding: 8px 12px 4px; color: #3a3a5e; font-size: 10px; letter-spacing: 1px; font-weight: 700; }
  .db-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .db-cell { padding: 6px 12px; }
  .db-k { display: block; color: #3a3a5e; font-size: 9px; text-transform: uppercase; }
  .db-v { font-size: 14px; font-weight: 700; color: #a0a0c0; }
  .db-v.danger { color: #f43f5e; }
  .qs-row { display: flex; flex-wrap: wrap; gap: 3px; padding: 4px 12px; }
  .qs-btn { padding: 4px 10px; background: #12121e; border: 1px solid #2a2a4e; color: #5858a0; cursor: pointer; font-size: 10px; border-radius: 4px; font-family: inherit; }
  .qs-btn.active { color: #22d3ee; border-color: #22d3ee40; background: #22d3ee08; }
  .qs-btn:hover { color: #a0a0c0; }

  /* ═══ CENTER CHAT ═══ */
  .col-center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .chat-scroll { flex: 1; overflow-y: auto; }
  .chat-inner { max-width: 640px; margin: 0 auto; padding: 20px 16px 100px; display: flex; flex-direction: column; gap: 14px; }
  .msg-row { display: flex; gap: 10px; } .msg-row.user { justify-content: flex-end; } .msg-row.douni { align-items: flex-start; }
  .avatar { width: 30px; height: 30px; background: #1a1a3e; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; margin-top: 2px; }
  .bubble-group { display: flex; flex-direction: column; gap: 10px; max-width: 520px; min-width: 0; }
  .bubble { padding: 10px 16px; border-radius: 18px; font-size: 14px; line-height: 1.6; white-space: pre-line; }
  .bubble.user { background: #3b82f6; color: white; border-bottom-right-radius: 6px; max-width: 320px; }
  .bubble.douni { background: #14142a; color: #d0d0f0; border-bottom-left-radius: 6px; }
  .dots { display: flex; gap: 5px; padding: 4px 2px; }
  .d { width: 7px; height: 7px; background: #5858a0; border-radius: 50%; animation: bn 1.4s infinite ease-in-out both; }
  .d:nth-child(1) { animation-delay: -0.32s; } .d:nth-child(2) { animation-delay: -0.16s; }
  @keyframes bn { 0%,80%,100% { transform: scale(0); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }

  /* Widgets */
  .w-chart { background: #0c0c18; border: 1px solid #1e1e35; border-radius: 14px; overflow: hidden; cursor: pointer; transition: border-color .15s; }
  .w-chart:hover { border-color: #3b82f6; }
  .wc-head { padding: 8px 12px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #1a1a2e; font-size: 12px; }
  .wc-sym { font-weight: 800; color: #e0e0ff; } .wc-tf { font-size: 10px; color: #5858a0; background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
  .wc-price { color: #e2e8f0; font-weight: 600; } .wc-chg { font-weight: 600; } .wc-chg.up { color: #22d3ee; } .wc-chg.dn { color: #f43f5e; }
  .wc-expand { margin-left: auto; font-size: 11px; color: #3b82f6; } .wc-mini { width: 100%; height: 80px; display: block; padding: 6px 4px; }
  .w-metrics { display: flex; gap: 8px; flex-wrap: wrap; }
  .w-layers { background: #0c0c18; border: 1px solid #1e1e35; border-radius: 14px; padding: 12px; }
  .wl-head { font-size: 12px; color: #7878a0; margin-bottom: 8px; font-weight: 600; }
  .wl-val { font-size: 20px; font-weight: 900; } .wl-lbl { font-size: 10px; font-weight: 700; margin-left: 4px; }
  .wl-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #0f0f1a; }
  .wl-row:last-child { border-bottom: none; }
  .wl-id { font-size: 10px; font-weight: 700; color: #5858a0; min-width: 26px; font-family: monospace; }
  .wl-name { font-size: 11px; color: #a0a0c0; min-width: 42px; }
  .wl-v { flex: 1; font-size: 10px; color: #7878a0; font-family: monospace; }
  .wl-bar-bg { width: 44px; height: 4px; background: #12121e; border-radius: 2px; overflow: hidden; }
  .wl-bar { height: 100%; border-radius: 2px; transition: width .3s; }
  .wl-s { font-size: 10px; font-weight: 700; min-width: 28px; text-align: right; font-family: monospace; }
  .w-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .wa { padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #2a2a4e; background: #12121e; color: #a0a0c0; transition: all .15s; }
  .wa:hover { background: #1a1a3e; color: #e0e0ff; }
  .wa.agree:hover { background: rgba(34,211,238,.15); border-color: #22d3ee; color: #22d3ee; }
  .wa.disagree:hover { background: rgba(244,63,94,.15); border-color: #f43f5e; color: #f43f5e; }
  .wa.save { background: linear-gradient(135deg,#3b82f6,#6366f1); border-color: transparent; color: white; }
  .input-bar { padding: 10px 16px 14px; }
  .input-box { max-width: 640px; margin: 0 auto; display: flex; gap: 8px; background: #12121e; border: 1px solid #2a2a4e; border-radius: 14px; padding: 4px 4px 4px 16px; align-items: center; }
  .input-box input { flex: 1; background: transparent; border: none; color: #d0d0f0; font-size: 14px; outline: none; padding: 8px 0; }
  .input-box input::placeholder { color: #3a3a5e; }
  .send { width: 36px; height: 36px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-size: 18px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
  .send:disabled { opacity: .3; }

  /* ═══ RIGHT: Side Chart ═══ */
  .col-right { width: 360px; flex-shrink: 0; border-left: 1px solid #1a1a2e; background: #0a0a12; display: flex; flex-direction: column; animation: slideIn .3s ease; }
  @keyframes slideIn { from { width: 0; opacity: 0; } to { width: 360px; opacity: 1; } }
  .sp-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #1a1a2e; }
  .sp-sym { font-weight: 800; font-size: 15px; color: #e0e0ff; }
  .sp-tf { font-size: 11px; color: #5858a0; background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
  .sp-alpha { margin-left: auto; font-size: 12px; font-weight: 800; }
  .sp-close { background: none; border: none; color: #5858a0; font-size: 16px; cursor: pointer; padding: 4px 8px; }
  .sp-close:hover { color: #e0e0ff; }
  .sp-chart { height: 280px; padding: 4px; }
  .sp-info { padding: 12px 16px; flex: 1; overflow-y: auto; }
  .sp-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #12121e; font-size: 13px; color: #a0a0c0; }

  /* ═══ Modal ═══ */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal-box { background: #12121e; border: 1px solid #2a2a4e; border-radius: 16px; padding: 28px; width: 420px; max-width: 90vw; }
  .modal-box h3 { margin: 0 0 20px; color: #e0e0ff; font-size: 18px; }
  .mf { margin-bottom: 16px; } .mf label { display: block; font-size: 12px; color: #7878a0; margin-bottom: 6px; font-weight: 600; }
  .mf input { width: 100%; padding: 10px 14px; background: #0a0a14; border: 1px solid #2a2a4e; border-radius: 8px; color: #d0d0f0; font-size: 14px; outline: none; box-sizing: border-box; }
  .mdir { display: flex; gap: 8px; }
  .md { flex: 1; padding: 10px; border: 1px solid #2a2a4e; background: #0a0a14; color: #7878a0; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .md.act { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,.1); }
  .mc { padding: 8px 12px; background: #0a0a14; border: 1px solid #1a1a2e; border-radius: 6px; font-family: monospace; font-size: 12px; color: #a0a0c0; margin-bottom: 4px; }
  .dim { color: #475569; }
  .mbot { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
  .mbtn { padding: 10px 20px; background: transparent; border: 1px solid #2a2a4e; color: #7878a0; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .mbtn.sv { background: linear-gradient(135deg,#3b82f6,#6366f1); border: none; color: white; font-weight: 700; }
  .chat-scroll::-webkit-scrollbar, .col-left::-webkit-scrollbar { width: 4px; }
  .chat-scroll::-webkit-scrollbar-thumb, .col-left::-webkit-scrollbar-thumb { background: #2a2a4e; border-radius: 2px; }
</style>
