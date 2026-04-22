<script lang="ts">
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import { shellStore } from '$lib/cogochi/shell.store';

  interface Command {
    id: string;
    label: string;
    hint: string;
    section: string;
  }

  interface Props {
    q: string;
    onClose: () => void;
    onChange: (q: string) => void;
  }

  const { q, onClose, onChange }: Props = $props();

  const baseCommands: Command[] = [
    { id: 'open_indicator_settings', label: '⚙ Manage indicators', hint: '', section: 'indicators' },
    { id: 'new_tab', label: 'New tab', hint: '⌘T', section: 'view' },
    { id: 'toggle_side', label: 'Toggle sidebar', hint: '⌘B', section: 'view' },
    { id: 'toggle_ai', label: 'Toggle AI panel', hint: '⌘L', section: 'view' },
    { id: 'mode_trade', label: 'Switch to TRADE mode', hint: '', section: 'mode' },
    { id: 'mode_train', label: 'Switch to TRAIN mode', hint: '', section: 'mode' },
    { id: 'mode_fly', label: 'Switch to FLYWHEEL', hint: '', section: 'mode' },
    { id: 'new_trade', label: 'New TRADE session', hint: '', section: 'session' },
    { id: 'reset', label: 'Reset all state', hint: '', section: 'system' },
  ];

  // Auto-generate toggle commands from the registry
  const indicatorCommands: Command[] = Object.values(INDICATOR_REGISTRY).map(def => ({
    id: `toggle_indicator:${def.id}`,
    label: `Toggle ${def.label ?? def.id}`,
    hint: def.family,
    section: 'indicators',
  }));

  const commands = [...baseCommands, ...indicatorCommands];

  const filtered = $derived(
    q ? commands.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : commands
  );

  function onRun(c: Command) {
    if (c.id.startsWith('toggle_indicator:')) {
      const indicatorId = c.id.slice('toggle_indicator:'.length);
      shellStore.toggleIndicatorVisible(indicatorId);
      onClose();
      return;
    }
    window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: c }));
    onClose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && filtered[0]) {
      onRun(filtered[0]);
    }
  }
</script>

<div class="overlay" onclick={onClose} />
<div class="palette">
  <div class="header">
    <input
      type="text"
      value={q}
      placeholder="/ command or search…"
      onchange={(e) => onChange((e.target as HTMLInputElement).value)}
      onkeydown={onKeyDown}
      oninput={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  </div>
  <div class="list">
    {#each filtered as c, i (c.id)}
      <div
        class="item"
        onclick={() => onRun(c)}
        onmouseenter={(e) => e.currentTarget.style.background = 'var(--g2)'}
        onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span class="section">{c.section}</span>
        <span class="label">{c.label}</span>
        {#if c.hint}
          <span class="hint">{c.hint}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 80;
  }

  .palette {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    z-index: 90;
    overflow: hidden;
  }

  .header {
    padding: 12px 14px;
    border-bottom: 0.5px solid var(--g3);
  }

  .header input {
    background: transparent;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--g9);
    width: 100%;
  }

  .header input::placeholder {
    color: var(--g5);
  }

  .list {
    max-height: 400px;
    overflow: auto;
  }

  .item {
    padding: 9px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    border-bottom: 0.5px solid var(--g3);
    transition: background 0.1s;
  }

  .item:last-child {
    border-bottom: none;
  }

  .section {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.14em;
    width: 60px;
    text-transform: uppercase;
  }

  .label {
    flex: 1;
    font-size: 11px;
    color: var(--g8);
  }

  .hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    padding: 2px 6px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 2px;
    letter-spacing: 0.08em;
  }
</style>
