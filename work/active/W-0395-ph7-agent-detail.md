# W-0395-Ph7 — /agent/[id] 개별 에이전트 상세

> Wave: 6 | Priority: P1 | Effort: M
> Parent Issue: #955
> Status: 🔴 Blocked — PR0 (agent persistence) 선결
> Created: 2026-05-04

## Goal
방문자가 /agent/[id]에서 에이전트의 신뢰도(equity / hit rate / decisions)를 30초 안에 판정한다.

## Owner
app + engine

## Blocking PR0 (별도 W-item 필요)
`/api/agents/stats/[agentId]` 현재 no-op stub.
필요: agent_stats / agent_decisions / agent_equity Supabase 테이블 신설.
PR0 완료 전 PR1 불가.

## PR 분해 계획

### PR 1 — SSR shell + KPI grid (PR0 완료 후)
신규: `routes/agent/[id]/+page.server.ts`, `lib/hubs/agent/AgentHub.svelte`, `lib/hubs/agent/panels/KpiGrid.svelte`
4 KPI: hit_rate / sharpe / n_decisions_30d / last_decision_at
AC10 badge 영구 노출 (헤더 상단 96px 내)
Exit Criteria:
- AC1: SSR LCP ≤1.2s mobile 4G
- AC2: 404 → 404 page (vitest)
- AC3: AC10 badge DOM 항상 존재

### PR 2 — EquityCurve + HoldTimeStrip
신규: `lib/hubs/agent/panels/EquityCurvePanel.svelte`, `lib/hubs/agent/panels/AgentHoldTimeAdapter.svelte`, `routes/api/agents/stats/[agentId]/equity/+server.ts`
공용: lib/components/shared/HoldTimeStrip.svelte 재사용
Exit Criteria:
- AC1: equity API p50 ≤350ms
- AC2: 0 decisions → "Insufficient data" placeholder

### PR 3 — Decisions table + feature drawer
cursor pagination 필수 (offset 금지 — 100k+ row 가능)
신규: `lib/hubs/agent/panels/DecisionsTable.svelte`, `lib/hubs/agent/panels/FeatureDrawer.svelte`
Exit Criteria:
- AC1: 첫 50행 ≤500ms SSR
- AC2: drawer open ≤150ms
- AC3: AC10 badge PR1 조건 유지

## Open Questions
- [ ] [Q-3] agent_stats / agent_decisions schema — PR0 담당 에이전트가 정의
- [ ] [Q-4] "Subscribe" = notification-only 확인 (AC10 저촉 없음)
