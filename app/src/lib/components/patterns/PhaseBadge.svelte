<script lang="ts">
  import { phaseMetaFor } from '$lib/contracts';

  interface Props {
    phase?: number | null;
    phaseId?: string;
    phaseLabel?: string;
    size?: 'sm' | 'md';
  }
  const { phase = null, phaseId, phaseLabel, size = 'sm' }: Props = $props();
  const meta = $derived(phaseMetaFor(phaseId, phaseLabel, phase ?? null));
</script>

<span class="phase-badge {size}" style="--phase-color:{meta.color}">{meta.label}</span>

<style>
  .phase-badge {
    font-family: var(--sc-font-mono, monospace);
    font-weight: 700;
    color: var(--phase-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .phase-badge.sm { font-size: 10px; }
  .phase-badge.md { font-size: 12px; }
</style>
