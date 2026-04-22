export const ANALYZE_PANEL_IDS = [
  'thesis',
  'live-stack',
  'options',
  'venue-divergence',
  'verified-backdrop',
  'dex-market-structure',
  'onchain-cycle-detail',
  'evidence-log',
  'execution-board',
] as const;

export type AnalyzePanelId = (typeof ANALYZE_PANEL_IDS)[number];
export type AnalyzePanelZone = 'main' | 'side';
export type AnalyzePanelMoveDirection = 'backward' | 'forward';

export interface AnalyzePanelLayoutItem {
  id: AnalyzePanelId;
  zone: AnalyzePanelZone;
  collapsed?: boolean;
}

export interface AnalyzePanelLayoutState {
  items: AnalyzePanelLayoutItem[];
  compareIds?: AnalyzePanelId[];
}

const PANEL_ID_SET = new Set<string>(ANALYZE_PANEL_IDS);

export const DEFAULT_ANALYZE_PANEL_LAYOUT: AnalyzePanelLayoutState = {
  items: [
    { id: 'thesis', zone: 'main' },
    { id: 'live-stack', zone: 'main' },
    { id: 'options', zone: 'main' },
    { id: 'venue-divergence', zone: 'main' },
    { id: 'verified-backdrop', zone: 'main' },
    { id: 'dex-market-structure', zone: 'main' },
    { id: 'onchain-cycle-detail', zone: 'main' },
    { id: 'evidence-log', zone: 'main' },
    { id: 'execution-board', zone: 'side' },
  ],
  compareIds: ['dex-market-structure', 'onchain-cycle-detail', 'execution-board'],
};

export function normalizeAnalyzeCompareIds(
  layout?: Partial<AnalyzePanelLayoutState> | null,
): AnalyzePanelId[] {
  const incoming = Array.isArray(layout?.compareIds) ? layout.compareIds : [];
  const normalized: AnalyzePanelId[] = [];
  const seen = new Set<AnalyzePanelId>();

  for (const id of incoming) {
    if (!PANEL_ID_SET.has(id)) continue;
    const panelId = id as AnalyzePanelId;
    if (seen.has(panelId)) continue;
    seen.add(panelId);
    normalized.push(panelId);
  }

  if (normalized.length > 0) return normalized;
  return [...(DEFAULT_ANALYZE_PANEL_LAYOUT.compareIds ?? [])];
}

export function normalizeAnalyzePanelLayout(
  layout?: Partial<AnalyzePanelLayoutState> | null,
): AnalyzePanelLayoutState {
  const incoming = Array.isArray(layout?.items) ? layout.items : [];
  const normalized: AnalyzePanelLayoutItem[] = [];
  const seen = new Set<AnalyzePanelId>();

  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    if (!PANEL_ID_SET.has(item.id)) continue;
    const id = item.id as AnalyzePanelId;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      zone: item.zone === 'side' ? 'side' : 'main',
      collapsed: Boolean(item.collapsed),
    });
  }

  for (const item of DEFAULT_ANALYZE_PANEL_LAYOUT.items) {
    if (seen.has(item.id)) continue;
    normalized.push({ ...item });
  }

  return {
    items: normalized,
    compareIds: normalizeAnalyzeCompareIds(layout),
  };
}

export function getAnalyzePanelsByZone(
  layout: AnalyzePanelLayoutState,
  zone: AnalyzePanelZone,
): AnalyzePanelId[] {
  return normalizeAnalyzePanelLayout(layout).items
    .filter((item) => item.zone === zone)
    .map((item) => item.id);
}

export function moveAnalyzePanel(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
  direction: AnalyzePanelMoveDirection,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  const items = [...normalized.items];
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return normalized;
  const zone = items[index].zone;
  const zoneIndices = items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter((entry) => entry.item.zone === zone)
    .map((entry) => entry.itemIndex);
  const zoneIndex = zoneIndices.indexOf(index);
  const targetZoneIndex = direction === 'backward' ? zoneIndex - 1 : zoneIndex + 1;
  if (zoneIndex === -1 || targetZoneIndex < 0 || targetZoneIndex >= zoneIndices.length) return normalized;
  const swapIndex = zoneIndices[targetZoneIndex];
  [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  return {
    ...normalized,
    items,
  };
}

export function setAnalyzePanelZone(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
  zone: AnalyzePanelZone,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  const items = normalized.items
    .filter((item) => item.id !== id)
    .map((item) => ({ ...item }));
  const existing = normalized.items.find((item) => item.id === id);
  const next: AnalyzePanelLayoutItem = {
    id,
    zone,
    collapsed: existing?.collapsed ?? false,
  };
  if (zone === 'side') {
    items.push(next);
  } else {
    const sideStart = items.findIndex((item) => item.zone === 'side');
    if (sideStart === -1) items.push(next);
    else items.splice(sideStart, 0, next);
  }
  return {
    ...normalized,
    items,
  };
}

export function toggleAnalyzePanelCollapsed(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  return {
    ...normalized,
    items: normalized.items.map((item) =>
      item.id === id ? { ...item, collapsed: !item.collapsed } : item,
    ),
  };
}

export function isAnalyzePanelCollapsed(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
): boolean {
  return Boolean(normalizeAnalyzePanelLayout(layout).items.find((item) => item.id === id)?.collapsed);
}

export function toggleAnalyzeComparePanel(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  const compareIds = normalizeAnalyzeCompareIds(normalized);
  return {
    ...normalized,
    compareIds: compareIds.includes(id)
      ? compareIds.filter((panelId) => panelId !== id)
      : [...compareIds, id],
  };
}

export function moveAnalyzeComparePanel(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
  direction: AnalyzePanelMoveDirection,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  const compareIds = [...normalizeAnalyzeCompareIds(normalized)];
  const index = compareIds.indexOf(id);
  if (index === -1) return normalized;
  const nextIndex = direction === 'backward' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= compareIds.length) return normalized;
  [compareIds[index], compareIds[nextIndex]] = [compareIds[nextIndex], compareIds[index]];
  return {
    ...normalized,
    compareIds,
  };
}

export function isAnalyzeComparePinned(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
): boolean {
  return normalizeAnalyzeCompareIds(layout).includes(id);
}
