/**
 * Indicator search — fuzzy query → IndicatorDef match.
 *
 * Used by AIPanel.convertPromptToSetup() to detect indicator intents
 * before falling through to the setup-token parser.
 *
 * Matching strategy (in priority order):
 * 1. Exact id match
 * 2. Exact label match (case-insensitive)
 * 3. Any aiSynonym exact match (case-insensitive)
 * 4. Any aiExampleQuery contains the query (or vice versa)
 * 5. Description or label starts-with the query
 * 6. Any field contains the query as a substring
 */

import { INDICATOR_REGISTRY } from './registry';
import type { IndicatorDef } from './types';

/** Normalise a query for comparison: lowercase + strip whitespace */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface SearchResult {
  def: IndicatorDef;
  /** How this match was found (for debugging / ranking) */
  matchType: 'id' | 'label' | 'synonym' | 'example' | 'description' | 'fuzzy';
  score: number;  // 0-1; higher = better
}

/**
 * Find indicator(s) matching the query string.
 * Returns ranked results (best first); empty array if no match.
 *
 * @param query - raw user query, e.g. "스큐 보여줘" or "gamma pin"
 * @param limit - max results (default 3)
 */
export function findIndicatorsByQuery(query: string, limit = 3): SearchResult[] {
  const q = norm(query);
  if (!q) return [];

  const results: SearchResult[] = [];
  const seen = new Set<string>();

  function push(def: IndicatorDef, matchType: SearchResult['matchType'], score: number) {
    if (seen.has(def.id)) return;
    seen.add(def.id);
    results.push({ def, matchType, score });
  }

  for (const def of Object.values(INDICATOR_REGISTRY)) {
    // 1. Exact id
    if (norm(def.id) === q) { push(def, 'id', 1.0); continue; }

    // 2. Exact label
    if (def.label && norm(def.label) === q) { push(def, 'label', 0.95); continue; }

    // 3. Synonym exact match
    if (def.aiSynonyms?.some(s => norm(s) === q)) { push(def, 'synonym', 0.9); continue; }

    // 4. Example query contains our q, or q contains an example term
    if (def.aiExampleQueries?.some(ex => norm(ex).includes(q) || q.includes(norm(ex).split(' ')[0]))) {
      push(def, 'example', 0.75);
      continue;
    }

    // 5. Synonym substring
    if (def.aiSynonyms?.some(s => norm(s).includes(q) || q.includes(norm(s)))) {
      push(def, 'synonym', 0.7);
      continue;
    }

    // 6. Label or description substring
    const labelMatch = def.label && (norm(def.label).includes(q) || q.includes(norm(def.label)));
    const descMatch  = def.description && norm(def.description).includes(q);
    if (labelMatch || descMatch) { push(def, 'description', 0.5); continue; }

    // 7. Fuzzy: id or family substring
    if (norm(def.id).includes(q) || q.includes(norm(def.family).toLowerCase())) {
      push(def, 'fuzzy', 0.3);
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Single best match — returns null if no match above min score.
 */
export function findIndicatorByQuery(query: string, minScore = 0.3): IndicatorDef | null {
  const results = findIndicatorsByQuery(query, 1);
  if (!results.length || results[0].score < minScore) return null;
  return results[0].def;
}
