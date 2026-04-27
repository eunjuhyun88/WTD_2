# W-0272 — Distributed Tracing (Agent OS Phase 2)

> W-0270 §Pillar 4 구현체 — Dapper/OpenTelemetry 스타일 span_id + parent_span_id 인과관계 추적

---

## Goal

에이전트 세션 → sub-agent 호출 → tool 실행 → commit 까지 **인과관계 체인**을 span_id/parent_span_id로 실시간 추적한다.
W-0271 Event Store 위에 올라가는 얇은 추적 레이어.

**사용자 가치**: "어떤 에이전트가 어떤 순서로 무엇을 실행했는가?" 를 `node tools/trace-emit.mjs replay <trace_id>` 한 줄로 확인.

## Owner

`tools/` (Node.js, no app/ or engine/ touch)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `tools/trace-emit.mjs` (NEW) | span_id 발급 + appendEvent 래퍼 + CLI |
| `tools/start.sh` | 세션 시작 시 `session_start` 이벤트 emit |
| `tools/end.sh` | 세션 종료 시 `session_end` 이벤트 emit (outcome, shipped) |
| `tools/save.sh` | 체크포인트 시 `checkpoint` 이벤트 emit |

## Non-Goals

- OpenTelemetry Collector/OTLP 전송 (W-0278 통합에서)
- app/ 또는 engine/ 코드 수정
- 실시간 스트림 / 대시보드

## Exit Criteria

- [ ] `node tools/trace-emit.mjs start session --agent A060 --subject W-0272` → JSON 출력, `span_id` 포함
- [ ] `node tools/trace-emit.mjs end <span_id> ok` → `session_start` 이벤트에 대응하는 `session_end` emit
- [ ] `node tools/trace-emit.mjs replay <trace_id>` → 인과관계 트리 출력 (parent indent)
- [ ] `./tools/start.sh` 실행 시 `session_start` 이벤트 자동 기록 (memory/events/*.jsonl)
- [ ] `./tools/end.sh "..." "..."` 실행 시 `session_end` 이벤트 자동 기록
- [ ] 기존 event-store 단위 테스트 0 regression (verify 명령 pass)
- [ ] span_id 없는 기존 이벤트와 backward-compat (span_id nullable)

## AI Researcher 리스크

**훈련 데이터 영향**
- 없음 — tools/ 레이어만 수정, engine/ 학습 파이프라인 미접촉

**통계적 유효성**
- span_id는 ULID 기반 (W-0271과 동일 생성기 재사용), sortable → replay 정렬 보장
- parent_span_id nullable → 루트 span 식별 단순 (`parent_span_id === null`)

**실데이터 검증 시나리오**
- 세션 1개 = trace_id 1개, 하위 sub-agent 3개 = span_id 3개 (parent = 세션 span)
- 예상 이벤트 밀도: 세션당 10~50 이벤트, 일 3~5 세션 → 일 파일 ~150 lines (< 10KB)

## CTO 설계 결정

**성능**
- `appendFileSync` (sync I/O) — 각 이벤트 < 1ms, hot path 없음 (start/end 시점만)
- daily partition jsonl → 파일당 최대 수백 줄, full-scan replay O(n) 허용

**안정성**
- event-store.mjs import 실패 시 start.sh/end.sh는 경고만 출력, 세션 block 금지
- span_id는 null-safe (nullable field)

**보안**
- memory/events/ 는 로컬 전용, git push 대상 아님 (.gitignore 추가)
- 이벤트 payload에 secret 포함 금지 (payload에 env var 값 직접 기록 불가)

**유지보수성**
- tools/ 전용 레이어 — app/engine 교차 없음
- event-store.mjs ESM import로 재사용 (코드 중복 없음)

## Facts (실측)

```bash
# event-store.mjs 존재 확인
$ ls tools/event-store.mjs
tools/event-store.mjs

# event-store API 확인
$ grep -n "^export function" tools/event-store.mjs
95: export function appendEvent(event) {
118: export function* iterEvents({ since, until } = {}) {
144: export function listEvents({ trace_id, agent_id, kind, since, until, limit } = {}) {
159: export function replayTrace(trace_id) {
168: export function verify() {

# start.sh/end.sh에 event-store 미연동 확인
$ grep -n "event-store\|appendEvent" tools/start.sh tools/end.sh
(no output)

# memory/events 디렉토리 확인
$ ls memory/events/
.gitkeep

# 현재 이벤트 count
$ node tools/event-store.mjs verify
{"files":0,"events":0,"errors":[]}
```

## Assumptions

- Node.js 18+ (ESM `import.meta.url` 지원)
- memory/ 디렉토리 git-tracked, memory/events/*.jsonl git-ignored
- start.sh / end.sh 에 `node` 실행 가능 환경

## Canonical Files

| 파일 | 역할 |
|---|---|
| `tools/trace-emit.mjs` | span_id CLI + appendEvent 래퍼 |
| `tools/event-store.mjs` | 기반 스토어 (읽기 전용 수정) |
| `tools/start.sh` | session_start emit 추가 |
| `tools/end.sh` | session_end emit 추가 |
| `tools/save.sh` | checkpoint emit 추가 |
| `.gitignore` | memory/events/*.jsonl 제외 |

---

## Implementation Sketch

```javascript
// tools/trace-emit.mjs
import { appendEvent, replayTrace } from "./event-store.mjs";

// span_id = "spn_" + ulid (별도 namespace)
// 이벤트 payload에 span_id + parent_span_id 추가

export function startSpan({ kind, agent_id, subject, trace_id, parent_span_id } = {}) {
  const span_id = newSpanId();
  const evt = appendEvent({
    kind,
    agent_id,
    subject,
    trace_id,
    outcome: "pending",
    payload: { span_id, parent_span_id: parent_span_id ?? null, phase: "start" },
  });
  return { span_id, trace_id: evt.trace_id, event_id: evt.event_id };
}

export function endSpan(span_id, outcome = "ok", payload = {}) {
  return appendEvent({
    kind: "span_end",
    outcome,
    payload: { span_id, ...payload },
  });
}

// replay: 인과관계 트리 (parent_span_id 기준 indent)
export function replaySpans(trace_id) { ... }
```

```bash
# start.sh 추가 (맨 끝, 실패해도 exit 0 유지)
if command -v node >/dev/null 2>&1 && [ -f "$REPO_ROOT/tools/trace-emit.mjs" ]; then
  node "$REPO_ROOT/tools/trace-emit.mjs" start session \
    --agent "${AGENT_ID:-unknown}" --subject "session" 2>/dev/null || true
fi
```
