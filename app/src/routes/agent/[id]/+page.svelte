<script lang="ts">
  import { AgentHub } from '$lib/hubs/agent';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AgentHub agentStats={data.agentStats} notFound={data.notFound} />
