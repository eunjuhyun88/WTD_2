<script lang="ts">
  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
  }

  const { mode }: Props = $props();
</script>

<div class="radial-topology">
  <div class="header">
    <span>FLYWHEEL · Signal Topology</span>
  </div>
  <div class="content">
    <svg class="flywheel" viewBox="0 0 400 400">
      <circle cx="200" cy="200" r="150" fill="none" stroke="var(--g3)" stroke-width="1" />
      <circle cx="200" cy="200" r="100" fill="none" stroke="var(--g3)" stroke-width="0.5" opacity="0.5" />

      <!-- Center circle -->
      <circle cx="200" cy="200" r="30" fill="var(--pos-d)" stroke="var(--pos)" stroke-width="1" />
      <text x="200" y="205" text-anchor="middle" font-size="12" fill="var(--pos)" font-family="JetBrains Mono">◉</text>

      <!-- Orbiting nodes -->
      {#each Array(6) as _, i}
        {@const angle = (i / 6) * Math.PI * 2}
        {@const x = 200 + Math.cos(angle) * 120}
        {@const y = 200 + Math.sin(angle) * 120}
        <circle cx={x} cy={y} r="20" fill="var(--g3)" stroke="var(--g4)" stroke-width="0.5" />
        <text x={x} y={y + 4} text-anchor="middle" font-size="10" fill="var(--g6)" font-family="JetBrains Mono">
          S{i + 1}
        </text>
        <!-- Line to center -->
        <line x1="200" y1="200" x2={x} y2={y} stroke="var(--g4)" stroke-width="0.5" opacity="0.5" />
      {/each}
    </svg>
  </div>
</div>

<style>
  .radial-topology {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--g0);
    overflow: hidden;
  }

  .header {
    padding: 12px;
    background: var(--g1);
    border-bottom: 0.5px solid var(--g3);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g6);
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    overflow: auto;
  }

  .flywheel {
    width: 100%;
    height: 100%;
    max-width: 400px;
    max-height: 400px;
  }
</style>
