<script lang="ts">
  /**
   * JudgeMode — Signal Alerts dashboard.
   * Pending feedback rows shown first.
   * Each row: agree/disagree + single-select reason chip.
   * Tap row → Chart mode replay with pendingAlertId set.
   */

  import { mobileMode } from '$lib/stores/mobileMode';
  import MobileEmptyState from './MobileEmptyState.svelte';

  type AlertStatus = 'pending' | 'agreed' | 'disagreed';
  type AlertReason = 'valid' | 'late' | 'noisy' | 'invalid' | 'almost';

  interface Alert {
    id: string;
    symbol: string;
    tf: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    summary: string;
    timestamp: number;
    status: AlertStatus;
    reason?: AlertReason;
  }

  interface Props {
    alerts?: Alert[];
    loading?: boolean;
    onFeedback?: (id: string, agree: boolean, reason?: AlertReason) => void;
  }

  let { alerts = [], loading = false, onFeedback }: Props = $props();

  const REASON_CHIPS: { id: AlertReason; label: string }[] = [
    { id: 'valid',   label: 'Valid' },
    { id: 'late',    label: 'Late' },
    { id: 'noisy',   label: 'Noisy' },
    { id: 'invalid', label: 'Invalid' },
    { id: 'almost',  label: 'Almost' },
  ];

  // Pending first, then resolved
  const sortedAlerts = $derived(
    [...alerts].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.timestamp - a.timestamp;
    })
  );

  let selectedReasons = $state<Record<string, AlertReason | undefined>>({});

  function goToChartReplay(alert: Alert) {
    mobileMode.setActive('chart', {
      symbol: alert.symbol,
      tf: alert.tf,
      alertId: alert.id,
    });
  }

  function handleAgree(id: string) {
    const reason = selectedReasons[id];
    onFeedback?.(id, true, reason);
  }

  function handleDisagree(id: string) {
    const reason = selectedReasons[id];
    onFeedback?.(id, false, reason);
  }

  function selectReason(id: string, reason: AlertReason) {
    selectedReasons = { ...selectedReasons, [id]: reason };
  }

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const directionColor: Record<string, string> = {
    bullish: 'var(--sc-bias-bull)',
    bearish: 'var(--sc-bias-bear)',
    neutral: 'var(--sc-text-2)',
  };

  const directionLabel: Record<string, string> = {
    bullish: '▲ LONG',
    bearish: '▼ SHORT',
    neutral: '◎ NEUTRAL',
  };
</script>

<div class="judge-mode">
  <div class="section-header">
    <span class="section-title">Signal Alerts</span>
    {#if loading}
      <span class="loading-dot">●</span>
    {/if}
  </div>

  <div class="alerts-list">
    {#if sortedAlerts.length === 0 && !loading}
      <MobileEmptyState
        icon="bell"
        headline="No alerts yet"
        subline="The scanner checks for patterns every 15 minutes."
        primaryCta={{
          label: 'Review patterns',
          onClick: () => mobileMode.setActive('chart'),
        }}
        secondaryCta={{
          label: 'View watchlist',
          onClick: () => mobileMode.setActive('scan'),
        }}
      />
    {:else}
      {#each sortedAlerts as alert (alert.id)}
        <div class="alert-card" class:pending={alert.status === 'pending'}>
          <!-- Row header: symbol + replay button -->
          <button
            class="alert-header"
            onclick={() => goToChartReplay(alert)}
            aria-label="{alert.symbol} chart replay"
          >
            <div class="alert-left">
              <span class="alert-symbol">{alert.symbol.replace('USDT', '')}</span>
              <span class="alert-tf">{alert.tf}</span>
              <span
                class="alert-direction"
                style="color: {directionColor[alert.direction] ?? 'inherit'}"
              >
                {directionLabel[alert.direction] ?? alert.direction}
              </span>
            </div>
            <div class="alert-right">
              <span class="alert-time">{fmtTime(alert.timestamp)}</span>
              <svg class="replay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </button>

          <!-- Summary -->
          <p class="alert-summary">{alert.summary}</p>

          <!-- Reason chips -->
          {#if alert.status === 'pending'}
            <div class="reason-chips">
              {#each REASON_CHIPS as chip}
                <button
                  class="reason-chip"
                  class:selected={selectedReasons[alert.id] === chip.id}
                  onclick={() => selectReason(alert.id, chip.id)}
                >
                  {chip.label}
                </button>
              {/each}
            </div>

            <!-- Agree / Disagree -->
            <div class="feedback-btns">
              <button class="fb-btn agree" onclick={() => handleAgree(alert.id)}>
                Agree
              </button>
              <button class="fb-btn disagree" onclick={() => handleDisagree(alert.id)}>
                Disagree
              </button>
            </div>
          {:else}
            <div class="resolved-badge">
              <span class="resolved-label">
                {alert.status === 'agreed' ? '✓ Agreed' : '✗ Disagreed'}
                {#if alert.reason}
                  · {REASON_CHIPS.find(c => c.id === alert.reason)?.label ?? alert.reason}
                {/if}
              </span>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .judge-mode {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .section-title {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
  }

  .loading-dot {
    font-size: 8px;
    color: #fbbf24;
    animation: pulse 0.8s infinite;
  }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  .alerts-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .alert-card {
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .alert-card.pending {
    border-color: rgba(251, 191, 36, 0.2);
    background: rgba(251, 191, 36, 0.03);
  }

  .alert-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    /* 44pt touch target */
    min-height: 48px;
    transition: background 0.1s;
  }

  .alert-header:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .alert-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alert-symbol {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 800;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
  }

  .alert-tf {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--sc-text-2, rgba(255,255,255,0.5));
  }

  .alert-direction {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .alert-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .alert-time {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }

  .replay-icon {
    width: 14px;
    height: 14px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }

  .alert-summary {
    font-size: 12px;
    line-height: 1.45;
    color: var(--sc-text-1, rgba(247,242,234,0.78));
    margin: 0;
    padding: 0 14px 10px;
  }

  /* Reason chips */
  .reason-chips {
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .reason-chips::-webkit-scrollbar { display: none; }

  .reason-chip {
    flex-shrink: 0;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    min-height: 30px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .reason-chip.selected {
    background: rgba(251, 191, 36, 0.14);
    border-color: rgba(251, 191, 36, 0.3);
    color: #fbbf24;
  }

  /* Feedback buttons */
  .feedback-btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px 14px 12px;
  }

  .fb-btn {
    height: 44px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .fb-btn.agree {
    color: var(--sc-bias-bull);
    border-color: rgba(74, 222, 128, 0.2);
  }

  .fb-btn.agree:active {
    background: rgba(74, 222, 128, 0.1);
  }

  .fb-btn.disagree {
    color: var(--sc-bias-bear);
    border-color: rgba(248, 113, 113, 0.2);
  }

  .fb-btn.disagree:active {
    background: rgba(248, 113, 113, 0.1);
  }

  /* Resolved badge */
  .resolved-badge {
    padding: 8px 14px 12px;
  }

  .resolved-label {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }
</style>
