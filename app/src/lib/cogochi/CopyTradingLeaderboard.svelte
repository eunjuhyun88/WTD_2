<script lang="ts">
  /**
   * CopyTradingLeaderboard — W-0132 Phase 1.
   *
   * Displays top-20 traders ranked by JUDGE score.
   * Subscribe/unsubscribe toggle per trader row.
   * Empty state handled gracefully.
   */
  interface Trader {
    userId: string;
    displayName: string;
    judgeScore: number;
    winCount: number;
    lossCount: number;
    rank: number;
  }

  let traders = $state<Trader[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let subscribing = $state<Record<string, boolean>>({});
  let subscriptions = $state<Record<string, string>>({}); // leaderId → subscriptionId

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/copy-trading/leaderboard?limit=20');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to load');
      traders = data.traders;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  async function subscribe(leaderId: string) {
    subscribing[leaderId] = true;
    try {
      const res = await fetch('/api/copy-trading/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Subscribe failed');
      subscriptions[leaderId] = data.subscriptionId;
    } catch (e) {
      console.error('[CopyTradingLeaderboard] subscribe error', e);
    } finally {
      subscribing[leaderId] = false;
    }
  }

  async function unsubscribe(leaderId: string) {
    const subId = subscriptions[leaderId];
    if (!subId) return;
    subscribing[leaderId] = true;
    try {
      const res = await fetch(`/api/copy-trading/subscribe/${subId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Unsubscribe failed');
      delete subscriptions[leaderId];
    } catch (e) {
      console.error('[CopyTradingLeaderboard] unsubscribe error', e);
    } finally {
      subscribing[leaderId] = false;
    }
  }

  $effect(() => { load(); });
</script>

<div class="leaderboard">
  <div class="leaderboard-header">
    <span class="leaderboard-title">JUDGE Leaderboard</span>
    <button class="refresh-btn" onclick={load} disabled={loading} aria-label="Refresh">
      {loading ? '…' : '↻'}
    </button>
  </div>

  {#if error}
    <div class="leaderboard-empty">
      <span class="empty-icon">⚠</span>
      <span>{error}</span>
    </div>
  {:else if loading}
    <div class="leaderboard-empty">
      <span class="spinner"></span>
      <span>Loading…</span>
    </div>
  {:else if traders.length === 0}
    <div class="leaderboard-empty">
      <span class="empty-icon">📊</span>
      <span>No traders registered yet</span>
    </div>
  {:else}
    <div class="trader-list" role="list">
      {#each traders as trader (trader.userId)}
        {@const isSubscribed = trader.userId in subscriptions}
        {@const isBusy = subscribing[trader.userId] ?? false}
        <div class="trader-row" role="listitem">
          <span class="rank">#{trader.rank}</span>
          <span class="display-name">{trader.displayName}</span>
          <div class="stats">
            <span class="score" title="JUDGE Score">{trader.judgeScore.toFixed(1)}</span>
            <span class="wl">
              <span class="win">{trader.winCount}W</span>
              <span class="sep">/</span>
              <span class="loss">{trader.lossCount}L</span>
            </span>
          </div>
          <button
            class="sub-btn"
            class:subscribed={isSubscribed}
            disabled={isBusy}
            onclick={() => isSubscribed ? unsubscribe(trader.userId) : subscribe(trader.userId)}
          >
            {#if isBusy}
              …
            {:else if isSubscribed}
              Subscribed
            {:else}
              + Subscribe
            {/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .leaderboard {
    display: flex;
    flex-direction: column;
    background: var(--surface-1, #111);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
    overflow: hidden;
    font-size: 12px;
    color: var(--text-primary, #e8e8e8);
  }

  .leaderboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--surface-2, #1a1a1a);
    border-bottom: 1px solid var(--border, #2a2a2a);
  }

  .leaderboard-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-secondary, #888);
    text-transform: uppercase;
  }

  .refresh-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 14px;
    line-height: 1;
  }
  .refresh-btn:hover:not(:disabled) { color: var(--text-primary, #e8e8e8); }
  .refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .leaderboard-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    color: var(--text-secondary, #888);
    justify-content: center;
  }

  .empty-icon { font-size: 16px; }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border, #2a2a2a);
    border-top-color: var(--accent, #3b82f6);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .trader-list {
    display: flex;
    flex-direction: column;
  }

  .trader-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    transition: background 0.1s;
  }
  .trader-row:last-child { border-bottom: none; }
  .trader-row:hover { background: var(--surface-2, #1a1a1a); }

  .rank {
    width: 28px;
    text-align: right;
    font-size: 11px;
    color: var(--text-secondary, #888);
    flex-shrink: 0;
  }

  .display-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .score {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--accent, #3b82f6);
    min-width: 40px;
    text-align: right;
  }

  .wl {
    display: flex;
    gap: 2px;
    font-size: var(--ui-text-xs);
    color: var(--text-secondary, #888);
  }
  .win { color: #4ade80; }
  .loss { color: #f87171; }
  .sep { color: var(--border, #444); }

  .sub-btn {
    flex-shrink: 0;
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid var(--border, #2a2a2a);
    background: transparent;
    color: var(--text-secondary, #888);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .sub-btn:hover:not(:disabled) {
    border-color: var(--accent, #3b82f6);
    color: var(--accent, #3b82f6);
  }
  .sub-btn.subscribed {
    background: var(--accent, #3b82f6);
    border-color: var(--accent, #3b82f6);
    color: #fff;
  }
  .sub-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
