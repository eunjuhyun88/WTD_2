<script lang="ts">
  // AC3: badge must always exist in the DOM — opacity-only visibility control.
  // NEVER use {#if visible} — this component is always mounted.
  interface Props {
    visible?: boolean;
  }

  let { visible = true }: Props = $props();
</script>

<!-- AC3: always in DOM, opacity controls visibility only (v-if is FORBIDDEN) -->
<div class="ac10-badge" style:opacity={visible ? 1 : 0} aria-hidden={visible ? undefined : 'true'}>
  <span class="ac10-icon">🔒</span>
  <span class="ac10-text">AC10 준수 · 자동매매 비연결</span>
</div>

<style>
  .ac10-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid rgba(245, 166, 35, 0.35);
    border-radius: 12px;
    background: rgba(245, 166, 35, 0.08);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--amb, #f5a623);
    /* transition so opacity fade is smooth */
    transition: opacity 0.2s;
    user-select: none;
    white-space: nowrap;
  }

  .ac10-icon {
    font-size: 11px;
    line-height: 1;
  }

  .ac10-text {
    letter-spacing: 0.01em;
  }
</style>
