# Agent Evidence Protocol

Reference guide for `mk.evidence_first()`, `mk.log_event()`, `mk.decision_record()`, and `mk.incident_record()` checkpoints.

## Context

Every agent execution must anchor to durable evidence files, not chat history. This runbook defines what each checkpoint does, when to use it, and where artifacts live.

---

## `mk.evidence_first("keyword")`

**When**: Session start, before beginning work.

**What it does**: Search memory system and canonical files for prior related work.

**Example**:

```python
mk.evidence_first("FeatureWindowStore search")

# Agent searches:
# 1. work/active/CURRENT.md → W-0162, W-0202
# 2. docs/decisions/ → "Layer A upgrade" decision
# 3. memory/ → prior session notes on corpus performance
# 4. work/active/*.md → related work items
```

**What you do next**:
- Read the most recent active work item from `work/active/CURRENT.md`
- Review any decisions or rejected hypotheses in `docs/decisions/`
- Check memory for context (`.claude/projects/.../memory/`)
- Confirm scope and blockers before starting

**Failure mode**: Skipping this → duplicating work or missing constraints.

---

## `mk.log_event(...)`

**When**: Immediately after PR merge.

**What it does**: Records completed work in audit log + updates CURRENT.md.

**Example**:

```python
mk.log_event(
    title="W-0162 Layer A upgrade merged",
    details="PR #258, commit ba716e54, FeatureWindowStore enrichment",
    tags=["w-0162", "merged", "engine"]
)

# Then manually update CURRENT.md:
# - Change main SHA to ba716e54
# - Move W-0162 from "Active" to "Completed" (if done)
# - Record any deferred work
```

**What the log records**:
- Work item ID
- PR number and commit SHA
- Brief description of what landed
- Tags for searching

**Failure mode**: Forgetting to update CURRENT.md → next session reads stale main SHA.

---

## `mk.decision_record(...)`

**When**: Before or immediately after making an architecture or design decision.

**What it does**: Records the decision in `docs/decisions/NNNN-<slug>.md` with rationale.

**Example**:

```python
mk.decision_record(
    what="use FeatureWindowStore as primary search corpus",
    why="3→40+ dims, batch enrichment, OI/funding 2x weight, N+1 avoided",
    how="Layer A upgrade: feature_snapshot first, FeatureWindowStore backfill, weighted L1"
)

# Then create or update docs/decisions/0005-layer-a-upgrade.md with:
# - WHAT: Problem statement + solution
# - WHY: Constraints, alternatives evaluated, trade-offs
# - HOW: Implementation steps + verification
# - WHEN: Date + PR/commit
```

**Where decisions live**:
- `docs/decisions/NNNN-<slug>.md` (4-digit sequence, slug matches decision)
- Format: ADR-style (status, context, decision, consequences)

**Failure mode**: Losing rationale → future agents can't judge trade-offs.

---

## `mk.incident_record(...)`

**When**: During or immediately after CI failure, production incident, or major blocker.

**What it does**: Records incident details for audit trail and prevention.

**Example**:

```python
mk.incident_record(
    title="main CI: 8 test failures after multi-track PR collision",
    symptoms="W-0200 + W-0163 + W-0162 merged in sequence; migration 021 state mismatch; fixture pollution",
    resolution="merge --ours (chose W-0162 HEAD), added worker concurrency guard, re-ran tests"
)

# Then create docs/incidents/2026-04-25-ci-track-collision.md with:
# - WHEN: Date/time
# - WHAT: Services/systems affected
# - ROOT CAUSE: Why it happened
# - RESOLUTION: Steps taken
# - PREVENTION: What to avoid next time
# - POSTMORTEM: If P0 + ongoing impact
```

**Where incidents live**:
- `docs/incidents/YYYY-MM-DD-<slug>.md`
- Organized by severity (P0, P1, P2)

**Failure mode**: Lost incident context → same failure repeats.

---

## Checkpoint Sequence

Typical agent session:

```
Session start
  ↓
mk.evidence_first("W-0202 engine strengthening")  # Collect prior context
  ↓
Read AGENTS.md + CURRENT.md + W-0202 work item
  ↓
[Do work: code, docs, tests]
  ↓
[Merge PR]
  ↓
mk.log_event(title="W-0202 slice A merged", ...)  # Record completion
  ↓
Update CURRENT.md (SHA, move to completed)
  ↓
Session end
```

If architecture decision during work:

```
[During implementation]
  ↓
mk.decision_record(what=..., why=..., how=...)  # Record before committing
  ↓
Create docs/decisions/NNNN-<slug>.md
  ↓
Commit decision doc + code together
```

If CI failure:

```
[Merge fails]
  ↓
mk.incident_record(title=..., symptoms=..., resolution=...)  # Record immediately
  ↓
Create docs/incidents/YYYY-MM-DD-<slug>.md
  ↓
Fix blocker
  ↓
Re-run tests + verify
```

---

## File Locations Checklist

| Checkpoint | Output File | Path |
|---|---|---|
| `evidence_first()` | Work item + memory | `work/active/*.md` + `.claude/projects/.../memory/` |
| `log_event()` | CURRENT.md + commit | `work/active/CURRENT.md` + git log |
| `decision_record()` | ADR | `docs/decisions/NNNN-<slug>.md` |
| `incident_record()` | Incident log | `docs/incidents/YYYY-MM-DD-<slug>.md` |

---

## Anti-Patterns

❌ **Don't**:
- Skip `evidence_first()` at session start
- Forget to update CURRENT.md after merge
- Make architecture decisions without recording rationale
- Let incidents be hidden in chat or commit messages

✅ **Do**:
- Always evidence-first before work
- Update CURRENT.md immediately after merge
- Record decisions in ADR format before shipping
- Create incident records for all P0/P1 failures
- Link decisions to work items in `Decisions` section

---

## Example Workflow

See `work/active/W-0162-*` for real examples:
- Evidence: Reviewed prior W-0160, W-0161 decisions
- Decision: Recorded Layer A upgrade decision in `docs/decisions/`
- Incident: Recorded multi-track CI collision in `docs/incidents/2026-04-25-ci-track-collision.md`
- Completion: Updated CURRENT.md SHA after PR #258 merge
