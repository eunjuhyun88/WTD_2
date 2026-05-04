<script lang="ts">
  import StatusBarExpand from './StatusBarExpand.svelte';
  import HoldTimeStrip from '$lib/components/shared/HoldTimeStrip.svelte';

  interface Props {
    verdicts: number;
    modelDelta: number;
    sidebarVisible: boolean;
    /** D-10: latest verdict label, e.g. "LONG" / "SHORT" / "WAIT" / null. */
    lastVerdictKind?: 'LONG' | 'SHORT' | 'WAIT' | null;
    /** D-10: epoch ms of latest data tick (chart price). null = unknown. */
    lastUpdatedAt?: number | null;
    /** W-0395: hold time p50 in hours for unresolved watch patterns. null = no data. */
    holdP50?: number | null;
    /** W-0395: hold time p90 in hours for unresolved watch patterns. null = no data. */
    holdP90?: number | null;
  }

  const {
    verdicts, modelDelta, sidebarVisible,
    lastVerdictKind = null, lastUpdatedAt = null,
    holdP50 = null, holdP90 = null,
  }: Props = $props();

  function getTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  let currentTime = $state(getTime());
  let nowMs = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => {
      currentTime = getTime();
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });

  // BTC FR + Kimchi live data (30s poll)
  let btcFR      = $state<number | null>(null);
  let kimchiPct  = $state<number | null>(null);

  const frClass     = $derived(btcFR === null ? '' : btcFR > 0 ? 'fr-long' : 'fr-short');
  const kimchiClass = $derived(kimchiPct === null ? '' : kimchiPct > 1.5 ? 'kim-hot' : kimchiPct < -0.5 ? 'kim-cold' : '');

  async function fetchMarketData() {
    try {
      const [frRes, kimRes] = await Promise.allSettled([
        fetch('/api/market/funding?symbol=BTCUSDT&limit=2'),
        fetch('/api/market/kimchi-premium'),
      ]);
      if (frRes.status === 'fulfilled' && frRes.value.ok) {
        const d = await frRes.value.json() as { bars: { delta: number }[] };
        const bars = d.bars ?? [];
        if (bars.length > 0) btcFR = bars[bars.length - 1].delta;
      }
      if (kimRes.status === 'fulfilled' && kimRes.value.ok) {
        const d = await kimRes.value.json() as { ok: boolean; data: { premium_pct: number } };
        if (d.ok) kimchiPct = d.data.premium_pct;
      }
    } catch { /* silent */ }
  }

  $effect(() => {
    fetchMarketData();
    const t = setInterval(fetchMarketData, 30_000);
    return () => clearInterval(t);
  });

  const freshnessSec = $derived(
    lastUpdatedAt == null ? null : Math.max(0, Math.floor((nowMs - lastUpdatedAt) / 1000)),
  );
  const freshnessClass = $derived(
    freshnessSec == null ? '' :
    freshnessSec < 15 ? 'fresh-good' :
    freshnessSec < 60 ? 'fresh-warn' : 'fresh-stale',
  );

  // F60 mini gate: verdicts >= 60 is the threshold for "enough data"
  const f60Gate = $derived(verdicts >= 60);
  const f60Class = $derived(f60Gate ? 'gate-pass' : 'gate-fail');

  // Tier-2 hover-expand state
  let expanded = $state(false);

  function onMouseEnter() { expanded = true; }
  function onMouseLeave() { expanded = false; }
  function toggleExpand() { expanded = !expanded; }
</script>

<!--
  StatusBar — 32px base (Tier-1).
  When [data-statusbar-expanded=true], StatusBarExpand slides in below as a 28px row.

  Tier-1 (always visible): F60 mini gate · Freshness · mini Verdict · Drift · Time
  Tier-2 (hover-expand): FR · Kimchi · HoldTime · scanner detail · sys health
-->
<div
  class="status-bar-wrapper"
  data-statusbar-expanded={expanded}
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
  role="status"
  aria-label="Terminal status bar"
>
  <!-- Tier-1: always visible 32px strip -->
  <div class="status-bar">

    <!-- F60 mini gate -->
    <span class="status-item" title="F60 gate: {f60Gate ? 'sufficient data (≥60 verdicts)' : 'insufficient data (<60 verdicts)'}">
      <span class="gate-dot {f60Class}"></span>
      <span class="item-label">F60</span>
      <strong class={f60Class}>{verdicts}</strong>
    </span>

    <span class="divider">│</span>

    <!-- Freshness ↻ -->
    {#if freshnessSec !== null}
      <span class="status-item" title="Time since last data refresh">
        <span class="refresh-icon" aria-hidden="true">↻</span>
        <strong class={freshnessClass}>{freshnessSec}s</strong>
      </span>
    {:else}
      <span class="status-item" title="Data freshness unknown">
        <span class="refresh-icon" aria-hidden="true">↻</span>
        <span class="item-muted">—</span>
      </span>
    {/if}

    <span class="divider">│</span>

    <!-- mini Verdict -->
    <span class="status-item" title="Latest verdict">
      {#if lastVerdictKind}
        <span
          class="verdict-dot"
          class:vd-long={lastVerdictKind === 'LONG'}
          class:vd-short={lastVerdictKind === 'SHORT'}
          class:vd-wait={lastVerdictKind === 'WAIT'}
        ></span>
        <span
          class="verdict-label"
          class:vl-long={lastVerdictKind === 'LONG'}
          class:vl-short={lastVerdictKind === 'SHORT'}
          class:vl-wait={lastVerdictKind === 'WAIT'}
        >{lastVerdictKind}</span>
      {:else}
        <span class="verdict-dot vd-none"></span>
        <span class="item-muted">—</span>
      {/if}
    </span>

    <span class="divider">│</span>

    <!-- Drift indicator -->
    <span class="status-item" title="Actual profit deviation vs. model prediction">
      <span class="item-label">drift</span>
      <strong class:positive={modelDelta >= 0} class:negative={modelDelta < 0}>
        {modelDelta >= 0 ? '+' : ''}{modelDelta.toFixed(3)}
      </strong>
    </span>

    <span class="spacer"></span>

    <!-- Expand chevron (click to pin Tier-2 open; hover also works) -->
    <button
      class="expand-btn"
      class:expanded
      onclick={toggleExpand}
      title="{expanded ? 'Collapse' : 'Expand'} status detail"
      aria-expanded={expanded}
      aria-controls="statusbar-tier2"
    >
      <span class="chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
    </button>

    <span class="divider">│</span>

    <!-- Time -->
    <span class="time" title="Current time (HH:MM:SS)">{currentTime}</span>
  </div>

  <!-- Tier-2: hover-expand or click-expand strip -->
  {#if expanded}
    <div id="statusbar-tier2">
      <HoldTimeStrip p50={holdP50} p90={holdP90} label="hold" />
      <StatusBarExpand
        {btcFR}
        {kimchiPct}
        {holdP50}
        {holdP90}
        {frClass}
        {kimchiClass}
      />
    </div>
  {/if}
</div>

<style>
  /* ── Wrapper ──────────────────────────────────────────── */
  .status-bar-wrapper {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-1, #14171c);
    border-top: 1px solid var(--border-subtle, #232830);
    /* Tier-2 slides up: wrapper grows from 32px to 60px */
    transition: height 120ms ease;
  }

  /* ── Tier-1 strip ─────────────────────────────────────── */
  .status-bar {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--sp-2, 8px);
    padding: 0 var(--sp-2, 8px);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--type-xs, 10px);
    color: var(--text-secondary, #9aa3b2);
    letter-spacing: 0.04em;
  }

  /* ── Shared atoms ─────────────────────────────────────── */
  .divider {
    color: var(--border-subtle, #232830);
    flex-shrink: 0;
  }

  .status-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1, 4px);
    white-space: nowrap;
  }

  .status-item strong {
    color: var(--text-primary, #e8ebf0);
  }

  .item-label {
    color: var(--text-tertiary, #5a6172);
  }

  .item-muted {
    color: var(--text-tertiary, #5a6172);
  }

  /* ── F60 gate dot ─────────────────────────────────────── */
  .gate-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .gate-pass { color: var(--accent-pos, #26d07a); }
  .gate-pass.gate-dot { background: var(--accent-pos, #26d07a); }
  .gate-fail { color: var(--accent-neg, #ff5a4f); }
  .gate-fail.gate-dot { background: var(--accent-neg, #ff5a4f); }

  /* ── Freshness ↻ ──────────────────────────────────────── */
  .refresh-icon {
    color: var(--text-tertiary, #5a6172);
    font-size: var(--type-xs, 10px);
  }
  .fresh-good  { color: var(--accent-pos, #26d07a); }
  .fresh-warn  { color: var(--accent-amb, #f5b942); }
  .fresh-stale { color: var(--accent-neg, #ff5a4f); }

  /* ── mini Verdict dot + label ─────────────────────────── */
  .verdict-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
    background: var(--text-tertiary, #5a6172);
  }
  .vd-long  { background: var(--accent-pos, #26d07a); }
  .vd-short { background: var(--accent-neg, #ff5a4f); }
  .vd-wait  { background: var(--accent-amb, #f5b942); }
  .vd-none  { background: var(--text-tertiary, #5a6172); }

  .verdict-label {
    font-size: var(--type-xs, 10px);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-tertiary, #5a6172);
  }
  .vl-long  { color: var(--accent-pos, #26d07a); }
  .vl-short { color: var(--accent-neg, #ff5a4f); }
  .vl-wait  { color: var(--accent-amb, #f5b942); }

  /* ── Drift ────────────────────────────────────────────── */
  .positive { color: var(--accent-pos, #26d07a); }
  .negative { color: var(--accent-neg, #ff5a4f); }

  /* ── Spacer ───────────────────────────────────────────── */
  .spacer {
    flex: 1;
  }

  /* ── Expand button ────────────────────────────────────── */
  .expand-btn {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 2px;
    color: var(--text-tertiary, #5a6172);
    transition: color 80ms, background 80ms;
  }
  .expand-btn:hover,
  .expand-btn.expanded {
    color: var(--text-secondary, #9aa3b2);
    background: var(--surface-2, #1c2026);
  }
  .chevron {
    font-size: var(--ui-text-xs);
    line-height: 1;
  }

  /* ── Time ─────────────────────────────────────────────── */
  .time {
    color: var(--text-secondary, #9aa3b2);
    white-space: nowrap;
  }
</style>
