<!--
  NewsFlashBar.svelte  (W-0210 Layer 4)

  Scrolling ticker-style news headlines for the active symbol.
  Sits between AlphaMarketBar and the chart area.
  Auto-hides when there are no events.
-->
<script lang="ts">
  import { newsStore } from '$lib/stores/newsStore';

  interface Props {
    symbol?: string;
    maxItems?: number;
  }

  let { symbol = 'BTCUSDT', maxItems = 5 }: Props = $props();

  // Fetch news when symbol changes
  $effect(() => {
    void symbol;
    newsStore.fetchNews(symbol);
  });

  const events = $derived($newsStore.events.slice(0, maxItems));

  function elapsed(ts: number): string {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  function sentimentClass(s: string): string {
    if (s === 'positive') return 'pos';
    if (s === 'negative') return 'neg';
    return 'neu';
  }
</script>

{#if events.length > 0}
  <div class="news-bar" role="marquee" aria-label="Latest news">
    <span class="news-label">NEWS</span>
    <div class="news-track">
      {#each events as ev (ev.id)}
        <a
          class="news-item news-item--{sentimentClass(ev.sentiment)}"
          href={ev.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          title={ev.title}
        >
          <span class="news-dot"></span>
          <span class="news-title">{ev.title.length > 60 ? ev.title.slice(0, 60) + '…' : ev.title}</span>
          <span class="news-age">{elapsed(ev.publishedAt)}</span>
        </a>
      {/each}
    </div>
  </div>
{/if}

<style>
  .news-bar {
    display: flex;
    align-items: center;
    height: 22px;
    background: rgba(255,255,255,0.012);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    overflow: hidden;
    flex-shrink: 0;
  }

  .news-label {
    flex-shrink: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.22);
    padding: 0 8px;
    border-right: 1px solid rgba(255,255,255,0.06);
    height: 100%;
    display: flex;
    align-items: center;
  }

  .news-track {
    display: flex;
    align-items: center;
    gap: 0;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
    height: 100%;
  }
  .news-track::-webkit-scrollbar { display: none; }

  .news-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    height: 100%;
    text-decoration: none;
    border-right: 1px solid rgba(255,255,255,0.04);
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.08s;
    cursor: pointer;
  }
  .news-item:hover { background: rgba(255,255,255,0.04); }

  .news-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .news-item--pos .news-dot { background: #22ab94; }
  .news-item--neg .news-dot { background: #f23645; }
  .news-item--neu .news-dot { background: rgba(255,199,80,0.55); }

  .news-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(209,212,220,0.58);
    letter-spacing: 0.01em;
  }
  .news-item:hover .news-title { color: rgba(209,212,220,0.85); }

  .news-age {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.22);
    flex-shrink: 0;
  }

  .news-item--neg .news-title { color: rgba(242,54,69,0.72); }
  .news-item--pos .news-title { color: rgba(34,171,148,0.72); }
  .news-item--neg:hover .news-title { color: #f23645; }
  .news-item--pos:hover .news-title { color: #22ab94; }
</style>
