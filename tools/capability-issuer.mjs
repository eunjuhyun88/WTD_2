#!/usr/bin/env node
/**
 * W-0275 Phase 5 — Capability Tokens
 *
 * Issues, checks, revokes, and lists scoped capability tokens for agents.
 * Tokens bound to a (work_item, agent_id) pair with an expiry window and
 * a capability scope (tools, paths, commands).
 *
 * State: state/capabilities.json (atomic write via tmp + rename)
 *
 * Token shape:
 *   {
 *     "token_id": "cap_<ulid>",
 *     "work_item": "W-####",
 *     "agent_id": "A###",
 *     "issued_at": "ISO",
 *     "expires_at": "ISO",
 *     "nonce": "<hex8>",
 *     "scope": {
 *       "allowed_tools": ["Bash","Edit","Write","Read","Glob","Grep"],
 *       "allowed_paths": [],
 *       "allowed_commands": [],
 *       "forbidden_paths": []
 *     },
 *     "status": "active | expired | revoked",
 *     "revoked_at": null,
 *     "revoke_reason": null
 *   }
 *
 * CLI:
 *   node tools/capability-issuer.mjs issue --work-item W-#### --agent A###
 *        [--expires 8h] [--scope-json '{...}']
 *   node tools/capability-issuer.mjs check <token_id>
 *   node tools/capability-issuer.mjs revoke <token_id> [--reason "..."]
 *   node tools/capability-issuer.mjs list [--agent A###] [--work-item W-####]
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
const STATE_FILE = resolve(REPO_ROOT, "state/capabilities.json");

// ---------------------------------------------------------------------------
// ULID-lite (same pattern as event-store.mjs)
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

function newTokenId() {
  return `cap_${ulid()}`;
}

function nonce() {
  return randomBytes(4).toString("hex");
}

// ---------------------------------------------------------------------------
// Parse duration strings like "8h", "30m", "1d"
// ---------------------------------------------------------------------------
function parseDuration(s) {
  const match = /^(\d+)(h|m|d)$/.exec(String(s));
  if (!match) throw new Error(`Invalid duration "${s}" — use e.g. 8h, 30m, 1d`);
  const n = Number(match[1]);
  const unit = match[2];
  const msMap = { h: 3600_000, m: 60_000, d: 86_400_000 };
  return n * msMap[unit];
}

// ---------------------------------------------------------------------------
// State helpers (atomic read-modify-write)
// ---------------------------------------------------------------------------
function loadState() {
  if (!existsSync(STATE_FILE)) return { tokens: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { tokens: {} };
  }
}

function saveState(state) {
  mkdirSync(resolve(REPO_ROOT, "state"), { recursive: true });
  const tmp = STATE_FILE + ".tmp." + process.pid;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, STATE_FILE);
}

// ---------------------------------------------------------------------------
// Sweep expired tokens (mutates state.tokens in-place, returns count swept)
// ---------------------------------------------------------------------------
function sweepExpired(state) {
  const now = new Date().toISOString();
  let swept = 0;
  for (const [id, tok] of Object.entries(state.tokens)) {
    if (tok.status === "active" && tok.expires_at < now) {
      state.tokens[id].status = "expired";
      swept++;
    }
  }
  return swept;
}

// ---------------------------------------------------------------------------
// Event store integration (dynamic import to keep coupling optional)
// ---------------------------------------------------------------------------
async function emitEvent(kind, payload) {
  try {
    const { appendEvent } = await import("./event-store.mjs");
    appendEvent({ kind, payload, subject: payload.work_item ?? null });
  } catch {
    // event-store unavailable — silently skip
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------
function issueToken({ workItem, agentId, expiresIn = "8h", scopeOverride }) {
  const state = loadState();
  sweepExpired(state);

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + parseDuration(expiresIn)).toISOString();

  const defaultScope = {
    allowed_tools: ["Bash", "Edit", "Write", "Read", "Glob", "Grep"],
    allowed_paths: [],
    allowed_commands: ["git commit", "git push", "pytest"],
    forbidden_paths: [],
  };

  const scope = scopeOverride
    ? { ...defaultScope, ...scopeOverride }
    : defaultScope;

  const token = {
    token_id: newTokenId(),
    work_item: workItem,
    agent_id: agentId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce: nonce(),
    scope,
    status: "active",
    revoked_at: null,
    revoke_reason: null,
  };

  state.tokens[token.token_id] = token;
  saveState(state);
  return token;
}

function checkToken(tokenId) {
  const state = loadState();
  sweepExpired(state);
  saveState(state);

  const tok = state.tokens[tokenId];
  if (!tok) return { valid: false, reason: "not_found" };
  if (tok.status === "revoked") return { valid: false, reason: "revoked", token: tok };
  if (tok.status === "expired") return { valid: false, reason: "expired", token: tok };
  return { valid: true, token: tok };
}

function revokeToken(tokenId, reason) {
  const state = loadState();
  const tok = state.tokens[tokenId];
  if (!tok) throw new Error(`Token ${tokenId} not found`);
  if (tok.status === "revoked") throw new Error(`Token ${tokenId} already revoked`);

  state.tokens[tokenId] = {
    ...tok,
    status: "revoked",
    revoked_at: new Date().toISOString(),
    revoke_reason: reason ?? null,
  };
  saveState(state);
  return state.tokens[tokenId];
}

function listTokens({ agentId, workItem } = {}) {
  const state = loadState();
  sweepExpired(state);
  saveState(state);

  return Object.values(state.tokens).filter((tok) => {
    if (agentId && tok.agent_id !== agentId) return false;
    if (workItem && tok.work_item !== workItem) return false;
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
  const [, , cmd, idArg, ...rest] = process.argv;
  const flags = parseFlags(process.argv.slice(3));

  switch (cmd) {
    case "issue": {
      const workItem = flags["work-item"];
      const agentId = flags["agent"];
      if (!workItem || !agentId) {
        console.error("usage: issue --work-item W-#### --agent A### [--expires 8h] [--scope-json '{...}']");
        process.exit(2);
      }
      const scopeOverride = flags["scope-json"]
        ? JSON.parse(flags["scope-json"])
        : undefined;
      const token = issueToken({
        workItem,
        agentId,
        expiresIn: flags["expires"] ?? "8h",
        scopeOverride,
      });
      await emitEvent("capability_issued", {
        token_id: token.token_id,
        work_item: token.work_item,
        agent_id: token.agent_id,
        expires_at: token.expires_at,
      });
      console.log(JSON.stringify(token, null, 2));
      return;
    }

    case "check": {
      const tokenId = idArg;
      if (!tokenId) {
        console.error("usage: check <token_id>");
        process.exit(2);
      }
      const result = checkToken(tokenId);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
      return;
    }

    case "revoke": {
      const tokenId = idArg;
      if (!tokenId) {
        console.error("usage: revoke <token_id> [--reason '...']");
        process.exit(2);
      }
      const tok = revokeToken(tokenId, flags["reason"]);
      await emitEvent("capability_revoked", {
        token_id: tok.token_id,
        work_item: tok.work_item,
        agent_id: tok.agent_id,
        revoke_reason: tok.revoke_reason,
      });
      console.log(JSON.stringify(tok, null, 2));
      return;
    }

    case "list": {
      const tokens = listTokens({
        agentId: flags["agent"],
        workItem: flags["work-item"],
      });
      for (const t of tokens) console.log(JSON.stringify(t));
      return;
    }

    case "sweep": {
      // Called by start.sh to sweep expired tokens
      const state = loadState();
      const count = sweepExpired(state);
      saveState(state);
      if (count > 0) {
        console.log(`[capability-issuer] swept ${count} expired token(s)`);
      }
      return;
    }

    default:
      console.error(
        "usage: capability-issuer.mjs <issue|check|revoke|list|sweep> ..."
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
