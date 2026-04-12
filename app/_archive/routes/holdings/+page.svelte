<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  // Holdings merged into Passport — redirect
  onMount(() => { goto('/passport', { replaceState: true }); });
</script>

<div style="display:flex;align-items:center;justify-content:center;height:60vh;font-family:var(--fm);color:#888;font-size:12px;letter-spacing:2px;">
  REDIRECTING TO PASSPORT...
</div>
