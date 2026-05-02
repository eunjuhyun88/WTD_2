<script lang="ts">
  /**
   * AIPanel — right column AI assist surface.
   *
   * Replaces the old chat-bubble UX with structured cards driven by
   * client-side intent classification:
   *
   *   ANALYZE   → /api/cogochi/analyze         → analyze card (+ chart overlay)
   *   SCAN      → /api/terminal/scan           → scan card (clickable rows)
   *   JUDGE     → /api/captures (POST)         → saved card
   *   INDICATOR → indicator search             → focus_indicator dispatch
   *
   * The legacy `messages` / `onSend` / `onApplySetup` props are still accepted
   * for backward compatibility with the parent shell, but the panel no longer
   * renders a chat thread.
   */
  import { findIndicatorByQuery } from '$lib/indicators/search';
  import { setAIOverlay, type AIPriceLine } from '$lib/stores/chartAIOverlay';

  interface SetupToken {
    kind: 'asset' | 'trigger' | 'filter';
    label: string;
  }

  interface SetupResult {
    tokens: SetupToken[];
    matches: number;
    past: number;
    text: string;
  }

  interface Message {
    role: 'user' | 'assistant';
    text: string;
    setup?: SetupResult;
  }

  type AICard =
    | {
        type: 'analyze';
        symbol: string;
        tf: string;
        direction: string;
        pWin: number | null;
        evidence: string[];
        entry: number | null;
        stop: number | null;
        ts: number;
      }
    | {
        type: 'scan';
        candidates: Array<{ symbol: string; signal: string; conf: number | null }>;
        ts: number;
      }
    | { type: 'saved'; symbol: string; verdict: string; ts: number }
    | { type: 'info'; text: string; ts: number };

  interface Props {
    messages?: Message[];
    onSend?: (text: string, newMessages: Message[]) => void;
    onApplySetup?: (setup: SetupResult) => void;
    onClose?: () => void;
    symbol?: string;
    timeframe?: string;
    onSelectSymbol?: (symbol: string) => void;
  }

  // `messages` and `onApplySetup` accepted for backward compatibility but unused —
  // the panel now renders structured cards instead of a chat thread.
  let {
    messages: _messages = [],
    onSend,
    onApplySetup: _onApplySetup,
    onClose,
    symbol = 'BTCUSDT',
    timeframe = '4h',
    onSelectSymbol,
  }: Props = $props();

  import { shellStore } from '$lib/cogochi/shell.store';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { onDestroy } from 'svelte';

  let cards = $state<AICard[]>([]);
  let inputValue = $state('');
  let loading = $state(false);
  let scrollEl: HTMLDivElement | undefined = $state();
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  const canSend = $derived(inputValue.trim().length > 0 && !loading);

  function selectSymbol(sym: string): void {
    shellStore.setSymbol(sym);
    onSelectSymbol?.(sym);
  }

  const quicks: readonly string[] = [
    'BTC 분석',
    'OI 급증 스캔',
    'ETH long 판정',
    'VWAP reclaim 스캔',
  ];

  // ── Intent classifier ────────────────────────────────────────────────────
  function classifyIntent(text: string): 'ANALYZE' | 'SCAN' | 'JUDGE' | 'INDICATOR' {
    const t = text.toLowerCase();
    if (/스캔|scan|찾아|screener/.test(t)) return 'SCAN';
    if (/판정|long|short|롱|숏|매수|매도|judge/.test(t)) return 'JUDGE';
    if (/분석|analyze|어때|봐줘|show me|what/.test(t)) return 'ANALYZE';
    return 'INDICATOR';
  }

  function extractSymbol(text: string, fallback: string): string {
    const m =
      text.match(/([A-Z]{2,10})\s*(분석|analyze|long|short|롱|숏|판정)/i) ??
      text.match(/(BTC|ETH|SOL|BNB|XRP|AVAX|DOGE)/i);
    if (!m) return fallback;
    const base = m[1].toUpperCase();
    return base.endsWith('USDT') ? base : `${base}USDT`;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleAnalyze(text: string): Promise<void> {
    const targetSymbol = extractSymbol(text, symbol);
    loading = true;
    try {
      const r = await fetch(`/api/cogochi/analyze?symbol=${targetSymbol}&tf=${timeframe}`);
      if (!r.ok) {
        cards = [{ type: 'info', text: `analyze 실패 (${r.status})`, ts: Date.now() }, ...cards];
        return;
      }
      const d = (await r.json()) as Record<string, any>;
      const analyze = (d.analyze ?? d) as Record<string, any>;
      const card: AICard = {
        type: 'analyze',
        symbol: targetSymbol,
        tf: timeframe,
        direction: String(analyze.direction ?? analyze.bias ?? '—'),
        pWin: typeof analyze.p_win === 'number'
          ? analyze.p_win
          : typeof analyze.confidence === 'number'
            ? analyze.confidence
            : null,
        evidence: Array.isArray(analyze.evidence) ? analyze.evidence.map(String) : [],
        entry:
          analyze.entryPlan && typeof analyze.entryPlan.entry === 'number'
            ? analyze.entryPlan.entry
            : null,
        stop:
          analyze.entryPlan && typeof analyze.entryPlan.stop === 'number'
            ? analyze.entryPlan.stop
            : null,
        ts: Date.now(),
      };
      cards = [card, ...cards];

      if (card.entry != null || card.stop != null) {
        const lines: AIPriceLine[] = [];
        if (card.entry != null) {
          lines.push({ price: card.entry, color: '#22AB94', label: 'Entry', style: 'solid' });
        }
        if (card.stop != null) {
          lines.push({ price: card.stop, color: '#F23645', label: 'Stop', style: 'dashed' });
        }
        setAIOverlay(targetSymbol, lines);
      }
    } catch (err) {
      cards = [
        { type: 'info', text: `analyze 오류: ${(err as Error).message ?? 'unknown'}`, ts: Date.now() },
        ...cards,
      ];
    } finally {
      loading = false;
    }
  }

  async function handleScan(_text: string): Promise<void> {
    loading = true;
    try {
      const r = await fetch('/api/terminal/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe }),
      });
      if (!r.ok) {
        cards = [{ type: 'info', text: `scan 실패 (${r.status})`, ts: Date.now() }, ...cards];
        return;
      }
      const d = (await r.json()) as Record<string, any>;
      const raw: any[] = (d.candidates ?? d.highlights ?? []) as any[];
      const candidates = raw.slice(0, 8).map((c) => ({
        symbol: String(c.symbol ?? c.pair ?? '—'),
        signal: String(c.signal ?? c.label ?? '—'),
        conf:
          typeof c.confidence === 'number'
            ? c.confidence
            : typeof c.conf === 'number'
              ? c.conf
              : null,
      }));
      cards = [{ type: 'scan', candidates, ts: Date.now() }, ...cards];
    } catch (err) {
      cards = [
        { type: 'info', text: `scan 오류: ${(err as Error).message ?? 'unknown'}`, ts: Date.now() },
        ...cards,
      ];
    } finally {
      loading = false;
    }
  }

  async function handleJudge(text: string): Promise<void> {
    const targetSymbol = extractSymbol(text, symbol);
    const isLong = /long|롱|매수/.test(text.toLowerCase());
    const verdict = isLong ? 'long' : 'short';
    loading = true;
    try {
      const r = await fetch('/api/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: targetSymbol,
          timeframe,
          verdict,
          source: 'ai_panel',
        }),
      });
      if (r.ok) {
        cards = [{ type: 'saved', symbol: targetSymbol, verdict, ts: Date.now() }, ...cards];
      } else {
        cards = [{ type: 'info', text: `저장 실패 (${r.status})`, ts: Date.now() }, ...cards];
      }
    } catch (err) {
      cards = [
        { type: 'info', text: `judge 오류: ${(err as Error).message ?? 'unknown'}`, ts: Date.now() },
        ...cards,
      ];
    } finally {
      loading = false;
    }
  }

  function handleIndicator(text: string): void {
    const indicatorDef = findIndicatorByQuery(text);
    if (!indicatorDef) {
      cards = [
        { type: 'info', text: `해석할 수 없는 명령입니다: "${text}"`, ts: Date.now() },
        ...cards,
      ];
      return;
    }
    window.dispatchEvent(
      new CustomEvent('cogochi:cmd', {
        detail: { id: 'focus_indicator', indicatorId: indicatorDef.id, def: indicatorDef },
      }),
    );
    cards = [
      {
        type: 'info',
        text: `${indicatorDef.label ?? indicatorDef.id} 지표로 이동했습니다.`,
        ts: Date.now(),
      },
      ...cards,
    ];
  }

  async function send(): Promise<void> {
    const t = inputValue.trim();
    if (!t || loading) return;
    inputValue = '';
    const intent = classifyIntent(t);

    // Notify parent for backward compat (chat persistence in tabState).
    onSend?.(t, [{ role: 'user', text: t }]);

    if (intent === 'ANALYZE') await handleAnalyze(t);
    else if (intent === 'SCAN') await handleScan(t);
    else if (intent === 'JUDGE') await handleJudge(t);
    else handleIndicator(t);
  }

  function quickPick(q: string): void {
    inputValue = q;
    void send();
  }

  function handleInput(event: Event): void {
    inputValue = (event.currentTarget as HTMLTextAreaElement).value;
  }

  $effect(() => {
    cards; // track changes
    if (scrollEl) scrollEl.scrollTop = 0;
  });

  // ── B,B range auto-analyze ────────────────────────────────────────────────
  async function handleAnalyzeRange(from: number, to: number): Promise<void> {
    loading = true;
    const fromDate = new Date(from * 1000).toISOString().slice(0, 10);
    const toDate = new Date(to * 1000).toISOString().slice(0, 10);
    try {
      const r = await fetch(
        `/api/cogochi/analyze?symbol=${symbol}&tf=${timeframe}&from=${from}&to=${to}`,
      );
      if (!r.ok) {
        cards = [{ type: 'info', text: `구간 analyze 실패 (${r.status})`, ts: Date.now() }, ...cards];
        return;
      }
      const d = (await r.json()) as Record<string, any>;
      const analyze = (d.analyze ?? d) as Record<string, any>;
      const card: AICard = {
        type: 'analyze',
        symbol,
        tf: `${timeframe} · ${fromDate}~${toDate}`,
        direction: String(analyze.direction ?? analyze.bias ?? '—'),
        pWin: typeof analyze.p_win === 'number'
          ? analyze.p_win
          : typeof analyze.confidence === 'number'
            ? analyze.confidence
            : null,
        evidence: Array.isArray(analyze.evidence) ? analyze.evidence.map(String) : [],
        entry:
          analyze.entryPlan && typeof analyze.entryPlan.entry === 'number'
            ? analyze.entryPlan.entry
            : null,
        stop:
          analyze.entryPlan && typeof analyze.entryPlan.stop === 'number'
            ? analyze.entryPlan.stop
            : null,
        ts: Date.now(),
      };
      cards = [card, ...cards];
      if (card.entry != null || card.stop != null) {
        const lines: AIPriceLine[] = [];
        if (card.entry != null) {
          lines.push({ price: card.entry, color: '#22AB94', label: 'Entry', style: 'solid' });
        }
        if (card.stop != null) {
          lines.push({ price: card.stop, color: '#F23645', label: 'Stop', style: 'dashed' });
        }
        setAIOverlay(symbol, lines);
      }
    } catch (err) {
      cards = [
        { type: 'info', text: `구간 analyze 오류: ${(err as Error).message ?? 'unknown'}`, ts: Date.now() },
        ...cards,
      ];
    } finally {
      loading = false;
    }
  }

  let _rangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const anchorA = $chartSaveMode.anchorA;
    const anchorB = $chartSaveMode.anchorB;
    if (anchorA == null || anchorB == null) return;
    const from = Math.min(anchorA, anchorB);
    const to = Math.max(anchorA, anchorB);
    if (_rangeDebounceTimer != null) clearTimeout(_rangeDebounceTimer);
    _rangeDebounceTimer = setTimeout(() => {
      _rangeDebounceTimer = null;
      void handleAnalyzeRange(from, to);
    }, 300);
  });

  // ── `/` shortcut — focus AI input ────────────────────────────────────────
  const onFocusCmd = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.id === 'focus_ai_input') {
      textareaEl?.focus();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('cogochi:cmd', onFocusCmd);
  }
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('cogochi:cmd', onFocusCmd);
    }
  });
</script>

<div class="panel">
  <div class="hdr">
    <span class="ai-dot"></span>
    <span class="ai-title">AI · {symbol} · {timeframe}</span>
    <span class="spacer"></span>
    {#if loading}<span class="loading">…</span>{/if}
    <button class="close" onclick={onClose} aria-label="close">×</button>
  </div>

  <div class="cards" bind:this={scrollEl}>
    {#if cards.length === 0}
      <div class="welcome">
        <div class="wl-section">AI · HOW TO</div>
        <p class="wl-text">
          분석/스캔/판정을 자연어로 요청하세요.<br />
          <span class="wl-hint">결과는 카드로 누적됩니다 (위가 최신).</span>
        </p>
        <div class="wl-section">QUICK</div>
        <div class="wl-picks">
          {#each quicks as q (q)}
            <button class="wl-pick" type="button" onclick={() => quickPick(q)}>
              <span class="pick-slash">/</span>
              {q}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each cards as card (card.ts)}
        {#if card.type === 'analyze'}
          <div class="card card--analyze">
            <div class="card-header">
              <span class="card-symbol">{card.symbol} · {card.tf}</span>
              <span
                class="card-badge"
                class:up={card.direction.toUpperCase() === 'LONG'}
                class:dn={card.direction.toUpperCase() === 'SHORT'}
              >
                {card.direction}
                {card.pWin != null ? `${Math.round(card.pWin * 100)}%` : ''}
              </span>
            </div>
            {#if card.evidence.length > 0}
              <ul class="card-evidence">
                {#each card.evidence.slice(0, 4) as e, i (i)}
                  <li>{e}</li>
                {/each}
              </ul>
            {/if}
            {#if card.entry != null || card.stop != null}
              <div class="card-levels">
                {#if card.entry != null}
                  <span class="level-entry">Entry {card.entry}</span>
                {/if}
                {#if card.stop != null}
                  <span class="level-stop">Stop {card.stop}</span>
                {/if}
              </div>
            {/if}
          </div>
        {:else if card.type === 'scan'}
          <div class="card card--scan">
            <div class="card-header">
              <span class="card-label">SCAN · {card.candidates.length} candidates</span>
            </div>
            <ul class="scan-list">
              {#each card.candidates as c, i (i)}
                <li>
                  <button
                    type="button"
                    class="scan-row"
                    class:active={c.symbol === symbol}
                    onclick={() => selectSymbol(c.symbol)}
                  >
                    <span class="scan-sym">{c.symbol.replace(/USDT$/, '')}</span>
                    <span class="scan-sig">{c.signal}</span>
                    {#if c.conf != null}
                      <span class="scan-conf">{Math.round(c.conf * 100)}%</span>
                    {/if}
                    {#if c.symbol === symbol}
                      <span class="scan-active">◀</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {:else if card.type === 'saved'}
          <div class="card card--saved">
            <span class="saved-icon">✓</span>
            <span>{card.symbol} {card.verdict.toUpperCase()} 저장됨</span>
          </div>
        {:else if card.type === 'info'}
          <div class="card card--info">{card.text}</div>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="input-area">
    <div class="input-box">
      <textarea
        bind:this={textareaEl}
        value={inputValue}
        placeholder="분석 / 스캔 / 판정 — 'BTC 분석' ↵"
        rows={2}
        oninput={handleInput}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
      ></textarea>
      <div class="input-footer">
        <span class="context-hint">{symbol} · {timeframe}</span>
        <span class="spacer"></span>
        <span class="enter-hint">↵ send</span>
        <button
          type="button"
          class="send-btn"
          class:active={canSend}
          onclick={() => void send()}
          disabled={!canSend}
        >
          SEND
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .panel {
    width: 100%;
    height: 100%;
    flex-shrink: 0;
    background: var(--g1);
    border-left: 1px solid var(--g5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
  }

  .hdr {
    height: 34px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border-bottom: 1px solid var(--g5);
    background: var(--g0);
    flex-shrink: 0;
  }
  .ai-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .ai-title { font-size: var(--ui-text-xs); color: var(--g7); letter-spacing: 0.12em; }
  .spacer { flex: 1; }
  .loading {
    font-size: 12px;
    color: var(--brand);
    letter-spacing: 0.2em;
  }
  .close {
    color: var(--g5);
    font-size: 16px;
    padding: 0 3px;
    background: none;
    border: none;
    cursor: pointer;
  }
  .close:hover { color: var(--g7); }

  /* Cards container */
  .cards {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Welcome */
  .welcome { display: flex; flex-direction: column; gap: 6px; }
  .wl-section {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-top: 8px;
  }
  .wl-text {
    font-size: 11px;
    color: var(--g7);
    line-height: 1.65;
    margin: 0;
    font-family: 'Geist', sans-serif;
  }
  .wl-hint { color: var(--g6); }
  .wl-picks { display: flex; flex-direction: column; gap: 3px; }
  .wl-pick {
    text-align: left;
    padding: 6px 9px;
    background: var(--g2);
    border: 1px solid var(--g5);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    line-height: 1.4;
    cursor: pointer;
    font-family: 'Geist', sans-serif;
    transition: background 0.1s;
  }
  .wl-pick:hover { background: var(--g3); }
  .pick-slash { color: var(--brand); margin-right: 5px; font-family: 'JetBrains Mono', monospace; }

  /* Cards */
  .card {
    background: var(--g2);
    border: 1px solid var(--g5);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 0;
    color: var(--g8);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--ui-text-xs);
    color: var(--g6);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .card-symbol {
    font-weight: 600;
    color: var(--g9);
  }

  .card-label {
    font-weight: 600;
    color: var(--g8);
  }

  .card-badge {
    font-size: var(--ui-text-xs);
    padding: 2px 6px;
    border-radius: 2px;
    background: var(--g3);
    color: var(--g8);
    border: 0.5px solid var(--g5);
  }
  .card-badge.up {
    color: #22AB94;
    border-color: #22AB9466;
    background: #22AB9410;
  }
  .card-badge.dn {
    color: #F23645;
    border-color: #F2364566;
    background: #F2364510;
  }

  .card-evidence {
    list-style: disc;
    margin: 0 0 6px;
    padding-left: 16px;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    font-family: 'Geist', sans-serif;
    line-height: 1.5;
  }

  .card-levels {
    display: flex;
    gap: 8px;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
  }
  .level-entry { color: #22AB94; }
  .level-stop { color: #F23645; }

  .scan-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .scan-row {
    width: 100%;
    display: grid;
    grid-template-columns: 60px 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 5px 4px;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g4);
    color: var(--g8);
    font-family: inherit;
    font-size: var(--ui-text-xs);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }
  .scan-row:hover {
    background: var(--g3);
  }
  .scan-row.active {
    background: var(--brand-dd);
    border-left: 2px solid var(--brand);
  }
  .scan-active {
    font-size: var(--ui-text-xs);
    color: var(--brand);
  }
  .scan-sym {
    font-weight: 600;
    color: var(--g9);
  }
  .scan-sig {
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }
  .scan-conf {
    font-size: var(--ui-text-xs);
    color: var(--brand);
  }

  .card--saved {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--ui-text-xs);
    color: #22AB94;
    border-color: #22AB9466;
    background: #22AB9408;
  }
  .saved-icon {
    font-weight: 700;
  }

  .card--info {
    font-size: var(--ui-text-xs);
    color: var(--g7);
    font-family: 'Geist', sans-serif;
  }

  /* Input */
  .input-area {
    border-top: 1px solid var(--g5);
    padding: 9px;
    background: var(--g0);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .input-box {
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    padding: 7px 9px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  textarea {
    background: transparent;
    color: var(--g9);
    font-size: 11px;
    font-family: 'Geist', sans-serif;
    resize: none;
    width: 100%;
    line-height: 1.5;
    border: none;
    outline: none;
  }
  textarea::placeholder { color: var(--g5); }
  .input-footer {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .context-hint { font-size: var(--ui-text-xs); color: var(--g5); letter-spacing: 0.08em; }
  .enter-hint { font-size: 7px; color: var(--g5); }
  .send-btn {
    padding: 3px 9px;
    border-radius: 3px;
    background: var(--g3);
    color: var(--g5);
    border: 1px solid var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: all 0.12s;
  }
  .send-btn.active {
    background: var(--brand-dd);
    color: var(--brand);
    border-color: var(--brand-d);
  }
  .send-btn.active:hover { background: var(--brand-d); }
  .send-btn:disabled { cursor: not-allowed; opacity: 0.7; }
</style>
