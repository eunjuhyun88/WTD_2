#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// COGOCHI — Forward-Walk CLI Runner (Phase 5)
// Usage: npm run validate:forward-walk [-- --scenario <id> --archetype <CRUSHER|RIDER|ORACLE|GUARDIAN> --rounds <N>]
// Calls the /api/lab/forward-walk endpoint on the dev server.
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const PORT = process.env.PORT || '5173';
const BASE = `http://localhost:${PORT}`;

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const scenarioId = getArg('scenario', 'ftx-crash-2022-4h');
const archetype = getArg('archetype', 'CRUSHER');
const rounds = parseInt(getArg('rounds', '20'), 10);
const splitRatio = parseFloat(getArg('split', '0.7'));

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  COGOCHI Forward-Walk Validation');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Scenario:   ${scenarioId}`);
  console.log(`  Archetype:  ${archetype}`);
  console.log(`  Split:      ${(splitRatio * 100).toFixed(0)}% IS / ${((1 - splitRatio) * 100).toFixed(0)}% OOS`);
  console.log(`  Rounds:     ${rounds}`);
  console.log('═══════════════════════════════════════════════════');
  console.log();

  try {
    const res = await fetch(`${BASE}/api/lab/forward-walk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId,
        archetype,
        splitRatio,
        hillClimbRounds: rounds,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error(`ERROR: ${err.error}`);
      console.error(`\nMake sure the dev server is running: npm run dev`);
      process.exit(1);
    }

    const { result, logs } = await res.json();

    // Print logs
    if (logs?.length) {
      console.log('── Progress ──────────────────────────────────────');
      for (const log of logs) console.log(`  ${log}`);
      console.log();
    }

    // Print results
    console.log('── Results ───────────────────────────────────────');
    console.log();
    printMetrics('IN-SAMPLE', result.isMetrics, result.isCandleCount);
    console.log();
    printMetrics('OUT-OF-SAMPLE', result.oosMetrics, result.oosCandleCount);
    console.log();

    // Degradation
    const deg = result.degradation;
    const riskEmoji = result.overfitRisk === 'low' ? 'OK' : result.overfitRisk === 'moderate' ? 'WARN' : 'FAIL';
    console.log('── Overfit Assessment ────────────────────────────');
    console.log(`  Degradation:  ${(deg * 100).toFixed(1)}% (IS → OOS)`);
    console.log(`  Overfit Risk: ${riskEmoji} (${result.overfitRisk})`);
    console.log(`  Elapsed:      ${(result.elapsedMs / 1000).toFixed(1)}s`);
    console.log();

    // Best weights
    console.log('── Best Weights ──────────────────────────────────');
    const w = result.bestWeights;
    console.log(`  cvdDivergence: ${w.cvdDivergence.toFixed(2)}`);
    console.log(`  fundingRate:   ${w.fundingRate.toFixed(2)}`);
    console.log(`  openInterest:  ${w.openInterest.toFixed(2)}`);
    console.log(`  htfStructure:  ${w.htfStructure.toFixed(2)}`);
    console.log();

    // Exit code based on overfit risk
    if (result.overfitRisk === 'high') {
      console.log('FAILED: High overfit risk detected. OOS degradation > 30%.');
      process.exit(1);
    }
    console.log('PASSED: Forward-walk validation complete.');
  } catch (err) {
    console.error(`Connection error: ${err.message}`);
    console.error(`\nMake sure the dev server is running: npm run dev`);
    process.exit(1);
  }
}

function printMetrics(label, m, candles) {
  console.log(`  ${label} (${candles} candles):`);
  console.log(`    Win Rate:      ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`    Total PnL:     ${(m.totalPnl * 100).toFixed(2)}%`);
  console.log(`    Trades:        ${m.tradeCount}`);
  console.log(`    NO_TRADE:      ${m.noTradeCount} ticks`);
  console.log(`    Avg R:         ${m.avgRMultiple.toFixed(2)}`);
  console.log(`    Max Drawdown:  ${(m.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`    Sharpe:        ${m.sharpe.toFixed(3)}`);
}

main();
