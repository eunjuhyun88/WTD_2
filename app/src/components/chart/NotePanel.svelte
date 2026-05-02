<script lang="ts">
  import { chartNotesStore, type ChartNote } from '$lib/stores/chartNotesStore.svelte';

  interface Props {
    symbol: string;
    timeframe: string;
    capturePrice: number;
    captureBarTime: number;
  }
  let { symbol, timeframe, capturePrice, captureBarTime }: Props = $props();

  const TAGS: ChartNote['tag'][] = ['idea', 'entry', 'exit', 'mistake', 'observation'];
  const TAG_LABELS: Record<ChartNote['tag'], string> = {
    idea: '💡 Idea', entry: '🟢 Entry', exit: '🔴 Exit',
    mistake: '🟠 Mistake', observation: '👁️ Observation',
  };

  let body = $state('');
  let tag  = $state<ChartNote['tag']>('observation');
  let saving = $state(false);
  let errorMsg = $state('');

  const note = $derived(chartNotesStore.openNote);
  const mode = $derived(chartNotesStore.panelMode);

  $effect(() => {
    if (mode === 'view' && note) { body = note.body; tag = note.tag; }
    if (mode === 'create') { body = ''; tag = 'observation'; errorMsg = ''; }
  });

  const nearCap = $derived(chartNotesStore.noteCount >= 45);
  const atCap   = $derived(chartNotesStore.noteCount >= 50);

  async function handleSave() {
    if (!body.trim()) { errorMsg = 'Enter a note'; return; }
    if (atCap) { errorMsg = '50-note limit reached. Upgrade to Pro'; return; }
    saving = true; errorMsg = '';
    try {
      if (mode === 'create') {
        await chartNotesStore.addNote({ symbol, timeframe, bar_time: captureBarTime, price_at_write: capturePrice, body, tag });
        chartNotesStore.closePanel();
      } else if (mode === 'edit' && note) {
        await chartNotesStore.editNote(note.id, { body, tag });
        chartNotesStore.closePanel();
      }
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : 'Save failed';
    }
    saving = false;
  }

  async function handleDelete() {
    if (!note) return;
    await chartNotesStore.removeNote(note.id);
  }

  function fmt(price: number) {
    return price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : price.toFixed(price < 1 ? 6 : 4);
  }
  function fmtDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="note-panel" role="dialog" aria-label="Chart note">
  <div class="np-header">
    <span class="np-title">
      {mode === 'create' ? '📝 Write note' : mode === 'edit' ? '✏️ Edit note' : '📝 Note'}
    </span>
    <button class="np-close" onclick={() => chartNotesStore.closePanel()} aria-label="Close">✕</button>
  </div>

  <!-- Capture meta -->
  <div class="np-meta">
    <span class="np-meta-item">{symbol}</span>
    <span class="np-meta-sep">·</span>
    <span class="np-meta-item">{timeframe}</span>
    <span class="np-meta-sep">·</span>
    <span class="np-meta-item np-price">${fmt(mode === 'create' ? capturePrice : (note?.price_at_write ?? capturePrice))}</span>
    <span class="np-meta-sep">·</span>
    <span class="np-meta-item np-time">{fmtDate(mode === 'create' ? captureBarTime : (note?.bar_time ?? captureBarTime))}</span>
  </div>

  <!-- Tag selector -->
  <div class="np-tags">
    {#each TAGS as t}
      <button
        class="np-tag"
        class:active={tag === t}
        onclick={() => { tag = t; }}
        disabled={mode === 'view'}
      >{TAG_LABELS[t]}</button>
    {/each}
  </div>

  <!-- Body -->
  <textarea
    class="np-body"
    placeholder="Write your note here…"
    maxlength={500}
    readonly={mode === 'view'}
    bind:value={body}
  ></textarea>
  <div class="np-count">{body.length}/500</div>

  {#if nearCap && mode === 'create'}
    <div class="np-warn">⚠️ Note {chartNotesStore.noteCount}/50 — limit approaching</div>
  {/if}
  {#if errorMsg}
    <div class="np-error">{errorMsg}</div>
  {/if}

  <!-- Actions -->
  <div class="np-actions">
    {#if mode === 'view' && note}
      <button class="np-btn np-btn--ghost np-btn--danger" onclick={handleDelete}>Delete</button>
      <button class="np-btn np-btn--secondary" onclick={() => { chartNotesStore['panelMode' as never] = 'edit' as never; }}>Edit</button>
    {:else}
      <button class="np-btn np-btn--ghost" onclick={() => chartNotesStore.closePanel()}>Cancel</button>
      <button class="np-btn np-btn--primary" onclick={handleSave} disabled={saving || !body.trim() || atCap}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    {/if}
  </div>
</div>

<style>
  .note-panel {
    position: absolute;
    bottom: 48px;
    right: 12px;
    width: 300px;
    background: #1a1a2e;
    border: 1px solid #334155;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    z-index: 200;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  }
  .np-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .np-title { font-size: .85rem; font-weight: 600; color: #e2e8f0; }
  .np-close {
    background: none; border: none; color: #64748b; cursor: pointer;
    font-size: 1rem; padding: 2px 4px; border-radius: 4px;
  }
  .np-close:hover { color: #e2e8f0; background: #334155; }
  .np-meta {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    font-size: .72rem; color: #64748b;
  }
  .np-meta-sep { color: #334155; }
  .np-price { color: #60a5fa; font-weight: 500; }
  .np-time  { color: #94a3b8; }
  .np-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .np-tag {
    font-size: .7rem; padding: 2px 8px; border-radius: 12px; cursor: pointer;
    background: #0f172a; border: 1px solid #334155; color: #94a3b8;
    transition: all .15s;
  }
  .np-tag:hover:not(:disabled) { border-color: #60a5fa; color: #e2e8f0; }
  .np-tag.active { background: #1e3a5f; border-color: #60a5fa; color: #60a5fa; }
  .np-tag:disabled { cursor: default; opacity: .6; }
  .np-body {
    width: 100%; min-height: 80px; max-height: 150px;
    background: #0f172a; border: 1px solid #334155; border-radius: 6px;
    color: #e2e8f0; font-size: .8rem; padding: 8px; resize: vertical;
    font-family: inherit; line-height: 1.5;
    box-sizing: border-box;
  }
  .np-body:focus { outline: none; border-color: #60a5fa; }
  .np-body[readonly] { cursor: default; color: #94a3b8; }
  .np-count { font-size: .68rem; color: #475569; text-align: right; margin-top: -4px; }
  .np-warn  { font-size: .72rem; color: #fb923c; background: rgba(251,146,60,.1); padding: 4px 8px; border-radius: 4px; }
  .np-error { font-size: .72rem; color: #f87171; background: rgba(248,113,113,.1); padding: 4px 8px; border-radius: 4px; }
  .np-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .np-btn {
    font-size: .78rem; padding: 5px 14px; border-radius: 6px; cursor: pointer;
    border: 1px solid transparent; font-family: inherit; transition: all .15s;
  }
  .np-btn--primary  { background: #2563eb; color: #fff; }
  .np-btn--primary:hover:not(:disabled) { background: #1d4ed8; }
  .np-btn--primary:disabled { opacity: .4; cursor: not-allowed; }
  .np-btn--secondary { background: #334155; color: #e2e8f0; border-color: #475569; }
  .np-btn--secondary:hover { background: #475569; }
  .np-btn--ghost  { background: none; color: #64748b; }
  .np-btn--ghost:hover { color: #e2e8f0; background: #1e293b; }
  .np-btn--danger { color: #f87171; }
  .np-btn--danger:hover { background: rgba(248,113,113,.1); }
</style>
