<!-- ═══════════════════════════════════════════
  PokemonFrame.svelte — Double-border panel
  Pokemon-style frame with 3px outer + 1px inner border
═══════════════════════════════════════════ -->
<script lang="ts">
  const { variant = 'default', padding = '8px' }: {
    variant?: 'default' | 'dark' | 'accent';
    padding?: string;
  } = $props();
</script>

<div class="poke-frame {variant}" style:padding={padding}>
  <div class="poke-inner">
    <slot />
  </div>
</div>

<style>
  .poke-frame {
    border: 3px solid #3a3a5c;
    border-radius: 8px;
    background: #1a1a2e;
    position: relative;
  }
  .poke-frame.dark {
    border-color: #2a2a44;
    background: #0e0e1a;
  }
  .poke-frame.accent {
    border-color: #e8967d;
    background: #1a1520;
  }
  .poke-inner {
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    height: 100%;
  }
  /* Highlight corners — subtle bevel effect */
  .poke-frame::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 6px;
    border-top: 1px solid rgba(255,255,255,0.08);
    border-left: 1px solid rgba(255,255,255,0.05);
    pointer-events: none;
  }
</style>
