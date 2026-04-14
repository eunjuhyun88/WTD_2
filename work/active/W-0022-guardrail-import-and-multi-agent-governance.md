# W-0022 Guardrail Import and Multi-Agent Governance

## Goal

Define a CTO-level target architecture that lets `wtd-v2` safely reuse proven guardrail patterns from `/Users/ej/Projects/src` while preserving `app`/`engine` boundaries and enabling multi-agent development/execution without cross-agent contamination.

## Owner

app

## Scope

- classify reusable guardrails in `/Users/ej/Projects/src` into transport/runtime/policy layers
- define a `wtd-v2`-native guardrail package surface that app routes and agent orchestrators can consume
- design multi-agent development and runtime governance rules (branch/worktree + execution policy)
- define phased migration path and acceptance criteria

## Non-Goals

- migrating all external code from `/Users/ej/Projects/src`
- changing canonical engine scoring semantics in `engine/`
- introducing direct dependency from `engine/` to `app/` guardrail code
- production infra vendor lock-in decisions

## Canonical Files

- `work/active/W-0022-guardrail-import-and-multi-agent-governance.md`
- `docs/architecture.md`
- `docs/decisions/ADR-002-app-engine-boundary.md`
- `app/src/lib/server/authSecurity.ts`
- `app/src/lib/server/rateLimit.ts`
- `app/src/lib/server/intelPolicyRuntime.ts`
- `app/src/lib/intel/qualityGate.ts`
- external references:
  - `/Users/ej/Projects/src/services/mcp/channelAllowlist.ts`
  - `/Users/ej/Projects/src/tools/BashTool/bashPermissions.ts`
  - `/Users/ej/Projects/src/services/remoteManagedSettings/securityCheck.tsx`

## Decisions

- Do not move `app/src` out of repo root structure. Keep `app/` as surface/orchestration owner per ADR-002.
- Import guardrails by pattern, not by direct file copy: extract portable concepts into a dedicated internal module.
- Separate guardrails into three layers:
  - `transport guards`: request size, rate limit, auth abuse, bot checks
  - `tool/runtime guards`: allowlist/denylist, command/tool permission policy, sandbox gates
  - `decision guards`: quality gates, confidence thresholds, execution blockers
- Multi-agent correctness requires dual governance:
  - development governance (branch/worktree isolation)
  - runtime governance (policy engine enforcing what agents can execute and publish)

## Proposed Target Structure

- `app/src/lib/guardrails/core/`
  - `types.ts` (shared policy and decision types)
  - `policy.ts` (rule evaluation primitives)
  - `audit.ts` (structured guardrail decision logs)
- `app/src/lib/guardrails/transport/`
  - wraps `authSecurity.ts` and `rateLimit.ts` primitives
  - exposes composable `runRequestGuardChain()`
- `app/src/lib/guardrails/runtime/`
  - `toolPolicy.ts` (allow/ask/deny)
  - `channelPolicy.ts` (channel/plugin allowlist)
  - `sandboxPolicy.ts` (execution mode decisions)
- `app/src/lib/guardrails/decision/`
  - adapter over `qualityGate.ts` and `intelPolicyRuntime.ts`
  - exposes `evaluateAgentDecisionGate()` and `enforceExecutionGate()`
- `app/src/lib/orchestration/agents/`
  - `coordinator.ts` (fan-out/fan-in and state machine)
  - `workerContracts.ts` (typed handoff contract)
  - `governance.ts` (calls guardrail runtime + decision layers)

## Import Map from /Users/ej/Projects/src

- `services/mcp/channelAllowlist.ts` -> adopt as `runtime/channelPolicy`
  - keep GrowthBook-backed dynamic allowlist concept
  - adapt to project plugin/server identity model
- `tools/BashTool/bashPermissions.ts` -> adopt as `runtime/toolPolicy`
  - keep deny > ask > allow precedence
  - keep wrapper/env-var normalization and compound-command checks
  - simplify initially to policy kernel; avoid importing CLI-specific UI paths
- `services/remoteManagedSettings/securityCheck.tsx` -> adopt as `transport/runtime approval gate`
  - keep "dangerous changes require explicit approval" pattern
  - in web/API context, map dialog step to policy flag + audit event + controlled reject

## Multi-Agent Governance Model

- Development plane:
  - mandatory one branch/worktree per active agent task
  - protected integration via PR-only merge gates
  - scope labels per task: `product-surface`, `engine-logic`, `contract`, `research`
- Runtime plane:
  - every agent action assigned `riskTier` (`low`, `medium`, `high`)
  - `high` actions require explicit `shouldExecute` gate pass and audit trail
  - coordinator never executes worker outputs directly without governance pass
- Publication plane:
  - response payloads include `guardrail` metadata: `pass`, `visibility`, `blockers`, `sourcePolicyVersion`

## Phased Rollout

1. Foundation
   - create `guardrails/core` and unify logging schema
   - wire current rate-limit/auth + quality gate into one audit stream
2. Runtime policy extraction
   - add `runtime/toolPolicy` with deny/ask/allow precedence
   - add `runtime/channelPolicy` allowlist checks
3. Orchestration integration
   - add governance checkpoint in coordinator before tool execution and before final publish
   - attach guardrail outcomes to SSE/API responses
4. Hardening
   - shadow mode first (observe decisions, do not block)
   - then enforce mode for selected high-risk actions

## Verification

- Unit tests
  - policy precedence: deny > ask > allow
  - normalization bypass cases (wrapper/env-var forms)
  - decision gate blockers map to execution block reasons
- Integration tests
  - multi-agent workflow where one worker returns high-risk action
  - coordinator blocks action until governance pass
- Operational checks
  - structured logs contain policy source, blockers, and final decision
  - no boundary violation (`app` does not duplicate engine domain logic)

## Next Steps

- open implementation item for Phase 1 module scaffolding and adapter interfaces
- choose first protected runtime path (recommended: terminal tool execution)
- define canonical policy config source (`app/config/guardrailPolicy.json` + runtime override)

## Implementation Status

- Phase 1 scaffold landed:
  - `guardrails/core/policy.ts` (deny > ask > allow merge kernel)
  - `guardrails/transport/requestGuardChain.ts` (composable request guard chain)
- Runtime governance checkpoint landed:
  - `guardrails/runtime/channelPolicy.ts`
  - `guardrails/runtime/executionGate.ts`
  - `server/douni/toolExecutor.ts` now evaluates channel + tool gate before execution
  - `/api/terminal/intel-agent-shadow/execute` now applies runtime channel gate before trade open flow
- Policy source now includes `douni.channelPolicy` in `app/config/guardrailPolicy.json`

## Exit Criteria

- `wtd-v2` has one internal guardrail module with transport/runtime/decision layers
- at least one multi-agent orchestration path is guarded end-to-end by policy + audit
- imported concepts from `/Users/ej/Projects/src` are represented without boundary violations
- rollout supports both shadow and enforce modes
