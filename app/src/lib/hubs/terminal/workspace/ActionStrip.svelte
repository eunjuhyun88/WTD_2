<script lang="ts">
  interface Props { action: string; invalidation?: string; avoid?: string }
  let { action, invalidation, avoid }: Props = $props();
</script>

<div class="action-strip">
  {#if action}
    <span class="action-tag primary">{action}</span>
  {/if}
  {#if avoid}
    <span class="action-tag avoid">Avoid: {avoid}</span>
  {/if}
  {#if invalidation}
    <span class="action-tag invalid">Invalidation: {invalidation}</span>
  {/if}
</div>

<style>
  .action-strip { display: flex; flex-wrap: wrap; gap: 6px; }
  .action-tag {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); padding: 3px 10px;
    border-radius: 3px; border: 1px solid;
  }
  .primary { border-color: #4ade80; color: #4ade80; background: rgba(74,222,128,0.06); }
  .avoid { border-color: #f87171; color: #f87171; background: rgba(248,113,113,0.06); }
  .invalid { border-color: #fbbf24; color: #fbbf24; background: rgba(251,191,36,0.06); }
</style>
