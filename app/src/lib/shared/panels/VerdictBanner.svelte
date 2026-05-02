<!-- ═══════════════════════════════════════════════════════════════
     WTD — Verdict Banner
     차트 상단에 최신 스캔 판정을 표시하는 배너
═══════════════════════════════════════════════════════════════ -->
<script lang="ts">
  import DirectionBadge from './DirectionBadge.svelte';

  interface VerdictData {
    pair: string;
    timeframe: string;
    consensus: 'long' | 'short' | 'neutral';
    avgConfidence: number;
    summary: string;
    highlights: Array<{ agent: string; vote: string; conf: number; note: string }>;
    createdAt: number;
  }

  const { verdict, scanning = false }: { verdict: VerdictData | null; scanning?: boolean } = $props();

  let expanded = $state(false);
  let justArrived = $state(false);

  const agreeCount = $derived(
    verdict?.highlights
      ? verdict.highlights.filter(h => h.vote === verdict.consensus).length
      : 0
  );
  const totalCount = $derived(verdict?.highlights?.length ?? 0);

  // Auto-expand + glow on new scan result
  $effect(() => {
    if (verdict) {
      justArrived = true;
      expanded = true;
      const t = setTimeout(() => { justArrived = false; }, 2500);
      const t2 = setTimeout(() => { expanded = false; }, 6000);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  });

  function timeSinceShort(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }
</script>

{#if scanning}
  <div class="verdict-banner verdict-loading">
    <span class="verdict-pulse"></span>
    <span class="verdict-label">SCANNING — analyzing market data</span>
  </div>
{:else if verdict}
  <button
    type="button"
    class="verdict-banner"
    class:expanded
    class:just-arrived={justArrived}
    onclick={() => expanded = !expanded}
  >
    <div class="verdict-row">
      <DirectionBadge
        direction={verdict.consensus}
        confidence={verdict.avgConfidence}
        showConfidence
        size="sm"
        variant="soft"
      />
      <span class="verdict-pair">{verdict.pair}</span>
      <span class="verdict-sep">·</span>
      <span class="verdict-meta">{verdict.timeframe.toUpperCase()} · {agreeCount}/{totalCount} agree</span>
      <span class="verdict-time">{timeSinceShort(verdict.createdAt)}</span>
      <span class="verdict-chevron">{expanded ? '▾' : '▸'}</span>
    </div>
    {#if expanded}
      <div class="verdict-detail">
        <p class="verdict-summary">{verdict.summary}</p>
        <div class="verdict-agents">
          {#each verdict.highlights as h}
            <div class="verdict-agent">
              <span class="va-name">{h.agent}</span>
              <DirectionBadge direction={h.vote as 'long' | 'short' | 'neutral'} confidence={h.conf} showConfidence size="xs" />
              <span class="va-note">{h.note}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </button>
{/if}

<style>
  .verdict-banner {
    font-family: var(--fm, 'JetBrains Mono', monospace);
    background: rgba(10, 9, 8, 0.92);
    border: none;
    border-bottom: 1px solid rgba(232, 150, 125, 0.15);
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    width: 100%;
    text-align: left;
    color: inherit;
    transition: background 0.15s, box-shadow 0.3s;
    z-index: 5;
    flex-shrink: 0;
  }
  .verdict-banner:hover {
    background: rgba(10, 9, 8, 0.98);
  }
  .verdict-banner.just-arrived {
    animation: verdictGlow 2.5s ease-out;
  }
  @keyframes verdictGlow {
    0% { box-shadow: inset 0 0 20px rgba(232,150,125,.25), 0 0 12px rgba(232,150,125,.15); }
    100% { box-shadow: none; }
  }
  .verdict-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: default;
  }
  .verdict-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #E8967D;
    animation: vpulse 1s ease infinite;
  }
  @keyframes vpulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.7); }
  }
  .verdict-label {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(240, 237, 228, 0.5);
    text-transform: uppercase;
  }
  .verdict-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .verdict-pair {
    font-size: var(--ui-text-xs);
    font-weight: 900;
    color: #F0EDE4;
    letter-spacing: .5px;
  }
  .verdict-sep {
    font-size: var(--ui-text-xs);
    color: rgba(240,237,228,.2);
  }
  .verdict-meta {
    font-size: var(--ui-text-xs);
    color: rgba(240, 237, 228, 0.4);
    letter-spacing: 0.5px;
  }
  .verdict-time {
    font-size: var(--ui-text-xs);
    color: rgba(240, 237, 228, 0.25);
    margin-left: auto;
  }
  .verdict-chevron {
    font-size: var(--ui-text-xs);
    color: rgba(240, 237, 228, 0.25);
  }
  /* Expanded detail */
  .verdict-detail {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(232, 150, 125, 0.08);
  }
  .verdict-summary {
    font-size: var(--ui-text-xs);
    color: rgba(240, 237, 228, 0.6);
    line-height: 1.5;
    margin: 0 0 6px;
  }
  .verdict-agents {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .verdict-agent {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--ui-text-xs);
  }
  .va-name {
    color: rgba(240, 237, 228, 0.4);
    min-width: 68px;
    text-transform: uppercase;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .va-note {
    color: rgba(240, 237, 228, 0.35);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
