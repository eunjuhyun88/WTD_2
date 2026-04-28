<script lang="ts">
  interface Props {
    phase: number;
    phaseId?: string;
    size?: 'sm' | 'md';
  }
  const { phase, phaseId, size = 'sm' }: Props = $props();

  const PHASE_META: Record<number, { label: string; color: string }> = {
    0: { label: 'FAKE DUMP',    color: 'rgba(251,191,36,0.7)' },
    1: { label: 'ARCH ZONE',    color: 'rgba(99,179,237,0.7)' },
    2: { label: 'REAL DUMP',    color: 'rgba(239,83,80,0.8)' },
    3: { label: 'ACCUMULATION', color: 'rgba(38,166,154,1)' },
    4: { label: 'BREAKOUT',     color: 'rgba(74,222,128,1)' },
  };

  const meta = $derived(PHASE_META[phase] ?? { label: phaseId ?? String(phase), color: 'rgba(255,255,255,0.4)' });
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
