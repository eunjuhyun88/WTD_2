<script lang="ts">
  /**
   * PeekDrawer — bottom overlay drawer with tab switcher and drag-resize.
   *
   * - Collapsed state: 26px bar showing tab labels + summary counts.
   * - Expanded state: drawer with active tab content in slot.
   * - Drag the handle to resize (30% ~ 70% of viewport height).
   * - Persisted: open state + height + active tab in localStorage.
   */
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  type Tab = 'analyze' | 'scan' | 'judge' | 'review';

  interface Props {
    analyzeCount?: number;
    scanCount?: number;
    judgeCount?: number;
    reviewCount?: number;
    /** Programmatically open to a specific tab (e.g. from capture annotation click on tablet). */
    openTab?: Tab | null;
  }
  let {
    analyzeCount = 0,
    scanCount = 0,
    judgeCount = 0,
    reviewCount = 0,
    openTab = null,
  }: Props = $props();

  $effect(() => {
    if (openTab) {
      activeTab = openTab;
      open = true;
      persist();
    }
  });

  // ── State ───────────────────────────────────────────────────────────────
  let open = $state(true);
  let activeTab = $state<Tab>('analyze');
  let heightPct = $state(40); // % of viewport
  let dragging = $state(false);
  let prefersReducedMotion = $state(false);

  const STORAGE_KEY = 'wtdv2:peek:v1';

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = mq.matches;
    mq.addEventListener('change', (e) => { prefersReducedMotion = e.matches; });

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.open === 'boolean') open = saved.open;
        if (saved.tab === 'analyze' || saved.tab === 'scan' || saved.tab === 'judge' || saved.tab === 'review') activeTab = saved.tab;
        if (typeof saved.h === 'number' && saved.h >= 25 && saved.h <= 75) heightPct = saved.h;
      }
    } catch {}

    const onKey = (e: KeyboardEvent) => {
      // skip if typing in input/textarea
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); open = !open; persist(); }
      else if (e.key === 'Escape' && open) { open = false; persist(); }
      else if (e.key === '1') { activeTab = 'analyze'; open = true; persist(); }
      else if (e.key === '2') { activeTab = 'scan'; open = true; persist(); }
      else if (e.key === '3') { activeTab = 'judge'; open = true; persist(); }
      else if (e.key === '4') { activeTab = 'review'; open = true; persist(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, tab: activeTab, h: heightPct }));
    } catch {}
  }

  function toggle() { open = !open; persist(); }
  function selectTab(t: Tab) {
    if (activeTab === t && open) { open = false; }
    else { activeTab = t; open = true; }
    persist();
  }

  // ── Drag resize ─────────────────────────────────────────────────────────
  function startDrag(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    const startY = e.clientY;
    const startH = heightPct;
    const vh = window.innerHeight;

    const onMove = (ev: PointerEvent) => {
      const delta = ((startY - ev.clientY) / vh) * 100;
      heightPct = Math.max(25, Math.min(75, startH + delta));
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      persist();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const TABS: Array<{ id: Tab; label: string; hint: string }> = [
    { id: 'analyze', label: 'ANALYZE', hint: '분석 · 가설 · 근거' },
    { id: 'scan',    label: 'SCAN',    hint: '유사 셋업 · 스캐너 알림' },
    { id: 'judge',   label: 'JUDGE',   hint: '판정 · 재판정' },
    { id: 'review',  label: 'REVIEW',  hint: '결과 검토 · 플라이휠' },
  ];

  function count(t: Tab): number {
    if (t === 'analyze') return analyzeCount;
    if (t === 'scan') return scanCount;
    if (t === 'judge') return judgeCount;
    return reviewCount;
  }
</script>

<div class="peek" class:open style:--peek-h="{heightPct}vh">
  <!-- Drag handle (only visible when open) -->
  {#if open}
    <button
      class="handle"
      class:dragging
      onpointerdown={startDrag}
      aria-label="Resize drawer"
    ></button>
  {/if}

  <!-- Tab bar (always visible, 26px tall) -->
  <div class="bar">
    <div class="tabs">
      {#each TABS as tab}
        <button
          class="tab"
          class:active={open && activeTab === tab.id}
          onclick={() => selectTab(tab.id)}
        >
          <span class="tab-label">{tab.label}</span>
          <span class="tab-hint">{tab.hint}</span>
          {#if count(tab.id) > 0}
            <span class="tab-count">{count(tab.id)}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="bar-right">
      <span class="hint">SPACE toggle · 1 2 3 4 tabs</span>
      <button class="chevron" onclick={toggle} aria-label={open ? 'Close' : 'Open'}>
        {open ? '▾' : '▴'}
      </button>
    </div>
  </div>

  <!-- Drawer content -->
  {#if open}
    <div
      class="drawer"
      transition:fly={{ y: prefersReducedMotion ? 0 : 20, duration: prefersReducedMotion ? 0 : 180, easing: cubicOut }}
    >
      {#if activeTab === 'analyze'}
        <slot name="analyze" />
      {:else if activeTab === 'scan'}
        <slot name="scan" />
      {:else if activeTab === 'judge'}
        <slot name="judge" />
      {:else if activeTab === 'review'}
        <slot name="review" />
      {/if}
    </div>
  {/if}
</div>

<style>
  .peek {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--sc-bg-0, #0b0e14);
    border-top: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .peek.open {
    height: var(--peek-h, 40vh);
  }

  /* Drag handle — 4px hover target at top */
  .handle {
    position: absolute;
    top: -3px; left: 0; right: 0;
    height: 6px;
    background: transparent;
    border: none;
    cursor: ns-resize;
    z-index: 10;
  }
  .handle::after {
    content: '';
    position: absolute;
    top: 2px; left: 50%;
    transform: translateX(-50%);
    width: 36px; height: 2px;
    background: rgba(255,255,255,0.12);
    border-radius: 1px;
    transition: background 0.15s;
  }
  .handle:hover::after,
  .handle.dragging::after { background: rgba(99,179,237,0.5); }

  /* Tab bar — 28px */
  .bar {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    height: 28px;
    background: rgba(8,10,14,0.98);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    flex: 1;
    min-width: 0;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    background: transparent;
    border: none;
    border-right: 1px solid rgba(255,255,255,0.05);
    color: rgba(247,242,234,0.5);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    min-width: 0;
  }
  .tab:hover { background: rgba(255,255,255,0.03); color: rgba(247,242,234,0.85); }
  .tab.active {
    background: rgba(99,179,237,0.08);
    color: rgba(247,242,234,1);
    box-shadow: inset 0 2px 0 0 var(--tv-blue, #4B9EFD);
  }
  .tab-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .tab-hint {
    font-size: 10px;
    color: rgba(247,242,234,0.32);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab.active .tab-hint { color: rgba(247,242,234,0.55); }
  .tab-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 8px;
    background: rgba(99,179,237,0.18);
    color: rgba(131,188,255,0.95);
    min-width: 18px;
    text-align: center;
  }
  .bar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    flex-shrink: 0;
  }
  .hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247,242,234,0.28);
    letter-spacing: 0.06em;
  }
  .chevron {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(247,242,234,0.6);
    border-radius: 3px;
    width: 20px;
    height: 20px;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chevron:hover { color: rgba(247,242,234,1); border-color: rgba(255,255,255,0.2); }

  /* Drawer content */
  .drawer {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--sc-bg-0, #0b0e14);
  }

  @media (max-width: 768px) {
    .tab-hint { display: none; }
    .hint { display: none; }
  }
</style>
