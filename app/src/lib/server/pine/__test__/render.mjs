// End-to-end render smoke test — replicates engine.ts logic in pure JS
// to verify a sample render of each template produces zero {{leftovers}}
// and passes the Pine v6 shape check.
//
// Run: node src/lib/server/pine/__test__/render.mjs

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(HERE, '..', 'templates');

const SLOT_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

// Sample values covering every slot we declared — verifies the engine
// can produce a fully-rendered script for each template.
const SAMPLE = {
  symbol: 'BTCUSDT',
  generatedAt: '2026-04-25T00:00:00Z',
  // wyckoff
  phase: 'AC',
  confidence: 78.5,
  phaseHigh: 67200,
  phaseLow: 64800,
  phaseStartTs: 1500,
  // regime
  regime: 'trend_up',
  trendStrength: 0.72,
  regimeHigh: 70000,
  regimeLow: 64000,
  // whale
  liquidations: 'long|65420|1200000|10x,short|71200|800000|5x',
  // signals
  signals: '1745000000000|long|0.82|RE-test|wyckoff,1745086400000|short|0.65|spring-fail|cvd',
  // cvd
  lookback: 50,
  // vpvr
  zones: '66200|2500000|hvn,67000|5800000|poc,68500|1200000|lvn',
  // smart money
  smcZones: '1745000000000|1745432000000|64500|66200|accumulation|74',
  // compare
  compareSymbol: 'ETHUSDT',
  // heatmap
  heatmap: '65000|0.85,67400|0.62,71800|0.41',
  // news
  events: '1745432000000|fed|high|FOMC,1745518400000|cpi|medium|CPI YoY',
};

let failed = 0;
const files = (await readdir(TEMPLATES_DIR)).filter((f) => f.endsWith('.pine'));

for (const filename of files) {
  const body = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');
  const rendered = body.replace(SLOT_RE, (match, name) =>
    SAMPLE[name] !== undefined ? String(SAMPLE[name]) : match,
  );
  const leftovers = rendered.match(/\{\{[^}]+\}\}/g);
  const noVersion = !rendered.includes('//@version=6');
  const noDecl = !/^\s*(indicator|strategy|library)\s*\(/m.test(rendered);

  if (leftovers || noVersion || noDecl) {
    failed += 1;
    console.error(`✗ ${filename}`);
    if (leftovers) console.error(`    leftover slots: ${leftovers.join(', ')}`);
    if (noVersion) console.error(`    missing //@version=6 after render`);
    if (noDecl) console.error(`    missing indicator()/strategy() after render`);
  } else {
    console.log(`✓ ${filename}  (${rendered.length} chars)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} template(s) failed render`);
  process.exit(1);
}
console.log(`\nAll ${files.length} templates render cleanly.`);
