<script lang="ts">
  import type { AgentMood } from '$lib/stores/agentData';

  const { mood }: { mood: AgentMood } = $props();

  const MOOD_MAP: Record<AgentMood, { emoji: string; label: string; cssClass: string }> = {
    focused: { emoji: '\uD83D\uDE24', label: 'Focused', cssClass: 'mood-focused' },
    hungry:  { emoji: '\uD83D\uDE14', label: 'Hungry',  cssClass: 'mood-hungry' },
    sharp:   { emoji: '\u26A1',       label: 'Sharp',   cssClass: 'mood-sharp' },
    tired:   { emoji: '\uD83D\uDE34', label: 'Tired',   cssClass: 'mood-tired' },
  };

  const info = $derived(MOOD_MAP[mood] ?? MOOD_MAP.focused);
</script>

<span class="mood-badge {info.cssClass}">
  <span class="mood-emoji">{info.emoji}</span>
  <span class="mood-label">{info.label}</span>
</span>

<style>
  .mood-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--sc-radius-pill);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 600;
    letter-spacing: 0.5px;
    white-space: nowrap;
    transition: background var(--sc-duration-fast) var(--sc-ease);
  }

  .mood-emoji {
    font-size: 11px;
    line-height: 1;
  }

  .mood-focused {
    background: rgba(var(--lis-rgb-lime), 0.12);
    color: var(--lis-positive);
    border: 1px solid rgba(var(--lis-rgb-lime), 0.2);
  }

  .mood-hungry {
    background: rgba(var(--lis-rgb-cream), 0.12);
    color: var(--lis-highlight);
    border: 1px solid rgba(var(--lis-rgb-cream), 0.2);
  }

  .mood-sharp {
    background: rgba(96, 160, 240, 0.12);
    color: #78b8ff;
    border: 1px solid rgba(96, 160, 240, 0.2);
  }

  .mood-tired {
    background: rgba(247, 242, 234, 0.06);
    color: var(--sc-text-3);
    border: 1px solid rgba(247, 242, 234, 0.08);
  }

  @media (prefers-reduced-motion: reduce) {
    .mood-badge { transition: none; }
  }
</style>
