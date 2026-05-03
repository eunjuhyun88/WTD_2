<script lang="ts">
  import { buildCanonicalHref } from '$lib/seo/site';
  import { SettingsHub } from '$lib/hubs/settings';
</script>

<svelte:head>
  <title>Settings — Cogochi</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href={buildCanonicalHref('/settings')} />
</svelte:head>

<SettingsHub />
