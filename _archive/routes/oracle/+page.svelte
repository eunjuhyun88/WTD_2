<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    void goto('/signals?view=oracle', {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
      invalidateAll: false
    });
  });
</script>

<div class="oracle-redirect">
  <p>Redirecting to Community Oracle leaderboard...</p>
  <a href="/signals?view=oracle">Open now</a>
</div>

<style>
  .oracle-redirect {
    min-height: calc(100vh - 42px);
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    background: #0a0f1a;
    color: #d6deff;
    font-family: var(--fm, 'IBM Plex Mono', monospace);
  }

  .oracle-redirect a {
    color: #86d1ff;
    text-decoration: none;
    font-weight: 700;
  }
</style>
