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
};

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

  return { items: normalized };
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
  return { items };
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
  return { items };
}

export function toggleAnalyzePanelCollapsed(
  layout: AnalyzePanelLayoutState,
  id: AnalyzePanelId,
): AnalyzePanelLayoutState {
  const normalized = normalizeAnalyzePanelLayout(layout);
  return {
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
