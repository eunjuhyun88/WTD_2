<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type TradingAccount = {
    id: string;
    account_type: string;
    mode: string;
    strategy_id: string | null;
    initial_balance: number;
    current_equity: number;
    realized_pnl: number;
    unrealized_pnl: number;
    max_loss_limit: number;
    profit_goal: number;
    mll_level: number | null;
    status: string;
    exit_policy: { tp_bps: number; sl_bps: number; ttl_min: number } | null;
  };

  type PatternFire = {
    id: string;
    fired_at: string;
    symbol: string;
    strategy_id: string;
    price: number | null;
    p_win: number | null;
    confidence: string | null;
    status: string;
  };

  type OpenPosition = {
    id: string;
    coin: string;
    side: string;
    qty: number;
    entry_px: number;
    mark_px: number | null;
    unrealized_pnl: number;
    opened_at: string;
  };

  type PanelState = 'idle' | 'loading' | 'ready' | 'error' | 'creating';

  let panelState = $state<PanelState>('idle');
  let account = $state<TradingAccount | null>(null);
  let recentFires = $state<PatternFire[]>([]);
  let openPositions = $state<OpenPosition[]>([]);
  let errorMsg = $state<string | null>(null);

  // Create account form
  let showCreateForm = $state(false);
  let formTpBps = $state(300);
  let formSlBps = $state(150);
  let formTtlMin = $state(120);
  let formStrategyId = $state('');
  let formSymbols = $state('BTC,ETH,SOL');

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    load();
    pollTimer = setInterval(load, 30_000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  async function load() {
    if (panelState === 'creating') return;
    panelState = 'loading';
    errorMsg = null;
    try {
      const res = await fetch('/api/propfirm');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'unknown');
      account = data.account ?? null;
      recentFires = data.recent_fires ?? [];
      openPositions = data.open_positions ?? [];
      panelState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      panelState = 'error';
    }
  }

  async function createAccount() {
    panelState = 'creating';
    errorMsg = null;
    const symbols = formSymbols.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/propfirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_account',
          exit_policy: { tp_bps: formTpBps, sl_bps: formSlBps, ttl_min: formTtlMin },
          strategy_id: formStrategyId || null,
          symbols: symbols.length > 0 ? symbols : null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'unknown');
      showCreateForm = false;
      await load();
    } catch (err) {
      errorMsg = String(err);
      panelState = 'error';
    }
  }

  function pnlClass(val: number): string {
    if (val > 0) return 'pnl-pos';
    if (val < 0) return 'pnl-neg';
    return '';
  }

  function fmtPnl(val: number) {
    return `${val >= 0 ? '+' : ''}$${val.toFixed(2)}`;
  }

  function fmtPct(val: number, base: number) {
    if (base === 0) return '0.00%';
    return `${((val / base) * 100).toFixed(2)}%`;
  }

  function equityPct(acct: TradingAccount) {
    return Math.min(100, Math.max(0, (acct.current_equity / acct.profit_goal + acct.initial_balance) * 100));
  }

  function progressPct(acct: TradingAccount) {
    const target = acct.initial_balance + acct.profit_goal;
    return Math.min(100, Math.max(0, ((acct.current_equity - acct.initial_balance) / acct.profit_goal) * 100));
  }

  function statusColor(status: string) {
    if (status === 'NEW') return '#f5a623';
    if (status === 'CONSUMED') return '#7ed321';
    if (status === 'SKIPPED') return 'rgba(250,247,235,0.3)';
    if (status === 'EXPIRED') return 'rgba(250,247,235,0.2)';
    return 'rgba(250,247,235,0.5)';
  }

  function timeAgo(iso: string) {
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }
</script>

<div class="pattern-run-panel">
  {#if panelState === 'loading' && !account}
    <div class="panel-empty">
      <div class="loader"></div>
      <p>Loading...</p>
    </div>
  {:else if panelState === 'error' && !account}
    <div class="panel-empty">
      <p class="err-txt">{errorMsg}</p>
      <button class="btn-ghost" onclick={load}>Retry</button>
    </div>
  {:else if !account && !showCreateForm}
    <div class="panel-empty">
      <p>No INTERNAL_RUN account found.</p>
      <p class="sub-txt">Automatically simulates pattern entry signals.</p>
      <button class="btn-primary" onclick={() => { showCreateForm = true; }}>Create Account</button>
    </div>
  {:else if showCreateForm}
    <div class="create-form">
      <h3>Create INTERNAL_RUN Account</h3>
      <div class="field">
        <label>TP (bps)</label>
        <input type="number" bind:value={formTpBps} min="50" max="2000" />
        <span class="field-hint">{(formTpBps / 100).toFixed(1)}%</span>
      </div>
      <div class="field">
        <label>SL (bps)</label>
        <input type="number" bind:value={formSlBps} min="25" max="1000" />
        <span class="field-hint">{(formSlBps / 100).toFixed(1)}%</span>
      </div>
      <div class="field">
        <label>TTL (min)</label>
        <input type="number" bind:value={formTtlMin} min="5" max="1440" />
      </div>
      <div class="field">
        <label>Strategy Filter <span class="optional">(optional)</span></label>
        <input type="text" bind:value={formStrategyId} placeholder="wtd.tradoor-oi-reversal-v1" />
      </div>
      <div class="field">
        <label>Symbols</label>
        <input type="text" bind:value={formSymbols} placeholder="BTC,ETH,SOL" />
      </div>
      {#if errorMsg}
        <p class="err-txt">{errorMsg}</p>
      {/if}
      <div class="form-actions">
        <button class="btn-ghost" onclick={() => { showCreateForm = false; errorMsg = null; }}>Cancel</button>
        <button class="btn-primary" onclick={createAccount} disabled={panelState === 'creating'}>
          {panelState === 'creating' ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  {:else if account}
    <!-- Account equity gauge -->
    <div class="equity-card">
      <div class="equity-header">
        <div>
          <span class="label-xs">INTERNAL_RUN</span>
          <div class="equity-value">${account.current_equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div class="equity-badges">
          <span class="badge" class:badge-fail={account.status !== 'ACTIVE'}>{account.status}</span>
        </div>
      </div>

      <!-- Progress bar: current_equity vs profit_goal -->
      <div class="progress-bar-wrap">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: {progressPct(account)}%"></div>
        </div>
        <div class="progress-labels">
          <span>${account.initial_balance.toLocaleString()}</span>
          <span class="goal-label">Target ${(account.initial_balance + account.profit_goal).toLocaleString()}</span>
        </div>
      </div>

      <div class="equity-stats">
        <div class="stat">
          <span class="stat-label">Realized PnL</span>
          <span class="stat-val {pnlClass(account.realized_pnl)}">{fmtPnl(account.realized_pnl)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Unrealized PnL</span>
          <span class="stat-val {pnlClass(account.unrealized_pnl)}">{fmtPnl(account.unrealized_pnl)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">MLL</span>
          <span class="stat-val">${account.mll_level?.toFixed(0) ?? (account.initial_balance - account.max_loss_limit).toFixed(0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Exit Policy</span>
          <span class="stat-val">
            {#if account.exit_policy}
              TP {(account.exit_policy.tp_bps / 100).toFixed(1)}% / SL {(account.exit_policy.sl_bps / 100).toFixed(1)}%
            {:else}
              —
            {/if}
          </span>
        </div>
      </div>
    </div>

    <!-- Open positions -->
    {#if openPositions.length > 0}
      <div class="section">
        <div class="section-head">
          <span class="section-title">Open Positions</span>
          <span class="count-badge">{openPositions.length}</span>
        </div>
        <div class="positions-list">
          {#each openPositions as pos}
            <div class="position-row">
              <div class="pos-left">
                <span class="coin">{pos.coin}</span>
                <span class="side side-{pos.side.toLowerCase()}">{pos.side}</span>
              </div>
              <div class="pos-right">
                <span class="pos-entry">Entry ${pos.entry_px.toFixed(2)}</span>
                <span class="pos-pnl {pnlClass(pos.unrealized_pnl)}">{fmtPnl(pos.unrealized_pnl)}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="section">
        <div class="section-head"><span class="section-title">Open Positions</span></div>
        <p class="empty-txt">None</p>
      </div>
    {/if}

    <!-- Recent pattern fires -->
    <div class="section">
      <div class="section-head">
        <span class="section-title">Recent Pattern Fires</span>
        {#if panelState === 'loading'}
          <div class="mini-loader"></div>
        {/if}
      </div>
      {#if recentFires.length === 0}
        <p class="empty-txt">No fires yet — waiting for pattern scan</p>
      {:else}
        <div class="fires-list">
          {#each recentFires as fire}
            <div class="fire-row">
              <div class="fire-left">
                <span class="fire-symbol">{fire.symbol}</span>
                <span class="fire-strategy">{fire.strategy_id.replace('wtd.', '')}</span>
              </div>
              <div class="fire-right">
                {#if fire.p_win !== null}
                  <span class="fire-pwin">p={fire.p_win.toFixed(2)}</span>
                {/if}
                <span class="fire-status" style="color: {statusColor(fire.status)}">{fire.status}</span>
                <span class="fire-time">{timeAgo(fire.fired_at)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pattern-run-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--sc-font-body);
    height: 100%;
    overflow-y: auto;
  }

  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 16px;
    text-align: center;
    color: rgba(250, 247, 235, 0.62);
    font-size: 0.86rem;
    height: 100%;
  }

  .sub-txt {
    font-size: 0.78rem;
    color: rgba(250, 247, 235, 0.4);
  }

  .err-txt {
    color: #f45b69;
    font-size: 0.82rem;
  }

  .loader {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(250, 247, 235, 0.15);
    border-top-color: rgba(250, 247, 235, 0.7);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .mini-loader {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(250, 247, 235, 0.1);
    border-top-color: rgba(250, 247, 235, 0.5);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Equity card */
  .equity-card {
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .equity-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .label-xs {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: rgba(250, 247, 235, 0.4);
    text-transform: uppercase;
  }

  .equity-value {
    font-size: 1.3rem;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.96);
    letter-spacing: -0.02em;
    margin-top: 2px;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(126, 211, 33, 0.3);
    color: #7ed321;
    background: rgba(126, 211, 33, 0.08);
  }

  .badge.badge-fail {
    border-color: rgba(244, 91, 105, 0.3);
    color: #f45b69;
    background: rgba(244, 91, 105, 0.08);
  }

  .progress-bar-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .progress-bar-track {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, #7ed321, #a8e063);
    transition: width 0.4s ease;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.35);
  }

  .equity-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stat-label {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.4);
  }

  .stat-val {
    font-size: 0.82rem;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.82);
  }

  .pnl-pos { color: #7ed321; }
  .pnl-neg { color: #f45b69; }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-title {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(250, 247, 235, 0.5);
    text-transform: uppercase;
  }

  .count-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(250, 247, 235, 0.08);
    color: rgba(250, 247, 235, 0.5);
  }

  .empty-txt {
    font-size: 0.82rem;
    color: rgba(250, 247, 235, 0.3);
    padding: 4px 0;
  }

  /* Positions */
  .positions-list, .fires-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .position-row, .fire-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .pos-left, .fire-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pos-right, .fire-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .coin, .fire-symbol {
    font-size: 0.84rem;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.9);
  }

  .side {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .side-long {
    background: rgba(126, 211, 33, 0.12);
    color: #7ed321;
    border: 1px solid rgba(126, 211, 33, 0.2);
  }

  .side-short {
    background: rgba(244, 91, 105, 0.12);
    color: #f45b69;
    border: 1px solid rgba(244, 91, 105, 0.2);
  }

  .pos-entry {
    font-size: 0.76rem;
    color: rgba(250, 247, 235, 0.4);
  }

  .pos-pnl {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .fire-strategy {
    font-size: 0.74rem;
    color: rgba(250, 247, 235, 0.4);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fire-pwin {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.5);
  }

  .fire-status {
    font-size: 0.7rem;
    font-weight: 700;
  }

  .fire-time {
    font-size: 0.7rem;
    color: rgba(250, 247, 235, 0.3);
  }

  /* Create form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .create-form h3 {
    font-size: 0.9rem;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.9);
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.5);
  }

  .field input {
    padding: 6px 8px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.9);
    font-family: var(--sc-font-body);
    font-size: 0.84rem;
  }

  .field-hint {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.35);
  }

  .optional {
    font-weight: 400;
    color: rgba(250, 247, 235, 0.35);
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn-primary {
    min-height: 34px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid rgba(219, 154, 159, 0.3);
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.95), rgba(249, 246, 241, 0.92));
    color: #0f0f12;
    font-family: var(--sc-font-body);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-ghost {
    min-height: 34px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.7);
    font-family: var(--sc-font-body);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-ghost:hover { background: rgba(255, 255, 255, 0.06); }
</style>
