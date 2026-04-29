# W-0279 — Agent OS Tracing Production Validation

> Phase 2 wiring acceptance — verify W-0272 spans actually emit across real agent sessions and audit `show-tree` for typical session shape.
>
> **Predecessor**: W-0272 (PRD #514, lib #515, wiring #526). All three merged on 2026-04-27.

---

## Goal

W-0272 Pillar 4 (causal tracing) 가 시뮬레이션이 아닌 **실제 5+ 에이전트 세션에서 동작**함을 측정 가능한 데이터로 입증한다. 빠진 wiring 또는 edge case (세션 crash / kill / abandoned trace) 가 있다면 갭으로 식별해서 W-0280+ 로 추적한다.

## Owner

`tools/` (Node.js, no app/ or engine/ touch)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `tools/check_tracing_health.mjs` (NEW) | 일별 trace 통계 집계 (세션 수, 평균 duration, orphaned span 카운트) |
| `tools/end.sh` | check_tracing_health 호출 (best-effort, 정보 출력만) |
| `docs/runbooks/agent-os-tracing.md` (NEW) | trace_id 디버깅 절차 + show-tree 예시 + edge case 처리 |
| `work/active/W-0279-*.md` → `work/completed/` | 5+ 세션 검증 후 Exit Criteria 평가 결과와 함께 closure |

## Non-Goals

- W-0273 (Circuit Breaker) / W-0274 (Optimistic Concurrency) shell wiring — 별도 work item
- OpenTelemetry Collector / OTLP 외부 송신 (W-0278 통합 시점)
- Web UI 대시보드 (CLI `show-tree` 만으로 충분)
- 자동 alerting (orphan span 알람) — observability 별도 트랙

## Exit Criteria

| # | Criterion | 측정 방법 |
|---|---|---|
| 1 | **5건 이상의 실제 에이전트 세션**이 `session_start` + `session_end` 한 쌍씩 기록 | `node tools/event-store.mjs list --kind span --since <date>` 후 `phase=start` 와 `phase=end` 의 span_id 매칭 카운트 ≥ 5 |
| 2 | 각 세션에 대해 `show-tree <trace_id>` 가 **non-zero duration** 으로 root span 출력 | duration_ms > 0 비율 == 100% (5/5) |
| 3 | event-store `verify` 7일치 jsonl 에서 **errors == 0** | `node tools/event-store.mjs verify` |
| 4 | `tools/check_tracing_health.mjs` 출력에 orphan span 카운트 ≤ 5% | `phase=start` 인데 매칭 `phase=end` 없는 span_id / 전체 start span 수 ≤ 0.05 |
| 5 | `docs/runbooks/agent-os-tracing.md` 가 edge case 3종 (crash, kill, abandoned) 처리 절차 포함 | 문서 grep `crash\|kill\|abandoned` ≥ 3 hits |
| 6 | `start.sh` 가 `trace-emit.mjs` 실패시에도 **AGENT_ID 발번을 막지 않음** | mock node 실패 환경에서 start.sh 정상 종료 (exit 0) |

## AI Researcher 리스크

**훈련 데이터 영향**
- 없음 — `tools/` 레이어 + 운영 데이터 수집. LightGBM Layer C / engine 학습 파이프라인 무관.
- 다만 `add-event checkpoint` payload 의 `next` 텍스트가 향후 세션 분석에서 실수 패턴 라벨링 자료로 활용될 가능성. PII 주의.

**통계적 유효성**
- N=5 세션은 acceptance 최소선. orphan rate ≤ 5% 임계값은 baseline 추정 (실측 후 조정 가능).
- "non-zero duration" 은 약한 검증 — 더 강한 lower bound (예: ≥ 100ms) 는 5세션 실측 후 검토.
- self-selection bias: 본 acceptance 를 의식한 에이전트가 평소보다 많은 add-event 호출 → checkpoint 횟수 분포가 비현실적일 수 있음. 분석 시 본 acceptance 세션 1건은 outlier 로 분리.

**실데이터 검증 시나리오**
- 5 세션 × 평균 10 events/세션 = 50 events → 1일 jsonl ~5KB. 7일 누적 ≈ 35KB. event-store O(n) full-scan replay 부담 무시 가능.
- 동시 세션 (multi-agent) 발생 시 trace_id 가 분리되는지 확인. `state/current_trace.txt` 가 worktree-scoped 라 worktree 분리 = trace 분리.
- 세션 crash (claude SIGKILL) 시 `current_session_span.txt` 에 orphan span_id 가 잔류. 다음 start.sh 가 잔여 파일을 감지해서 경고 / 강제 close 할지 정책 결정 필요.

## CTO 설계 결정

**성능 (100명+ 동시 사용자 기준 — 본 work item 은 single-user tool 이지만 정합성 위해 명시)**
- check_tracing_health 는 7일 jsonl full-scan, 1회 ≤ 10MB 메모리, < 1s wall (실측: 35KB ÷ 100 events/s 기준 < 0.5s). cron 스케줄 미필요.
- start.sh / end.sh / save.sh emit 추가 latency 는 Node.js cold-start 100~150ms 1회. 세션 lifecycle 만 영향, hot path 아님.

**안정성**
- 모든 trace-emit 호출은 `|| true` best-effort (#526 패턴 그대로) — Node 미설치 / 스크립트 오류 시 세션 진행 막지 않음.
- check_tracing_health 가 corrupt jsonl 라인을 만나도 `event-store.iterEvents` 가 silent skip → 통계는 부분 집계. errors 카운트는 별도 verify 명령에서 검출.
- orphan span 처리 정책: 본 acceptance 단계에서는 **관찰만**, 자동 close 안 함. 데이터 누적 후 판단.

**보안**
- `memory/events/*.jsonl` 은 이미 .gitignore (#526) → push 위험 없음.
- payload 의 shipped/handoff 텍스트에 PII 가능성 (사용자 이름 등) — 200 char truncation (#526 적용) 으로 1차 방어. runbook 에 "민감 정보 금지" 가이드 명시.
- check_tracing_health 출력은 stdout 만 — 외부 송신 없음.

**유지보수성**
- check_tracing_health 는 **읽기 전용** — 이벤트 mutation 금지. 분석/통계만.
- `event-store.mjs` API (`iterEvents`, `listEvents`, `verify`) 만 import — 기존 라이브러리 재사용, 코드 중복 없음.
- runbook 은 `docs/runbooks/` 표준 위치, 다른 multi-agent 문서 (`multi-agent-coordination.md`) 와 같은 톤.

## Facts (실측, 2026-04-27 19:31 UTC, origin/main `e9c0212f` 기준)

```bash
# trace-emit.mjs CLI 시그니처
$ grep -n "case \"" tools/trace-emit.mjs
395:    case "start-span":  return cmdStartSpan(arg1, flags);
396:    case "end-span":    return cmdEndSpan(arg1, flags);
397:    case "add-event":   return cmdAddEvent(arg1, ...);
398:    case "list-spans":  return cmdListSpans(flags);
399:    case "show-tree":   return cmdShowTree(arg1);

# shell wiring 위치 (#526)
tools/start.sh:117 → start-span session
tools/save.sh:103  → add-event checkpoint
tools/end.sh:114   → end-span --status ok

# 현재 event-store 상태 (clean worktree)
$ node tools/event-store.mjs verify
{"files": 0, "events": 0, "errors": []}

# state/current_*.txt — gitignored (#526), worktree-scoped
.gitignore:
  state/current_trace.txt
  state/current_session_span.txt
  state/spans/
  memory/events/*.jsonl
```

## Assumptions

- Node.js 18+ (ESM `import.meta.url` 지원) 모든 에이전트 환경에 설치됨
- `memory/events/` 디렉토리는 .gitkeep 으로 tracked, 개별 jsonl 은 untracked
- 본 work item 진입 후 **최소 5건의 자연 발생 세션** (acceptance 자체 1건 포함) — 다른 에이전트가 normal work 진행 중이어야 함
- 세션 crash 빈도가 1% 미만 — 5건 중 0건 fatal 가정. 만약 crash 발생 → orphan span 정책 결정 트리거

## Canonical Files

| 파일 | 역할 |
|---|---|
| `tools/check_tracing_health.mjs` (NEW) | 통계 집계 CLI: `--since`, `--days N`, `--by-agent` |
| `tools/event-store.mjs` | 기반 스토어 (read-only 사용) |
| `tools/trace-emit.mjs` | span emit (이미 #515) |
| `tools/end.sh` | check_tracing_health 호출 추가 |
| `tools/start.sh` / `tools/save.sh` | 변경 없음 — #526 wiring 그대로 |
| `docs/runbooks/agent-os-tracing.md` (NEW) | trace_id 디버깅 + edge case 절차 |
| `work/active/W-0279-*.md` | 본 문서, 5세션 후 completed 이동 |

---

## Implementation Sketch

```javascript
// tools/check_tracing_health.mjs
import { iterEvents } from "./event-store.mjs";

export function summarize({ sinceDays = 7 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400e3).toISOString();
  const startSpans = new Map();   // span_id -> evt
  const endSpans = new Set();
  let totalEvents = 0;

  for (const evt of iterEvents({ since })) {
    totalEvents++;
    const sid = evt.payload?.span_id;
    if (!sid) continue;
    if (evt.payload.phase === "start") startSpans.set(sid, evt);
    if (evt.payload.phase === "end") endSpans.add(sid);
  }

  const orphans = [...startSpans.keys()].filter((sid) => !endSpans.has(sid));
  return {
    total_events: totalEvents,
    sessions_total: startSpans.size,
    sessions_closed: endSpans.size,
    orphan_count: orphans.length,
    orphan_rate: startSpans.size ? orphans.length / startSpans.size : 0,
    by_agent: groupByAgent(startSpans),
  };
}
```

```bash
# end.sh 추가 (맨 끝, best-effort)
if command -v node >/dev/null 2>&1 && [ -f tools/check_tracing_health.mjs ]; then
  echo ""
  echo "Tracing health (last 7 days):"
  node tools/check_tracing_health.mjs --days 7 2>/dev/null | sed 's/^/  /' || true
fi
```
