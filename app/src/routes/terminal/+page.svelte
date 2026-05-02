<script lang="ts">
  import { buildCanonicalHref } from '$lib/seo/site';
  import { TerminalHub } from '$lib/hubs/terminal';
</script>

<svelte:head>
  <title>Terminal — WTD</title>
  <meta
    name="description"
    content="Live crypto terminal — analyze structure, flow, and evidence before you act."
  />
  <link rel="canonical" href={buildCanonicalHref('/terminal')} />
</svelte:head>

<TerminalHub />
