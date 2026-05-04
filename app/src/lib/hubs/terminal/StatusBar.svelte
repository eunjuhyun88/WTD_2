<script lang="ts">
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
</script>

<div class="status-bar">
  <span class="status-item">
    <span class="dot"></span>
    scanner live · 300 sym · 14s
  </span>

  <span class="divider">│</span>
  <span class="status-item" title="Cumulative verdict count (AGREE/DISAGREE)">
    verdicts <strong>{verdicts}</strong>
  </span>

  {#if btcFR !== null}
    <span class="divider">│</span>
    <span class="status-item" title="BTC funding rate">
      BTC FR <strong class={frClass}>{btcFR > 0 ? '+' : ''}{(btcFR * 100).toFixed(3)}%</strong>
    </span>
  {/if}

  {#if kimchiPct !== null}
    <span class="divider">│</span>
    <span class="status-item kimchi-sb" title="Kimchi Premium (Upbit/Binance BTC spread)">
      Kim <strong class={kimchiClass}>{kimchiPct > 0 ? '+' : ''}{kimchiPct.toFixed(2)}%</strong>
    </span>
  {/if}

  <span class="divider">│</span>
  <span class="status-item" title="Actual profit deviation vs. model prediction">
    drift <strong class:positive={modelDelta >= 0} class:negative={modelDelta < 0}>
      {modelDelta >= 0 ? '+' : ''}{modelDelta.toFixed(3)}
    </strong>
  </span>

  {#if lastVerdictKind}
    <span class="divider">│</span>
    <span class="status-item" title="Latest verdict (LONG/SHORT/WAIT)">
      verdict
      <span
        class="verdict-pill"
        class:vp-long={lastVerdictKind === 'LONG'}
        class:vp-short={lastVerdictKind === 'SHORT'}
        class:vp-wait={lastVerdictKind === 'WAIT'}
      >{lastVerdictKind}</span>
    </span>
  {/if}

  {#if freshnessSec !== null}
    <span class="divider">│</span>
    <span class="status-item" title="Time since last data refresh">
      fresh <strong class={freshnessClass}>{freshnessSec}s</strong>
    </span>
  {/if}

  <span class="spacer"></span>

  <span class="divider">│</span>
  <span class="status-item hold-time-item" data-testid="hold-time-strip">
    <HoldTimeStrip p50={holdP50} p90={holdP90} label="hold" />
  </span>

  <span class="shortcuts">
    <span class="status-item">⌘[ <span class="divider">·</span> watch</span>
    <span class="divider">│</span>
    <span class="status-item">⌘] <span class="divider">·</span> ai</span>
    <span class="divider">│</span>
    <span class="status-item">⌘\ <span class="divider">·</span> wide</span>
    <span class="divider">│</span>
    <span class="status-item">⌘0 <span class="divider">·</span> reset</span>
    <span class="divider">│</span>
    <span class="status-item">⌘K <span class="divider">·</span> cmd</span>
    <span class="divider">│</span>
  </span>
  <span class="time">{currentTime}</span>
</div>

<style>
  .status-bar {
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px;
    background: var(--g1);
    border-top: 1px solid var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    letter-spacing: 0.04em;
  }

  .divider {
    color: var(--g4);
    margin: 0 3px;
  }

  .status-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .status-item strong {
    color: var(--g8);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pos);
    display: inline-block;
  }

  .positive {
    color: var(--pos);
  }

  .negative {
    color: var(--neg);
  }

  /* D-10 verdict pill + freshness */
  .verdict-pill {
    display: inline-block;
    padding: 1px 6px;
    margin-left: 3px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    border-radius: 2px;
    border: 0.5px solid var(--g4);
    background: var(--g2);
    color: var(--amb, #f5a623);
  }
  .verdict-pill.vp-long  { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 40%, transparent); }
  .verdict-pill.vp-short { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 40%, transparent); }
  .verdict-pill.vp-wait  { color: var(--amb, #d6a347); border-color: color-mix(in srgb, var(--amb, #d6a347) 40%, transparent); }

  .fresh-good  { color: var(--pos); }
  .fresh-warn  { color: var(--amb, #d6a347); }
  .fresh-stale { color: var(--neg); }

  .fr-long  { color: var(--amb, #d6a347); }
  .fr-short { color: #38bdf8; }
  .kim-hot  { color: var(--amb, #d6a347); }
  .kim-cold { color: #38bdf8; }

  @media (max-width: 1279px) { .kimchi-sb { display: none; } }

  .spacer {
    flex: 1;
  }

  .time {
    color: var(--g7);
  }

  .shortcuts {
    display: contents;
  }

  @media (max-width: 1279px) {
    .shortcuts {
      display: none;
    }
  }
</style>
