<script lang="ts">
  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    verdicts: number;
    modelDelta: number;
    onSwitchMode: (mode: 'trade' | 'train' | 'flywheel') => void;
    sidebarVisible: boolean;
    lastVerdictKind?: 'LONG' | 'SHORT' | 'WAIT' | null;
    lastUpdatedAt?: number | null;
    scannerSymCount?: number;
    scannerAgeSec?: number;
  }

  const {
    mode, verdicts, modelDelta, onSwitchMode, sidebarVisible,
    lastVerdictKind = null, lastUpdatedAt = null,
    scannerSymCount = 0, scannerAgeSec = 0,
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
  <!-- verdict pill — L1, most prominent element -->
  {#if lastVerdictKind}
    <span
      class="verdict-pill"
      class:vp-long={lastVerdictKind === 'LONG'}
      class:vp-short={lastVerdictKind === 'SHORT'}
      class:vp-wait={lastVerdictKind === 'WAIT'}
      title="AI verdict"
    >
      {lastVerdictKind === 'LONG' ? '▲' : lastVerdictKind === 'SHORT' ? '▼' : '—'}
      {lastVerdictKind}
    </span>
    <span class="divider">│</span>
  {/if}

  <span class="status-item">
    <span class="dot"></span>
    scanner
    {#if scannerSymCount > 0}
      · {scannerSymCount} sym
    {/if}
    {#if scannerAgeSec > 0}
      · {scannerAgeSec}s
    {:else}
      · live
    {/if}
  </span>

  <span class="divider">│</span>
  <span class="status-item" title="누적 판단 (AGREE/DISAGREE) 수">
    verdicts <strong>{verdicts}</strong>
  </span>

  <span class="divider">│</span>
  <span class="status-item" title="모델 예측 대비 실제 수익 편차">
    drift <strong class:positive={modelDelta >= 0} class:negative={modelDelta < 0}>
      {modelDelta >= 0 ? '+' : ''}{modelDelta.toFixed(3)}
    </strong>
  </span>


  {#if freshnessSec !== null}
    <span class="divider">│</span>
    <span class="status-item" title="최근 데이터 갱신 경과 시간">
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
    gap: 10px;
    padding: 0 10px;
    background: var(--g1);
    border-top: 1px solid var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
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

  /* verdict pill — L1, 14px bold */
  .verdict-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
    border-radius: 3px;
    border: 1px solid var(--g4);
    background: var(--g2);
    color: var(--g8);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .verdict-pill.vp-long  { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 40%, transparent); background: color-mix(in srgb, var(--pos) 8%, transparent); }
  .verdict-pill.vp-short { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 40%, transparent); background: color-mix(in srgb, var(--neg) 8%, transparent); }
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
