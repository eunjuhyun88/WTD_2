<script lang="ts">
  interface FlywheelHealth {
    ok: boolean;
    captures_per_day_7d: number;
    captures_to_outcome_rate: number;
    outcomes_to_verdict_rate: number;
    verdicts_to_refinement_count_7d: number;
    active_models_per_pattern: Record<string, number>;
    promotion_gate_pass_rate_30d: number;
  }

  interface Props {
    flywheelHealth: FlywheelHealth | null;
    lastSyncAt?: string | null;
  }

  const { flywheelHealth, lastSyncAt = null }: Props = $props();

  const modelCount = $derived(
    flywheelHealth
      ? Object.values(flywheelHealth.active_models_per_pattern).reduce((a, b) => a + b, 0)
      : null
  );

  const syncLabel = $derived(
    lastSyncAt
      ? new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : null
  );
</script>

<div class="sys-zone">
  <div class="sys-zone-header">
    <span class="zone-label">시스템 상태</span>
    <span class="sys-dot" class:ok={flywheelHealth?.ok} class:err={flywheelHealth && !flywheelHealth.ok}></span>
  </div>

  <div class="sys-rows">
    <div class="sys-row">
      <span class="sys-icon">●</span>
      <span class="sys-text">scanner</span>
      <span class="sys-val" class:pos={flywheelHealth?.ok}>
        {flywheelHealth?.ok ? 'live' : flywheelHealth ? 'degraded' : '—'}
      </span>
    </div>
    <div class="sys-row">
      <span class="sys-icon">●</span>
      <span class="sys-text">captures / day</span>
      <span class="sys-val">
        {flywheelHealth != null ? flywheelHealth.captures_per_day_7d.toFixed(1) : '—'}
      </span>
    </div>
    <div class="sys-row">
      <span class="sys-icon">●</span>
      <span class="sys-text">활성 모델</span>
      <span class="sys-val">{modelCount ?? '—'}</span>
    </div>
    {#if syncLabel}
      <div class="sys-row">
        <span class="sys-icon">●</span>
        <span class="sys-text">마지막 sync</span>
        <span class="sys-val">{syncLabel}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .sys-zone {
    background: var(--g3);
    border: 1px solid var(--g4);
    border-radius: 4px;
    padding: 10px;
    flex: 1;
    min-width: 0;
  }
  .sys-zone-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .zone-label { font-size: 10px; font-weight: 700; color: var(--g9); text-transform: uppercase; letter-spacing: 0.04em; }
  .sys-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--g5); }
  .sys-dot.ok  { background: var(--pos); }
  .sys-dot.err { background: var(--neg); }

  .sys-rows { display: flex; flex-direction: column; gap: 4px; }
  .sys-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sys-icon { font-size: 7px; color: var(--g7); flex-shrink: 0; }
  .sys-text { font-size: 10px; color: var(--g7); flex: 1; }
  .sys-val  { font-size: 10px; font-weight: 600; color: var(--g9); }
  .pos { color: var(--pos); }
</style>
