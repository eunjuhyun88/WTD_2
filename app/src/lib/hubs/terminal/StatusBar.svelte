<script lang="ts">
  interface Props {
    verdicts: number;
    modelDelta: number;
    sidebarVisible: boolean;
    /** D-10: latest verdict label, e.g. "LONG" / "SHORT" / "WAIT" / null. */
    lastVerdictKind?: 'LONG' | 'SHORT' | 'WAIT' | null;
    /** D-10: epoch ms of latest data tick (chart price). null = unknown. */
    lastUpdatedAt?: number | null;
  }

  const {
    verdicts, modelDelta, sidebarVisible,
    lastVerdictKind = null, lastUpdatedAt = null,
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

  <span class="shortcuts">
    <span class="status-item">⌘B <span class="divider">·</span> sidebar</span>
    <span class="divider">│</span>
    <span class="status-item">⌘K <span class="divider">·</span> prompt</span>
    <span class="divider">│</span>
    <span class="status-item">⌘T <span class="divider">·</span> new tab</span>
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
    padding: 1px 5px;
    margin-left: 3px;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    border-radius: 2px;
    border: 0.5px solid var(--g4);
    background: var(--g2);
    color: var(--g8);
  }
  .verdict-pill.vp-long  { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 40%, transparent); }
  .verdict-pill.vp-short { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 40%, transparent); }
  .verdict-pill.vp-wait  { color: var(--amb, #d6a347); border-color: color-mix(in srgb, var(--amb, #d6a347) 40%, transparent); }

  .fresh-good  { color: var(--pos); }
  .fresh-warn  { color: var(--amb, #d6a347); }
  .fresh-stale { color: var(--neg); }

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
