#!/usr/bin/env node
/**
 * W-0272 Phase 2 — Trace Replay + Causal Graph
 *
 * Reads events from the event store and reconstructs the causal chain for
 * a given trace_id.  Useful for post-mortem analysis of agent sessions.
 *
 * CLI:
 *   node tools/trace-replay.mjs replay <trace_id>
 *         # print chronological span timeline with durations
 *
 *   node tools/trace-replay.mjs diff <trace_id_A> <trace_id_B>
 *         # compare two traces (e.g. before/after a fix)
 *
 *   node tools/trace-replay.mjs stats <trace_id>
 *         # aggregate: total spans, errors, slowest ops, p50/p95
 *
 *   node tools/trace-replay.mjs sessions [--agent <A###>] [--since <ISO>] [--limit N]
 *         # list trace_ids from session_start events
 *
 *   node tools/trace-replay.mjs export <trace_id> --format json|csv
 *         # machine-readable dump
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const EVENT_STORE = resolve(REPO_ROOT, "tools/event-store.mjs");

let _store = null;
async function store() {
  if (!_store) _store = await import(`file://${EVENT_STORE}`);
  return _store;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(ms) {
  if (ms == null) return "open";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTs(iso) {
  return iso ? iso.replace("T", " ").replace("Z", "").slice(0, 19) : "—";
}

function collectSpans(events) {
  const bySpan = new Map();
  for (const e of events) {
    const sid = e.payload?.span_id;
    if (!sid) continue;
    const phase = e.payload?.phase;
    if (!bySpan.has(sid) || phase === "end") bySpan.set(sid, e.payload);
  }
  return bySpan;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdReplay(trace_id) {
  if (!trace_id) { console.error("usage: replay <trace_id>"); process.exit(2); }

  const s = await store();
  const all = s.listEvents({ trace_id });

  if (all.length === 0) {
    console.log(`(no events for trace ${trace_id})`);
    return;
  }

  console.log(`\n=== Trace Replay: ${trace_id} ===\n`);
  console.log(`${"Timestamp".padEnd(20)} ${"Kind".padEnd(18)} ${"Subject/Operation".padEnd(40)} ${"Outcome"}`);
  console.log("─".repeat(100));

  for (const e of all) {
    const ts = fmtTs(e.ts);
    const kind = e.kind.padEnd(18);
    const sub = (e.subject ?? e.payload?.operation ?? "").slice(0, 40).padEnd(40);
    const phase = e.payload?.phase ? ` [${e.payload.phase}]` : "";
    const dur = e.payload?.duration_ms != null ? ` ${fmtDuration(e.payload.duration_ms)}` : "";
    console.log(`${ts} ${kind} ${sub} ${e.outcome}${phase}${dur}`);
  }

  const spans = collectSpans(all.filter(e => e.kind === "span"));
  const errors = [...spans.values()].filter(s => s.status === "error").length;
  const total = spans.size;
  console.log(`\n${total} spans, ${errors} errors`);
}

async function cmdStats(trace_id) {
  if (!trace_id) { console.error("usage: stats <trace_id>"); process.exit(2); }

  const s = await store();
  const all = s.listEvents({ trace_id, kind: "span" });
  const spans = collectSpans(all);

  if (spans.size === 0) {
    console.log(`(no spans for trace ${trace_id})`);
    return;
  }

  const durations = [...spans.values()]
    .map(sp => sp.duration_ms)
    .filter(d => d != null)
    .sort((a, b) => a - b);

  const p = (arr, pct) => arr[Math.ceil(arr.length * pct / 100) - 1];
  const errors = [...spans.values()].filter(sp => sp.status === "error");

  console.log(`\n=== Trace Stats: ${trace_id} ===`);
  console.log(`Spans:      ${spans.size}`);
  console.log(`Completed:  ${durations.length}`);
  console.log(`Errors:     ${errors.length}`);
  if (durations.length > 0) {
    console.log(`Min:        ${fmtDuration(durations[0])}`);
    console.log(`Median:     ${fmtDuration(p(durations, 50))}`);
    console.log(`p95:        ${fmtDuration(p(durations, 95))}`);
    console.log(`Max:        ${fmtDuration(durations[durations.length - 1])}`);
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const sp of errors) {
      console.log(`  ✗ ${sp.operation} [${sp.span_id?.slice(0, 16)}]`);
    }
  }

  // slowest 5
  const sorted = [...spans.values()]
    .filter(sp => sp.duration_ms != null)
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 5);
  if (sorted.length > 0) {
    console.log("\nSlowest spans:");
    for (const sp of sorted) {
      console.log(`  ${fmtDuration(sp.duration_ms).padEnd(8)} ${sp.operation}`);
    }
  }
}

async function cmdDiff(traceA, traceB) {
  if (!traceA || !traceB) { console.error("usage: diff <trace_id_A> <trace_id_B>"); process.exit(2); }

  const s = await store();
  const [evA, evB] = await Promise.all([
    s.listEvents({ trace_id: traceA, kind: "span" }),
    s.listEvents({ trace_id: traceB, kind: "span" }),
  ]);

  const spansA = collectSpans(evA);
  const spansB = collectSpans(evB);

  const opsA = new Map([...spansA.values()].map(sp => [sp.operation, sp]));
  const opsB = new Map([...spansB.values()].map(sp => [sp.operation, sp]));

  const allOps = new Set([...opsA.keys(), ...opsB.keys()]);

  console.log(`\n=== Trace Diff: ${traceA.slice(0, 16)} vs ${traceB.slice(0, 16)} ===\n`);
  console.log(`${"Operation".padEnd(45)} ${"A (ms)".padEnd(10)} ${"B (ms)".padEnd(10)} Delta`);
  console.log("─".repeat(80));

  for (const op of [...allOps].sort()) {
    const a = opsA.get(op);
    const b = opsB.get(op);
    const durA = a?.duration_ms ?? null;
    const durB = b?.duration_ms ?? null;
    const delta = durA != null && durB != null ? durB - durA : null;
    const deltaStr = delta == null ? "—" : (delta >= 0 ? `+${delta}ms` : `${delta}ms`);
    const mark = !a ? "NEW" : !b ? "DEL" : "";
    console.log(
      `${op.slice(0, 45).padEnd(45)} ${String(durA ?? "—").padEnd(10)} ${String(durB ?? "—").padEnd(10)} ${deltaStr} ${mark}`
    );
  }
}

async function cmdSessions(flags) {
  const s = await store();
  const events = s.listEvents({
    kind: "session_start",
    agent_id: flags.agent,
    since: flags.since,
    limit: flags.limit ? Number(flags.limit) : undefined,
  });

  if (events.length === 0) {
    // fall back: any event with a trace_id
    const all = s.listEvents({ agent_id: flags.agent, since: flags.since });
    const seen = new Set();
    let count = 0;
    const limit = flags.limit ? Number(flags.limit) : 20;
    for (const e of all) {
      if (!e.trace_id || seen.has(e.trace_id)) continue;
      seen.add(e.trace_id);
      console.log(JSON.stringify({ trace_id: e.trace_id, agent_id: e.agent_id, ts: e.ts }));
      if (++count >= limit) break;
    }
    return;
  }

  for (const e of events) {
    console.log(JSON.stringify({ trace_id: e.trace_id, agent_id: e.agent_id, ts: e.ts }));
  }
}

async function cmdExport(trace_id, flags) {
  if (!trace_id) { console.error("usage: export <trace_id> [--format json|csv]"); process.exit(2); }

  const s = await store();
  const events = s.listEvents({ trace_id });
  const fmt = flags.format ?? "json";

  if (fmt === "csv") {
    console.log("event_id,trace_id,kind,ts,outcome,subject,agent_id");
    for (const e of events) {
      const cols = [e.event_id, e.trace_id, e.kind, e.ts, e.outcome, e.subject ?? "", e.agent_id ?? ""];
      console.log(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
  } else {
    console.log(JSON.stringify(events, null, 2));
  }
}

// ---------------------------------------------------------------------------
// CLI flag parser
// ---------------------------------------------------------------------------
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[i + 1];
      flags[key] = (!v || v.startsWith("--")) ? true : (i++, v);
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const [, , cmd, arg1, arg2, ...rest] = process.argv;
  const flags = parseFlags([arg2, ...rest].filter(Boolean));

  switch (cmd) {
    case "replay":   return cmdReplay(arg1);
    case "stats":    return cmdStats(arg1);
    case "diff":     return cmdDiff(arg1, arg2);
    case "sessions": return cmdSessions(parseFlags(process.argv.slice(3)));
    case "export":   return cmdExport(arg1, flags);
    default:
      console.error("usage: trace-replay.mjs <replay|stats|diff|sessions|export> ...");
      process.exit(2);
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
