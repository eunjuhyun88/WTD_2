<script lang="ts">
  /**
   * ModeRouter — reads mobileMode and renders one of the 4 mode components.
   * Passed props are forwarded to the active mode component.
   */

  import { mobileMode } from '$lib/stores/mobileMode';
  import ChartMode from './ChartMode.svelte';
  import DetailMode from './DetailMode.svelte';
  import ScanMode from './ScanMode.svelte';
  import JudgeMode from './JudgeMode.svelte';
  import type { TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  interface MarketRow {
    symbol: string;
    base: string;
    price: number;
    changePct: number;
    volume24h?: number;
    bias?: 'bullish' | 'bearish' | 'neutral';
  }

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
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    captureId?: string | null;
    marketRows?: MarketRow[];
    alerts?: Alert[];
    marketLoading?: boolean;
    alertsLoading?: boolean;
    onMarketRefresh?: () => void;
    onAlertFeedback?: (id: string, agree: boolean, reason?: AlertReason) => void;
  }

  let {
    verdict = null,
    evidence = [],
    captureId = null,
    marketRows = [],
    alerts = [],
    marketLoading = false,
    alertsLoading = false,
    onMarketRefresh,
    onAlertFeedback,
  }: Props = $props();
</script>

<div class="mode-router">
  {#if $mobileMode.active === 'chart'}
    <ChartMode />
  {:else if $mobileMode.active === 'detail'}
    <DetailMode {verdict} {evidence} {captureId} />
  {:else if $mobileMode.active === 'scan'}
    <ScanMode rows={marketRows} loading={marketLoading} onRefresh={onMarketRefresh} />
  {:else if $mobileMode.active === 'judge'}
    <JudgeMode {alerts} loading={alertsLoading} onFeedback={onAlertFeedback} />
  {/if}
</div>

<style>
  .mode-router {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
