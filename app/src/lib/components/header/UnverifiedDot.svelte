<script lang="ts">
  interface Props { count: number }
  const { count }: Props = $props();
</script>

{#if count >= 10}
  <span class="unverified-dot" aria-label="검증 대기 {count}건"></span>
{/if}

<style>
  .unverified-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--neg);
  }
</style>
