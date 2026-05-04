<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseQuery } from './slashParser';
  import { trackAiAsk, trackTabSwitch } from './telemetry';

  // ── Props ──────────────────────────────────────────────────────────────────

  /** The currently active tab — used as the "from" arg in trackTabSwitch. */
  let { currentTab = 'research' }: { currentTab?: string } = $props();

  // ── Rotating placeholder ───────────────────────────────────────────────────

  const PLACEHOLDERS = [
    'AI에 물어보기...',
    '/scan funding<0',
    '/why BTC',
    '/judge 최근 7일',
  ] as const;

  let placeholderIdx = $state(0);
  let inputValue = $state('');

  let intervalId: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    intervalId = setInterval(() => {
      placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
    }, 4000);
  });

  onDestroy(() => {
    if (intervalId !== undefined) clearInterval(intervalId);
  });

  // ── Submit handler ─────────────────────────────────────────────────────────

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const raw = inputValue.trim();
    if (!raw) return;

    const { intent, tab, query } = parseQuery(raw);

    // Determine telemetry source before clearing input
    const source = raw.startsWith('/') ? 'slash' : 'nlu';

    // Emit bus event for PR7 listeners
    window.dispatchEvent(
      new CustomEvent('cogochi:ai-ask', {
        detail: { intent, tab, query },
      }),
    );

    // Telemetry
    trackAiAsk(intent, raw.length);
    trackTabSwitch(currentTab, tab, source);

    // Reset
    inputValue = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const form = (e.target as HTMLElement).closest('form');
      form?.requestSubmit();
    }
  }
</script>

<div class="ai-search-bar">
  <form onsubmit={handleSubmit}>
    <label class="visually-hidden" for="ai-search-input">AI 검색</label>
    <div class="input-wrapper">
      <span class="search-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.25"/>
          <path d="M9.5 9.5L12 12" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
      </span>
      <input
        id="ai-search-input"
        type="text"
        bind:value={inputValue}
        placeholder={PLACEHOLDERS[placeholderIdx]}
        onkeydown={handleKeydown}
        autocomplete="off"
        spellcheck="false"
        aria-label="AI에 질문하거나 슬래시 커맨드 입력"
      />
      <kbd class="shortcut-hint" aria-hidden="true">⌘L</kbd>
    </div>
  </form>
</div>

<style>
  .ai-search-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    width: 100%;
    background-color: var(--surface-1, #14171c);
    border-bottom: 1px solid var(--border-subtle, #232830);
    padding: var(--sp-1, 4px) var(--sp-2, 8px);
  }

  form {
    width: 100%;
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--sp-1, 4px);
    background-color: var(--surface-2, #1c2026);
    border: 1px solid var(--border-subtle, #232830);
    border-radius: 4px;
    padding: 0 var(--sp-2, 8px);
    height: 32px;
    transition: border-color 0.15s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--accent-amb, #f5b942);
  }

  .search-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--text-tertiary, #5a6172);
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: var(--type-sm, 12px);
    line-height: 16px;
    color: var(--text-primary, #e8ebf0);
    font-family: inherit;
    min-width: 0;
  }

  input::placeholder {
    color: var(--text-tertiary, #5a6172);
  }

  .shortcut-hint {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-tertiary, #5a6172);
    background: transparent;
    border: none;
    padding: 0;
    font-family: inherit;
    pointer-events: none;
    user-select: none;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
