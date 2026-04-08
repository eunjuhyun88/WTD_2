<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { AGDEFS } from '$lib/data/agents';
  import { agentStats, type AgentStats } from '$lib/stores/agentData';
  import { buildLabLink } from '$lib/utils/deepLinks';
  import AgentCard from '../../components/agent/AgentCard.svelte';

  const allStats = $derived($agentStats);
  let mounted = $state(false);

  // Mock memory counts per agent (API 없이 동작)
  const memoryCounts: Record<string, number> = {
    structure: 47,
    vpa: 32,
    ict: 28,
    deriv: 19,
    valuation: 12,
    flow: 38,
    senti: 15,
    macro: 22,
  };

  onMount(() => {
    requestAnimationFrame(() => { mounted = true; });
  });

  function handleManage(agentId: string) {
    goto(`/agent/${agentId}`);
  }

  function handleTrain(agentId: string) {
    goto(buildLabLink({ agentId }));
  }

  function handleCreate() {
    goto('/onboard?path=builder');
  }
</script>

<svelte:head>
  <title>My Agents — Cogochi</title>
</svelte:head>

<main class="agents-page" class:mounted>
  <header class="page-header">
    <div class="header-top">
      <span class="header-eyebrow">AGENT</span>
      <h1 class="header-title">MY AGENTS</h1>
    </div>
    <p class="header-desc">
      Manage your AI agents. Edit doctrines, review memories, and send to Lab for training.
    </p>
  </header>

  <section class="agents-list">
    {#each AGDEFS as agent, i}
      {@const stats = allStats[agent.id]}
      {#if stats}
        <div class="agent-item" style="--delay:{i * 60}ms">
          <AgentCard
            {agent}
            {stats}
            memoryCount={memoryCounts[agent.id] ?? 0}
            onManage={() => handleManage(agent.id)}
            onTrain={() => handleTrain(agent.id)}
          />
        </div>
      {/if}
    {/each}

    <!-- Create new agent card -->
    <div class="agent-item create-item" style="--delay:{AGDEFS.length * 60}ms">
      <button class="create-card" type="button" onclick={handleCreate}>
        <div class="create-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="plus-svg">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="create-label">Create Agent</span>
        <span class="create-desc">New doctrine from scratch or archetype</span>
      </button>
    </div>
  </section>
</main>

<style>
  .agents-page {
    min-height: 100%;
    padding: 32px 24px 64px;
    display: flex;
    flex-direction: column;
    gap: 32px;
    max-width: 900px;
    margin: 0 auto;
    background:
      radial-gradient(ellipse 70% 40% at 30% 0%, rgba(219,154,159,0.03), transparent),
      radial-gradient(ellipse 50% 30% at 80% 100%, rgba(173,202,124,0.03), transparent);
  }

  /* Header */
  .page-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .mounted .page-header {
    opacity: 1;
    transform: none;
  }

  .header-top {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .header-eyebrow {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 3px;
    color: var(--sc-text-3);
  }

  .header-title {
    font-family: var(--sc-font-display);
    font-size: clamp(28px, 5vw, 42px);
    letter-spacing: 2px;
    color: var(--lis-ivory);
    margin: 0;
  }

  .header-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
    max-width: 480px;
    margin: 0;
  }

  /* Agent list */
  .agents-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }

  .agent-item {
    opacity: 0;
    transform: translateY(16px);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .mounted .agent-item {
    opacity: 1;
    transform: none;
    transition-delay: var(--delay, 0ms);
  }

  /* Create card */
  .create-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    min-height: 180px;
    padding: 24px;
    border-radius: 16px;
    border: 2px dashed rgba(247, 242, 234, 0.06);
    background: rgba(247, 242, 234, 0.01);
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .create-card:hover {
    border-color: rgba(219, 154, 159, 0.2);
    background: rgba(219, 154, 159, 0.03);
    transform: translateY(-3px);
  }
  .create-card:active {
    transform: translateY(0) scale(0.99);
  }

  .create-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(247, 242, 234, 0.03);
    border: 1px solid rgba(247, 242, 234, 0.06);
    transition: all 0.3s;
  }
  .create-card:hover .create-icon {
    background: rgba(219, 154, 159, 0.08);
    border-color: rgba(219, 154, 159, 0.15);
  }

  .plus-svg {
    width: 22px;
    height: 22px;
    color: var(--sc-text-3);
    transition: color 0.3s;
  }
  .create-card:hover .plus-svg {
    color: var(--lis-accent);
  }

  .create-label {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--sc-text-2);
    transition: color 0.3s;
  }
  .create-card:hover .create-label {
    color: var(--lis-ivory);
  }

  .create-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
  }

  @media (max-width: 768px) {
    .agents-page { padding: 24px 16px 48px; }
    .agents-list {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .agents-page { padding: 20px 12px 40px; gap: 24px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-header, .agent-item {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
</style>
