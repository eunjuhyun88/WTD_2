#!/usr/bin/env node
/**
 * W-0272 Phase 2 — Distributed Tracing (OpenTelemetry-style)
 *
 * Builds on the W-0271 Event Store.  Every agent action becomes a *span*:
 * a named, timed, causally-linked unit of work.  Spans share a trace_id
 * and form a tree via parent_span_id, enabling full causal reconstruction.
 *
 * Span shape (stored as an event in the event store with kind="span"):
 *   {
 *     "span_id":        "spn_<ulid>",
 *     "trace_id":       "trc_<ulid>",   // inherited from parent or new
 *     "parent_span_id": "spn_..." | null,
 *     "agent_id":       "A###" | null,
 *     "operation":      "session/start" | "tool/bash" | "git/commit" | ...
 *     "status":         "ok" | "error" | "pending",
 *     "start_ts":       "2026-...",
 *     "end_ts":         "2026-..." | null,
 *     "duration_ms":    123 | null,
 *     "attributes":     { key: value },  // OTel-style free tags
 *     "events":         [{ ts, name, attrs }]  // in-span events
 *   }
 *
 * Span state is persisted in two places:
 *   memory/events/<date>.jsonl  — immutable append (via event store)
 *   state/spans/open/<span_id>.json  — mutable open span (for end-span)
 *
 * CLI:
 *   node tools/trace-emit.mjs start-span <operation>
 *         [--trace <trc_id>] [--parent <spn_id>] [--agent <A###>]
 *         [--attr key=value ...]
 *
 *   node tools/trace-emit.mjs end-span <span_id>
 *         [--status ok|error] [--attr key=value ...]
 *
 *   node tools/trace-emit.mjs add-event <span_id> <event-name>
 *         [--attr key=value ...]
 *
 *   node tools/trace-emit.mjs list-spans
 *         [--trace <trc_id>] [--agent <A###>] [--since <ISO>] [--limit N]
 *
 *   node tools/trace-emit.mjs show-tree <trace_id>   # ASCII span tree
 *
 *   node tools/trace-emit.mjs new-trace              # print fresh trc_ id
 *   node tools/trace-emit.mjs current-trace          # read state/current_trace.txt
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const OPEN_SPANS_DIR = resolve(REPO_ROOT, "state/spans/open");
const EVENT_STORE = resolve(REPO_ROOT, "tools/event-store.mjs");
const CURRENT_TRACE_FILE = resolve(REPO_ROOT, "state/current_trace.txt");

// ---------------------------------------------------------------------------
// ULID-lite (same as event-store)
// ---------------------------------------------------------------------------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid() {
  const ts = Date.now();
  let head = "";
  let tsBig = BigInt(ts);
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[Number(tsBig & 0x1fn)] + head;
    tsBig >>= 5n;
  }
  const rand = randomBytes(10);
  let tail = "";
  for (const byte of rand) tail += CROCKFORD[byte & 0x1f];
  return head + tail;
}

function newSpanId() { return `spn_${ulid()}`; }
function newTraceId() { return `trc_${ulid()}`; }

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ---------------------------------------------------------------------------
// Open span state (state/spans/open/<span_id>.json)
// ---------------------------------------------------------------------------
function openSpanPath(span_id) {
  return resolve(OPEN_SPANS_DIR, `${span_id}.json`);
}

function saveOpenSpan(span) {
  ensureDir(OPEN_SPANS_DIR);
  writeFileSync(openSpanPath(span.span_id), JSON.stringify(span, null, 2));
}

function loadOpenSpan(span_id) {
  const p = openSpanPath(span_id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function closeOpenSpan(span_id) {
  const p = openSpanPath(span_id);
  if (existsSync(p)) unlinkSync(p);
}

// ---------------------------------------------------------------------------
// Current trace helpers
// ---------------------------------------------------------------------------
function currentTrace() {
  if (existsSync(CURRENT_TRACE_FILE)) {
    return readFileSync(CURRENT_TRACE_FILE, "utf8").trim();
  }
  return null;
}

function setCurrentTrace(trace_id) {
  ensureDir(resolve(REPO_ROOT, "state"));
  writeFileSync(CURRENT_TRACE_FILE, trace_id + "\n");
}

// ---------------------------------------------------------------------------
// Event store integration (dynamic import)
// ---------------------------------------------------------------------------
let _store = null;
async function store() {
  if (!_store) {
    _store = await import(`file://${EVENT_STORE}`);
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Parse attributes from ["key=value", ...] array
// ---------------------------------------------------------------------------
function parseAttrs(argv) {
  const attrs = {};
  for (const a of argv) {
    const eq = a.indexOf("=");
    if (eq === -1) {
      attrs[a] = true;
    } else {
      attrs[a.slice(0, eq)] = a.slice(eq + 1);
    }
  }
  return attrs;
}

// ---------------------------------------------------------------------------
// CLI flag parser
// ---------------------------------------------------------------------------
function parseFlags(argv) {
  const flags = { attr: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--attr") {
      if (argv[i + 1]) flags.attr.push(argv[++i]);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = v;
        i++;
      }
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStartSpan(operation, flags) {
  if (!operation) {
    console.error("usage: start-span <operation> [--trace <id>] [--parent <id>] [--agent <A###>]");
    process.exit(2);
  }

  const span_id = newSpanId();
  const trace_id = flags.trace ?? currentTrace() ?? newTraceId();
  const now = new Date().toISOString();

  const span = {
    span_id,
    trace_id,
    parent_span_id: flags.parent ?? null,
    agent_id: flags.agent ?? null,
    operation,
    status: "pending",
    start_ts: now,
    end_ts: null,
    duration_ms: null,
    attributes: parseAttrs(flags.attr),
    events: [],
  };

  saveOpenSpan(span);
  setCurrentTrace(trace_id);

  // record in event store
  const s = await store();
  s.appendEvent({
    trace_id,
    parent_event_id: null,
    agent_id: span.agent_id,
    kind: "span",
    subject: operation,
    payload: { span_id, operation, phase: "start", parent_span_id: span.parent_span_id, attributes: span.attributes },
    outcome: "pending",
  });

  console.log(JSON.stringify({ span_id, trace_id, operation }));
}

async function cmdEndSpan(span_id, flags) {
  if (!span_id) {
    console.error("usage: end-span <span_id> [--status ok|error]");
    process.exit(2);
  }

  const span = loadOpenSpan(span_id);
  if (!span) {
    console.error(`span not found (already closed or unknown): ${span_id}`);
    process.exit(1);
  }

  const now = new Date();
  span.end_ts = now.toISOString();
  span.duration_ms = now - new Date(span.start_ts);
  span.status = flags.status ?? "ok";
  if (flags.attr && flags.attr.length) {
    Object.assign(span.attributes, parseAttrs(flags.attr));
  }

  closeOpenSpan(span_id);

  const s = await store();
  s.appendEvent({
    trace_id: span.trace_id,
    agent_id: span.agent_id,
    kind: "span",
    subject: span.operation,
    payload: {
      span_id,
      operation: span.operation,
      phase: "end",
      parent_span_id: span.parent_span_id,
      start_ts: span.start_ts,
      end_ts: span.end_ts,
      duration_ms: span.duration_ms,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
    },
    outcome: span.status === "ok" ? "ok" : "error",
  });

  console.log(JSON.stringify({ span_id, duration_ms: span.duration_ms, status: span.status }));
}

async function cmdAddEvent(span_id, name, flags) {
  if (!span_id || !name) {
    console.error("usage: add-event <span_id> <event-name> [--attr key=value ...]");
    process.exit(2);
  }

  const span = loadOpenSpan(span_id);
  if (!span) {
    console.error(`span not found: ${span_id}`);
    process.exit(1);
  }

  const ev = { ts: new Date().toISOString(), name, attributes: parseAttrs(flags.attr) };
  span.events.push(ev);
  saveOpenSpan(span);
  console.log(JSON.stringify(ev));
}

async function cmdListSpans(flags) {
  const s = await store();
  const events = s.listEvents({
    kind: "span",
    trace_id: flags.trace,
    agent_id: flags.agent,
    since: flags.since,
    limit: flags.limit ? Number(flags.limit) : undefined,
  });

  // deduplicate — only end-phase or start-phase if no end
  const bySpan = new Map();
  for (const e of events) {
    const sid = e.payload?.span_id;
    if (!sid) continue;
    const phase = e.payload?.phase;
    if (!bySpan.has(sid) || phase === "end") {
      bySpan.set(sid, e);
    }
  }

  for (const e of bySpan.values()) console.log(JSON.stringify(e.payload));
}

async function cmdShowTree(trace_id) {
  if (!trace_id) {
    console.error("usage: show-tree <trace_id>");
    process.exit(2);
  }

  const s = await store();
  const events = s.listEvents({ kind: "span", trace_id });

  // collect ended spans (phase=end) and open spans (phase=start, no matching end)
  const bySpan = new Map();
  for (const e of events) {
    const sid = e.payload?.span_id;
    if (!sid) continue;
    const phase = e.payload?.phase;
    if (!bySpan.has(sid) || phase === "end") bySpan.set(sid, e.payload);
  }

  if (bySpan.size === 0) {
    // also check open spans dir
    if (existsSync(OPEN_SPANS_DIR)) {
      for (const f of readdirSync(OPEN_SPANS_DIR)) {
        if (!f.endsWith(".json")) continue;
        const sp = JSON.parse(readFileSync(resolve(OPEN_SPANS_DIR, f), "utf8"));
        if (sp.trace_id === trace_id) bySpan.set(sp.span_id, sp);
      }
    }
  }

  if (bySpan.size === 0) {
    console.log(`(no spans found for trace ${trace_id})`);
    return;
  }

  // Build adjacency
  const children = new Map();
  const roots = [];
  for (const [sid, sp] of bySpan) {
    const pid = sp.parent_span_id;
    if (!pid || !bySpan.has(pid)) {
      roots.push(sid);
    } else {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(sid);
    }
  }

  function statusIcon(sp) {
    if (!sp) return "?";
    if (sp.status === "pending") return "⏳";
    if (sp.status === "error") return "✗";
    return "✓";
  }

  function durationStr(sp) {
    if (sp.duration_ms != null) return ` (${sp.duration_ms}ms)`;
    return " (open)";
  }

  function printNode(sid, prefix, isLast) {
    const sp = bySpan.get(sid);
    const connector = isLast ? "└─" : "├─";
    const op = sp?.operation ?? sid;
    const icon = statusIcon(sp);
    console.log(`${prefix}${connector} ${icon} ${op}${durationStr(sp)}  [${sid.slice(0, 16)}]`);
    const kids = children.get(sid) ?? [];
    const childPrefix = prefix + (isLast ? "   " : "│  ");
    kids.forEach((kid, i) => printNode(kid, childPrefix, i === kids.length - 1));
  }

  console.log(`Trace: ${trace_id}`);
  roots.forEach((r, i) => printNode(r, "", i === roots.length - 1));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const [, , cmd, arg1, ...rest] = process.argv;
  const flags = parseFlags(rest);

  switch (cmd) {
    case "start-span":  return cmdStartSpan(arg1, flags);
    case "end-span":    return cmdEndSpan(arg1, flags);
    case "add-event":   return cmdAddEvent(arg1, rest.find(a => !a.startsWith("--")), flags);
    case "list-spans":  return cmdListSpans(flags);
    case "show-tree":   return cmdShowTree(arg1);
    case "new-trace":   console.log(newTraceId()); return;
    case "current-trace": {
      const t = currentTrace();
      if (t) { console.log(t); } else { console.error("no current trace"); process.exit(1); }
      return;
    }
    default:
      console.error("usage: trace-emit.mjs <start-span|end-span|add-event|list-spans|show-tree|new-trace|current-trace> ...");
      process.exit(2);
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
