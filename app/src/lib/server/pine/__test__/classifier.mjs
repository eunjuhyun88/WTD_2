// Smoke test for the Tier-1 keyword classifier. LLM tier is skipped here
// — only the regex-first path needs to be deterministic.
//
// Run: node src/lib/server/pine/__test__/classifier.mjs

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(HERE, '..', 'registry.ts');

// Inline minimal port of registry parsing + keyword scoring (mirrors classifier.ts).
const src = await readFile(REGISTRY_PATH, 'utf-8');
const blocks = src.split(/\{\s*\n\s*id:/);
const TEMPLATES = [];
for (let i = 1; i < blocks.length; i++) {
  const block = 'id:' + blocks[i];
  const idMatch = block.match(/id:\s*['"]([a-z_][a-z0-9_]*)['"]/);
  const kwMatch = block.match(/keywords:\s*\[([^\]]+)\]/);
  if (!idMatch || !kwMatch) continue;
  const keywords = [...kwMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  TEMPLATES.push({ id: idMatch[1], keywords });
}

function tokens(text) {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}

function classify(prompt) {
  const promptTokens = new Set(tokens(prompt));
  let best = null;
  for (const t of TEMPLATES) {
    let hits = 0;
    for (const kw of t.keywords) {
      if (kw.includes(' ')) {
        if (prompt.toLowerCase().includes(kw)) hits += 1;
      } else if (promptTokens.has(kw)) {
        hits += 1;
      }
    }
    if (hits === 0) continue;
    const score = hits / t.keywords.length;
    if (!best || hits > best.hits || (hits === best.hits && score > best.score)) {
      best = { id: t.id, score, hits };
    }
  }
  return best;
}

const cases = [
  { prompt: 'show wyckoff phase boxes',                  expect: 'wyckoff_overlay' },
  { prompt: 'highlight accumulation phase',              expect: 'wyckoff_overlay' },
  { prompt: 'plot regime trend background',              expect: 'regime_gauge' },
  { prompt: 'whale liquidation prices please',           expect: 'whale_liquidation_lines' },
  { prompt: 'show me alpha signal arrows on the chart',  expect: 'alpha_signal_markers' },
  { prompt: 'cvd divergence indicator',                  expect: 'cvd_divergence' },
  { prompt: 'volume profile zones with poc',             expect: 'vpvr_zones' },
  { prompt: 'smart money accumulation zones',            expect: 'smart_money_zones' },
  { prompt: 'compare with btc normalized',               expect: 'multi_asset_correlation' },
  { prompt: 'liquidation heatmap density',               expect: 'liquidation_heatmap' },
  { prompt: 'macro fed cpi event markers',               expect: 'news_event_markers' },
];

let failed = 0;
for (const c of cases) {
  const got = classify(c.prompt);
  const ok = got && got.id === c.expect;
  if (ok) {
    console.log(`✓ "${c.prompt}" → ${got.id} (hits ${got.hits}, score ${got.score.toFixed(2)})`);
  } else {
    failed += 1;
    console.error(`✗ "${c.prompt}"  expected ${c.expect}, got ${got?.id ?? 'null'}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} classifier case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} classifier cases pass.`);
