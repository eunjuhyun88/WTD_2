# W-0272 — Distributed Tracing (Phase 2)

> Wave: Meta / Tooling | Priority: **P1** | Effort: M
> Parent: W-0270 §Pillar 4
> Status: ✅ COMPLETE
> Branch: feat/W-0272-tracing

## Goal

W-0270 Event Store(Pillar 1) 위에 OpenTelemetry-style span tracing을 추가한다.
모든 agent action이 `trace_id + span_id + parent_span_id` 삼중 키로 인과관계를 기록한다.
→ post-mortem 분석, 세션 재현, 성능 bottleneck 탐지 가능.

## Scope

### 구현 파일

| 파일 | 역할 |
|---|---|
| `tools/trace-emit.mjs` | span 생성/종료/이벤트 기록 CLI |
| `tools/trace-replay.mjs` | trace replay / stats / diff / export CLI |
| `state/spans/open/<span_id>.json` | 진행 중인 span mutable state |
| `state/current_trace.txt` | 세션 trace_id 공유 파일 |

### Span 구조

```json
{
  "span_id":        "spn_<ulid>",
  "trace_id":       "trc_<ulid>",
  "parent_span_id": "spn_..." | null,
  "agent_id":       "A###" | null,
  "operation":      "session/start | tool/bash | git/commit | ...",
  "status":         "ok | error | pending",
  "start_ts":       "ISO",
  "end_ts":         "ISO" | null,
  "duration_ms":    123 | null,
  "attributes":     {},
  "events":         []
}
```

### CLI Examples

```bash
# 새 trace 시작
TRACE=$(node tools/trace-emit.mjs new-trace)

# span 열기
SPAN=$(node tools/trace-emit.mjs start-span "git/commit" --trace "$TRACE" --agent "A042" | jq -r .span_id)

# span 닫기
node tools/trace-emit.mjs end-span "$SPAN" --status ok

# trace tree 시각화
node tools/trace-emit.mjs show-tree "$TRACE"

# stats
node tools/trace-replay.mjs stats "$TRACE"

# 두 trace 비교
node tools/trace-replay.mjs diff "$TRACE_A" "$TRACE_B"
```

## Exit Criteria ✅

- [x] `trace-emit.mjs start-span / end-span / add-event / list-spans / show-tree` 동작
- [x] `trace-replay.mjs replay / stats / diff / sessions / export` 동작
- [x] event store(W-0271)에 span events 저장 (kind="span")
- [x] smoke test: trace 생성 → span start/end → stats 정상 출력

## References

- Parent: W-0270 §Pillar 4
- Dapper (Sigelman 2010): parent_id/span_id 모델
- OpenTelemetry: trace_id/span_id/parent_span_id 표준
- Event store: W-0271 (`tools/event-store.mjs`)
