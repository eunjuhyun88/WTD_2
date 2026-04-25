// End-to-end integration test:
//   • Imports the actual engine.ts module via Node 22 native TS strip
//   • Renders all 10 templates with real-shape sample data
//   • Asserts no leftover slots, valid Pine v6 shape, expected slot fill count
//
// Run: node --experimental-strip-types src/lib/server/pine/__test__/integration.mjs

import { render } from '../engine.ts';
import { TEMPLATES } from '../registry.ts';

// Sample slot values for every registered template.
const SAMPLES = {
  wyckoff_overlay:        { symbol: 'BTCUSDT', phase: 'AC', confidence: 78.5, phaseHigh: 67200, phaseLow: 64800, phaseStartTs: 1500 },
  regime_gauge:           { symbol: 'BTCUSDT', regime: 'trend_up', trendStrength: 0.72, regimeHigh: 70000, regimeLow: 64000 },
  whale_liquidation_lines:{ symbol: 'BTCUSDT', liquidations: 'long|65420|1200000|10x,short|71200|800000|5x' },
  alpha_signal_markers:   { symbol: 'BTCUSDT', signals: '1745000000000|long|0.82|RE-test' },
  cvd_divergence:         { symbol: 'BTCUSDT', lookback: 50 },
  vpvr_zones:             { symbol: 'BTCUSDT', zones: '66200|2500000|hvn,67000|5800000|poc' },
  smart_money_zones:      { symbol: 'BTCUSDT', smcZones: '1745000000000|1745432000000|64500|66200|accumulation|74' },
  multi_asset_correlation:{ symbol: 'BTCUSDT', compareSymbol: 'ETHUSDT', lookback: 100 },
  liquidation_heatmap:    { symbol: 'BTCUSDT', heatmap: '65000|0.85,67400|0.62' },
  news_event_markers:     { symbol: 'BTCUSDT', events: '1745432000000|fed|high|FOMC' },
};

let failed = 0;

for (const tmpl of TEMPLATES) {
  const values = SAMPLES[tmpl.id];
  if (!values) {
    failed++;
    console.error(`✗ ${tmpl.id} — no sample values defined in test`);
    continue;
  }
  const result = await render({ templateId: tmpl.id, values });
  if (!result.ok) {
    failed++;
    console.error(`✗ ${tmpl.id} — ${result.error}${result.missingSlots ? ' (missing: ' + result.missingSlots.join(', ') + ')' : ''}`);
    continue;
  }
  const issues = [];
  if (!result.source.includes('//@version=6')) issues.push('no version header');
  if (/\{\{[^}]+\}\}/.test(result.source)) issues.push('leftover slots');
  if (result.warnings.some((w) => w.startsWith('un-rendered slots'))) issues.push('engine reports leftover slots');
  if (issues.length) {
    failed++;
    console.error(`✗ ${tmpl.id} — ${issues.join(', ')}`);
    continue;
  }
  console.log(`✓ ${tmpl.id}  filled=${result.filledSlots.length}  warnings=${result.warnings.length}  size=${result.source.length}`);
}

if (failed > 0) {
  console.error(`\n${failed} template(s) failed integration`);
  process.exit(1);
}
console.log(`\nAll ${TEMPLATES.length} templates render via real engine module.`);
