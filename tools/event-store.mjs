#!/usr/bin/env node
/**
 * W-0271 Phase 1 — Event Store (immutable agent action log)
 *
 * Append-only log + replay primitives for the Agent OS event sourcing
 * pillar (W-0270 §Pillar 1).
 *
 * Layout:
 *   memory/events/<YYYY-MM-DD>.jsonl   — daily-partitioned event log
 *   memory/events/index.json           — fast lookup (trace_id → file:offset)
 *
 * Event shape (append-only, immutable):
 *   {
 *     "event_id": "evt_<ulid>",     // monotonic, sortable
 *     "trace_id": "trc_<ulid>",     // groups events of one user request
 *     "parent_event_id": "evt_..."  // causal chain
 *     "agent_id": "A###",           // optional, may be null for system events
 *     "ts": "2026-04-28T01:23:45Z",
 *     "kind": "session_start" | "tool_call" | "commit" | "merge" | "decision" | ...
 *     "subject": "W-####" | "PR #N" | "branch:..." | null,
 *     "payload": { ... },           // free-form, kind-specific
 *     "outcome": "ok" | "error" | "pending"
 *   }
 *
 * CLI:
 *   node tools/event-store.mjs append <kind> [--trace <id>] [--parent <id>]
 *                                     [--agent <id>] [--subject <s>]
 *                                     [--outcome ok|error|pending]
 *                                     [--payload-json <json>]
 *   node tools/event-store.mjs list [--trace <id>] [--agent <id>]
 *                                   [--since <ISO>] [--until <ISO>]
 *                                   [--kind <k>] [--limit N]
 *   node tools/event-store.mjs replay <trace-id>            # causal chain
 *   node tools/event-store.mjs verify                       # checks file integrity
 *
 * Retention: caller responsibility (default behaviour: append-only, no
 * automatic prune; align with memkraft 7d policy via cron later).
 */

import { mkdirSync, readdirSync, readFileSync, appendFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const EVENTS_DIR = resolve(REPO_ROOT, "memory/events");

// ---------------------------------------------------------------------------
// ULID-lite (sortable id with 48-bit timestamp + 80-bit random, base32)
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
  for (const byte of rand) {
    tail += CROCKFORD[byte & 0x1f];
  }
  return head + tail;
}

function newEventId() {
  return `evt_${ulid()}`;
}
function newTraceId() {
  return `trc_${ulid()}`;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function ensureDir() {
  if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
  }
}

function partitionFile(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return resolve(EVENTS_DIR, `${yyyy}-${mm}-${dd}.jsonl`);
}

// ---------------------------------------------------------------------------
// API: append
// ---------------------------------------------------------------------------
export function appendEvent(event) {
  ensureDir();
  const enriched = {
    event_id: event.event_id ?? newEventId(),
    trace_id: event.trace_id ?? newTraceId(),
    parent_event_id: event.parent_event_id ?? null,
    agent_id: event.agent_id ?? null,
    ts: event.ts ?? new Date().toISOString(),
    kind: event.kind,
    subject: event.subject ?? null,
    payload: event.payload ?? {},
    outcome: event.outcome ?? "ok",
  };
  if (!enriched.kind) {
    throw new Error("event.kind is required");
  }
  appendFileSync(partitionFile(), JSON.stringify(enriched) + "\n");
  return enriched;
}

// ---------------------------------------------------------------------------
// API: iterate (generator over all events in [since, until])
// ---------------------------------------------------------------------------
export function* iterEvents({ since, until } = {}) {
  ensureDir();
  const files = readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  for (const f of files) {
    const path = resolve(EVENTS_DIR, f);
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue; // tolerate corrupt lines (verify subcommand reports)
      }
      if (since && evt.ts < since) continue;
      if (until && evt.ts > until) continue;
      yield evt;
    }
  }
}

// ---------------------------------------------------------------------------
// API: list (filtered)
// ---------------------------------------------------------------------------
export function listEvents({ trace_id, agent_id, kind, since, until, limit } = {}) {
  const out = [];
  for (const evt of iterEvents({ since, until })) {
    if (trace_id && evt.trace_id !== trace_id) continue;
    if (agent_id && evt.agent_id !== agent_id) continue;
    if (kind && evt.kind !== kind) continue;
    out.push(evt);
    if (limit && out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// API: replay (causal chain by trace_id, preserving parent order)
// ---------------------------------------------------------------------------
export function replayTrace(trace_id) {
  const all = listEvents({ trace_id });
  // sort by event_id (ULID is sortable by time)
  return all.sort((a, b) => a.event_id.localeCompare(b.event_id));
}

// ---------------------------------------------------------------------------
// API: verify (file integrity)
// ---------------------------------------------------------------------------
export function verify() {
  ensureDir();
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith(".jsonl"));
  const report = { files: 0, events: 0, errors: [] };
  for (const f of files) {
    report.files++;
    const path = resolve(EVENTS_DIR, f);
    const raw = readFileSync(path, "utf8");
    let lineNum = 0;
    for (const line of raw.split("\n")) {
      lineNum++;
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (!evt.event_id || !evt.kind || !evt.ts) {
          report.errors.push(`${f}:${lineNum} missing required field`);
        } else {
          report.events++;
        }
      } catch (e) {
        report.errors.push(`${f}:${lineNum} ${e.message}`);
      }
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = v;
        i++;
      }
    }
  }
  return out;
}

async function main() {
  const [, , cmd, kindOrId, ...rest] = process.argv;
  const flags = parseFlags(rest);
  switch (cmd) {
    case "append": {
      if (!kindOrId) {
        console.error("usage: append <kind> [--trace <id>] ...");
        process.exit(2);
      }
      const payload = flags["payload-json"]
        ? JSON.parse(flags["payload-json"])
        : {};
      const evt = appendEvent({
        kind: kindOrId,
        trace_id: flags.trace,
        parent_event_id: flags.parent,
        agent_id: flags.agent,
        subject: flags.subject,
        payload,
        outcome: flags.outcome,
      });
      console.log(JSON.stringify(evt));
      return;
    }
    case "list": {
      const events = listEvents({
        trace_id: flags.trace,
        agent_id: flags.agent,
        kind: flags.kind,
        since: flags.since,
        until: flags.until,
        limit: flags.limit ? Number(flags.limit) : undefined,
      });
      for (const e of events) console.log(JSON.stringify(e));
      return;
    }
    case "replay": {
      if (!kindOrId) {
        console.error("usage: replay <trace-id>");
        process.exit(2);
      }
      for (const e of replayTrace(kindOrId)) console.log(JSON.stringify(e));
      return;
    }
    case "verify": {
      const report = verify();
      console.log(JSON.stringify(report, null, 2));
      if (report.errors.length > 0) process.exit(1);
      return;
    }
    case "new-trace": {
      console.log(newTraceId());
      return;
    }
    default:
      console.error(
        "usage: event-store.mjs <append|list|replay|verify|new-trace> ..."
      );
      process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}
