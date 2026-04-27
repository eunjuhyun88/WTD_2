#!/usr/bin/env node
/**
 * W-0276 Phase 6 — Consensus / Quorum Validator
 *
 * Multi-agent voting sessions with configurable quorum thresholds.
 * Agents vote PASS|FAIL on a subject (design doc, PR, etc.).  Once
 * threshold is met, the session auto-decides.  Timeout → TIMEOUT.
 *
 * State: state/quorum-sessions.json (atomic write)
 *
 * Session shape:
 *   {
 *     "session_id": "qrm_<ulid>",
 *     "trace_id": "trc_<ulid>",
 *     "subject": "W-#### design | PR #NNN",
 *     "threshold": { "n": 2, "of": 3 },
 *     "votes": [{ "agent_id": "A###", "vote": "PASS|FAIL", "reason": "...", "ts": "ISO" }],
 *     "status": "open | decided | timeout",
 *     "decision": "PASS | FAIL | TIMEOUT | null",
 *     "decided_at": null,
 *     "opened_at": "ISO",
 *     "timeout_sec": 600
 *   }
 *
 * CLI:
 *   node tools/quorum-validator.mjs open --subject "..." [--threshold 2:3] [--timeout 600]
 *   node tools/quorum-validator.mjs vote <session_id> --agent A### --vote PASS|FAIL --reason "..."
 *   node tools/quorum-validator.mjs status <session_id>
 *   node tools/quorum-validator.mjs decide <session_id>
 *   node tools/quorum-validator.mjs list [--status open]
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const STATE_FILE = resolve(REPO_ROOT, "state/quorum-sessions.json");

// ---------------------------------------------------------------------------
// ULID-lite
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

function newSessionId() { return `qrm_${ulid()}`; }
function newTraceId()   { return `trc_${ulid()}`; }

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function loadState() {
  if (!existsSync(STATE_FILE)) return { sessions: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { sessions: {} };
  }
}

function saveState(state) {
  mkdirSync(resolve(REPO_ROOT, "state"), { recursive: true });
  const tmp = STATE_FILE + ".tmp." + process.pid;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, STATE_FILE);
}

// ---------------------------------------------------------------------------
// Event store integration
// ---------------------------------------------------------------------------
async function emitEvent(kind, payload, subject) {
  try {
    const { appendEvent } = await import("./event-store.mjs");
    appendEvent({ kind, payload, subject: subject ?? null });
  } catch {
    // silently skip
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Try to auto-decide based on current votes. Returns updated session. */
function tryAutoDecide(session) {
  if (session.status !== "open") return session;

  const { n, of: total } = session.threshold;
  const passCnt = session.votes.filter((v) => v.vote === "PASS").length;
  const failCnt = session.votes.filter((v) => v.vote === "FAIL").length;

  // n PASS votes → PASS
  if (passCnt >= n) {
    session.status = "decided";
    session.decision = "PASS";
    session.decided_at = new Date().toISOString();
    return session;
  }

  // majority of `of` is FAIL (more than half of total)
  const failMajority = Math.floor(total / 2) + 1;
  if (failCnt >= failMajority) {
    session.status = "decided";
    session.decision = "FAIL";
    session.decided_at = new Date().toISOString();
    return session;
  }

  return session;
}

function openSession({ subject, threshold = "2:3", timeoutSec = 600 }) {
  const state = loadState();

  const [n, of_] = threshold.split(":").map(Number);
  if (!n || !of_) throw new Error(`Invalid threshold "${threshold}" — use N:M e.g. 2:3`);

  const session = {
    session_id: newSessionId(),
    trace_id: newTraceId(),
    subject,
    threshold: { n, of: of_ },
    votes: [],
    status: "open",
    decision: null,
    decided_at: null,
    opened_at: new Date().toISOString(),
    timeout_sec: Number(timeoutSec),
  };

  state.sessions[session.session_id] = session;
  saveState(state);
  return session;
}

function castVote({ sessionId, agentId, vote, reason }) {
  if (!["PASS", "FAIL"].includes(vote)) {
    throw new Error(`vote must be PASS or FAIL, got "${vote}"`);
  }
  const state = loadState();
  const session = state.sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.status !== "open") throw new Error(`Session ${sessionId} is already ${session.status}`);

  // Check timeout
  const openedMs = new Date(session.opened_at).getTime();
  const elapsedSec = (Date.now() - openedMs) / 1000;
  if (elapsedSec > session.timeout_sec) {
    session.status = "timeout";
    session.decision = "TIMEOUT";
    session.decided_at = new Date().toISOString();
    state.sessions[sessionId] = session;
    saveState(state);
    throw new Error(`Session ${sessionId} has timed out`);
  }

  // Deduplicate per agent
  const existing = session.votes.findIndex((v) => v.agent_id === agentId);
  const voteEntry = { agent_id: agentId, vote, reason: reason ?? null, ts: new Date().toISOString() };
  if (existing >= 0) {
    session.votes[existing] = voteEntry; // allow vote update
  } else {
    session.votes.push(voteEntry);
  }

  // Try auto-decide
  tryAutoDecide(session);
  state.sessions[sessionId] = session;
  saveState(state);
  return session;
}

function getStatus(sessionId) {
  const state = loadState();
  const session = state.sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  return session;
}

function forceDecide(sessionId) {
  const state = loadState();
  const session = state.sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);

  if (session.status !== "open") return session; // already decided

  const openedMs = new Date(session.opened_at).getTime();
  const elapsedSec = (Date.now() - openedMs) / 1000;

  if (elapsedSec > session.timeout_sec) {
    session.status = "timeout";
    session.decision = "TIMEOUT";
    session.decided_at = new Date().toISOString();
  } else {
    // Try to decide by current votes
    tryAutoDecide(session);
    if (session.status === "open") {
      // Not enough votes yet and no timeout — mark as timeout
      session.status = "timeout";
      session.decision = "TIMEOUT";
      session.decided_at = new Date().toISOString();
    }
  }

  state.sessions[sessionId] = session;
  saveState(state);
  return session;
}

function listSessions({ statusFilter } = {}) {
  const state = loadState();
  return Object.values(state.sessions).filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });
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
  const [, , cmd, idArg] = process.argv;
  const flags = parseFlags(process.argv.slice(3));

  switch (cmd) {
    case "open": {
      const subject = flags["subject"];
      if (!subject) {
        console.error('usage: open --subject "..." [--threshold 2:3] [--timeout 600]');
        process.exit(2);
      }
      const session = openSession({
        subject,
        threshold: flags["threshold"] ?? "2:3",
        timeoutSec: flags["timeout"] ?? 600,
      });
      await emitEvent("quorum_opened", {
        session_id: session.session_id,
        subject: session.subject,
        threshold: session.threshold,
      }, session.subject);
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    case "vote": {
      const sessionId = idArg;
      const agentId = flags["agent"];
      const vote = flags["vote"];
      if (!sessionId || !agentId || !vote) {
        console.error("usage: vote <session_id> --agent A### --vote PASS|FAIL --reason '...'");
        process.exit(2);
      }
      const session = castVote({ sessionId, agentId, vote, reason: flags["reason"] });
      await emitEvent("quorum_vote", {
        session_id: sessionId,
        agent_id: agentId,
        vote,
        reason: flags["reason"] ?? null,
        session_status: session.status,
        decision: session.decision,
      }, session.subject);
      if (session.status === "decided") {
        await emitEvent("quorum_decide", {
          session_id: sessionId,
          decision: session.decision,
          subject: session.subject,
          votes: session.votes,
        }, session.subject);
      }
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    case "status": {
      const sessionId = idArg;
      if (!sessionId) {
        console.error("usage: status <session_id>");
        process.exit(2);
      }
      console.log(JSON.stringify(getStatus(sessionId), null, 2));
      return;
    }

    case "decide": {
      const sessionId = idArg;
      if (!sessionId) {
        console.error("usage: decide <session_id>");
        process.exit(2);
      }
      const session = forceDecide(sessionId);
      await emitEvent("quorum_decide", {
        session_id: sessionId,
        decision: session.decision,
        subject: session.subject,
        votes: session.votes,
        forced: true,
      }, session.subject);
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    case "list": {
      const sessions = listSessions({ statusFilter: flags["status"] });
      for (const s of sessions) console.log(JSON.stringify(s));
      return;
    }

    default:
      console.error(
        "usage: quorum-validator.mjs <open|vote|status|decide|list> ..."
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
