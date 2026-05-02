<script lang="ts">
  import { goto } from '$app/navigation';
  import { forkStrategy } from '$lib/stores/strategyStore';
  import type { Strategy } from '$lib/lab/backtest';

  const { post } = $props<{
    post: {
      id: string;
      author: string;
      text: string;
      timestamp: number;
      likes: number;
      forkCount: number;
      strategy: {
        id: string;
        name: string;
        version: number;
        sharpe: number;
        winRate: number;
        maxDD: number;
        cyclesTested: number;
        totalCycles: number;
        conditions: Array<{ factorId: string; operator: string; value: number }>;
        parentId?: string;
        // Full strategy for forking
        fullStrategy?: Strategy;
      };
    };
  }>();

  function timeSince(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function handleFork() {
    if (post.strategy.fullStrategy) {
      const newId = forkStrategy(post.strategy.fullStrategy);
      goto(`/lab`);
    }
  }
</script>

<div class="strategy-card">
  <div class="card-header">
    <span class="author">@{post.author}</span>
    <span class="time">{timeSince(post.timestamp)}</span>
  </div>

  {#if post.text}
    <p class="card-text">{post.text}</p>
  {/if}

  <div class="strat-preview">
    <div class="sp-top">
      <span class="sp-name">{post.strategy.name}</span>
      <span class="sp-ver">v{post.strategy.version}</span>
    </div>

    <div class="sp-stats">
      <div class="sp-stat">
        <span class="sp-stat-label">Sharpe</span>
        <span class="sp-stat-value" class:positive={post.strategy.sharpe >= 1}>{post.strategy.sharpe.toFixed(2)}</span>
      </div>
      <div class="sp-stat">
        <span class="sp-stat-label">Win</span>
        <span class="sp-stat-value" class:positive={post.strategy.winRate >= 55}>{post.strategy.winRate.toFixed(0)}%</span>
      </div>
      <div class="sp-stat">
        <span class="sp-stat-label">MDD</span>
        <span class="sp-stat-value negative">-{post.strategy.maxDD.toFixed(1)}%</span>
      </div>
    </div>

    <div class="sp-conditions">
      {#each post.strategy.conditions.slice(0, 4) as cond}
        <span class="cond-tag">{cond.factorId}</span>
      {/each}
      {#if post.strategy.conditions.length > 4}
        <span class="cond-more">+{post.strategy.conditions.length - 4}</span>
      {/if}
    </div>

    <div class="sp-cycles">
      <div class="sp-progress-bar">
        <div class="sp-progress-fill" style:width="{(post.strategy.cyclesTested / Math.max(post.strategy.totalCycles, 1)) * 100}%"></div>
      </div>
      <span class="sp-progress-text">{post.strategy.cyclesTested}/{post.strategy.totalCycles} cycles</span>
    </div>
  </div>

  <div class="card-footer">
    <div class="card-actions-left">
      <span class="action-stat">🔥 {post.likes}</span>
      <span class="action-stat">🔀 {post.forkCount}</span>
    </div>
    <button class="fork-btn" onclick={handleFork}>
      Test in Lab →
    </button>
  </div>
</div>

<style>
  .strategy-card {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s;
  }

  .strategy-card:hover {
    border-color: var(--lis-border);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .author {
    font-family: var(--sc-font-body);
    font-size: 12px;
    font-weight: 600;
    color: var(--lis-accent);
  }

  .time {
    font-family: var(--sc-font-body);
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.2);
  }

  .card-text {
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: rgba(255 255 255 / 0.65);
    line-height: 1.5;
    margin: 0;
  }

  /* ── Strategy preview ── */
  .strat-preview {
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.05);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sp-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sp-name {
    font-family: var(--sc-font-body);
    font-size: 13px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.9);
  }

  .sp-ver {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: var(--lis-accent);
    background: rgba(var(--lis-rgb-pink), 0.1);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .sp-stats {
    display: flex;
    gap: 16px;
  }

  .sp-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sp-stat-label {
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255 255 255 / 0.3);
  }

  .sp-stat-value {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.8);
  }

  .sp-stat-value.positive { color: var(--lis-positive); }
  .sp-stat-value.negative { color: var(--sc-bad); }

  .sp-conditions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .cond-tag {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    background: rgba(var(--lis-rgb-pink), 0.08);
    color: rgba(255 255 255 / 0.5);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .cond-more {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.25);
  }

  .sp-cycles {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sp-progress-bar {
    flex: 1;
    height: 2px;
    background: rgba(255 255 255 / 0.06);
    border-radius: 1px;
    overflow: hidden;
  }

  .sp-progress-fill {
    height: 100%;
    background: var(--lis-accent);
    border-radius: 1px;
  }

  .sp-progress-text {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.25);
    flex-shrink: 0;
  }

  /* ── Footer ── */
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-actions-left {
    display: flex;
    gap: 12px;
  }

  .action-stat {
    font-size: 11px;
    color: rgba(255 255 255 / 0.3);
  }

  .fork-btn {
    font-family: var(--sc-font-body);
    font-size: 11px;
    font-weight: 500;
    padding: 5px 12px;
    background: rgba(var(--lis-rgb-pink), 0.1);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.2);
    border-radius: 5px;
    color: var(--lis-accent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .fork-btn:hover {
    background: rgba(var(--lis-rgb-pink), 0.2);
    border-color: rgba(var(--lis-rgb-pink), 0.35);
    box-shadow: 0 0 8px rgba(var(--lis-rgb-pink), 0.1);
  }
</style>
