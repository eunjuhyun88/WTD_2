<script lang="ts">
  /**
   * PatternLibraryPanelAdapter — wraps terminal PatternLibraryPanel for cogochi.
   *
   * Fetches from /api/captures (engine captures) and normalizes the shape
   * into PatternCaptureRecord so PatternLibraryPanel can render them.
   * Opens/closes via shell.store.activeSection === 'library'.
   */
  import PatternLibraryPanel from '../components/terminal/workspace/PatternLibraryPanel.svelte';
  import { shellStore } from './shell.store';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface EngineCapture {
    capture_id: string;
    symbol: string;
    timeframe: string;
    pattern_slug?: string;
    phase?: string;
    trigger_origin?: string;
    captured_at_ms?: number;
    user_note?: string;
    outcome?: string | null;
    user_verdict?: string | null;
  }

  let records = $state<PatternCaptureRecord[]>([]);
  let loading = $state(false);

  const open = $derived($shellStore.activeSection === 'library' && $shellStore.sidebarVisible);

  function normalize(cap: EngineCapture): PatternCaptureRecord {
    const ts = cap.captured_at_ms
      ? new Date(cap.captured_at_ms).toISOString()
      : new Date().toISOString();
    return {
      id: cap.capture_id,
      symbol: cap.symbol,
      timeframe: cap.timeframe,
      contextKind: 'symbol',
      triggerOrigin: (cap.trigger_origin ?? 'manual') as PatternCaptureRecord['triggerOrigin'],
      patternSlug: cap.pattern_slug ?? undefined,
      snapshot: {},
      decision: {
        verdict: (cap.outcome ?? null) as PatternCaptureRecord['decision']['verdict'],
        userVerdict: (cap.user_verdict ?? null) as PatternCaptureRecord['decision']['userVerdict'],
      },
      sourceFreshness: {},
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch('/api/captures?limit=50');
      if (!res.ok) return;
      const data = await res.json() as { captures?: EngineCapture[] };
      records = (data.captures ?? []).map(normalize);
    } catch {
      // leave records empty
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) load();
  });
</script>

<PatternLibraryPanel
  {open}
  {records}
  {loading}
  onClose={() => shellStore.update(s => ({ ...s, sidebarVisible: false }))}
  onSelect={(record) => {
    shellStore.setSymbol(record.symbol);
    shellStore.setDecisionBundle({
      symbol: record.symbol,
      timeframe: record.timeframe,
      patternSlug: record.patternSlug ?? null,
    });
    shellStore.update(s => ({ ...s, sidebarVisible: false }));
  }}
/>
