<script lang="ts">
  import type { HudPatternStatus } from '$lib/components/terminal/hud/types';

  export let data: HudPatternStatus;

  const PHASE_COLORS: Record<string, string> = {
    ACCUMULATION: '#fbbf24',
    MARKUP: '#26a69a',
    DISTRIBUTION: '#fb923c',
    MARKDOWN: '#ef5350',
  };

  const STATE_COLORS: Record<string, string> = {
    WATCHING: '#60a5fa',
    ACTIVE: '#26a69a',
    IDLE: 'rgba(255,255,255,0.35)',
    DONE: 'rgba(255,255,255,0.2)',
  };

  function relativeTime(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60_000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    } catch {
      return '';
    }
  }

  $: phaseColor = PHASE_COLORS[data.phase] ?? 'rgba(255,255,255,0.5)';
  $: stateColor = STATE_COLORS[data.state] ?? 'rgba(255,255,255,0.35)';
</script>

<div class="hud-card pattern-status-card">
  <div class="card-label">PATTERN STATUS</div>

  <div class="pattern-name">{data.pattern_name}</div>

  <div class="badges">
    <span class="badge" style="color:{phaseColor}; border-color:{phaseColor}33">
      {data.phase}
    </span>
    <span class="badge" style="color:{stateColor}; border-color:{stateColor}33">
      {data.state}
    </span>
  </div>

  <div class="updated">Updated {relativeTime(data.last_updated)}</div>
</div>

<style>
  .hud-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
  }

  .card-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.25);
    text-transform: uppercase;
  }

  .pattern-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.04em;
  }

  .badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    border: 1px solid;
    border-radius: 4px;
  }

  .updated {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.2);
    margin-top: 2px;
  }
</style>
