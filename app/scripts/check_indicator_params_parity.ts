/**
 * check_indicator_params_parity — W-0400 Phase 2B
 *
 * CI parity check: verifies that every app INDICATOR_REGISTRY entry with an
 * `engineKey` actually exists in the engine's catalog.
 *
 * Usage (from app/):
 *   npx tsx scripts/check_indicator_params_parity.ts
 *
 * Reads:   ../engine/indicators/catalog_export.json
 * Imports: app/src/lib/indicators/registry.ts  (via tsx transpilation)
 *
 * Exit 0 — all app engineKeys found in engine catalog
 * Exit 1 — one or more engineKeys missing from engine catalog
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(APP_ROOT, '../engine/indicators/catalog_export.json');

// ── Load engine catalog ───────────────────────────────────────────────────────

interface CatalogExport {
  indicators: string[];
  count: number;
}

let catalog: CatalogExport;
try {
  const raw = readFileSync(CATALOG_PATH, 'utf-8');
  catalog = JSON.parse(raw) as CatalogExport;
} catch (err) {
  console.error(`[parity] ERROR: could not read engine catalog at ${CATALOG_PATH}`);
  console.error(`         Run: cd engine && python3 -c "import json; from indicators.registry import REGISTRY; print(json.dumps({'indicators': list(REGISTRY.keys()), 'count': len(REGISTRY)}, indent=2))" > indicators/catalog_export.json`);
  process.exit(1);
}

const engineKeys = new Set(catalog.indicators);
console.log(`[parity] Engine catalog: ${engineKeys.size} indicators`);

// ── Load app registry ─────────────────────────────────────────────────────────

// Dynamic import so tsx resolves the TypeScript source at runtime
const registryPath = resolve(APP_ROOT, 'src/lib/indicators/registry.ts');
// We use a path alias workaround: read the file and extract engineKey values via regex
// (avoids needing SvelteKit $lib alias resolution in a plain tsx context)

const registrySource = readFileSync(registryPath, 'utf-8');

// Extract all engineKey: 'xxx' occurrences
const ENGINE_KEY_RE = /engineKey:\s*['"]([^'"]+)['"]/g;
const appEngineKeys: string[] = [];
let match: RegExpExecArray | null;
while ((match = ENGINE_KEY_RE.exec(registrySource)) !== null) {
  appEngineKeys.push(match[1]);
}

console.log(`[parity] App registry: ${appEngineKeys.length} entries with engineKey`);

// ── Compare ───────────────────────────────────────────────────────────────────

const missing = appEngineKeys.filter((key) => !engineKeys.has(key));
const extra   = [...engineKeys].filter((key) => !appEngineKeys.includes(key));

if (missing.length === 0) {
  console.log('[parity] OK — all app engineKeys exist in engine catalog');
} else {
  console.error(`[parity] FAIL — ${missing.length} app engineKey(s) NOT found in engine catalog:`);
  for (const key of missing) {
    console.error(`          missing: ${key}`);
  }
}

if (extra.length > 0) {
  console.log(`[parity] INFO — ${extra.length} engine indicator(s) not yet in app registry (informational only):`);
  for (const key of extra.slice(0, 20)) {
    console.log(`          unregistered: ${key}`);
  }
  if (extra.length > 20) {
    console.log(`          ... and ${extra.length - 20} more`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n[parity] Summary:');
console.log(`  engine catalog keys : ${engineKeys.size}`);
console.log(`  app engineKey count : ${appEngineKeys.length}`);
console.log(`  missing (app→engine): ${missing.length}`);
console.log(`  unregistered        : ${extra.length}`);

process.exit(missing.length > 0 ? 1 : 0);
