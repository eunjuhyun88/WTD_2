# Multi-Agent Collaboration

Use this runbook for all non-trivial, multi-agent work.

## Roles

- `Orchestrator`: split work, assign owners, control merge order
- `Implementer-*`: one agent per task branch and worktree
- `Reviewer`: review correctness, risk, boundary violations
- `Integrator`: merge PRs, sync baseline, publish release notes

## Non-Negotiable Rules

- Never commit directly to `main`.
- One task equals one branch: `task/W-xxxx-<slug>`.
- One branch equals one worktree.
- No push/merge without explicit user approval.
- If unexpected diffs appear, stop and confirm scope.

## Task Contract

Each `work/active/W-xxxx-*.md` must include:

- `Goal`
- `Scope` and `Non-Goals`
- `Canonical Files`
- `Verification` commands
- `Exit Criteria`

Recommended additions:

- `Depends on`
- `Risk` (`low` | `medium` | `high`)
- `Rollback`

## Standard SOP

1. Orchestrator creates/splits `W-xxxx`.
2. Implementer creates `task/W-xxxx-*` branch + dedicated worktree.
3. Implementer changes only in canonical file scope.
4. Run required verification commands.
5. Open PR with summary and test plan.
6. Reviewer checks risks, boundaries, and regressions.
7. Integrator confirms CI green and merges.
8. Sync `main`, start next task.

## Merge Gate

Before merge, all must pass:

- `git status` clean
- work item updated and aligned with final diff
- required tests/checks green
- no app/engine boundary violation
- no guardrail bypass
- deployment checks green (including Vercel/CI)

## External Framework Evaluation Policy

Use external "awesome" lists (such as [awesome-agent-frameworks](https://github.com/subinium/awesome-agent-frameworks)) for candidate discovery only.

- Do not adopt frameworks directly from list ranking.
- Require local PoC and measured evidence before adoption.
- Prefer pattern import over wholesale framework migration.
- Record decisions in `docs/research/agent-frameworks-eval.md`.

## Framework Adoption Architecture

Use this architecture when importing ideas from external agent frameworks.

### Adoption Unit

- Adopt patterns, not full framework replacement.
- Allowed pattern units:
  - runtime policy chain (`allow` / `ask` / `deny`)
  - orchestration handoff contract
  - audit/event envelope
  - optional memory/learning hook

### Internal Mapping

- `app/src/lib/guardrails/*`: runtime policy and execution gating
- `app/src/lib/orchestration/agents/*`: coordinator and worker handoff
- `work/active/W-xxxx-*.md`: governance and delivery contract
- `engine/`: no external framework logic import

### Adapter Boundary

- All framework-derived behavior must be behind adapter interfaces.
- Core app modules must only depend on internal interfaces, not external framework packages.
- Runtime switches must be environment-driven:
  - `GUARDRAIL_ADAPTER=native|candidate`
  - `GUARDRAIL_MODE=shadow|enforce`

### Rollout Modes

- `shadow`: evaluate and log decisions, do not block
- `enforce`: block selected high-risk actions

### Integration Streams

- Stream A (Policy): runtime policy adapter integration
- Stream B (Orchestration): coordinator + handoff schema integration
- Stream C (Observability): unified guardrail and decision event envelope

