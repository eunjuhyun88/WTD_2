<script lang="ts">
  interface Props {
    verdictCount: number;
    accuracy: number;
    gatePass: boolean;
    minVerdicts?: number;
    minAccuracy?: number;
  }

  let {
    verdictCount,
    accuracy,
    gatePass,
    minVerdicts = 200,
    minAccuracy = 0.55,
  }: Props = $props();

  const verdictPct = $derived(Math.min((verdictCount / minVerdicts) * 100, 100));
  const accuracyPct = $derived(Math.min((accuracy / minAccuracy) * 100, 100));
  const accuracyDisplay = $derived((accuracy * 100).toFixed(1));
</script>

<div class="f60-gate-bar" class:pass={gatePass} class:pending={!gatePass}>
  <div class="gate-status">
    <span class="label">F-60 Gate</span>
    <span class="badge" class:pass={gatePass}>{gatePass ? 'PASS' : 'PENDING'}</span>
  </div>

  <div class="progress-row">
    <span class="metric-label">Verdicts</span>
    <div class="progress-bar" role="progressbar" aria-valuenow={verdictCount} aria-valuemin={0} aria-valuemax={minVerdicts}>
      <div class="progress-fill" style="width: {verdictPct}%"></div>
    </div>
    <span class="metric-value">{verdictCount}/{minVerdicts}</span>
  </div>

  <div class="progress-row">
    <span class="metric-label">Accuracy</span>
    <div class="progress-bar accuracy-bar" role="progressbar" aria-valuenow={accuracy} aria-valuemin={0} aria-valuemax={minAccuracy}>
      <div class="progress-fill accuracy" style="width: {accuracyPct}%"></div>
    </div>
    <span class="metric-value">{accuracyDisplay}%</span>
  </div>
</div>

<style>
  .f60-gate-bar {
    padding: 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border, #333);
    background: var(--surface, #1a1a1a);
  }

  .gate-status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .label {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    font-weight: 500;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--warning, #f59e0b);
    color: #000;
  }

  .badge.pass {
    background: var(--success, #22c55e);
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }

  .metric-label {
    font-size: 0.7rem;
    color: var(--text-muted, #888);
    width: 60px;
    flex-shrink: 0;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--surface-2, #2a2a2a);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent, #6366f1);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-fill.accuracy {
    background: var(--success, #22c55e);
  }

  .metric-value {
    font-size: 0.7rem;
    color: var(--text, #e0e0e0);
    width: 60px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
