<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(:root) {
    /* grid zones */
    --zone-left-rail: 180px;
    --zone-right-panel: 320px;
    --zone-right-panel-expanded: 480px;
    --zone-drawing-tool: 40px;
    --zone-top-bar: 48px;
    --zone-news-flash: 28px;
    --zone-tab-bar: 40px;
    --zone-status-bar: 32px;

    /* colors (Bloomberg dark) */
    --c-bg: #0c0a09;
    --c-surface: #141210;
    --c-border: #272320;
    --c-text-primary: #eceae8;
    --c-text-secondary: #9d9690;
    --c-text-dim: #706a62;
    --c-accent: #f5a623;
    --c-accent-blue: #4a90e2;
    --c-pos: #4ade80;
    --c-neg: #f87171;
    --c-amb: #facc15;

    /* spacing */
    --sp-xs: 4px;
    --sp-sm: 8px;
    --sp-md: 12px;
    --sp-lg: 16px;
    --sp-xl: 24px;

    /* radius */
    --r-sm: 3px;
    --r-md: 6px;
    --r-lg: 10px;

    /* font */
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    --font-sans: 'Inter', system-ui, sans-serif;
  }
</style>
