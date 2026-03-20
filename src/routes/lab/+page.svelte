<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import ContextBanner from '../../components/shared/ContextBanner.svelte';
  import { AGDEFS } from '$lib/data/agents';
  import { agentStats, getWinRate, hydrateAgentStats } from '$lib/stores/agentData';
  import { buildArenaLink, buildMarketLink, buildPassportLink, buildTerminalLink } from '$lib/utils/deepLinks';

  type LabAgentView = {
    id: string;
    name: string;
    role: string;
    source: string;
    image: string;
    conf: number;
    winRate: number;
    sample: number;
    level: number;
    xp: number;
    memoryCount: number;
    doctrineTitle: string;
    doctrineDetail: string;
    specialties: string[];
  };

  const stats = $derived($agentStats);
  let selectedAgentId = $state(AGDEFS[0]?.id ?? '');

  const agents = $derived.by<LabAgentView[]>(() =>
    AGDEFS.map((agent) => {
      const stat = stats[agent.id];
      const learning = stat?.learning;

      return {
        id: agent.id,
        name: agent.nameKR || agent.name,
        role: agent.role,
        source: agent.source,
        image: agent.img.def,
        conf: agent.conf,
        winRate: stat ? getWinRate(stat) : agent.conf,
        sample: stat ? stat.wins + stat.losses : 0,
        level: stat?.level ?? 1,
        xp: stat?.xp ?? 0,
        memoryCount: learning?.totalRAGEntries ?? 0,
        doctrineTitle: agent.finding.title,
        doctrineDetail: agent.finding.detail,
        specialties: agent.specialty.slice(0, 4),
      };
    })
  );

  const selectedAgent = $derived.by(() => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null);

  const workbenchCards = $derived.by(() => {
    if (!selectedAgent) return [];

    return [
      {
        label: 'Doctrine',
        title: selectedAgent.doctrineTitle,
        detail: selectedAgent.doctrineDetail,
      },
      {
        label: 'Memory',
        title: `${selectedAgent.memoryCount} retained entries`,
        detail: 'Pinned lessons, recent patterns, and replay-ready clues live here before the next deployment.',
      },
      {
        label: 'Release',
        title: `${selectedAgent.winRate}% proven win rate`,
        detail: 'Battle proof determines whether the creature is ready for public release or needs another pass.',
      },
    ];
  });

  onMount(() => {
    void hydrateAgentStats();
  });
</script>

<svelte:head>
  <title>Lab — Model Training and Growth</title>
</svelte:head>

<div class="lab-page">
  <ContextBanner page="lab" />

  <section class="lab-hero">
    <div class="lab-copy">
      <p class="lab-kicker">Lab</p>
      <h1>Train the model through the creature.</h1>
      <p class="lab-subtitle">
        Character care is the visible layer. The real job here is turning battle proof into model doctrine,
        retained memory, and the next training move.
      </p>
    </div>

    <div class="lab-actions">
      <button type="button" class="lab-btn lab-btn-primary" onclick={() => goto(buildTerminalLink())}>
        Save From Terminal
      </button>
      <button type="button" class="lab-btn" onclick={() => goto(buildArenaLink())}>
        Deploy To Battle
      </button>
      <button type="button" class="lab-btn" onclick={() => goto(buildPassportLink())}>
        Open Passport
      </button>
    </div>
  </section>

  <section class="lab-layout">
    <aside class="roster-panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Roster</p>
          <h2>Active cast</h2>
        </div>
        <span class="panel-badge">{agents.length} creatures</span>
      </div>

      <div class="roster-list">
        {#each agents as agent}
          <button
            type="button"
            class="roster-card"
            class:selected={agent.id === selectedAgentId}
            onclick={() => (selectedAgentId = agent.id)}
          >
            <img class="roster-image" src={agent.image} alt={agent.name} />
            <div class="roster-body">
              <div class="roster-title-row">
                <strong>{agent.name}</strong>
                <span class="roster-tier">Lv.{agent.level}</span>
              </div>
              <span class="roster-meta">{agent.role}</span>
              <div class="roster-stats">
                <span>WR {agent.winRate}%</span>
                <span>MEM {agent.memoryCount}</span>
                <span>{agent.source.toUpperCase()}</span>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </aside>

    {#if selectedAgent}
      <div class="workbench">
        <section class="spotlight-card">
          <img class="spotlight-image" src={selectedAgent.image} alt={selectedAgent.name} />

          <div class="spotlight-copy">
            <div class="spotlight-head">
              <p class="panel-kicker">Selected creature</p>
              <h2>{selectedAgent.name}</h2>
              <span class="spotlight-role">{selectedAgent.role}</span>
            </div>

            <p class="spotlight-text">
              {selectedAgent.name} holds {selectedAgent.winRate}% field proof and {selectedAgent.memoryCount} retained
              memory entries. Tighten doctrine, tune behavior, then decide whether it goes back to Battle or moves toward Market.
            </p>

            <div class="spotlight-metrics">
              <div class="metric-card">
                <span class="metric-label">Confidence</span>
                <strong>{selectedAgent.conf}</strong>
              </div>
              <div class="metric-card">
                <span class="metric-label">Samples</span>
                <strong>{selectedAgent.sample}</strong>
              </div>
              <div class="metric-card">
                <span class="metric-label">XP</span>
                <strong>{selectedAgent.xp}</strong>
              </div>
            </div>
          </div>
        </section>

        <div class="work-grid">
          <article class="work-card doctrine-card">
            <div class="panel-head">
              <p class="panel-kicker">Model recipe</p>
              <h3>Current doctrine</h3>
            </div>
            <div class="doctrine-block">
              <span class="doctrine-label">Signal focus</span>
              <strong>{selectedAgent.doctrineTitle}</strong>
              <p>{selectedAgent.doctrineDetail}</p>
            </div>
            <div class="doctrine-block">
              <span class="doctrine-label">Specialties</span>
              <div class="chip-row">
                {#each selectedAgent.specialties as tag}
                  <span class="chip">{tag}</span>
                {/each}
              </div>
            </div>
          </article>

          <article class="work-card">
            <div class="panel-head">
              <p class="panel-kicker">Training memory</p>
              <h3>Retained lessons</h3>
            </div>
            <div class="memory-grid">
              {#each selectedAgent.specialties as tag}
                <div class="memory-card">
                  <span class="memory-type">Pattern</span>
                  <strong>{tag}</strong>
                </div>
              {/each}
              <div class="memory-card memory-card-accent">
                <span class="memory-type">Workbench</span>
                <strong>{selectedAgent.memoryCount} total entries retained</strong>
              </div>
            </div>
          </article>

          <article class="work-card">
            <div class="panel-head">
              <p class="panel-kicker">Training queue</p>
              <h3>Next model moves</h3>
            </div>
            <div class="queue-list">
              <button type="button" class="queue-item" onclick={() => goto(buildTerminalLink())}>
                <span class="queue-title">Retune doctrine in Terminal</span>
                <span class="queue-copy">Push one cleaner instruction before the next battle sample updates the model.</span>
              </button>
              <button type="button" class="queue-item" onclick={() => goto(buildArenaLink())}>
                <span class="queue-title">Send back to Battle</span>
                <span class="queue-copy">Validate the current creature-model in one more world-to-clash cycle.</span>
              </button>
              <button type="button" class="queue-item" onclick={() => goto(buildMarketLink())}>
                <span class="queue-title">Prepare Market story</span>
                <span class="queue-copy">Make public proof and model trust the next release checkpoint.</span>
              </button>
            </div>
          </article>

          <article class="work-card release-card">
            <div class="panel-head">
              <p class="panel-kicker">Promotion gate</p>
              <h3>Model promotion rule</h3>
            </div>
            {#each workbenchCards as card}
              <div class="release-row">
                <span class="release-label">{card.label}</span>
                <strong>{card.title}</strong>
                <p>{card.detail}</p>
              </div>
            {/each}
          </article>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .lab-page {
    --lab-line: var(--lis-border);
    --lab-line-soft: var(--lis-border-soft);
    --lab-line-strong: var(--lis-border-strong);
    --lab-pink-soft: rgba(var(--lis-rgb-pink), 0.08);
    --lab-pink-glow: rgba(var(--lis-rgb-pink), 0.12);
    --lab-lime-soft: rgba(var(--lis-rgb-lime), 0.08);
    --lab-highlight: var(--lis-highlight);
    --lab-ivory: var(--lis-ivory);
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(8, 17, 18, 0.92), rgba(8, 14, 16, 0.92));
    padding-bottom: 0;
  }

  .lab-hero,
  .roster-panel,
  .spotlight-card,
  .work-card {
    position: relative;
    z-index: 1;
    border: 1px solid var(--lab-line);
    background:
      linear-gradient(180deg, rgba(11, 20, 22, 0.94), rgba(7, 13, 15, 0.96)),
      radial-gradient(circle at top right, var(--lab-pink-soft), transparent 32%),
      radial-gradient(circle at bottom left, var(--lab-lime-soft), transparent 28%);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.24);
  }

  .lab-hero {
    margin: var(--sc-sp-4) var(--sc-sp-4) var(--sc-sp-3);
    padding: 14px 16px;
    border-radius: 28px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sc-sp-4);
  }

  .lab-copy {
    display: grid;
    gap: 10px;
    max-width: 64ch;
  }

  .lab-kicker,
  .panel-kicker,
  .doctrine-label,
  .metric-label,
  .memory-type,
  .release-label {
    margin: 0;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--lab-highlight);
  }

  h1,
  h2,
  h3 {
    margin: 0;
    font-family: var(--sc-font-display);
    color: var(--sc-text-0);
  }

  h1 {
    font-size: clamp(2rem, 4vw, 3.3rem);
    line-height: 1;
    color: var(--lab-ivory);
    text-shadow:
      0 0 12px var(--lab-pink-glow),
      0 0 28px rgba(var(--lis-rgb-pink), 0.06);
  }

  .lab-subtitle,
  .spotlight-text,
  .doctrine-block p,
  .queue-copy,
  .release-row p {
    margin: 0;
    line-height: 1.6;
    color: var(--sc-text-2);
  }

  .lab-actions {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2);
    flex-wrap: wrap;
    justify-content: flex-end;
    align-self: center;
  }

  .lab-btn,
  .queue-item,
  .roster-card {
    transition:
      transform var(--sc-duration-fast) var(--sc-ease),
      border-color var(--sc-duration-fast) var(--sc-ease),
      background var(--sc-duration-fast) var(--sc-ease);
  }

  .lab-btn {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--lab-line-strong);
    background:
      linear-gradient(180deg, rgba(12, 21, 23, 0.94), rgba(8, 14, 16, 0.96)),
      radial-gradient(circle at top right, var(--lab-lime-soft), transparent 32%);
    color: var(--sc-text-0);
    font-family: var(--sc-font-pixel);
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 18px rgba(0, 0, 0, 0.14);
  }

  .lab-btn-primary {
    background: linear-gradient(135deg, var(--lis-accent), var(--lis-highlight));
    color: #15100d;
    border-color: rgba(var(--lis-rgb-cream), 0.3);
  }

  .lab-btn:hover,
  .queue-item:hover,
  .roster-card:hover {
    transform: translateY(-2px);
    border-color: var(--lab-line-strong);
  }

  .lab-layout {
    display: grid;
    grid-template-columns: minmax(248px, 292px) minmax(0, 1fr);
    gap: var(--sc-sp-3);
    padding: 0 var(--sc-sp-4) var(--sc-sp-4);
    min-height: 0;
    overflow: hidden;
    align-items: stretch;
  }

  .roster-panel,
  .workbench {
    min-height: 0;
    height: 100%;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .roster-panel {
    border-radius: 24px;
    padding: 10px;
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .roster-panel .panel-head {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 2px 2px 8px;
    background:
      linear-gradient(180deg, rgba(12, 20, 22, 0.98), rgba(12, 20, 22, 0.88), rgba(12, 20, 22, 0));
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .roster-list,
  .work-grid,
  .queue-list,
  .memory-grid {
    display: grid;
    gap: 6px;
  }

  .roster-card {
    width: 100%;
    text-align: left;
    border-radius: 14px;
    border: 1px solid var(--lab-line-soft);
    background:
      linear-gradient(180deg, rgba(12, 21, 23, 0.9), rgba(8, 14, 16, 0.94)),
      radial-gradient(circle at top right, rgba(var(--lis-rgb-lime), 0.06), transparent 28%);
    padding: 7px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 8px;
    cursor: pointer;
    color: var(--sc-text-0);
  }

  .roster-card.selected {
    border-color: var(--lab-line-strong);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.04),
      var(--lis-glow-pink);
    background:
      linear-gradient(180deg, rgba(15, 24, 26, 0.96), rgba(9, 15, 17, 0.98)),
      radial-gradient(circle at top right, var(--lab-pink-soft), transparent 26%);
  }

  .roster-image,
  .spotlight-image {
    width: 100%;
    border-radius: 14px;
    background:
      radial-gradient(circle at 50% 0%, rgba(var(--lis-rgb-pink), 0.1), transparent 34%),
      linear-gradient(180deg, rgba(24, 38, 41, 0.82), rgba(7, 13, 15, 0.98));
    object-fit: contain;
    image-rendering: pixelated;
  }

  .roster-image {
    height: 48px;
    padding: 5px;
  }

  .roster-body,
  .spotlight-copy,
  .panel-head,
  .doctrine-block,
  .metric-card,
  .memory-card,
  .release-row {
    display: grid;
    gap: 6px;
  }

  .roster-title-row,
  .spotlight-head,
  .spotlight-metrics {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2);
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .roster-meta,
  .roster-stats,
  .spotlight-role {
    color: var(--sc-text-2);
    font-size: var(--sc-fs-sm);
  }

  .roster-stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
  }

  .panel-badge {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid var(--lab-line-soft);
    background: rgba(10, 18, 20, 0.84);
    color: var(--lab-highlight);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    white-space: nowrap;
  }

  .roster-tier {
    font-family: var(--sc-font-pixel);
    font-size: var(--sc-fs-2xs);
    color: var(--lis-highlight);
  }

  .workbench {
    display: grid;
    gap: 8px;
    padding-right: 2px;
    align-content: start;
  }

  .spotlight-card {
    border-radius: 24px;
    padding: 12px;
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    position: relative;
    overflow: hidden;
  }

  .spotlight-card::after {
    content: '';
    position: absolute;
    inset: auto -15% -25% auto;
    width: 260px;
    height: 260px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(var(--lis-rgb-pink), 0.16), transparent 70%);
    filter: blur(16px);
    opacity: 0.48;
    pointer-events: none;
  }

  .spotlight-image {
    width: 76px;
    height: 76px;
    min-height: 76px;
    padding: 8px;
    align-self: start;
  }

  .spotlight-copy {
    position: relative;
    z-index: 1;
    align-content: start;
    gap: 8px;
  }

  .spotlight-metrics {
    justify-content: flex-start;
    gap: 6px;
  }

  .metric-card {
    min-width: 82px;
    padding: 7px 8px;
    border-radius: 14px;
    border: 1px solid var(--lab-line-soft);
    background: rgba(10, 18, 20, 0.82);
  }

  .metric-card strong {
    font-family: var(--sc-font-display);
    color: var(--lab-highlight);
  }

  .work-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    align-items: start;
    gap: 8px;
  }

  .work-card {
    border-radius: 24px;
    padding: 12px;
  }

  .doctrine-card {
    grid-row: auto;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--lab-line);
    background: rgba(10, 17, 19, 0.82);
    color: var(--lab-ivory);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
  }

  .memory-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .memory-card {
    min-height: 74px;
    padding: 9px;
    border-radius: 18px;
    border: 1px solid var(--lab-line-soft);
    background:
      linear-gradient(180deg, rgba(12, 20, 22, 0.92), rgba(8, 14, 16, 0.96)),
      radial-gradient(circle at top right, var(--lab-lime-soft), transparent 28%);
    align-content: start;
  }

  .memory-card-accent {
    grid-column: span 2;
    background:
      linear-gradient(180deg, rgba(18, 26, 28, 0.94), rgba(10, 15, 17, 0.98)),
      radial-gradient(circle at top right, var(--lab-pink-glow), transparent 32%);
  }

  .queue-item {
    width: 100%;
    text-align: left;
    min-height: 70px;
    padding: 10px;
    border-radius: 18px;
    border: 1px solid var(--lab-line-soft);
    background:
      linear-gradient(180deg, rgba(12, 20, 22, 0.92), rgba(8, 14, 16, 0.96)),
      radial-gradient(circle at top right, var(--lab-pink-soft), transparent 32%);
    cursor: pointer;
    display: grid;
    gap: 4px;
    color: var(--sc-text-0);
  }

  .queue-title {
    font-family: var(--sc-font-display);
    color: var(--lab-ivory);
  }

  .release-card {
    grid-row: auto;
  }

  .release-row {
    padding-top: 10px;
    border-top: 1px solid rgba(var(--lis-rgb-pink), 0.1);
  }

  .release-row strong,
  .memory-card strong,
  .doctrine-block strong {
    color: var(--lab-ivory);
  }

  .spotlight-role {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(var(--lis-rgb-cream), 0.18);
    background: rgba(var(--lis-rgb-pink), 0.08);
    color: var(--lab-highlight);
  }

  .release-row:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  @media (max-width: 1080px) {
    .lab-page {
      grid-template-rows: auto auto;
      overflow: auto;
      padding-bottom: var(--sc-bottom-bar-h);
    }

    .lab-layout,
    .spotlight-card,
    .work-grid {
      grid-template-columns: 1fr;
    }

    .lab-layout {
      height: auto;
      min-height: auto;
      overflow: visible;
      padding-bottom: var(--sc-sp-6);
    }

    .roster-panel,
    .workbench {
      height: auto;
      overflow: visible;
    }

    .roster-panel .panel-head {
      position: static;
      background: none;
      padding: 0;
    }

    .doctrine-card,
    .release-card {
      grid-row: auto;
    }
  }

  @media (max-width: 768px) {
    .lab-hero,
    .lab-layout {
      margin: var(--sc-sp-3);
      padding: 0;
    }

    .lab-hero {
      padding: var(--sc-sp-3);
      flex-direction: column;
      align-items: flex-start;
    }

    .lab-layout {
      gap: var(--sc-sp-3);
    }

    .roster-card {
      grid-template-columns: 46px minmax(0, 1fr);
      padding: 7px;
    }

    .roster-image {
      height: 46px;
    }

    .spotlight-card,
    .work-card {
      padding: 12px;
    }

    .memory-grid {
      grid-template-columns: 1fr;
    }

    .memory-card-accent {
      grid-column: auto;
    }
  }
</style>
