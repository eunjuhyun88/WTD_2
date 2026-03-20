<script lang="ts">
  import type { AgentSignal } from '$lib/data/warroom';
  import type { ScanTab, SignalDiff } from './types';
  import DirectionBadge from '../DirectionBadge.svelte';

  export let filteredSignals: AgentSignal[] = [];
  export let summarySignals: AgentSignal[] = [];
  export let densityMode: 'essential' | 'pro' = 'essential';
  export let scanTabs: ScanTab[] = [];
  export let selectedIds: Set<string> = new Set();
  export let selectedCount = 0;
  export let signalDiffs: Map<string, SignalDiff> = new Map();
  export let diffFreshUntil = 0;

  export let fmtPrice: (value: number) => string;
  export let onSelectAll: () => void;
  export let onToggleSelect: (id: string) => void;
  export let onQuickTrade: (dir: 'LONG' | 'SHORT', sig: AgentSignal) => void;
  export let onTrack: (sig: AgentSignal) => void;
  export let onRunScan: () => void;
  export let onShowOnChart: (sig: AgentSignal) => void = () => {};

  let expandedId: string | null = null;
  function toggleExpand(id: string) { expandedId = expandedId === id ? null : id; }
</script>

{#if summarySignals.length > 0}
  <div class="wr-agent-pulse" aria-label="Agent pulse summary">
    {#each summarySignals as sig (sig.id)}
      <button class="wr-agent-chip" type="button" on:click={() => onShowOnChart(sig)} title={`${sig.name} ${sig.vote.toUpperCase()} ${sig.conf}%`}>
        <span class="wr-agent-chip-name">{sig.name}</span>
        <DirectionBadge direction={sig.vote} confidence={sig.conf} showConfidence size="xs" />
      </button>
    {/each}
  </div>
{/if}

<div class="select-bar">
  <button class="select-all-btn" on:click={onSelectAll}>
    <span class="sa-check" class:checked={selectedCount === filteredSignals.length && filteredSignals.length > 0}></span>
    SELECT ALL
  </button>
  {#if selectedCount > 0}
    <span class="select-count">{selectedCount} selected</span>
  {/if}
</div>

<div class="wr-msgs">
  {#each filteredSignals as sig (sig.id)}
    {@const isSelected = selectedIds.has(sig.id)}
    {@const diff = diffFreshUntil > Date.now() ? signalDiffs.get(sig.id) : undefined}
    {@const hasChange = diff && (diff.isNew || diff.voteChanged || Math.abs(diff.confDelta) >= 3)}
    {@const isExpanded = expandedId === sig.id}
    <div
      class="wr-msg"
      class:selected={isSelected}
      class:essential={densityMode === 'essential'}
      class:wr-msg-new={hasChange}
      class:wr-msg-vote-flip={diff?.voteChanged}
      on:click={() => onToggleSelect(sig.id)}
      role="button"
      tabindex="0"
      on:keydown={(e) => e.key === 'Enter' && onToggleSelect(sig.id)}
    >
      <div class="wr-msg-strip" style="background:{sig.color}"></div>
      <div class="wr-msg-checkbox">
        <span class="msg-check" class:checked={isSelected}></span>
      </div>
      <div class="wr-msg-body">
        <div class="wr-msg-head">
          <span class="wr-msg-agent-id" style="color:{sig.color};border-color:{sig.color}">{sig.name.charAt(0)}</span>
          <span class="wr-msg-name" style="color:{sig.color}">{sig.name}</span>
          <DirectionBadge direction={sig.vote} confidence={sig.conf} showConfidence size="xs" />
          {#if diff}
            {#if diff.isNew}
              <span class="wr-diff-badge wr-diff-new">NEW</span>
            {:else if diff.voteChanged && diff.prevVote}
              <span class="wr-diff-badge wr-diff-flip">{diff.prevVote.toUpperCase()}{'\u2192'}{sig.vote.toUpperCase()}</span>
            {/if}
            {#if !diff.isNew && diff.confDelta !== 0}
              <span class="wr-diff-delta" class:pos={diff.confDelta > 0} class:neg={diff.confDelta < 0}>
                {diff.confDelta > 0 ? '+' : ''}{diff.confDelta}%
              </span>
            {/if}
          {/if}
          <span class="wr-msg-time">{sig.time}</span>
        </div>
        <div class="wr-conf-bar">
          <div class="wr-conf-fill {sig.vote}" style="width:{Math.min(sig.conf, 100)}%"></div>
        </div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="wr-msg-text" class:expanded={isExpanded} title={sig.text}
          on:click|stopPropagation={() => toggleExpand(sig.id)} role="button" tabindex="-1">{sig.text}</div>
        <div class="wr-msg-signal-row">
          <span class="wr-msg-entry">{fmtPrice(sig.entry)}</span>
          <span class="wr-msg-arrow-price">{'\u2192'}</span>
          <span class="wr-msg-tp">TP {fmtPrice(sig.tp)}</span>
          <span class="wr-msg-sl">SL {fmtPrice(sig.sl)}</span>
        </div>
        {#if densityMode === 'essential'}
          <div class="wr-msg-actions">
            <button class="wr-act-btn chart" on:click|stopPropagation={() => onShowOnChart(sig)} title="Show entry/TP/SL on chart">CHART</button>
            {#if sig.vote === 'long' || sig.vote === 'short'}
              <button
                class="wr-act-btn {sig.vote === 'long' ? 'long' : 'short'}"
                on:click|stopPropagation={() => onQuickTrade(sig.vote === 'long' ? 'LONG' : 'SHORT', sig)}
                title="Quick Trade by current signal direction"
              >
                {sig.vote === 'long' ? '\u25B2 LONG' : '\u25BC SHORT'}
              </button>
            {/if}
            <button class="wr-act-btn track" on:click|stopPropagation={() => onTrack(sig)}>TRACK</button>
          </div>
        {:else}
          <!-- Primary actions -->
          <div class="wr-msg-actions">
            <button class="wr-act-btn long" on:click|stopPropagation={() => onQuickTrade('LONG', sig)} title="Quick Trade: open LONG position">{'\u25B2'} LONG</button>
            <button class="wr-act-btn short" on:click|stopPropagation={() => onQuickTrade('SHORT', sig)} title="Quick Trade: open SHORT position">{'\u25BC'} SHORT</button>
          </div>
          <!-- Secondary actions (hover reveal) -->
          <div class="wr-msg-actions-secondary">
            <button class="wr-act-btn chart" on:click|stopPropagation={() => onShowOnChart(sig)} title="Show entry/TP/SL on chart">CHART</button>
            <button class="wr-act-btn track" on:click|stopPropagation={() => onTrack(sig)}>TRACK</button>
            <span class="wr-msg-src">{sig.src}</span>
          </div>
        {/if}
      </div>
    </div>
  {/each}

  {#if filteredSignals.length === 0}
    <div class="wr-empty">
      {#if scanTabs.length === 0}
        <div class="wr-empty-icon">&#x25C9;</div>
        <div class="wr-empty-title">SCAN TO START</div>
        <div class="wr-empty-text">Run an AI agent scan to analyze the current market. Results will appear here.</div>
        <button class="wr-empty-scan-btn" on:click={onRunScan}>
          RUN SCAN NOW
        </button>
      {:else}
        <div class="wr-empty-title">NO SIGNALS</div>
        <div class="wr-empty-text">No data for the current filter.</div>
      {/if}
    </div>
  {/if}
</div>
