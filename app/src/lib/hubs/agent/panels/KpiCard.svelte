<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    delta?: string;
    mono?: boolean;
  }

  const { label, value, delta, mono = false }: Props = $props();
</script>

<div class="kpi-card">
  <span class="kpi-value" class:kpi-value--mono={mono}>{value}</span>
  {#if delta}
    <span class="kpi-delta">{delta}</span>
  {/if}
  <span class="kpi-label">{label}</span>
</div>

<style>
  .kpi-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 20px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.02);
  }

  .kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .kpi-value--mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .kpi-delta {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255, 255, 255, 0.35);
    font-family: 'JetBrains Mono', monospace;
  }

  .kpi-label {
    font-size: var(--ui-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.3);
    margin-top: 4px;
  }
</style>
