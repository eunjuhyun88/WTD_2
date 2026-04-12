<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { p0Override } from '$lib/stores/notificationStore';

  interface Props {
    timeLeft?: number;
    onsubmit?: (data: { dir: 'LONG' | 'SHORT' | 'NEUTRAL'; conf: number; tf: string; vmode: 'tpsl' | 'close'; closeN: number; tags: string[]; reason: string; entry: number; tp: number; sl: number; rr: number }) => void;
  }
  let { timeLeft = 45, onsubmit }: Props = $props();

  // Get current price from the active pair
  let pairBase = $derived($gameState.pair.split('/')[0]);
  let currentPrice = $derived($gameState.prices[pairBase as keyof typeof $gameState.prices] || $gameState.prices.BTC);

  // Hypothesis state
  let dir: 'LONG' | 'SHORT' | 'NEUTRAL' | null = $state(null);
  let conf = $state(0);
  let tf = $state('1h');
  let vmode: 'tpsl' | 'close' = $state('tpsl');
  let closeN = $state(3);
  let locked = $state(false);

  // NEW: Reasoning tags
  const REASONING_TAGS = ['STRUCTURE', 'FLOW', 'FUNDING', 'SENTIMENT', 'MACRO'] as const;
  let selectedTags: string[] = $state([]);

  // NEW: Optional text reason (280 char max)
  let reason = $state('');
  let reasonCharsLeft = $derived(280 - reason.length);

  // Price levels — dynamically adjusted to current price
  let entry = $state(0);
  let tp = $state(0);
  let sl = $state(0);
  let userAdjusted = $state(false);

  // Update entry when price changes (only if user hasn't manually adjusted)
  $effect.pre(() => {
    if (!userAdjusted && !dir) {
      entry = currentPrice;
      tp = entry * 1.02;
      sl = entry * 0.985;
    }
  });

  // Calculate step size based on price magnitude
  let step = $derived(currentPrice > 10000 ? 100 : currentPrice > 1000 ? 10 : currentPrice > 100 ? 1 : currentPrice > 10 ? 0.1 : 0.01);
  let decimals = $derived(currentPrice > 100 ? 0 : currentPrice > 1 ? 2 : 4);

  let reward = $derived(Math.abs(tp - entry));
  let risk = $derived(Math.abs(entry - sl));
  let rr = $derived(risk > 0 ? (reward / risk).toFixed(2) : '—');
  let rrColor = $derived(parseFloat(rr) >= 2 ? '#00cc66' : parseFloat(rr) >= 1.5 ? '#ffd060' : parseFloat(rr) >= 1 ? '#ff8c3b' : '#ff2d55');
  let tpPct = $derived(entry > 0 ? ((tp - entry) / entry * 100).toFixed(2) : '0.00');
  let slPct = $derived(entry > 0 ? ((sl - entry) / entry * 100).toFixed(2) : '0.00');

  // Validation: for LONG, TP > Entry > SL; for SHORT, SL > Entry > TP
  // P0 override disables submission
  let canSubmit = $derived(!$p0Override.active && !locked && dir !== null && dir !== 'NEUTRAL' && (
    dir === 'LONG' ? (tp > entry && entry > sl) :
    dir === 'SHORT' ? (sl > entry && entry > tp) : false
  ));

  // "Hypothesis First" — agent data should be hidden when user has not yet committed
  let hypothesisInputActive = $derived(!locked);

  const TF_LABELS: Record<string, string> = { '1m': '1M', '5m': '5M', '15m': '15M', '1h': '1H', '4h': '4H', '1d': '1D' };

  function selectDir(d: 'LONG' | 'SHORT' | 'NEUTRAL') {
    if (locked || $p0Override.active) return;
    dir = d;
    userAdjusted = true;
    if (d === 'LONG') {
      tp = entry * 1.02;
      sl = entry * 0.985;
    } else if (d === 'SHORT') {
      tp = entry * 0.98;
      sl = entry * 1.015;
    }
  }

  function toggleTag(tag: string) {
    if (locked) return;
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  function adjustTP(delta: number) {
    if (locked) return;
    tp = +(tp + delta * step).toFixed(decimals);
    userAdjusted = true;
  }
  function adjustSL(delta: number) {
    if (locked) return;
    sl = +(sl + delta * step).toFixed(decimals);
    userAdjusted = true;
  }

  function formatPrice(p: number): string {
    if (p >= 1000) return '$' + Math.round(p).toLocaleString();
    if (p >= 1) return '$' + p.toFixed(2);
    return '$' + p.toFixed(4);
  }

  function submit() {
    if (!dir || $p0Override.active) return;
    locked = true;
    onsubmit?.({
      dir, conf: conf || 1, tf, vmode, closeN,
      tags: [...selectedTags],
      reason,
      entry: +entry.toFixed(decimals),
      tp: +tp.toFixed(decimals),
      sl: +sl.toFixed(decimals),
      rr: parseFloat(rr) || 1
    });
  }

  function skip() {
    locked = true;
    onsubmit?.({
      dir: 'NEUTRAL', conf: 1, tf, vmode: 'tpsl', closeN: 3,
      tags: [],
      reason: '',
      entry: +entry.toFixed(decimals),
      tp: +(entry * 1.02).toFixed(decimals),
      sl: +(entry * 0.985).toFixed(decimals),
      rr: 1.3
    });
  }

  function unlock() {
    locked = false;
  }
</script>

<div class="hypo-panel" class:locked>
  <!-- Hypothesis First Banner -->
  {#if hypothesisInputActive}
    <div class="hypo-first-banner">
      🧠 HYPOTHESIS FIRST — Form your thesis before agents analyze
    </div>
  {/if}

  <div class="hypo-header">
    <span class="hypo-icon">🐕</span>
    <span class="hypo-title">YOUR CALL?</span>
    <span class="hypo-pair">{$gameState.pair}</span>
    <div class="hypo-timer" class:urgent={timeLeft <= 10}>{timeLeft}s</div>
  </div>

  <!-- P0 Override Warning -->
  {#if $p0Override.active}
    <div class="p0-warning">
      ⚠️ P0 OVERRIDE ACTIVE — All draft orders disabled
    </div>
  {/if}

  <!-- Direction Selection — Compact Pill Toggles -->
  <div class="dir-section">
    <button class="dir-pill long" class:sel={dir === 'LONG'} disabled={locked || $p0Override.active} onclick={() => selectDir('LONG')}>
      ▲ LONG
    </button>
    <button class="dir-pill short" class:sel={dir === 'SHORT'} disabled={locked || $p0Override.active} onclick={() => selectDir('SHORT')}>
      ▼ SHORT
    </button>
  </div>

  <!-- Confidence Dots (1-5) -->
  <div class="conf-section">
    <span class="section-label">CONFIDENCE</span>
    <div class="conf-dots">
      {#each [1,2,3,4,5] as n}
        <button
          class="conf-dot"
          class:on={n <= conf}
          disabled={locked}
          onclick={() => conf = n}
          aria-label="Confidence {n}"
        >
          <span class="dot-fill"></span>
        </button>
      {/each}
      <span class="conf-label">
        {#if conf === 0}SELECT{:else if conf <= 2}LOW{:else if conf <= 3}MED{:else if conf <= 4}HIGH{:else}MAX{/if}
      </span>
    </div>
  </div>

  <!-- Reasoning Tags -->
  <div class="tags-section">
    <span class="section-label">REASONING</span>
    <div class="tag-chips">
      {#each REASONING_TAGS as tag}
        <button
          class="tag-chip"
          class:sel={selectedTags.includes(tag)}
          disabled={locked}
          onclick={() => toggleTag(tag)}
        >
          {tag}
        </button>
      {/each}
    </div>
  </div>

  <!-- Optional Text Reason -->
  <div class="reason-section">
    <span class="section-label">THESIS NOTE <span class="optional-tag">OPTIONAL</span></span>
    <textarea
      class="reason-input"
      placeholder="Why this direction? (280 chars max)"
      bind:value={reason}
      maxlength="280"
      disabled={locked}
      rows="2"
    ></textarea>
    <span class="char-count" class:warn={reasonCharsLeft < 30}>{reasonCharsLeft}</span>
  </div>

  <!-- Timeframe -->
  <div class="tf-section">
    <span class="section-label">TIMEFRAME</span>
    <div class="tf-btns">
      {#each ['1m', '5m', '15m', '1h', '4h', '1d'] as t}
        <button class="tf-btn" class:sel={tf === t} disabled={locked} onclick={() => tf = t}>{TF_LABELS[t]}</button>
      {/each}
    </div>
  </div>

  <!-- Verdict Mode -->
  <div class="vmode-section">
    <span class="section-label">VERDICT MODE</span>
    <div class="vmode-btns">
      <button class="vmode-btn" class:sel={vmode === 'tpsl'} disabled={locked} onclick={() => vmode = 'tpsl'}>TP/SL Touch</button>
      <button class="vmode-btn" class:sel={vmode === 'close'} disabled={locked} onclick={() => vmode = 'close'}>Close x{closeN}</button>
    </div>
    {#if vmode === 'close'}
      <div class="close-n">
        <button disabled={locked} onclick={() => closeN = Math.max(1, closeN - 1)}>-</button>
        <span>{closeN} candles</span>
        <button disabled={locked} onclick={() => closeN = Math.min(10, closeN + 1)}>+</button>
      </div>
    {/if}
  </div>

  <!-- SL/TP Levels -->
  <div class="levels-section">
    {#if dir === 'LONG' || !dir}
      <!-- LONG order: TP > Entry > SL -->
      <div class="level-row tp">
        <span class="level-label">TP</span>
        <div class="level-controls">
          <button class="adj-btn" disabled={locked} onclick={() => adjustTP(-1)}>-</button>
          <span class="level-price">{formatPrice(tp)}</span>
          <button class="adj-btn" disabled={locked} onclick={() => adjustTP(1)}>+</button>
        </div>
        <span class="level-pct" style="color:#00cc66">{+tpPct >= 0 ? '+' : ''}{tpPct}%</span>
      </div>
      <div class="level-row entry">
        <span class="level-label">ENTRY</span>
        <span class="level-price">{formatPrice(entry)}</span>
        <span class="level-tag">CURRENT</span>
      </div>
      <div class="level-row sl">
        <span class="level-label">SL</span>
        <div class="level-controls">
          <button class="adj-btn" disabled={locked} onclick={() => adjustSL(-1)}>-</button>
          <span class="level-price">{formatPrice(sl)}</span>
          <button class="adj-btn" disabled={locked} onclick={() => adjustSL(1)}>+</button>
        </div>
        <span class="level-pct" style="color:#ff2d55">{slPct}%</span>
      </div>
    {:else}
      <!-- SHORT order: SL > Entry > TP -->
      <div class="level-row sl">
        <span class="level-label">SL</span>
        <div class="level-controls">
          <button class="adj-btn" disabled={locked} onclick={() => adjustSL(-1)}>-</button>
          <span class="level-price">{formatPrice(sl)}</span>
          <button class="adj-btn" disabled={locked} onclick={() => adjustSL(1)}>+</button>
        </div>
        <span class="level-pct" style="color:#ff2d55">{+slPct >= 0 ? '+' : ''}{slPct}%</span>
      </div>
      <div class="level-row entry">
        <span class="level-label">ENTRY</span>
        <span class="level-price">{formatPrice(entry)}</span>
        <span class="level-tag">CURRENT</span>
      </div>
      <div class="level-row tp">
        <span class="level-label">TP</span>
        <div class="level-controls">
          <button class="adj-btn" disabled={locked} onclick={() => adjustTP(-1)}>-</button>
          <span class="level-price">{formatPrice(tp)}</span>
          <button class="adj-btn" disabled={locked} onclick={() => adjustTP(1)}>+</button>
        </div>
        <span class="level-pct" style="color:#00cc66">{tpPct}%</span>
      </div>
    {/if}
  </div>

  <!-- R:R Display -->
  <div class="rr-display">
    <span class="rr-label">RISK : REWARD</span>
    <span class="rr-value" style="color:{rrColor}">1 : {rr}</span>
  </div>

  <!-- Submit -->
  <div class="submit-section">
    {#if locked}
      <button class="submit-btn locked-btn" onclick={unlock}>
        🔒 HYPOTHESIS LOCKED — TAP TO EDIT
      </button>
    {:else}
      <button class="submit-btn" class:long-btn={dir === 'LONG'} class:short-btn={dir === 'SHORT'} disabled={!canSubmit} onclick={submit}>
        {#if $p0Override.active}⛔ P0 — DISABLED{:else if dir === 'LONG'}🚀 LOCK IN LONG{:else if dir === 'SHORT'}💀 LOCK IN SHORT{:else}SELECT DIRECTION{/if}
      </button>
      <button class="skip-btn" onclick={skip}>SKIP →</button>
    {/if}
  </div>

  <!-- Drag hint -->
  <div class="drag-hint">💡 Drag TP/SL lines on chart or use +/- buttons</div>
</div>

<style>
  /* ═══ HypothesisPanel — Dark Arena Theme ═══ */
  .hypo-panel {
    background: rgba(10,26,18,.92);
    border: 1px solid rgba(232,150,125,.2);
    border-radius: 14px;
    padding: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,.5), inset 0 1px 0 rgba(232,150,125,.06);
    width: 260px;
    max-height: 80vh;
    overflow-y: auto;
    transition: opacity .3s;
    font-size: 0.95em;
    color: #f0ede4;
  }
  .hypo-panel.locked {
    opacity: 0.85;
  }

  /* Hypothesis First Banner */
  .hypo-first-banner {
    background: linear-gradient(90deg, rgba(232,150,125,.25), rgba(232,150,125,.12));
    color: #e8967d;
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 5px 8px;
    border: 1px solid rgba(232,150,125,.35);
    border-radius: 8px;
    margin-bottom: 8px;
    text-align: center;
    animation: slideUp .3s ease;
  }

  /* P0 Warning */
  .p0-warning {
    background: rgba(255,94,122,.2);
    color: #ff5e7a;
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 5px 8px;
    border: 1px solid rgba(255,94,122,.4);
    border-radius: 8px;
    margin-bottom: 8px;
    text-align: center;
    animation: shake .4s ease;
  }

  .hypo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(232,150,125,.18);
    margin-bottom: 10px;
  }
  .hypo-icon { font-size: 18px; }
  .hypo-title { font-size: 14px; font-weight: 900; font-family: var(--fc); letter-spacing: 3px; color: #f0ede4; }
  .hypo-pair { font-size: 9px; font-weight: 700; font-family: var(--fd); color: #e8967d; background: rgba(232,150,125,.12); padding: 2px 6px; border-radius: 4px; letter-spacing: 1px; border: 1px solid rgba(232,150,125,.2); }
  .hypo-timer {
    font-size: 16px; font-weight: 900; font-family: var(--fd);
    background: rgba(232,150,125,.18); color: #e8967d; border: 1px solid rgba(232,150,125,.3); border-radius: 8px;
    padding: 2px 10px; min-width: 40px; text-align: center; margin-left: auto;
  }
  .hypo-timer.urgent { background: rgba(255,94,122,.3); color: #ff5e7a; border-color: rgba(255,94,122,.5); animation: timerPulse .5s ease infinite; }
  @keyframes timerPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.1) } }

  /* Direction — Compact Pill Toggles */
  .dir-section { display: flex; gap: 4px; margin-bottom: 10px; }
  .dir-pill {
    flex: 1; padding: 7px 4px; border: 1px solid rgba(240,237,228,.15); border-radius: 20px;
    font-family: var(--fd); font-size: 10px; font-weight: 900; letter-spacing: 1.5px;
    cursor: pointer; transition: all .15s; background: rgba(10,26,18,.6);
    text-align: center; color: rgba(240,237,228,.5);
  }
  .dir-pill:disabled { opacity: .5; cursor: not-allowed; }
  .dir-pill.long { background: rgba(0,204,136,.08); color: #00cc88; border-color: rgba(0,204,136,.25); }
  .dir-pill.long.sel { background: rgba(0,204,136,.2); color: #00ff88; border-color: #00cc88; box-shadow: 0 0 12px rgba(0,204,136,.3), inset 0 0 8px rgba(0,204,136,.1); }
  .dir-pill.short { background: rgba(255,94,122,.08); color: #ff5e7a; border-color: rgba(255,94,122,.25); }
  .dir-pill.short.sel { background: rgba(255,94,122,.2); color: #ff5e7a; border-color: #ff5e7a; box-shadow: 0 0 12px rgba(255,94,122,.3), inset 0 0 8px rgba(255,94,122,.1); }
  .dir-pill:hover:not(:disabled):not(.sel) { border-color: rgba(240,237,228,.3); }

  /* Sections */
  .section-label { font-size: 7px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; color: rgba(240,237,228,.45); display: block; margin-bottom: 4px; }
  .optional-tag { font-size: 6px; color: rgba(240,237,228,.3); letter-spacing: 1px; }

  /* Confidence Dots */
  .conf-section { margin-bottom: 8px; }
  .conf-dots { display: flex; align-items: center; gap: 6px; }
  .conf-dot {
    width: 24px; height: 24px; border-radius: 50%;
    border: 2px solid rgba(240,237,228,.2); background: rgba(10,26,18,.6);
    cursor: pointer; transition: all .15s;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
  }
  .conf-dot:disabled { cursor: not-allowed; opacity: .5; }
  .conf-dot .dot-fill {
    width: 12px; height: 12px; border-radius: 50%;
    background: transparent; transition: background .15s;
  }
  .conf-dot.on { border-color: #e8967d; }
  .conf-dot.on .dot-fill { background: #e8967d; }
  .conf-dot:hover:not(:disabled) { border-color: rgba(232,150,125,.5); transform: scale(1.1); }
  .conf-label {
    font-family: var(--fm); font-size: 8px; font-weight: 900;
    letter-spacing: 2px; color: rgba(240,237,228,.5); margin-left: 4px;
  }

  /* Reasoning Tags */
  .tags-section { margin-bottom: 8px; }
  .tag-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag-chip {
    font-family: var(--fm); font-size: 7px; font-weight: 900;
    letter-spacing: 1px; padding: 4px 8px;
    border: 1px solid rgba(240,237,228,.15); border-radius: 20px;
    background: rgba(10,26,18,.6); color: rgba(240,237,228,.45); cursor: pointer;
    transition: all .15s;
  }
  .tag-chip:disabled { opacity: .5; cursor: not-allowed; }
  .tag-chip.sel {
    border-color: #e8967d; background: rgba(232,150,125,.18); color: #e8967d;
    box-shadow: 0 0 8px rgba(232,150,125,.15);
  }
  .tag-chip:hover:not(:disabled):not(.sel) {
    border-color: rgba(240,237,228,.3); color: rgba(240,237,228,.6);
  }

  /* Text Reason */
  .reason-section { margin-bottom: 8px; position: relative; }
  .reason-input {
    width: 100%; padding: 6px 8px;
    border: 1px solid rgba(240,237,228,.15); border-radius: 8px;
    font-family: var(--fm); font-size: 8px;
    background: rgba(7,19,13,.7); color: #f0ede4;
    resize: none; outline: none;
    transition: border-color .15s;
    line-height: 1.4;
  }
  .reason-input:focus { border-color: rgba(232,150,125,.5); }
  .reason-input:disabled { opacity: .5; }
  .char-count {
    position: absolute; bottom: 4px; right: 8px;
    font-family: var(--fm); font-size: 7px; color: rgba(240,237,228,.3);
  }
  .char-count.warn { color: #ff5e7a; }

  /* Timeframe */
  .tf-section { margin-bottom: 8px; }
  .tf-btns { display: flex; gap: 3px; }
  .tf-btn {
    flex: 1; padding: 4px 2px; border: 1px solid rgba(240,237,228,.15); border-radius: 6px;
    font-size: 8px; font-weight: 900; font-family: var(--fd);
    background: rgba(10,26,18,.6); cursor: pointer; color: rgba(240,237,228,.45);
  }
  .tf-btn:disabled { opacity: .5; cursor: not-allowed; }
  .tf-btn.sel { border-color: #e8967d; background: rgba(232,150,125,.18); color: #e8967d; box-shadow: 0 0 8px rgba(232,150,125,.12); }

  /* Verdict Mode */
  .vmode-section { margin-bottom: 8px; }
  .vmode-btns { display: flex; gap: 4px; }
  .vmode-btn {
    flex: 1; padding: 5px 4px; border: 1px solid rgba(240,237,228,.15); border-radius: 8px;
    font-size: 8px; font-weight: 700; font-family: var(--fm);
    background: rgba(10,26,18,.6); cursor: pointer; color: rgba(240,237,228,.45);
  }
  .vmode-btn:disabled { opacity: .5; cursor: not-allowed; }
  .vmode-btn.sel { border-color: rgba(102,204,230,.4); background: rgba(102,204,230,.1); color: #66cce6; box-shadow: 0 0 8px rgba(102,204,230,.1); }
  .close-n {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 4px; font-size: 9px; font-family: var(--fm); font-weight: 700; color: #f0ede4;
  }
  .close-n button { width: 22px; height: 22px; border: 1px solid rgba(240,237,228,.25); border-radius: 6px; background: rgba(10,26,18,.6); cursor: pointer; font-weight: 900; color: #f0ede4; }
  .close-n button:disabled { opacity: .5; cursor: not-allowed; }

  /* Levels */
  .levels-section { margin-bottom: 8px; border: 1px solid rgba(240,237,228,.15); border-radius: 10px; overflow: hidden; }
  .level-row {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px;
    font-family: var(--fm); font-size: 9px; color: #f0ede4;
  }
  .level-row.tp { background: rgba(0,204,136,.06); border-bottom: 1px solid rgba(240,237,228,.08); }
  .level-row.entry { background: rgba(232,150,125,.06); border-bottom: 1px solid rgba(240,237,228,.08); }
  .level-row.sl { background: rgba(255,94,122,.06); }
  .level-label { font-size: 8px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; width: 36px; }
  .level-price { font-size: 11px; font-weight: 900; font-family: var(--fd); }
  .level-pct { font-size: 8px; font-weight: 700; margin-left: auto; }
  .level-tag { font-size: 6px; color: rgba(240,237,228,.4); margin-left: auto; font-weight: 700; letter-spacing: 1px; }
  .level-controls { display: flex; align-items: center; gap: 4px; }
  .adj-btn { width: 22px; height: 22px; border: 1px solid rgba(240,237,228,.25); border-radius: 6px; background: rgba(10,26,18,.6); cursor: pointer; font-weight: 900; font-size: 12px; display: flex; align-items: center; justify-content: center; color: #f0ede4; }
  .adj-btn:disabled { opacity: .5; cursor: not-allowed; }
  .adj-btn:hover:not(:disabled) { background: rgba(232,150,125,.18); border-color: rgba(232,150,125,.4); }
  .adj-btn:active:not(:disabled) { transform: scale(.9); }

  /* R:R */
  .rr-display {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px; margin-bottom: 8px;
    background: rgba(7,19,13,.8); border: 1px solid rgba(240,237,228,.1); border-radius: 8px;
  }
  .rr-label { font-size: 7px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; color: rgba(240,237,228,.45); }
  .rr-value { font-size: 16px; font-weight: 900; font-family: var(--fd); color: #e8967d; }

  /* Submit */
  .submit-section { display: flex; gap: 6px; }
  .submit-btn {
    flex: 1; padding: 10px; border: 1px solid rgba(240,237,228,.15); border-radius: 12px;
    font-family: var(--fc); font-size: 12px; font-weight: 900; letter-spacing: 2px;
    background: rgba(10,26,18,.6); color: rgba(240,237,228,.35);
    cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.3); transition: all .15s;
  }
  .submit-btn.long-btn:not(:disabled) { background: linear-gradient(180deg, rgba(0,204,136,.3), rgba(0,180,100,.2)); color: #00ff88; border-color: rgba(0,204,136,.4); box-shadow: 0 4px 16px rgba(0,204,136,.2); }
  .submit-btn.short-btn:not(:disabled) { background: linear-gradient(180deg, rgba(255,94,122,.3), rgba(200,50,70,.2)); color: #ff5e7a; border-color: rgba(255,94,122,.4); box-shadow: 0 4px 16px rgba(255,94,122,.2); }
  .submit-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.15); }
  .submit-btn:disabled { opacity: .5; cursor: not-allowed; }
  .submit-btn.locked-btn {
    background: rgba(10,26,18,.8);
    color: #e8967d;
    font-size: 8px;
    letter-spacing: 1px;
    border-color: rgba(232,150,125,.2);
  }
  .submit-btn.locked-btn:hover {
    background: rgba(232,150,125,.1);
  }
  .skip-btn {
    padding: 10px 14px; border: 1px solid rgba(240,237,228,.15); border-radius: 10px;
    font-family: var(--fm); font-size: 9px; font-weight: 700;
    background: rgba(10,26,18,.6); color: rgba(240,237,228,.5); cursor: pointer;
  }
  .skip-btn:hover { background: rgba(240,237,228,.08); }

  .drag-hint { text-align: center; font-size: 7px; color: rgba(240,237,228,.3); margin-top: 6px; font-family: var(--fm); }
</style>
