/**
 * Workspace Presets (W-0125)
 *
 * A preset = snapshot of the TradeMode workspace state:
 *   • layoutMode ('A'|'B'|'C')
 *   • visibleIndicators[] (ordered)
 *   • archetypePrefs (per-indicator archetype override)
 *
 * Users can save the current workspace as a named preset, load it back,
 * or delete it. Persisted via localStorage under `cogochi_presets_v1`.
 *
 * Three built-in presets ship by default (scalp / swing / options-focus)
 * and cannot be deleted, only overridden by user presets of the same name.
 */

import { writable, get } from 'svelte/store';
import { shellStore, type ShellState } from './shell.store';

const STORAGE_KEY = 'cogochi_presets_v1';
const ACTIVE_KEY = 'cogochi_active_preset';

export interface WorkspacePreset {
  name: string;
  layoutMode: ShellState['tabs'][number]['tabState']['layoutMode'];
  visibleIndicators: string[];
  archetypePrefs: Record<string, string>;
  builtin?: boolean;
  createdAt: number;
}

// ── Built-in presets ─────────────────────────────────────────────────────────
export const BUILTIN_PRESETS: WorkspacePreset[] = [
  {
    name: 'scalp',
    layoutMode: 'C',
    visibleIndicators: ['oi_change_1h', 'funding_rate', 'cvd_state', 'volume_ratio', 'liq_heatmap', 'oi_per_venue'],
    archetypePrefs: {},
    builtin: true,
    createdAt: 0,
  },
  {
    name: 'swing',
    layoutMode: 'C',
    visibleIndicators: ['oi_change_4h', 'funding_rate', 'exchange_netflow', 'coinbase_premium', 'stablecoin_supply_ratio', 'liq_heatmap'],
    archetypePrefs: {},
    builtin: true,
    createdAt: 0,
  },
  {
    name: 'options-focus',
    layoutMode: 'C',
    visibleIndicators: ['options_skew_25d', 'put_call_ratio', 'gamma_flip_level', 'iv_term_structure', 'options_oi_by_strike', 'funding_rate'],
    archetypePrefs: {},
    builtin: true,
    createdAt: 0,
  },
];

// ── Storage ──────────────────────────────────────────────────────────────────
function loadUserPresets(): WorkspacePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspacePreset[];
    return Array.isArray(parsed) ? parsed.filter(p => !p.builtin) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(presets: WorkspacePreset[]) {
  if (typeof window === 'undefined') return;
  const userOnly = presets.filter(p => !p.builtin);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
}

// ── Store (subscription-friendly) ────────────────────────────────────────────
export const presets = writable<WorkspacePreset[]>([...BUILTIN_PRESETS, ...loadUserPresets()]);
export const activePresetName = writable<string | null>(
  typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null,
);

activePresetName.subscribe(name => {
  if (typeof window === 'undefined') return;
  if (name) localStorage.setItem(ACTIVE_KEY, name);
  else localStorage.removeItem(ACTIVE_KEY);
});

// ── Public API ───────────────────────────────────────────────────────────────

/** Capture current workspace state as a preset. */
export function saveCurrentAs(name: string): WorkspacePreset {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Preset name required');

  const st = get(shellStore);
  const tab = st.tabs.find(t => t.id === st.activeTabId) ?? st.tabs[0];
  const ts = tab?.tabState;
  if (!ts) throw new Error('No active tab state');

  const preset: WorkspacePreset = {
    name: trimmed,
    layoutMode: ts.layoutMode,
    visibleIndicators: [...st.visibleIndicators],
    archetypePrefs: { ...st.archetypePrefs },
    createdAt: Date.now(),
  };

  presets.update(list => {
    // Replace user preset of same name, else append
    const idx = list.findIndex(p => !p.builtin && p.name === trimmed);
    const next = [...list];
    if (idx >= 0) next[idx] = preset;
    else next.push(preset);
    saveUserPresets(next);
    return next;
  });

  activePresetName.set(trimmed);
  return preset;
}

/** Apply a preset's state to the current shell + active tab. */
export function apply(name: string): boolean {
  const list = get(presets);
  const p = list.find(x => x.name === name);
  if (!p) return false;

  shellStore.update(st => ({
    ...st,
    visibleIndicators: [...p.visibleIndicators],
    archetypePrefs: { ...p.archetypePrefs },
  }));
  shellStore.updateTabState(s => ({ ...s, layoutMode: p.layoutMode }));
  activePresetName.set(name);
  return true;
}

/** Delete a user preset. Built-ins are immutable. */
export function remove(name: string): boolean {
  let removed = false;
  presets.update(list => {
    const idx = list.findIndex(p => !p.builtin && p.name === name);
    if (idx < 0) return list;
    removed = true;
    const next = list.filter((_, i) => i !== idx);
    saveUserPresets(next);
    return next;
  });
  if (removed && get(activePresetName) === name) activePresetName.set(null);
  return removed;
}

/** Restore built-ins if they were somehow removed (defensive). */
export function reset() {
  saveUserPresets([]);
  presets.set([...BUILTIN_PRESETS]);
  activePresetName.set(null);
}
