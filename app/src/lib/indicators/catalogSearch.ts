import type { IndicatorDef } from './types';
import type Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';

interface CatalogEntry extends IndicatorDef {
  _searchText: string; // pre-built search corpus
}

function buildEntries(defs: IndicatorDef[]): CatalogEntry[] {
  return defs.map(d => ({
    ...d,
    _searchText: [
      d.id,
      d.label ?? '',
      d.description ?? '',
      ...(d.aiSynonyms ?? []),
    ].join(' ').toLowerCase(),
  }));
}

const FUSE_OPTIONS: IFuseOptions<CatalogEntry> = {
  keys: [
    { name: '_searchText', weight: 1 },
    { name: 'label', weight: 0.8 },
    { name: 'id', weight: 0.6 },
  ],
  threshold: 0.4,
  minMatchCharLength: 1,
  includeScore: true,
  useExtendedSearch: false,
};

/** Synchronous fallback: simple substring match (used before Fuse.js loads). */
function syncSearch(query: string, entries: CatalogEntry[]): IndicatorDef[] {
  const q = query.toLowerCase();
  return entries.filter(e => e._searchText.includes(q));
}

let _entriesCache: CatalogEntry[] | null = null;
let _fuseInstance: Fuse<CatalogEntry> | null = null;

export function initCatalogSearch(defs: IndicatorDef[]): void {
  _entriesCache = buildEntries(defs);
  _fuseInstance = null;
  import('fuse.js').then(({ default: FuseCtor }) => {
    if (!_entriesCache) return;
    _fuseInstance = new FuseCtor<CatalogEntry>(_entriesCache, FUSE_OPTIONS);
  });
}

/**
 * Search indicator catalog. Returns results ordered by relevance.
 * Falls back to substring match if Fuse.js not yet loaded.
 *
 * AC1B-6: < 16ms for 31 entries × 5 runs.
 */
export function catalogSearch(
  query: string,
  defs?: IndicatorDef[],
): IndicatorDef[] {
  const entries = defs ? buildEntries(defs) : (_entriesCache ?? []);
  if (!query.trim()) return entries;

  if (_fuseInstance && !defs) {
    return _fuseInstance.search(query).map((r: { item: CatalogEntry }) => r.item as IndicatorDef);
  }

  return syncSearch(query, entries);
}
