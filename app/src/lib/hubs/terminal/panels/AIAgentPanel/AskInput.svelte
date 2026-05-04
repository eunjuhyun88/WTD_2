<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { classifyAsk } from '../../aiQueryRouter';
  import { shellStore, activeRightPanelTab } from '../../shell.store';
  import type { RightPanelTab } from '../../shell.store';
  import { trackAiAsk, trackTabSwitch } from '../../telemetry';

  const LS_KEY = 'wave6.ai_ask.history';
  const PLACEHOLDERS = [
    'Ask anything…',
    '/scan funding<0',
    '/why BTC',
    '/judge',
    '/recall double-bottom',
  ];

  let inputEl = $state<HTMLInputElement | null>(null);
  let query = $state('');
  let loading = $state(false);
  let history = $state<string[]>([]);
  let placeholderIdx = $state(0);
  let toastMsg = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const currentTab = $derived($activeRightPanelTab);

  function loadHistory() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) history = JSON.parse(raw) as string[];
    } catch { history = []; }
  }

  function saveHistory(q: string) {
    const next = [q, ...history.filter(h => h !== q)].slice(0, 10);
    history = next;
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  async function submit() {
    const q = query.trim();
    if (!q) return;

    loading = true;
    // minimum 150ms spinner
    const minWait = new Promise(r => setTimeout(r, 150));

    const result = classifyAsk(q);

    // tab switch
    if (result.tab !== currentTab) {
      const prevTab: RightPanelTab = currentTab;
      shellStore.setRightPanelTab(result.tab);
      trackTabSwitch({ from: prevTab, to: result.tab, trigger: 'ai_ask' });
      showToast(`Switched to ${result.tab}`);
    }

    // dispatch event
    window.dispatchEvent(new CustomEvent('cogochi:ai-ask', {
      detail: { intent: result.intent, query: result.query, ts: Date.now() },
    }));

    // telemetry
    trackAiAsk({ intent: result.intent, source: result.source, input_len: q.length });

    // persist
    saveHistory(q);

    await minWait;
    loading = false;
    query = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function fillFromChip(h: string) {
    query = h;
    inputEl?.focus();
  }

  function showToast(msg: string) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMsg = ''; }, 1000);
  }

  let rotateTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadHistory();
    rotateTimer = setInterval(() => {
      placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
    }, 4000);

    // Cmd+L focus shortcut
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'l') { e.preventDefault(); inputEl?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  onDestroy(() => {
    if (rotateTimer) clearInterval(rotateTimer);
    if (toastTimer) clearTimeout(toastTimer);
  });
</script>

<div class="ask-wrap">
  <div class="ask-row">
    <input
      class="ask-input"
      class:loading
      bind:value={query}
      bind:this={inputEl}
      placeholder={PLACEHOLDERS[placeholderIdx]}
      onkeydown={handleKeydown}
      autocomplete="off"
      spellcheck="false"
    />
    {#if loading}
      <span class="spinner" aria-label="Processing"></span>
    {/if}
  </div>
  {#if toastMsg}
    <div class="ask-toast" aria-live="polite">{toastMsg}</div>
  {/if}
  {#if history.length > 0}
    <div class="ask-chips">
      {#each history.slice(0, 3) as h}
        <button class="chip" onclick={() => fillFromChip(h)}>{h}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
.ask-wrap {
  padding: 5px 8px 4px;
  border-bottom: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
  position: relative;
}

.ask-row {
  position: relative;
  display: flex;
  align-items: center;
}

.ask-input {
  width: 100%;
  height: 32px;
  background: var(--g2, #131110);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g8, #cec9c4);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs, 11px);
  padding: 0 28px 0 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.08s;
}
.ask-input:focus { border-color: var(--amb, #f5a623); }
.ask-input.loading { opacity: 0.7; }

.spinner {
  position: absolute;
  right: 8px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--g4, #272320);
  border-top-color: var(--amb, #f5a623);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  pointer-events: none;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ask-toast {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--amb, #f5a623);
  padding: 2px 0 0;
  animation: fade-out 1s ease forwards;
}
@keyframes fade-out {
  0%   { opacity: 1; }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}

.ask-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 4px;
}

.chip {
  background: var(--g2, #131110);
  border: 1px solid var(--g4, #272320);
  border-radius: 2px;
  color: var(--g5, #3d3830);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 1px 6px;
  cursor: pointer;
  transition: color 0.07s, border-color 0.07s;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }
</style>
