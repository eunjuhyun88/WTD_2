<!--
  PineGenerator — Template-First Pine Script export panel

  Workflow:
    1. Catalog loads from GET /api/pine/templates
    2. User picks a template (or types a prompt → classifier picks one)
    3. Required slots are revealed — auto-filled from `analysisData` if available
    4. POST /api/pine/generate → ready-to-paste Pine Script v6
    5. One-click copy → user pastes into TradingView's Pine Editor
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    /** Default symbol shown in {{symbol}} slots */
    symbol?: string;
    /** Pre-computed WTD analysis bundle (auto-fills matching slots) */
    analysisData?: Record<string, unknown> | null;
  }

  let { symbol = 'BTCUSDT', analysisData = null }: Props = $props();

  type Category = 'analysis' | 'flow' | 'compare' | 'news';
  interface CatalogItem {
    id: string;
    title: string;
    category: Category;
    description: string;
  }
  interface SlotSpec {
    name: string;
    type: 'string' | 'number' | 'csv';
    required: boolean;
    default?: string | number;
    description: string;
  }
  interface FullTemplate extends CatalogItem {
    keywords: string[];
    filename: string;
    slots: SlotSpec[];
  }

  let catalog = $state<CatalogItem[]>([]);
  let selectedId = $state<string | null>(null);
  let selectedSpec = $state<FullTemplate | null>(null);
  let prompt = $state('');
  let slotValues = $state<Record<string, string>>({});
  let generating = $state(false);
  let output = $state<string | null>(null);
  let warnings = $state<string[]>([]);
  let classifierReason = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);

  onMount(async () => {
    try {
      const r = await fetch('/api/pine/templates');
      const j = await r.json();
      if (j.ok) catalog = j.templates;
    } catch (e) {
      error = `Failed to load template catalog: ${(e as Error).message}`;
    }
  });

  async function selectTemplate(id: string) {
    selectedId = id;
    output = null;
    warnings = [];
    classifierReason = null;
    error = null;
    try {
      const r = await fetch(`/api/pine/templates?id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!j.ok) {
        error = j.error;
        return;
      }
      selectedSpec = j.template;
      // Seed slot values from analysisData and defaults
      slotValues = {};
      for (const slot of selectedSpec!.slots) {
        const fromAnalysis = analysisData?.[slot.name];
        if (fromAnalysis !== undefined && fromAnalysis !== null) {
          slotValues[slot.name] = String(fromAnalysis);
        } else if (slot.name === 'symbol') {
          slotValues[slot.name] = symbol;
        } else if (slot.default !== undefined) {
          slotValues[slot.name] = String(slot.default);
        } else {
          slotValues[slot.name] = '';
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function generate() {
    if (!selectedId && !prompt.trim()) {
      error = 'Pick a template or describe what you want';
      return;
    }
    generating = true;
    output = null;
    warnings = [];
    classifierReason = null;
    error = null;
    copied = false;

    const body: Record<string, unknown> = { values: { ...slotValues } };
    if (selectedId) body.templateId = selectedId;
    else body.prompt = prompt.trim();

    try {
      const r = await fetch('/api/pine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) {
        error = j.error + (j.missingSlots ? ` (missing: ${j.missingSlots.join(', ')})` : '');
        return;
      }
      output = j.source;
      warnings = j.warnings ?? [];
      if (j.classifier) {
        classifierReason = `Picked "${j.title}" via ${j.classifier.via} (${(j.classifier.confidence * 100).toFixed(0)}% — ${j.classifier.reason})`;
        // Sync UI selection to classified template
        if (!selectedId || selectedId !== j.templateId) {
          await selectTemplate(j.templateId);
        }
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      generating = false;
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  const CATEGORIES: Category[] = ['analysis', 'flow', 'compare', 'news'];

  const groupedCatalog = $derived.by(() => {
    const groups: Record<Category, CatalogItem[]> = { analysis: [], flow: [], compare: [], news: [] };
    for (const item of catalog) groups[item.category].push(item);
    return groups;
  });
</script>

<div class="pine-gen">
  <header class="pg-header">
    <h2>Pine Script Export</h2>
    <p class="sub">WTD analysis → TradingView. Pick a template or describe what you want.</p>
  </header>

  <section class="pg-prompt">
    <input
      type="text"
      placeholder='e.g. "show wyckoff phase boxes" or "whale liquidations"'
      bind:value={prompt}
      onkeydown={(e) => {
        if (e.key === 'Enter') generate();
      }}
    />
    <button class="primary" onclick={generate} disabled={generating}>
      {generating ? 'Generating…' : 'Generate'}
    </button>
  </section>

  <section class="pg-catalog">
    {#each CATEGORIES as cat}
      {@const items = groupedCatalog[cat]}
      {#if items.length}
        <div class="cat">
          <span class="cat-label">{cat}</span>
          <div class="chips">
            {#each items as item}
              <button
                class="chip"
                class:active={selectedId === item.id}
                onclick={() => selectTemplate(item.id)}
                title={item.description}
              >
                {item.title}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </section>

  {#if selectedSpec}
    <section class="pg-slots">
      <header class="slots-head">
        <strong>{selectedSpec.title}</strong>
        <span class="muted">{selectedSpec.description}</span>
      </header>
      <div class="slot-grid">
        {#each selectedSpec.slots as slot}
          <label class="slot">
            <span class="slot-name">
              {slot.name}
              {#if slot.required}<em class="req">*</em>{/if}
              <em class="type">{slot.type}</em>
            </span>
            <input
              type="text"
              bind:value={slotValues[slot.name]}
              placeholder={slot.description}
            />
          </label>
        {/each}
      </div>
    </section>
  {/if}

  {#if classifierReason}
    <p class="classifier-note">{classifierReason}</p>
  {/if}

  {#if error}
    <p class="err">{error}</p>
  {/if}

  {#if warnings.length}
    <ul class="warnings">
      {#each warnings as w}
        <li>{w}</li>
      {/each}
    </ul>
  {/if}

  {#if output}
    <section class="pg-output">
      <header class="out-head">
        <strong>Generated Pine Script v6</strong>
        <button class="copy-btn" onclick={copyOutput}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </header>
      <pre>{output}</pre>
      <p class="hint">Paste into TradingView → Pine Editor → Save → Add to chart.</p>
    </section>
  {/if}
</div>

<style>
  .pine-gen {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #ddd;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
  }
  .pg-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .sub {
    margin: 4px 0 0;
    color: #888;
    font-size: 11px;
  }
  .pg-prompt {
    display: flex;
    gap: 8px;
  }
  .pg-prompt input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 8px 10px;
    color: #eee;
    font: inherit;
  }
  .pg-prompt input:focus {
    outline: none;
    border-color: rgba(80, 200, 255, 0.5);
  }
  button.primary {
    background: linear-gradient(180deg, #2a8af0, #1f6dd0);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0 14px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pg-catalog {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cat {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .cat-label {
    width: 64px;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: #888;
    padding-top: 4px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    padding: 4px 10px;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .chip.active {
    background: rgba(80, 200, 255, 0.15);
    border-color: rgba(80, 200, 255, 0.5);
    color: #e8faff;
  }
  .pg-slots {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 10px;
  }
  .slots-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .muted {
    color: #888;
    font-size: 11px;
  }
  .slot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }
  .slot {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .slot-name {
    font-size: 11px;
    color: #aaa;
    font-family: ui-monospace, SFMono-Regular, monospace;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .req {
    color: #f08080;
    font-style: normal;
  }
  .type {
    color: #666;
    font-style: normal;
    font-size: 10px;
  }
  .slot input {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    padding: 5px 7px;
    color: #eee;
    font: 12px ui-monospace, SFMono-Regular, monospace;
  }
  .slot input:focus {
    outline: none;
    border-color: rgba(80, 200, 255, 0.5);
  }
  .classifier-note {
    margin: 0;
    padding: 6px 10px;
    background: rgba(80, 200, 255, 0.08);
    border-left: 2px solid rgba(80, 200, 255, 0.5);
    color: #a8d8e8;
    font-size: 11px;
  }
  .err {
    margin: 0;
    padding: 8px 10px;
    background: rgba(240, 80, 80, 0.1);
    border-left: 2px solid #f08080;
    color: #f8b0b0;
    font-size: 12px;
  }
  .warnings {
    margin: 0;
    padding: 6px 10px 6px 24px;
    background: rgba(240, 200, 80, 0.06);
    border-left: 2px solid rgba(240, 200, 80, 0.5);
    color: #d8c280;
    font-size: 11px;
  }
  .warnings li {
    margin: 2px 0;
  }
  .pg-output {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 10px;
  }
  .out-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .copy-btn {
    background: rgba(80, 200, 255, 0.12);
    border: 1px solid rgba(80, 200, 255, 0.4);
    color: #e8faff;
    border-radius: 4px;
    padding: 4px 10px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .copy-btn:hover {
    background: rgba(80, 200, 255, 0.2);
  }
  pre {
    margin: 0;
    padding: 10px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    color: #d4e6f1;
    font: 12px ui-monospace, SFMono-Regular, monospace;
    overflow-x: auto;
    max-height: 380px;
    overflow-y: auto;
  }
  .hint {
    margin: 8px 0 0;
    color: #888;
    font-size: 11px;
  }
</style>
