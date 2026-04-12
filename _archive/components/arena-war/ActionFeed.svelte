<!-- ═══════════════════════════════════════════
  ActionFeed.svelte — 실시간 배틀 액션 로그
  포켓몬 배틀 메시지 스타일
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { BattleLogEntry } from '$lib/engine/v2BattleTypes';

  const {
    entries = [],
    maxVisible = 6,
  }: {
    entries: BattleLogEntry[];
    maxVisible?: number;
  } = $props();

  const visibleEntries = $derived(entries.slice(-maxVisible));

  function getEntryStyle(entry: BattleLogEntry): { bg: string; border: string } {
    switch (entry.type) {
      case 'critical':
        return { bg: 'rgba(255, 215, 0, 0.08)', border: '#FFD700' };
      case 'combo':
        return { bg: 'rgba(255, 140, 0, 0.08)', border: '#FF8C00' };
      case 'milestone':
        return { bg: 'rgba(79, 195, 247, 0.08)', border: '#4FC3F7' };
      case 'system':
        return { bg: 'rgba(255, 255, 255, 0.04)', border: 'rgba(255,255,255,0.1)' };
      default:
        return { bg: 'transparent', border: 'transparent' };
    }
  }
</script>

<div class="action-feed">
  <div class="feed-header">
    <span class="feed-title">BATTLE LOG</span>
    <span class="feed-count">{entries.length}</span>
  </div>

  <div class="feed-list">
    {#each visibleEntries as entry, i (entry.timestamp + i)}
      {@const style = getEntryStyle(entry)}
      <div
        class="feed-entry type-{entry.type}"
        style:background={style.bg}
        style:border-left-color={style.border}
      >
        {#if entry.icon}
          <span class="entry-icon">{entry.icon}</span>
        {/if}
        <span class="entry-msg" style:color={entry.color ?? '#b0b0b0'}>
          {entry.message}
        </span>
        <span class="entry-tick">T{entry.tickN}</span>
      </div>
    {/each}

    {#if entries.length === 0}
      <div class="feed-empty">배틀 대기 중...</div>
    {/if}
  </div>
</div>

<style>
  .action-feed {
    width: 100%;
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    overflow: hidden;
  }

  .feed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .feed-title {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
  }

  .feed-count {
    font-size: 8px;
    color: rgba(255,255,255,0.25);
    font-family: 'JetBrains Mono', monospace;
  }

  .feed-list {
    max-height: 160px;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .feed-list::-webkit-scrollbar { display: none; }

  .feed-entry {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-left: 2px solid transparent;
    animation: feed-slide-in 0.25s ease-out;
  }

  .feed-entry.type-critical {
    animation: feed-slide-in 0.25s ease-out, feed-glow-gold 0.5s ease-out;
  }
  .feed-entry.type-combo {
    animation: feed-slide-in 0.25s ease-out, feed-glow-orange 0.4s ease-out;
  }

  .entry-icon {
    font-size: 10px;
    flex-shrink: 0;
  }

  .entry-msg {
    font-size: 9px;
    font-family: 'JetBrains Mono', monospace;
    flex: 1;
    line-height: 1.3;
  }

  .entry-tick {
    font-size: 7px;
    color: rgba(255,255,255,0.2);
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
  }

  .feed-empty {
    padding: 12px;
    text-align: center;
    font-size: 9px;
    color: rgba(255,255,255,0.2);
    font-family: 'JetBrains Mono', monospace;
  }

  @keyframes feed-slide-in {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes feed-glow-gold {
    0% { background: rgba(255, 215, 0, 0.2); }
    100% { background: rgba(255, 215, 0, 0.08); }
  }
  @keyframes feed-glow-orange {
    0% { background: rgba(255, 140, 0, 0.2); }
    100% { background: rgba(255, 140, 0, 0.08); }
  }
</style>
