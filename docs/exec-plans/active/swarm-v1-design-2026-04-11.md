# swarm-v1 — Multi-Agent Parallel Development System

- **Date**: 2026-04-11
- **Status**: Active Design (Phase A not yet implemented)
- **Scope**: CHATBATTLE repository (project-local, extractable to plugin later)
- **Parent trunk plan**: `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md`
- **Authority**: This doc is the canonical swarm-v1 design. It supersedes any ad-hoc chat proposals from earlier sessions.

## TL;DR

swarm-v1 is a **10-worker parallel development system** for a solo founder running the three-pipeline trunk plan. It layers on top of Claude Code's native subagent system, uses file-based state (no RPC), and enforces path ownership via pre-commit hooks. The human operates as "board" with one daily 15-minute review cycle; three infrastructure agents (Scheduler, Reviewer-Auto, Main-Keeper) handle the operational loop. Eleven worker agent types spawn on demand across three tracks (product 6 slots, research 3, fix 1). Rollout is phased — 1 → 3 → 5 → 10 over four weeks — with hard exit gates at each stage.

The design explicitly rejects governance-heavy patterns (state machines, event buses, persona role hierarchies) observed in MetaGPT/ChatDev-style frameworks. It borrows directly from Claude Code's own internal swarm architecture discovered at `/Users/ej/Projects/src/utils/swarm/` (team-lead + teammates + file mailbox + permission bridge).

## 1. Context & Problem

### 1.1 The user's situation

- **Single founder**, building CHATBATTLE (SvelteKit fullstack, Supabase backend, 60+ server modules, 40+ API routes, 1131-LOC god-file at `src/lib/server/scanEngine.ts`)
- **Parallel LoRA training** already offloaded to a separate worktree (`wtd`)
- **Three-pipeline trunk plan** estimates 7–9 weeks of work across ~70 logical slices
- **20+ existing git worktrees**, most stale, most unmerged to `main`
- **No existing coordination infrastructure** beyond `coord:claim`, `ctx:*`, `.agent-context/briefs/`

### 1.2 The hard problems at n=10

Problems that are invisible at n≤3 become system-breaking at n=10:

| # | Problem | n=3 | n=10 |
|---|---|---|---|
| 1 | File conflict between agents | rare | constant |
| 2 | Dependency ordering | fits in human memory | requires explicit DAG |
| 3 | Context drift (stale main) | 2–3 days OK | 2 hours is stale |
| 4 | Review bottleneck | ≤3 PRs/day OK | 10 PRs/day = impossible |
| 5 | Stale agent accumulation | weekly sweep | hourly sweep |
| 6 | Gate I/O contention | none | Supabase, Vercel, npm contention |
| 7 | Memory/context drift | weekly compact | hourly compact |
| 8 | **Claude API rate limit** | never hit | **always hit — hardest constraint** |

The final item — API rate limits at n=10 — is the single most important design constraint. Concurrent slots don't mean simultaneous execution; the scheduler must stagger spawns.

### 1.3 What's different from solo + WIP 3

At WIP ≤ 3, governance infrastructure is overkill. The CTO posture is "ship code, not coordination layers". At WIP = 10, that inverts completely:

- Path ownership must be **enforced by tooling**, not discipline
- Slice lifetime must be **auto-swept**, not manually reviewed
- Human review cannot be synchronous per-PR
- Scheduler must **explicitly** stagger work to protect rate limits

This doc documents the WIP=10 system. It explicitly does **not** recommend running at WIP=10 immediately.

## 2. Design Principles (Lessons from Earlier Drafts)

Across this session we iterated through six drafts. The final principles that survived contradict most of the early drafts:

1. **Ship code, not governance infrastructure.** Every rule must pay rent in shipped code, not in "visibility" or "control".
2. **Claude Code native first, custom layer second.** Use `.claude/agents/*.md`, Task tool, hooks, scheduled-tasks MCP before building anything bespoke.
3. **File state > event bus.** JSON/JSONL files in `.agent-context/` are simpler, debuggable, git-trackable. No publish/subscribe, no message queues.
4. **Pre-commit hooks > runtime checks.** Enforce path ownership at commit time, when violation is cheapest to fix. Runtime checks are noise.
5. **Human as board, not operator.** Two human decision points only: merge approval and kill decision. Everything else is automation.
6. **Phased rollout (1 → 3 → 5 → 10), never straight to 10.** Each phase has explicit exit criteria. Rollback is the default response to regression.
7. **Two tracks never share code, only contracts.** Product track and research track meet only at `src/lib/contracts/*.ts`. Physical separation prevents learning-loop sprint cadence from blocking user-facing shipping.
8. **Reviewer quality = system quality.** At n=10, one false PASS per day = one broken main per day. Reviewer agent must be over-strict for the first two weeks.
9. **Rate limit and cost are first-class constraints.** Not an afterthought. Scheduler caps spawn rate; daily digest tracks API spend.
10. **Solo-specific.** This is not a team coordination system. Multi-user extensions are explicit non-goals.

### 2.1 Explicitly rejected from earlier drafts

| Rejected | Reason |
|---|---|
| 5-state slice state machine | Task-type system (LocalAgent/Remote/InProcess) already works; state machine is reinvention |
| Event-sourced `slices.jsonl` with 8 event types | Git log + append-only journal covers 95% at 5% of the complexity |
| Persona files with `paths_allowed`/`paths_forbidden` YAML | Pre-commit hook enforces paths; personas only hold system prompts |
| WIP limits enforced by JSON policy | WIP limits live in `policy/wip-limits.json` but enforcement is in Scheduler code, not via rules engine |
| kill-gates.json with semantic criteria | Kill decisions remain cognitive (human); policy file documents thresholds only |
| 5 persona subagents (ci-fix, merge-train, context-compactor, etc.) | Collapsed: ci-fix → part of Worker's own loop, merge-train → Main-Keeper, compactor → DreamTask (already exists) |
| CPO-style roadmap dashboard | Out of scope; this is a dev system, not a product management tool |
| MetaGPT-style SOP publish/subscribe | Empirically worse than Claude Code's file-mailbox pattern on SWE-bench |
| Custom orchestration framework | Claude Code's native stack already provides it |

## 3. Architecture Overview

```
              ┌────────────────┐
              │  HUMAN (you)   │
              │  board + CTO   │
              └────────┬───────┘
                       │ 1× daily: approve / reject / kill / extend
                       │ weekly: trunk plan update
                       ▼
        ┌──────────────────────────────┐
        │   Daily Digest (file)         │  ← cron 17:00
        │  .agent-context/digest/       │
        │    YYYY-MM-DD.md              │
        └──────────────────────────────┘
                    ▲
    ┌───────────────┼───────────────┐
    │               │               │
┌───┴────┐    ┌─────┴──────┐   ┌───┴─────────┐
│Scheduler│   │Reviewer-   │   │Main-Keeper  │
│cron 10m │   │Auto (Stop) │   │cron 30m     │
└───┬────┘    └─────┬──────┘   └───┬─────────┘
    │               │              │ merge-train
    │               │              │ stale-sweep
    │               │              │ main-rebase-ping
    ▼               ▼              ▼
┌──────────────────────────────────────────┐
│       STATE LAYER (file-based)            │
│                                            │
│  .agent-context/                          │
│    trunk-plan.dag.json   ← slice DAG      │
│    state/                                  │
│      slices.jsonl         ← append-only   │
│      wip.json             ← counters      │
│      queue.jsonl          ← ready queue   │
│      main.json            ← main hash     │
│    ownership/sl_NNN.json  ← claimed paths │
│    mailbox/sl_NNN/*.jsonl                 │
│    briefs/sl_NNN.md                       │
│    handoffs/sl_NNN-*.md                   │
│    policy/                                 │
│      wip-limits.json                       │
│      kill-gates.json                       │
└──────────────┬─────────────────────────────┘
               │ reads/writes
               ▼
┌──────────────────────────────────────────┐
│       WORKER POOL (WIP ≤ 10)              │
│                                            │
│  product track (max 6)                    │
│  [sl_1][sl_2][sl_3][sl_4][sl_5][sl_6]     │
│                                            │
│  research track (max 3)                   │
│  [sl_7][sl_8][sl_9]                        │
│                                            │
│  fix track (max 1 — surge capacity)       │
│  [sl_10]                                   │
│                                            │
│  each worker = 1 slice = 1 worktree =     │
│                1 branch = 1 PR             │
└──────────────┬─────────────────────────────┘
               │ commits (path-guarded by pre-commit hook)
               ▼
         ┌─────────────┐
         │  git main   │
         └─────────────┘
```

### 3.1 Infrastructure agents (3)

| Agent | Trigger | Responsibility |
|---|---|---|
| **Scheduler** | cron 10m + SubagentStop hook | Read DAG, check WIP, spawn next ready slice, generate brief, claim paths, rate-limit spawns (max 3/min) |
| **Reviewer-Auto** | SubagentStop hook on any worker | Read diff, check DoD, verify ownership boundary, check gate result, output verdict (PASS / REVISE / ESCALATE) |
| **Main-Keeper** | cron 30m | Stale sweep (age >3d → flag, not auto-kill), merge-train (ff-only, max 5/cycle), main-rebase-ping (notify stale slices to rebase) |

Plus **DreamTask** (already exists in Claude Code) for automatic memory compaction — no new agent needed.

### 3.2 Worker agent types (11)

**Product track types** (share 6 WIP slots):

| Type | Scope |
|---|---|
| `product-engineer` | UI, routes, stores, client API |
| `contract-drafter` | zod schemas under `src/lib/contracts/` only |
| `decomposer` | god-file decomposition (plan first, execute one PR at a time) |
| `api-surgeon` | single `+server.ts` route modification |
| `migration-writer` | DB schema + round-trip tests |
| `test-author` | failing tests first (TDD workflow) |

**Research track types** (share 3 WIP slots):

| Type | Scope |
|---|---|
| `research-scientist` | learning loop, baselines, hypothesis validation |
| `data-formatter` | trajectory → JSONL export for LoRA training |
| `eval-runner` | FIXED_SCENARIOS + hit_rate computation |

**Fix track types** (1 WIP slot):

| Type | Scope |
|---|---|
| `gate-unsticker` | `npm run gate` failure recovery, max 3 attempts, refuses test-assertion failures |

Multiple instances of the same type can run concurrently on different slices. Exception: `contract-drafter` is serialized via DAG `mutex` field (see §6).

## 4. State Layer

All shared state lives in `.agent-context/`. No runtime RPC, no databases, no message queues beyond files.

```
.agent-context/
├── trunk-plan.dag.json          # slice DAG (committed to git, human-edited)
│
├── state/                        # runtime, NOT committed
│   ├── slices.jsonl              # append-only event log
│   ├── wip.json                  # {"product": 3, "research": 1, "fix": 0}
│   ├── queue.jsonl               # ready-but-not-spawned
│   └── main.json                 # current main hash + health
│
├── ownership/                    # runtime, NOT committed
│   └── sl_NNN.json               # {"paths": [...], "agent_type": "...", "claimed_at": "..."}
│
├── mailbox/                      # runtime, NOT committed
│   └── sl_NNN/
│       ├── inbox.jsonl
│       └── outbox.jsonl
│
├── briefs/                       # NOT committed (exists already)
│   └── sl_NNN.md                 # auto-generated by Scheduler
│
├── handoffs/                     # NOT committed (exists already)
│   └── sl_NNN-<stage>.md
│
├── policy/                       # committed
│   ├── wip-limits.json           # {"product": 6, "research": 3, "fix": 1}
│   └── kill-gates.json           # thresholds (documentation + Scheduler reads)
│
└── digest/                       # NOT committed
    └── YYYY-MM-DD.md             # daily human review file
```

### 4.1 Commit boundary

**Committed to git** (shared across sessions, team-safe):
- `trunk-plan.dag.json`
- `policy/*.json`
- `.claude/agents/*.md` (all subagent definitions)
- `.claude/commands/*.md` (all slash commands)
- `.claude/settings.json`
- `scripts/slice/**`, `scripts/hooks/**`

**Gitignored** (session-local runtime):
- `state/*`
- `ownership/*`
- `mailbox/*`
- `digest/*`
- `briefs/*` (already)
- `handoffs/*` (already)
- `checkpoints/*` (already)

This split is non-negotiable. Committing runtime state creates merge conflicts; gitignoring the DAG prevents session-to-session continuity.

## 5. Slice DAG Model

The single source of truth is `docs/exec-plans/active/trunk-plan.dag.json`. Every slice is a node; every dependency is an edge. See §12 (Next Actions) for the v0 file.

### 5.1 Node schema

```json
{
  "id": "P0.1-verdict-zod",
  "title": "Promote PipelineResult to VerdictBlock zod schema",
  "track": "product",
  "phase": "P0",
  "priority": 100,
  "agent_type": "contract-drafter",
  "depends_on": [],
  "mutex": ["contract-*"],
  "paths": [
    "src/lib/contracts/verdict.ts",
    "src/lib/contracts/index.ts"
  ],
  "context_files": [
    "src/lib/engine/types.ts",
    "src/lib/engine/agentPipeline.ts",
    "docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md"
  ],
  "dod": [
    "VerdictBlockSchema exported from src/lib/contracts/verdict.ts",
    "z.infer<> type alias VerdictBlock exported",
    "round-trip parse test passes",
    "npm run check exits 0",
    "src/lib/contracts/index.ts re-exports new module"
  ],
  "kill_gate": {
    "gate_fail_max": 3,
    "age_days_max": 3
  }
}
```

### 5.2 Mutex groups

Mutex groups serialize access to shared resources that would otherwise cause merge conflicts:

- `contract-*` — anything touching `src/lib/contracts/**` runs one at a time
- `scanEngine-decompose` — all P1.A0.* slices touching `scanEngine.ts` run one at a time
- `migration-*` — one DB migration at a time (prevents schema race)

The Scheduler enforces mutex: a slice matching any active slice's mutex pattern cannot be spawned until the active one merges.

### 5.3 DAG invariants

- **Acyclic**: Scheduler startup runs topological sort; failure blocks the entire system
- **Single ownership**: each path glob appears in at most one active slice's ownership
- **Phase ordering respected**: a slice with `phase: "P2"` cannot depend only on phase P0 — it must depend on all its P1 predecessors explicitly

## 6. Invariants (10 hard rules)

| # | Rule | Enforcement |
|---|---|---|
| 1 | Each slice has exactly one owner agent type | Brief auto-generation |
| 2 | Each slice has exactly one worktree + branch | Scheduler spawn logic |
| 3 | Slice touches only pre-declared paths | **pre-commit git hook** |
| 4 | Slice age ≤ 3 days (auto-flag to human) | Main-Keeper stale sweep |
| 5 | `main` stays green | Main-Keeper merge uses `--ff-only` |
| 6 | Contract changes serialized | DAG `mutex: ["contract-*"]` |
| 7 | DAG acyclic | Scheduler startup topological sort |
| 8 | Human review queue ≤ 10 items/day | Backpressure: Scheduler lowers effective WIP when queue grows |
| 9 | Gate passes before Reviewer-Auto sees code | Reviewer-Auto's first check |
| 10 | Stale slices auto-archive after 48h human silence | Main-Keeper second-pass sweep |

**Rule #3 is load-bearing.** Without pre-commit path enforcement, n=10 collapses within hours. Everything else is relatively forgiving.

## 7. Packaging Strategy (4-Layer, Phase A/B)

### 7.1 The four layers

```
Layer 4: Plugin (~/.claude/plugins/swarm-v1/)      ← cross-repo, distributable
Layer 3: User-level (~/.claude/)                    ← cross-project for this user
Layer 2: Project-local (CHATBATTLE/.claude/)       ← this repo, git-committed
Layer 1: Session (Task tool ad-hoc)                ← one-off invocation
```

### 7.2 Phase A — Project-local in CHATBATTLE (weeks 1–4)

Everything lives in `CHATBATTLE/.claude/` + `CHATBATTLE/.agent-context/` + `CHATBATTLE/scripts/`. Committed to git. Proven here first.

### 7.3 Phase B — Plugin extraction (week 5+, only if Phase A stable)

Move to `~/.claude/plugins/swarm-v1/` with a `plugin.json` manifest. Install across repos via `/swarm-init` slash command which scaffolds `.agent-context/` in a new repo.

**Strict gate to enter Phase B**:
1. 3 consecutive weeks of Phase A stable (daily `/slice-status` green, weekly merge count ≥ 5)
2. At least 2 failure modes encountered and recovered (gate loops, rate-limit hits, stale sweeps)
3. The CLI scripts have been refactored at least twice

Premature extraction freezes buggy abstractions. Rule of Three applies: copy Phase A manually to a second repo before extracting a plugin.

## 8. Rollout — Week-by-Week

| Week | WIP cap | Focus | Exit gate |
|---|---|---|---|
| **0. Foundation** (3 days) | 1 (manual) | Scheduler/Reviewer/Main-Keeper markdown, pre-commit hook, trunk-plan.dag.json v0, scripts/slice/ CLI skeleton | 1 slice manually spawn → worker → review → merge end-to-end |
| **1. Single-track, WIP 3** | 3 (product only) | Scheduler auto-spawn ON, Reviewer-Auto hook ON | 3 days of 0 stale, human review ≤ 3/day |
| **2. Two-track, WIP 5** | 5 (3 product + 2 research) | Research track added, mutex tested via contract-drafter collision | 0 API throttle events, 1 week main-behind = 0 |
| **3. Full WIP 10** | 10 (6/3/1) | All worker types active, Main-Keeper merge queue exercised | Phase 2 metrics held + review queue ≤ 10/day |
| **4. Optimization** (2 weeks) | 10 | Fix observed bottlenecks (gate queue, rate limit, reviewer false-pass) | Learning loop + product loop both advancing |

Failure at any phase → rollback to previous phase. This is non-negotiable; do not "push through".

## 9. Claude API Rate Limit Handling

The hardest real-world constraint. Mitigations:

1. **Staggered spawn**: Scheduler caps spawns at 3/minute regardless of empty slots
2. **Parallel tool calls within worker**: prompt-level instruction to batch independent calls
3. **Spawn cooldown**: 30–60s between SubagentStop events before Scheduler reacts
4. **Serialized gate**: Main-Keeper merge train runs gate sequentially, max 5 merges per cycle
5. **Observability**: daily digest tracks "API throttle events count" and daily token spend
6. **Daily cost ceiling**: env var `CLAUDE_API_DAILY_CEILING_USD`. At 80% → Scheduler suspends spawns; at 100% → kill signal to all workers.

Without #6, one month at WIP=10 can produce a surprise 7-figure won API bill. Setup day 1.

## 10. Failure Modes Handled

| Failure | Detection | Recovery |
|---|---|---|
| Agent edit loop | 3× same gate error | auto-revert + ESCALATE |
| Two agents same file | pre-commit hook | later commit rejected, re-queue |
| Cyclic DAG update | Scheduler startup | system halted, human alert |
| `main` force-pushed | Main-Keeper hash mismatch | all slices flagged for rebase |
| Scheduler crash | scheduled-task failure event | self-heal next cron; 3 failures → alert |
| Reviewer false PASS | human reject button | slice → IN_PROGRESS + reviewer prompt iteration |
| Rate limit | API error pattern | 30min spawn suspend, exponential backoff |
| Worker memory overflow | session end | DreamTask handoff, Scheduler resumes |

## 11. Risks & Open Questions

### 11.1 Top 3 risks

1. **Reviewer-Auto quality is the bottleneck.** If it PASSes garbage, `main` breaks. Expect 2–3 iterations of prompt refinement. Run intentionally over-strict for weeks 1–2.
2. **DAG maintenance burden.** Human must keep `trunk-plan.dag.json` current as slices resolve. At 50+ slices this becomes tedious. Phase 3+ may need a DAG-generator agent that reads the trunk plan markdown.
3. **Claude API monthly spend.** At WIP=10 with typical tool-call patterns, monthly API cost can reach $X,XXX+. Hard cap required from day 1.

### 11.2 Open questions

1. **Slice ID naming**: `P0.1-verdict-zod` vs `sl_20260411_001` — prefer semantic (DAG-aligned) or timestamp (append-friendly)? **Decision: semantic** (human recall more important than append convenience).
2. **Reviewer-Auto model**: same as workers (sonnet/opus) or smaller (haiku)? **Decision pending**: start with same model, measure cost, downgrade if budget allows.
3. **Gate parallelism**: can multiple workers run `npm run gate` concurrently? Depends on Supabase local + test DB state. **Decision pending**: start serial, relax after Phase 2 observation.
4. **Mutex for `src/lib/contracts/**`**: one-at-a-time strict, or per-file granularity? **Decision: one-at-a-time for safety**; may relax after Phase 3.
5. **Brief language**: Korean or English? **Decision: English** (subagent prompts work better in English; human-facing files can be Korean).

## 12. Next Actions (Ordered)

The ordering is strict: #1 unblocks #2 unblocks #3.

1. **`docs/exec-plans/active/trunk-plan.dag.json` v0** — define the first 10 slices from Phase 0 + Phase 1 of the three-pipeline trunk plan. Without this, subsequent infra has nothing to orchestrate. Authoritative v0 committed alongside this doc.
2. **This doc committed + cross-referenced** in the three-pipeline trunk plan as its operational layer.
3. **`.claude/settings.json` + `scripts/hooks/session-start.sh` + pre-commit hook** — the automation backbone. After this, every new session auto-loads swarm state.
4. **`scripts/slice/cli.mjs`** — the CLI dispatcher. `slice new`, `slice status`, `slice merge`, `slice kill`, `slice approve`.
5. **3 infra agent markdown files**: `.claude/agents/scheduler.md`, `reviewer-auto.md`, `main-keeper.md`.
6. **Smoke test**: spawn 1 slice manually, take it through Scheduler → Worker → Reviewer-Auto → human approve → Main-Keeper merge. End-to-end.
7. **Phase 0 exit**: automate via cron + hooks. Ready for Phase 1 (WIP=3, product only).

## 13. References

### 13.1 In this repo
- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md` — parent trunk plan
- `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md` — verdict_block source of truth
- `docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` — trajectory schema source of truth
- `.claude/agents/README.md` — current subagent catalog
- `AGENTS.md` — mandatory start sequence, branch policy
- `README.md` — collaboration SSOT

### 13.2 External references (architecture inspiration)

From Claude Code's own source at `/Users/ej/Projects/src/`:
- `src/utils/swarm/` — tmux team-lead + teammates pattern (constants, inProcessRunner, permissionSync, teamHelpers, teammateInit)
- `src/utils/teammateMailbox.ts` — file-based mailbox pattern directly inspired §4's state layout
- `src/tools/AgentTool/loadAgentsDir.ts` — markdown subagent loader with frontmatter schema
- `src/tasks/DreamTask/` — background memory consolidation (we use this unchanged for compaction)

From public GitHub projects evaluated for patterns:
- [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator) — worktree-per-slice + auto-CI-fix pattern
- [SWE-agent/mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — 100-line linear bash loop, 74% SWE-bench Verified (validation that minimalism wins)
- [Aider](https://aider.chat/) — Architect/Editor separation pattern borrowed for decomposer (plan phase / execute phase)
- [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) — WIP-limit-as-infrastructure concept (borrowed conceptually, not implemented)

### 13.3 Explicitly rejected external frameworks
- **MetaGPT / ChatDev** — SOP-driven role hierarchy. Empirically underperforms on SWE-bench. Patterns incompatible with solo founder budget.
- **Paperclip** — "Zero-human company" metaphor. Whole framework too heavy; metaphor kept only.
- **CrewAI / LangChain / Microsoft Agent Framework** — general-purpose orchestration. Not git-worktree-native; wrong tool for dev workflow.

## 14. Design Evolution — What We Tried and Rejected in This Session

This document is the sixth and final iteration of a design discussion. For future sessions reading this file fresh, the design evolution is informative:

| Iteration | Proposal | Why rejected |
|---|---|---|
| 1 | Physical frontend/backend split into `apps/web` + `apps/api` | Premature; SvelteKit boundary already enforces it |
| 2 | 5-persona orchestration layer with state machine + event log | CPO-style project management; didn't produce code |
| 3 | `.agent-context/board/` with event-sourced `slices.jsonl` + policy JSON | Over-engineered; Claude Code native system already covers 80% |
| 4 | Custom mailbox + WIP policy rules engine | Duplicates Claude Code's own `src/utils/teammateMailbox.ts` pattern |
| 5 | Task-specialized dev agents only, no infra | Works for WIP ≤ 3, fails catastrophically at n=10 |
| 6 (current) | **3 infra agents + 11 worker types + file state + pre-commit enforcement + phased rollout** | Balances n=10 requirements with minimal custom layer |

The critical realization at iteration 6: **n=10 is a qualitatively different regime from n≤3**. Solo-founder rules ("ship code, not governance") still apply but require enforcement infrastructure to scale. The infrastructure is minimal (3 agents, pre-commit hook, DAG file) but mandatory.

---

## Appendix A — Summary of discoveries during the session

Beyond the design itself, the session surfaced several facts about the repo that are important for future sessions:

1. **`src/lib/engine/`** contains 8 in-game "analysis agents" (STRUCTURE, VPA, ICT, DERIV, VALUATION, FLOW, SENTI, MACRO) with 48 factors + specs. This is the **product's domain model**, not a dev agent system. It is also the **ground truth for `verdict_block`**: `src/lib/engine/types.ts::PipelineResult` and `agentPipeline.ts::runAgentPipeline` already produce the shape that Phase 0.1's zod schema must match. Phase 0.1 is a "promote existing interface" task, not a greenfield design.
2. **`feat/phase0-contracts`** branch already has drafted `src/lib/contracts/ids.ts` with open `RawId` type. Phase 0 work is partially complete but not merged to main.
3. **`feat/research-spine`** branch (in `jovial-satoshi` worktree) already has measurement spine + R1 baseline stubs installed. This is a working superset of `feat/phase0-contracts` and should be the first merge-train target.
4. **`/Users/ej/Projects/src/`** is Claude Code's own source (or a very close fork). This is the single most valuable reference implementation for any future dev-agent work in this repo.
5. **`/Users/ej/Projects/maxidoge-clones/`** contains 25+ `claude/*` worktrees most of which are stale. Part of Phase 0 foundation work is an audit of these (archive or kill).
6. **`agents/*.json`** at repo root is legacy Memento-format; `.claude/agents/*.md` is the live Claude Code native format. Do not conflate.
7. Three CHATBATTLE-adjacent projects exist in `/Users/ej/Projects/`: `Cogochi`, `Cogochi_v1`, `cogochi_02`, plus `WTD` for LoRA training. Relationship between these and CHATBATTLE is unclear; this session did not resolve it.

---

## Appendix B — Known gaps surfaced 2026-04-11 (post-Phase-0 landing)

These are open design holes found while running the first operational smoke-test preflight. They are **intentionally not fixed in this revision** — they are recorded here so the next session can address them deliberately rather than rediscovering them.

### B.1 — Worker / session-internal context management is unspecified

The body of this design (§2.1, §11.Risks, line ~158/~426) collapses "context compaction" onto **DreamTask** and asserts it "already exists". Reality check:

```
$ ls src/tasks/DreamTask/
No such file or directory
```

DreamTask is a Claude Code internal (`/Users/ej/Projects/src/tasks/DreamTask/`), not a CHATBATTLE primitive. It is not reachable from a worker spawned inside this repo. Consequences:

- **Workers have no in-session compact path.** `.claude/agents/implementer.md` only documents `ctx:restore --mode handoff` at session START. No rule for mid-slice context pressure. A long slice that crosses the worker's context budget has no graceful exit.
- **Scheduler has no resume path.** `.claude/agents/scheduler.md` grep returns zero occurrences of `resume`, `handoff`, `overflow`. The risks table (§11, "Worker memory overflow → session end + DreamTask handoff, Scheduler resumes") is aspirational, not implemented.
- **Reviewer-Auto / Main-Keeper same.** Neither agent prompt defines a context budget or a compact trigger.

What DOES exist (session-boundary only):

- `npm run ctx:restore` — start of session
- `npm run ctx:compact` — end of session → snapshot → checkpoint + brief + handoff
- `ctx:auto` post-merge hook — automatic snapshot after every merge (verified working on 2026-04-11)
- `.agent-context/briefs/<slice-id>.md` — Scheduler-written fixed input brief

**Proposed next-session work (not this one):**

1. Add §15 "Worker context management" to this doc with explicit budget rules + mid-slice compact trigger.
2. Replace every `DreamTask` reference in §2.1/§11/§12 with a concrete primitive (most likely a `scripts/swarm/compact.mjs` that wraps `ctx:compact` for worker-targeted use).
3. Add resume path to Scheduler: worker reports "context N% full" via `.agent-context/state/worker-telemetry.jsonl` → Scheduler respawns with handoff brief.

### B.2 — `.agent-context/state/` is gitignored; `slices.jsonl` is per-worktree

Found while running the first `slice backfill` sweep on `claude/nice-driscoll`:

```
$ cat .gitignore | grep agent-context
.agent-context/*
!.agent-context/policy/
!.agent-context/policy/**
```

Only `.agent-context/policy/` is tracked. Everything else — including `state/slices.jsonl`, `ownership/*.json`, `briefs/*.md` — is ephemeral per-worktree.

This breaks a core design assumption. §3 architecture places Scheduler, Reviewer-Auto, and Main-Keeper at the same state layer; §7 event log is authoritative. If that log isn't shared across worktrees, then:

- Each new worktree starts with an empty `slices.jsonl` and must re-backfill from git log.
- `slice ready` output is only correct for the worktree that did the backfill.
- Main-Keeper in one worktree cannot see merges completed by workers in other worktrees except via fresh git fetch + recomputation.

**Proposed next-session work (not this one):**

1. Decide: track `.agent-context/state/` (commit the authoritative journal) OR add a rebuild command (`scripts/slice/cli.mjs rebuild` that replays `git log` into `slices.jsonl`).
2. If tracked: add merge discipline — one writer at a time, or append-only journal format that handles concurrent appends cleanly.
3. If rebuild: Main-Keeper runs `rebuild` after every fetch; Scheduler runs it before every `ready` query.

Recommendation: **rebuild** is simpler and avoids write contention. The journal is derived data; git log is the source of truth via commit messages matching slice IDs.

### B.3 — `slice` CLI `new`/`status` policy reader shape mismatch (fixed in this commit)

`cmdNew` and `cmdStatus` read `wip-limits.json` expecting `{product, research, fix}` at the root, but the file stores `{tracks: {product, research, fix}, rollout_schedule, active_phase}`. Result: `product=0/undefined` display + `WIP cap hit for track "product" (0/0)` on every `slice new`. Fixed in the same commit that adds this appendix via `loadPolicy()` helper that honors `active_phase` rollout caps.

### B.4 — 9 pre-swarm-v1 merged slices backfilled (journal seed)

Before this commit, `.agent-context/state/slices.jsonl` did not exist. The following 9 slices had landed on main but were not reflected in DAG state (all showed UNKNOWN):

| Slice | Landing SHA | Evidence |
|---|---|---|
| P0.1-verdict-zod | 92c1e56 | `src/lib/contracts/verdict.ts` exports `VerdictBlockSchema` |
| P0.2-trajectory-zod | 92c1e56 | `src/lib/contracts/trajectory.ts` exports `DecisionTrajectorySchema` |
| P0.3-ids-finalize | 92c1e56 | `src/lib/contracts/ids.ts` exports `ContractLayer` + branded IDs |
| P0.4-contracts-barrel | 92c1e56 | `src/lib/contracts/index.ts` re-export barrel |
| P0.5-zod-pin | 88af6b0 | `package.json` pins zod |
| P1.A0-binance | 89f8430 | `src/lib/server/providers/binance.ts` canonical loader |
| P1.A0-coingecko | 0ba2653 | `src/lib/server/providers/coingecko.ts` canonical loader |
| P1.A0-coinalyze | 7d558ef | `src/lib/server/providers/coinalyze.ts` canonical loader |
| P1.A0-dexscreener | 743856d | `src/lib/server/providers/dexscreener.ts` canonical loader |

Backfill applied on `claude/nice-driscoll` via new `slice backfill` subcommand. **Caveat B.2 applies**: because state is gitignored, the backfill is per-worktree. Other worktrees will need to re-run the same 9 commands (or a `slice backfill-all` future convenience) before their `slice ready` output is meaningful.
