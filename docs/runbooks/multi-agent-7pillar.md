# Multi-Agent 7-Pillar Operations Runbook

> W-0278 Integration Scenario — 2026-04-28
> Standard operation guide for the "4 sub-agent parallel PR bundle" using the 7-pillar multi-agent system.

---

## 1. Prerequisites

- Node.js >= 22 in PATH (default: `/Users/ej/.local/node-v22.14.0-darwin-arm64/bin`)
- Python 3 available for JSON parsing in shell scripts
- `state/` directory auto-created by tools on first run
- Tools are executable: `chmod +x tools/integration-test.sh tools/circuit-breaker.sh`

Verify:

```bash
node --version          # >= 22
python3 --version       # >= 3.9
ls state/               # created after first tool run
```

---

## 2. Quick Start — Standard 4-Agent Scenario

This describes the canonical "4 sub-agent parallel PR bundle" flow where Agents A001–A004 each implement one work item concurrently.

### Step 1: Issue Capability Tokens (Pillar 3)

Before launching sub-agents, the orchestrator issues a scoped capability token per agent:

```bash
node tools/capability-issuer.mjs issue \
  --work-item W-0275 \
  --agent A001 \
  --expires 8h \
  --scope-json '{"allowed_tools":["Bash","Edit","Write","Read"],"allowed_paths":["tools/","engine/"],"allowed_commands":["git commit","git push","pytest"],"forbidden_paths":["state/","spec/CONTRACTS.md"]}'
# Returns JSON with token_id. Pass token_id to each sub-agent prompt.
```

Repeat for A002, A003, A004 with respective work items.

### Step 2: Start Conflict Detector Claims (Pillar 2)

Each agent declares which files it will modify before starting work:

```bash
node tools/conflict-detector.mjs claim engine/my_module.py \
  --agent A001 --work-item W-0275
```

If another agent has already claimed the file, this surfaces the conflict immediately.

### Step 3: Start Saga (Pillar 5)

Define and start the orchestration saga:

```bash
node tools/saga-coordinator.mjs define tools/saga-definitions/parallel-4agent.json
node tools/saga-coordinator.mjs start parallel-4agent-impl
# Returns saga_id — track this for step reporting
```

### Step 4: Open Trace (Pillar 4)

Start a root span for the overall session:

```bash
node tools/trace-emit.mjs start-span --op "parallel-4agent-session" --agent A000
# Returns span_id
```

### Step 5: Launch Sub-Agents

Launch 4 agents in parallel using `isolation: "worktree"`. Each agent:
1. Checks its capability token on start
2. Claims its files
3. Does the work (implement, test, PR)
4. Calls `step-done` when complete

```bash
# After each sub-agent completes:
node tools/saga-coordinator.mjs step-done "$SAGA_ID" stp_001 --pr-number 521
node tools/saga-coordinator.mjs step-done "$SAGA_ID" stp_002 --pr-number 522
node tools/saga-coordinator.mjs step-done "$SAGA_ID" stp_003 --pr-number 523
node tools/saga-coordinator.mjs step-done "$SAGA_ID" stp_004
```

### Step 6: Quorum Validate PRs (Pillar 7)

For design or architectural changes requiring consensus:

```bash
SESSION=$(node tools/quorum-validator.mjs open \
  --subject "W-0275/W-0276/W-0277 bundle review" \
  --threshold 2:3 | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")

node tools/quorum-validator.mjs vote "$SESSION" --agent A001 --vote PASS --reason "LGTM"
node tools/quorum-validator.mjs vote "$SESSION" --agent A002 --vote PASS --reason "LGTM"
# Auto-decides at 2/3 threshold
```

### Step 7: Close and Cleanup

```bash
# End trace
node tools/trace-emit.mjs end-span "$SPAN_ID" --status ok

# Release claims after PR merge
node tools/conflict-detector.mjs release --agent A001

# Revoke tokens after session
node tools/capability-issuer.mjs revoke "$TOKEN_ID"
```

---

## 3. Tool Reference

| Tool | Command | Pillar | Purpose |
|---|---|---|---|
| `event-store.mjs` | `appendEvent` / `queryEvents` | 1: Event Log | Immutable append-only event journal |
| `conflict-detector.mjs` | `claim` / `check-staged` / `release` | 2: Concurrency | Optimistic file-level locking |
| `capability-issuer.mjs` | `issue` / `check` / `revoke` / `list` / `sweep` | 3: Tokens | Scoped per-agent capability tokens |
| `trace-emit.mjs` | `start-span` / `end-span` / `show-tree` | 4: Tracing | Distributed causal trace trees |
| `saga-coordinator.mjs` | `define` / `start` / `step-done` / `step-failed` / `compensate` | 5: Saga | Distributed transactions with rollback |
| `circuit-breaker.sh` | `check` / `failure` / `success` / `reset` / `timeout-check` | 6: Fault Isolation | Auto CLOSED/OPEN/HALF-OPEN state |
| `quorum-validator.mjs` | `open` / `vote` / `status` / `decide` | 7: Consensus | Multi-agent voting sessions |

---

## 4. KPI Measurement

Track these 5 KPIs per multi-agent session:

| KPI | Target | How to Measure |
|---|---|---|
| **7-pillar coverage** | All 7 pillars exercised per session | Check event store for all 7 `kind` prefixes |
| **Timeout rate** | < 5% of saga steps time out | `saga-coordinator list --status failed` / total |
| **Conflict rate** | < 10% of claims result in conflict | `conflict-detector list` then count blocked claims |
| **Scope creep** | 0 files modified outside claimed paths | `conflict-detector check-staged` before every commit |
| **Quorum usage** | >= 1 quorum session per architectural PR | `quorum-validator list` count vs PR count |

---

## 5. Failure Diagnosis

### Pillar 1 — Event Store

**Symptom**: `memory/events/<date>.jsonl` missing or empty after tool runs.
**Fix**: Verify `memory/events/` directory exists (`mkdir -p memory/events`). Event store creates it on first write.

### Pillar 2 — Conflict Detector

**Symptom**: `state/claims.json` shows a file claimed by another agent.
**Fix**: Check with `node tools/conflict-detector.mjs list`. If the blocking agent is done, `release --agent <A###>`. Never force-release another agent's claim without coordination.

### Pillar 3 — Capability Issuer

**Symptom**: `check` returns `valid: false, reason: expired`.
**Fix**: Issue a new token with `--expires 8h`. Run `sweep` to clear old expired tokens: `node tools/capability-issuer.mjs sweep`.

### Pillar 4 — Trace Emit

**Symptom**: `end-span` fails with "span not found".
**Fix**: Open span file may be missing from `state/spans/open/`. If lost, skip `end-span` — the span start event is already in the event store.

### Pillar 5 — Saga Coordinator

**Symptom**: Saga stuck in `compensating` state.
**Fix**: Run `node tools/saga-coordinator.mjs status <saga_id>` to inspect step states. If safe to force-complete: `node tools/saga-coordinator.mjs compensate <saga_id>`.

### Pillar 6 — Circuit Breaker

**Symptom**: `check` exits 1 (OPEN state), blocking agent launch.
**Fix**: Check status with `bash tools/circuit-breaker.sh status <key>`. After diagnosing the root failure: `bash tools/circuit-breaker.sh reset <key>` to force CLOSED.

### Pillar 7 — Quorum Validator

**Symptom**: Session stuck in `open` with not enough voters available.
**Fix**: `node tools/quorum-validator.mjs decide <session_id>` forces a decision based on current votes (or TIMEOUT if none).

---

## 6. Smoke Test

Run the full integration test to verify all 7 pillars are working:

```bash
bash tools/integration-test.sh
```

Expected output: `Results: 8 passed | 0 failed | 1 skipped` (AC7 skipped is acceptable — event store path varies by environment).

The script resets `state/` before running, so it is safe to run at any time without side effects on live agent state.

---

## 7. References

- W-0270: Multi-Agent System Theory — 7-pillar design (`work/active/W-0270-*.md`)
- W-0271: Event Store (`tools/event-store.mjs`)
- W-0272: Distributed Tracing (`tools/trace-emit.mjs`)
- W-0273: Circuit Breaker (`tools/circuit-breaker.sh`)
- W-0274: Conflict Detector (`tools/conflict-detector.mjs`)
- W-0275: Capability Tokens (`tools/capability-issuer.mjs`)
- W-0276: Quorum Validator (`tools/quorum-validator.mjs`)
- W-0277: Saga Coordinator (`tools/saga-coordinator.mjs`)
- W-0278: Integration Test + Runbook (this file)
- Garcia-Molina & Salem 1987: "Sagas" (SIGMOD) — compensating transaction theory
- Nygard 2007: "Release It!" — circuit breaker pattern
