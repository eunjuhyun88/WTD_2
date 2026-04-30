import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';

export interface ChartNote {
  id: string;
  symbol: string;
  timeframe: string;
  bar_time: number;
  price_at_write: number;
  body: string;
  tag: 'idea' | 'entry' | 'exit' | 'mistake' | 'observation';
  created_at: string;
}

const TAG_COLORS: Record<ChartNote['tag'], string> = {
  idea:        '#60a5fa',
  entry:       '#4ade80',
  exit:        '#f87171',
  mistake:     '#fb923c',
  observation: '#9ca3af',
};

const TAG_SHAPES: Record<ChartNote['tag'], SeriesMarker<UTCTimestamp>['shape']> = {
  idea:        'circle',
  entry:       'arrowUp',
  exit:        'arrowDown',
  mistake:     'square',
  observation: 'circle',
};

function buildMarkers(notes: ChartNote[]): SeriesMarker<UTCTimestamp>[] {
  // Group by bar_time to collapse multiple notes on same bar
  const byBar = new Map<number, ChartNote[]>();
  for (const n of notes) {
    const arr = byBar.get(n.bar_time) ?? [];
    arr.push(n);
    byBar.set(n.bar_time, arr);
  }
  const out: SeriesMarker<UTCTimestamp>[] = [];
  for (const [barTime, group] of byBar) {
    const first = group[0];
    const tag = group.length === 1 ? first.tag : 'observation';
    out.push({
      time:     barTime as UTCTimestamp,
      position: 'aboveBar',
      color:    TAG_COLORS[tag],
      shape:    TAG_SHAPES[tag],
      text:     group.length > 1 ? `✏️×${group.length}` : `✏️ ${first.body.slice(0, 20)}${first.body.length > 20 ? '…' : ''}`,
    });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

function createChartNotesStore() {
  let notes = $state<ChartNote[]>([]);
  let showNotes = $state(true);
  let loading = $state(false);
  let openNote = $state<ChartNote | null>(null);
  let panelOpen = $state(false);
  let panelMode = $state<'create' | 'view' | 'edit'>('create');

  const markers = $derived(showNotes ? buildMarkers(notes) : []);

  async function loadNotes(symbol: string, timeframe: string) {
    loading = true;
    try {
      const res = await fetch(`/api/chart/notes?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`);
      if (res.ok) {
        const data = await res.json() as { notes: ChartNote[] };
        notes = data.notes;
      }
    } catch { /* graceful skip */ }
    loading = false;
  }

  async function addNote(input: {
    symbol: string; timeframe: string; bar_time: number;
    price_at_write: number; body: string; tag: ChartNote['tag'];
  }): Promise<ChartNote | null> {
    try {
      const res = await fetch('/api/chart/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'failed' })) as { message?: string };
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { note: ChartNote };
      notes = [...notes, data.note].sort((a, b) => a.bar_time - b.bar_time);
      return data.note;
    } catch (e) {
      throw e;
    }
  }

  async function editNote(id: string, patch: { body?: string; tag?: string }): Promise<void> {
    const res = await fetch(`/api/chart/notes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { note: ChartNote };
    notes = notes.map(n => n.id === id ? data.note : n);
    if (openNote?.id === id) openNote = data.note;
  }

  async function removeNote(id: string): Promise<void> {
    await fetch(`/api/chart/notes/${id}`, { method: 'DELETE' });
    notes = notes.filter(n => n.id !== id);
    if (openNote?.id === id) { openNote = null; panelOpen = false; }
  }

  function openCreate() { openNote = null; panelMode = 'create'; panelOpen = true; }
  function openView(note: ChartNote) { openNote = note; panelMode = 'view'; panelOpen = true; }
  function closePanel() { panelOpen = false; openNote = null; }

  return {
    get notes() { return notes; },
    get markers() { return markers; },
    get showNotes() { return showNotes; },
    set showNotes(v: boolean) { showNotes = v; },
    get loading() { return loading; },
    get panelOpen() { return panelOpen; },
    get panelMode() { return panelMode; },
    get openNote() { return openNote; },
    get noteCount() { return notes.length; },
    loadNotes,
    addNote,
    editNote,
    removeNote,
    openCreate,
    openView,
    closePanel,
  };
}

export const chartNotesStore = createChartNotesStore();
