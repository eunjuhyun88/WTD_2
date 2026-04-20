<script lang="ts">
  import LibrarySection from './sections/LibrarySection.svelte';
  import VerdictsSection from './sections/VerdictsSection.svelte';
  import RulesSection from './sections/RulesSection.svelte';

  interface Props {
    visible: boolean;
    activeSection: 'library' | 'verdicts' | 'rules';
    setActiveSection: (id: 'library' | 'verdicts' | 'rules') => void;
    onOpenTab: (tab: any) => void;
  }

  const { visible, activeSection, setActiveSection, onOpenTab }: Props = $props();

  const sections = [
    { id: 'library', label: 'Library', color: 'var(--pos)', count: 8 },
    { id: 'verdicts', label: 'Verdicts', color: 'var(--amb)', count: 5 },
    { id: 'rules', label: 'Rules', color: '#7aa2e0', count: 4 },
  ] as const;
</script>

{#if visible}
  <div class="sidebar">
    <div class="section-tabs">
      {#each sections as s (s.id)}
        <button
          class="tab"
          class:active={activeSection === s.id}
          style:--border-color={s.color}
          onclick={() => setActiveSection(s.id)}
        >
          <span>{s.label}</span>
          <span class="count">{s.count}</span>
        </button>
      {/each}
    </div>

    <div class="content">
      {#if activeSection === 'library'}
        <LibrarySection {onOpenTab} />
      {:else if activeSection === 'verdicts'}
        <VerdictsSection {onOpenTab} />
      {:else if activeSection === 'rules'}
        <RulesSection {onOpenTab} />
      {/if}
    </div>

    <div class="footer">
      <span class="dot" />
      <span>scanner live</span>
      <span class="spacer" />
      <span>300 sym</span>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--g1);
    border-right: 0.5px solid var(--g3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-tabs {
    display: flex;
    border-bottom: 0.5px solid var(--g3);
    height: 30px;
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    padding: 0 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g6);
    background: transparent;
    border-bottom: 1.5px solid transparent;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab.active {
    color: var(--g9);
    background: var(--g2);
    border-bottom-color: var(--border-color);
  }

  .count {
    font-size: 8px;
    color: var(--g5);
    font-weight: 400;
  }

  .content {
    flex: 1;
    overflow: auto;
  }

  .footer {
    height: 22px;
    border-top: 0.5px solid var(--g3);
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pos);
  }

  .spacer {
    flex: 1;
  }
</style>
