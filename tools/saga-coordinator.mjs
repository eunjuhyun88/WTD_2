#!/usr/bin/env node
/**
 * W-0277 Phase 7 — Saga Pattern Coordinator
 *
 * Orchestrates multi-step distributed transactions with compensating actions.
 * If a step fails, the saga runs compensating actions in reverse order
 * (step N → N-1 → ... → 0) to restore consistency.
 *
 * State: state/sagas.json (atomic write)
 *
 * Saga definition (JSON file):
 *   {
 *     "name": "parallel-4agent-impl",
 *     "steps": [
 *       {
 *         "step_id": "stp_001",
 *         "name": "W-0275 capability tokens",
 *         "agent_id": null,
 *         "work_item": "W-0275",
 *         "action": { "type": "create_pr", "branch_pattern": "feat/W-0275-*" },
 *         "compensating_action": { "type": "close_pr", "description": "close PR if saga fails" }
 *       }
 *     ]
 *   }
 *
 * Saga instance (state/sagas.json):
 *   {
 *     "saga_id": "sga_<ulid>",
 *     "trace_id": "trc_<ulid>",
 *     "name": "...",
 *     "status": "running|completed|compensating|failed",
 *     "steps": [{ ...step + runtime fields }],
 *     "current_step": 0,
 *     "compensate_from": null,
 *     "started_at": "ISO",
 *     "completed_at": null
 *   }
 *
 * CLI:
 *   node tools/saga-coordinator.mjs define <definition.json>
 *   node tools/saga-coordinator.mjs start <saga_name>
 *   node tools/saga-coordinator.mjs step-done <saga_id> <step_id> [--pr-number N]
 *   node tools/saga-coordinator.mjs step-failed <saga_id> <step_id> [--error "..."]
 *   node tools/saga-coordinator.mjs status <saga_id>
 *   node tools/saga-coordinator.mjs compensate <saga_id>
 *   node tools/saga-coordinator.mjs list [--status running|completed|failed]
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
const STATE_FILE = resolve(REPO_ROOT, "state/sagas.json");

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

function newSagaId() { return `sga_${ulid()}`; }
function newTraceId() { return `trc_${ulid()}`; }

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function loadState() {
  if (!existsSync(STATE_FILE)) return { sagas: {}, definitions: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { sagas: {}, definitions: {} };
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

function defineDefinition(definitionPath) {
  const raw = readFileSync(definitionPath, "utf8");
  const def = JSON.parse(raw);
  if (!def.name) throw new Error("Definition must have a 'name' field");
  if (!Array.isArray(def.steps)) throw new Error("Definition must have a 'steps' array");

  const state = loadState();
  state.definitions[def.name] = def;
  saveState(state);
  return def;
}

function startSaga(sagaName) {
  const state = loadState();
  const def = state.definitions[sagaName];
  if (!def) throw new Error(`Saga definition "${sagaName}" not found. Run define first.`);

  const sagaId = newSagaId();
  const saga = {
    saga_id: sagaId,
    trace_id: newTraceId(),
    name: sagaName,
    status: "running",
    steps: def.steps.map((step) => ({
      ...step,
      status: "pending",
      started_at: null,
      completed_at: null,
      error: null,
      result: null,
    })),
    current_step: 0,
    compensate_from: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  };

  // Mark first step as running
  if (saga.steps.length > 0) {
    saga.steps[0].status = "running";
    saga.steps[0].started_at = new Date().toISOString();
  }

  state.sagas[sagaId] = saga;
  saveState(state);
  return saga;
}

function stepDone(sagaId, stepId, { prNumber } = {}) {
  const state = loadState();
  const saga = state.sagas[sagaId];
  if (!saga) throw new Error(`Saga ${sagaId} not found`);
  if (saga.status !== "running") throw new Error(`Saga ${sagaId} is not running (status: ${saga.status})`);

  const stepIdx = saga.steps.findIndex((s) => s.step_id === stepId);
  if (stepIdx < 0) throw new Error(`Step ${stepId} not found in saga ${sagaId}`);

  const step = saga.steps[stepIdx];
  step.status = "completed";
  step.completed_at = new Date().toISOString();
  if (prNumber) step.result = { pr_number: prNumber };

  // Check if there's a next step
  const nextIdx = stepIdx + 1;
  if (nextIdx < saga.steps.length) {
    saga.steps[nextIdx].status = "running";
    saga.steps[nextIdx].started_at = new Date().toISOString();
    saga.current_step = nextIdx;
  } else {
    // All steps complete
    saga.status = "completed";
    saga.completed_at = new Date().toISOString();
    saga.current_step = saga.steps.length;
  }

  state.sagas[sagaId] = saga;
  saveState(state);
  return saga;
}

function stepFailed(sagaId, stepId, { error } = {}) {
  const state = loadState();
  const saga = state.sagas[sagaId];
  if (!saga) throw new Error(`Saga ${sagaId} not found`);
  if (saga.status !== "running") throw new Error(`Saga ${sagaId} is not running (status: ${saga.status})`);

  const stepIdx = saga.steps.findIndex((s) => s.step_id === stepId);
  if (stepIdx < 0) throw new Error(`Step ${stepId} not found in saga ${sagaId}`);

  saga.steps[stepIdx].status = "failed";
  saga.steps[stepIdx].completed_at = new Date().toISOString();
  saga.steps[stepIdx].error = error ?? null;

  // Trigger compensation from last completed step before this one
  const compensateFrom = stepIdx - 1; // compensate from previous completed step
  saga.status = "compensating";
  saga.compensate_from = compensateFrom;

  // Run compensation inline (mark all preceding completed steps as compensating)
  runCompensation(saga);

  state.sagas[sagaId] = saga;
  saveState(state);
  return saga;
}

/**
 * Apply compensation metadata in reverse order.
 * Actual compensating actions are advisory (recorded, not executed here).
 */
function runCompensation(saga) {
  if (saga.compensate_from === null) return;

  // Mark steps to be compensated in reverse order (step N → 0)
  for (let i = saga.compensate_from; i >= 0; i--) {
    const step = saga.steps[i];
    if (step.status === "completed") {
      step.status = "compensated";
      step.compensated_at = new Date().toISOString();
    }
  }

  saga.status = "failed";
  saga.completed_at = new Date().toISOString();
}

function triggerCompensate(sagaId) {
  const state = loadState();
  const saga = state.sagas[sagaId];
  if (!saga) throw new Error(`Saga ${sagaId} not found`);

  if (saga.status === "failed" || saga.status === "compensating") {
    // Find the last completed step index
    let lastCompleted = -1;
    for (let i = 0; i < saga.steps.length; i++) {
      if (saga.steps[i].status === "completed" || saga.steps[i].status === "compensated") {
        lastCompleted = i;
      }
    }
    saga.compensate_from = lastCompleted;
    saga.status = "compensating";
    runCompensation(saga);
  } else {
    throw new Error(`Saga ${sagaId} cannot be compensated (status: ${saga.status})`);
  }

  state.sagas[sagaId] = saga;
  saveState(state);
  return saga;
}

function getSagaStatus(sagaId) {
  const state = loadState();
  const saga = state.sagas[sagaId];
  if (!saga) throw new Error(`Saga ${sagaId} not found`);
  return saga;
}

function listSagas({ statusFilter } = {}) {
  const state = loadState();
  return Object.values(state.sagas).filter((s) => {
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
  const args = process.argv.slice(2);
  const cmd = args[0];
  const flags = parseFlags(args.slice(1));

  switch (cmd) {
    case "define": {
      const defPath = args[1];
      if (!defPath) {
        console.error("usage: define <definition.json>");
        process.exit(2);
      }
      const def = defineDefinition(resolve(process.cwd(), defPath));
      console.log(JSON.stringify(def, null, 2));
      return;
    }

    case "start": {
      const sagaName = args[1];
      if (!sagaName) {
        console.error("usage: start <saga_name>");
        process.exit(2);
      }
      const saga = startSaga(sagaName);
      await emitEvent("saga_start", {
        saga_id: saga.saga_id,
        name: saga.name,
        steps: saga.steps.map((s) => s.step_id),
      }, saga.name);
      console.log(JSON.stringify(saga, null, 2));
      return;
    }

    case "step-done": {
      const sagaId = args[1];
      const stepId = args[2];
      if (!sagaId || !stepId) {
        console.error("usage: step-done <saga_id> <step_id> [--pr-number N]");
        process.exit(2);
      }
      const saga = stepDone(sagaId, stepId, { prNumber: flags["pr-number"] });
      await emitEvent("saga_step_done", {
        saga_id: sagaId,
        step_id: stepId,
        pr_number: flags["pr-number"] ?? null,
        saga_status: saga.status,
      }, saga.name);
      if (saga.status === "completed") {
        await emitEvent("saga_complete", {
          saga_id: sagaId,
          name: saga.name,
        }, saga.name);
      }
      console.log(JSON.stringify(saga, null, 2));
      return;
    }

    case "step-failed": {
      const sagaId = args[1];
      const stepId = args[2];
      if (!sagaId || !stepId) {
        console.error("usage: step-failed <saga_id> <step_id> [--error '...']");
        process.exit(2);
      }
      const saga = stepFailed(sagaId, stepId, { error: flags["error"] });
      await emitEvent("saga_compensate", {
        saga_id: sagaId,
        failed_step: stepId,
        error: flags["error"] ?? null,
        compensated_steps: saga.steps
          .filter((s) => s.status === "compensated")
          .map((s) => s.step_id),
      }, saga.name);
      console.log(JSON.stringify(saga, null, 2));
      return;
    }

    case "status": {
      const sagaId = args[1];
      if (!sagaId) {
        console.error("usage: status <saga_id>");
        process.exit(2);
      }
      console.log(JSON.stringify(getSagaStatus(sagaId), null, 2));
      return;
    }

    case "compensate": {
      const sagaId = args[1];
      if (!sagaId) {
        console.error("usage: compensate <saga_id>");
        process.exit(2);
      }
      const saga = triggerCompensate(sagaId);
      await emitEvent("saga_compensate", {
        saga_id: sagaId,
        manual: true,
        compensated_steps: saga.steps
          .filter((s) => s.status === "compensated")
          .map((s) => s.step_id),
      }, saga.name);
      console.log(JSON.stringify(saga, null, 2));
      return;
    }

    case "list": {
      const sagas = listSagas({ statusFilter: flags["status"] });
      for (const s of sagas) console.log(JSON.stringify(s));
      return;
    }

    default:
      console.error(
        "usage: saga-coordinator.mjs <define|start|step-done|step-failed|status|compensate|list> ..."
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
