<script lang="ts">
  import { goto } from '$app/navigation';
  import type { AgentDef } from '$lib/data/agents';
  import type { AgentStats } from '$lib/stores/agentData';
  import { getWinRate, getAgentAge } from '$lib/stores/agentData';
  import MoodBadge from '../shared/MoodBadge.svelte';

  const { agent, stats, memoryCount = 0, onManage, onTrain }: {
    agent: AgentDef;
    stats: AgentStats;
    memoryCount?: number;
    onManage?: () => void;
    onTrain?: () => void;
  } = $props();

  const winRate = $derived(getWinRate(stats));
  const totalMatches = $derived(stats.wins + stats.losses);

  // Stage color mapping
  const stageColors: Record<string, string> = {
    BRONZE: '#cd7f32',
    SILVER: '#c0c0c0',
    GOLD: '#ffd700',
    DIAMOND: '#b9f2ff',
    MASTER: '#ff6b9d',
  };

  function getStageName(level: number): string {
    if (level >= 40) return 'MASTER';
    if (level >= 25) return 'DIAMOND';
    if (level >= 15) return 'GOLD';
    if (level >= 8) return 'SILVER';
    return 'BRONZE';
  }

  const stage = $derived(getStageName(stats.level));
  const stageColor = $derived(stageColors[stage] ?? stageColors.BRONZE);
  const xpPercent = $derived(stats.xpMax > 0 ? Math.round((stats.xp / stats.xpMax) * 100) : 0);
  const agentAge = $derived(getAgentAge(stats.createdAt ?? Date.now()));
  const stageIndicator = $derived(
    Array.from({ length: 3 }, (_, i) => i + 1 <= (stats.stage ?? 1))
  );
</script>

<article class="agent-card">
  <div class="card-top">
    <div class="avatar-wrap" style="--agent-color:{agent.color}">
      <img
        src={agent.img.def}
        alt={agent.name}
        class="avatar-img"
        loading="lazy"
      />
      <span class="level-badge">Lv.{stats.level}</span>
    </div>

    <div class="card-info">
      <div class="name-row">
        <span class="name-mood-row">
          <span class="agent-name">{agent.name}</span>
          <MoodBadge mood={stats.mood ?? 'focused'} />
        </span>
        <span class="agent-role">{agent.role}</span>
      </div>

      <div class="stats-row">
        <span class="stat">
          <span class="stat-label">Win</span>
          <span class="stat-value" class:good={winRate >= 60} class:bad={winRate < 40}>{winRate}%</span>
        </span>
        <span class="stat-divider"></span>
        <span class="stat">
          <span class="stat-label">Memories</span>
          <span class="stat-value">{memoryCount}</span>
        </span>
        <span class="stat-divider"></span>
        <span class="stat">
          <span class="stat-label">Matches</span>
          <span class="stat-value">{totalMatches}</span>
        </span>
      </div>

      <div class="meta-row">
        <span class="meta-item bond-item">{'\u2665'} {stats.bond ?? 0}</span>
        <span class="meta-divider"></span>
        <span class="meta-item age-item">{agentAge}d</span>
        <span class="meta-divider"></span>
        <span class="meta-item stage-dots">
          {#each stageIndicator as filled}
            <span class="sdot" class:filled>{'\u25CF'}</span>
          {/each}
        </span>
      </div>

      <div class="stage-row">
        <span class="stage-label" style="color:{stageColor}">{stage}</span>
        <div class="stage-bar">
          <div class="stage-fill" style="width:{xpPercent}%;background:{stageColor}"></div>
        </div>
        <span class="stage-pct">{xpPercent}%</span>
      </div>
    </div>
  </div>

  <div class="card-actions">
    {#if onManage}
      <button class="btn-manage" type="button" onclick={onManage}>
        Manage
      </button>
    {/if}
    {#if onTrain}
      <button class="btn-train" type="button" onclick={onTrain}>
        Lab Training
      </button>
    {/if}
  </div>
</article>

<style>
  .agent-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid rgba(247, 242, 234, 0.05);
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.7), rgba(5, 9, 20, 0.8));
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    overflow: hidden;
  }

  .agent-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 20% 90%, var(--agent-color, rgba(219,154,159,0.06)), transparent 60%);
    opacity: 0;
    transition: opacity 0.35s;
    pointer-events: none;
  }

  .agent-card:hover {
    border-color: rgba(247, 242, 234, 0.1);
    transform: translateY(-3px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  }
  .agent-card:hover::before { opacity: 1; }

  .card-top {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    position: relative;
    z-index: 1;
  }

  .avatar-wrap {
    position: relative;
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    border: 1px solid rgba(247, 242, 234, 0.08);
    background: rgba(247, 242, 234, 0.03);
    overflow: hidden;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .level-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 5px;
    border-radius: 5px;
    background: rgba(5, 9, 20, 0.92);
    border: 1px solid rgba(247, 242, 234, 0.1);
    color: var(--lis-ivory);
  }

  .card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .name-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name-mood-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .agent-name {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-lg);
    font-weight: 700;
    color: var(--lis-ivory);
    letter-spacing: 0.3px;
  }

  .agent-role {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 1px;
    color: var(--sc-text-3);
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stats-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .stat-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .stat-value {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--sc-text-1);
  }
  .stat-value.good { color: var(--lis-positive); }
  .stat-value.bad { color: var(--lis-negative); }

  .stat-divider {
    width: 1px;
    height: 12px;
    background: rgba(247, 242, 234, 0.08);
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-item {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
  }

  .bond-item { color: var(--lis-negative); }
  .age-item { color: var(--sc-text-3); }

  .meta-divider {
    width: 1px;
    height: 10px;
    background: rgba(247, 242, 234, 0.08);
  }

  .stage-dots {
    display: flex;
    gap: 3px;
    font-size: 8px;
  }

  .sdot {
    color: rgba(247, 242, 234, 0.12);
  }
  .sdot.filled {
    color: var(--lis-accent);
  }

  .stage-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stage-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 700;
    letter-spacing: 1.5px;
    min-width: 56px;
  }

  .stage-bar {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: rgba(247, 242, 234, 0.05);
    overflow: hidden;
  }

  .stage-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .stage-pct {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    min-width: 28px;
    text-align: right;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    position: relative;
    z-index: 1;
  }

  .btn-manage,
  .btn-train {
    flex: 1;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-manage {
    border: 1px solid rgba(247, 242, 234, 0.08);
    background: rgba(247, 242, 234, 0.03);
    color: var(--sc-text-1);
  }
  .btn-manage:hover {
    border-color: rgba(247, 242, 234, 0.16);
    background: rgba(247, 242, 234, 0.06);
    color: var(--lis-ivory);
  }

  .btn-train {
    border: 1px solid rgba(219, 154, 159, 0.2);
    background: rgba(219, 154, 159, 0.06);
    color: var(--lis-accent);
  }
  .btn-train:hover {
    background: rgba(219, 154, 159, 0.12);
    border-color: rgba(219, 154, 159, 0.32);
  }

  @media (max-width: 480px) {
    .agent-card { padding: 16px; }
    .avatar-wrap { width: 48px; height: 48px; }
    .stats-row { flex-wrap: wrap; gap: 6px; }
  }
</style>
