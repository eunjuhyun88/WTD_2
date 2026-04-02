<script lang="ts">
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import type { Strategy } from '$lib/engine/backtestEngine';
  import type { StrategyEntry } from '$lib/stores/strategyStore';

  const {
    strategies,
    activeStrategy,
    selectedCycles,
    mode,
    interval,
    isRunning,
    onSelectStrategy,
    onSelectCycles,
    onToggleMode,
    onChangeInterval,
    onRun,
    onNextBar,
    onNewStrategy,
    onImport,
  } = $props<{
    strategies: StrategyEntry[];
    activeStrategy: Strategy | null;
    selectedCycles: string[];
    mode: 'auto' | 'manual';
    interval: string;
    isRunning: boolean;
    onSelectStrategy: (id: string) => void;
    onSelectCycles: (ids: string[]) => void;
    onToggleMode: () => void;
    onChangeInterval: (v: string) => void;
    onRun: () => void;
    onNextBar: () => void;
    onNewStrategy: () => void;
    onImport: () => void;
  }>();

  let showStratPicker = $state(false);
  let showCyclePicker = $state(false);

  const cycleCount = $derived(selectedCycles.length);
  const intervals = ['1h', '4h', '1d'];

  function toggleCycle(id: string) {
    if (selectedCycles.includes(id)) {
      onSelectCycles(selectedCycles.filter((s: string) => s !== id));
    } else {
      onSelectCycles([...selectedCycles, id]);
    }
  }
</script>

<div class="toolbar">
  <!-- Strategy picker -->
  <div class="tb-group" class:open={showStratPicker}>
    <button class="tb-btn strat-btn" onclick={() => { showStratPicker = !showStratPicker; showCyclePicker = false; }}>
      <span class="tb-label">{activeStrategy?.name ?? '전략 선택'}</span>
      <span class="tb-ver">{activeStrategy ? `v${activeStrategy.version}` : ''}</span>
      <span class="tb-arrow">▾</span>
    </button>
    {#if showStratPicker}
      <div class="tb-dropdown">
        {#each strategies as s (s.strategy.id)}
          <button class="dd-item" class:active={activeStrategy?.id === s.strategy.id}
            onclick={() => { onSelectStrategy(s.strategy.id); showStratPicker = false; }}>
            <span class="dd-name">{s.strategy.name}</span>
            <span class="dd-meta">v{s.strategy.version}</span>
          </button>
        {/each}
        <div class="dd-sep"></div>
        <button class="dd-item add" onclick={() => { onNewStrategy(); showStratPicker = false; }}>+ 새 전략</button>
        <button class="dd-item add" onclick={() => { onImport(); showStratPicker = false; }}>임포트</button>
      </div>
    {/if}
  </div>

  <div class="tb-sep"></div>

  <!-- Cycle picker -->
  <div class="tb-group" class:open={showCyclePicker}>
    <button class="tb-btn" onclick={() => { showCyclePicker = !showCyclePicker; showStratPicker = false; }}>
      <span class="tb-label">{cycleCount}개 사이클</span>
      <span class="tb-arrow">▾</span>
    </button>
    {#if showCyclePicker}
      <div class="tb-dropdown cycle-dd">
        {#each MARKET_CYCLES as c (c.id)}
          <label class="dd-check">
            <input type="checkbox" checked={selectedCycles.includes(c.id)} onchange={() => toggleCycle(c.id)} />
            <span class="dd-name">{c.label}</span>
            <span class="dd-change" class:pos={c.btcChangePercent >= 0} class:neg={c.btcChangePercent < 0}>
              {c.btcChangePercent >= 0 ? '+' : ''}{c.btcChangePercent}%
            </span>
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <div class="tb-sep"></div>

  <!-- Mode toggle -->
  <div class="mode-toggle">
    <button class="mode-btn" class:active={mode === 'auto'} onclick={mode === 'manual' ? onToggleMode : undefined}>자동</button>
    <button class="mode-btn" class:active={mode === 'manual'} onclick={mode === 'auto' ? onToggleMode : undefined}>수동</button>
  </div>

  <div class="tb-sep"></div>

  <!-- Interval -->
  <div class="interval-group">
    {#each intervals as iv}
      <button class="iv-btn" class:active={interval === iv} onclick={() => onChangeInterval(iv)}>
        {iv.toUpperCase()}
      </button>
    {/each}
  </div>

  <div class="tb-spacer"></div>

  <!-- Run / Next Bar -->
  {#if mode === 'auto'}
    <button class="run-btn" disabled={isRunning || cycleCount === 0} onclick={onRun}>
      {#if isRunning}
        <span class="spinner"></span>
      {:else}
        ▶
      {/if}
      실행
    </button>
  {:else}
    <button class="run-btn next-bar" onclick={onNextBar}>
      ▶ Next Bar
    </button>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .tb-group { position: relative; }
  .tb-sep { width: 1px; height: 20px; background: rgba(255 255 255 / 0.06); flex-shrink: 0; }
  .tb-spacer { flex: 1; }

  .tb-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px; background: transparent; border: 1px solid transparent;
    border-radius: 5px; cursor: pointer; transition: all 0.15s;
    font-family: var(--sc-font-body); font-size: 12px; color: rgba(255 255 255 / 0.7);
    white-space: nowrap;
  }
  .tb-btn:hover { background: rgba(var(--lis-rgb-pink), 0.06); }
  .strat-btn { font-weight: 600; }
  .tb-ver { font-family: var(--sc-font-mono); font-size: 10px; color: var(--lis-accent); background: rgba(var(--lis-rgb-pink), 0.1); padding: 1px 5px; border-radius: 3px; }
  .tb-arrow { font-size: 9px; color: rgba(255 255 255 / 0.25); }
  .tb-label { color: rgba(255 255 255 / 0.8); }

  .tb-dropdown {
    position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 220px;
    background: var(--lis-surface-1); border: 1px solid var(--lis-border);
    border-radius: 8px; padding: 4px; z-index: 40;
    box-shadow: 0 8px 24px rgba(0 0 0 / 0.5); max-height: 320px; overflow-y: auto;
  }
  .cycle-dd { min-width: 280px; }

  .dd-item {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 7px 10px; background: transparent; border: none; border-radius: 5px;
    cursor: pointer; text-align: left; font-family: var(--sc-font-body); font-size: 12px;
    color: rgba(255 255 255 / 0.7); transition: background 0.15s;
  }
  .dd-item:hover { background: rgba(var(--lis-rgb-pink), 0.08); }
  .dd-item.active { background: rgba(var(--lis-rgb-pink), 0.12); }
  .dd-item.add { color: var(--lis-accent); }
  .dd-name { flex: 1; }
  .dd-meta { font-family: var(--sc-font-mono); font-size: 10px; color: rgba(255 255 255 / 0.3); }
  .dd-sep { height: 1px; background: rgba(255 255 255 / 0.06); margin: 4px 0; }

  .dd-check {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 4px;
    cursor: pointer; font-size: 12px; color: rgba(255 255 255 / 0.7); transition: background 0.15s;
  }
  .dd-check:hover { background: rgba(var(--lis-rgb-pink), 0.06); }
  .dd-check input { accent-color: var(--lis-accent); }
  .dd-change { font-family: var(--sc-font-mono); font-size: 10px; margin-left: auto; }
  .dd-change.pos { color: var(--lis-positive); }
  .dd-change.neg { color: var(--sc-bad); }

  .mode-toggle { display: flex; border: 1px solid rgba(255 255 255 / 0.08); border-radius: 5px; overflow: hidden; }
  .mode-btn {
    padding: 4px 10px; background: transparent; border: none;
    font-family: var(--sc-font-body); font-size: 11px; color: rgba(255 255 255 / 0.4);
    cursor: pointer; transition: all 0.15s;
  }
  .mode-btn.active { background: rgba(var(--lis-rgb-pink), 0.15); color: var(--lis-accent); }

  .interval-group { display: flex; gap: 2px; }
  .iv-btn {
    padding: 4px 8px; background: transparent; border: 1px solid transparent;
    border-radius: 4px; font-family: var(--sc-font-mono); font-size: 10px;
    color: rgba(255 255 255 / 0.35); cursor: pointer; transition: all 0.15s;
  }
  .iv-btn.active { color: rgba(255 255 255 / 0.9); border-color: rgba(255 255 255 / 0.1); background: rgba(255 255 255 / 0.04); }
  .iv-btn:hover { color: rgba(255 255 255 / 0.6); }

  .run-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 16px; border-radius: 6px; font-family: var(--sc-font-body);
    font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid;
    background: rgba(var(--lis-rgb-pink), 0.15); border-color: rgba(var(--lis-rgb-pink), 0.3);
    color: var(--lis-accent); white-space: nowrap;
  }
  .run-btn:hover:not(:disabled) { background: rgba(var(--lis-rgb-pink), 0.25); box-shadow: var(--lis-glow-pink); }
  .run-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .run-btn.next-bar { background: rgba(173, 202, 124, 0.15); border-color: rgba(173, 202, 124, 0.3); color: var(--lis-positive); }
  .run-btn.next-bar:hover { background: rgba(173, 202, 124, 0.25); box-shadow: var(--lis-glow-lime); }

  .spinner { width: 10px; height: 10px; border: 2px solid rgba(var(--lis-rgb-pink), 0.2); border-top-color: var(--lis-accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .toolbar { gap: 3px; padding: 5px 8px; }
    .tb-sep:nth-child(4), .tb-sep:nth-child(6) { display: none; }
    .interval-group { display: none; }
  }
</style>
