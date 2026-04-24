# W-0200 — Core Loop Proof

## Goal

트레이더가 화면에서 **Save → Find Similar (10개) → Outcome** 을 실제로 돌릴 수 있게 한다.
기술 완성도가 아니라 **루프가 사용자 손에서 돌아가는 것**이 목적이다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- Save Setup 시 `pattern_draft` 포함 capture 저장 경로를 실제 surface에서 확인하고 필요하면 보정
- 저장된 capture에서 `Find Similar`가 engine `POST /captures/{id}/benchmark_search`를 호출하게 연결
- 결과 10개를 심볼, 타임스탬프, 유사도, outcome 관점으로 표시하는 최소 UI 연결
- `benchmark_search` 응답을 surface가 바로 못 쓰면 route-local adapter를 최소 범위로 추가

## Non-Goals

- W-0148 plane contract 작업 없음
- W-0160 definition truth 마이그레이션 없음
- 새 데이터 provider 추가 없음
- Refinement threshold 자동 조정 없음

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0200-core-loop-proof.md`
- `engine/api/routes/captures.py`
- `engine/research/manual_hypothesis_pack_builder.py`
- `engine/research/pattern_search.py`
- `engine/research/query_transformer.py`
- `engine/capture/store.py`
- `app/src/routes/terminal/+page.svelte` (Save Setup 진입점)
- `app/src/lib/cogochi/modes/` (TradeMode Save 흐름)

## Facts

1. `engine/research/pattern_search.py`에는 `run_pattern_benchmark_search`가 이미 구현되어 있다.
2. `engine/research/manual_hypothesis_pack_builder.py`에는 capture → benchmark pack 변환 로직이 이미 있다.
3. `POST /captures/{id}/benchmark_pack_draft`와 `POST /captures/{id}/benchmark_search` route truth는 post-merge refresh lane에서 복구되어 `main`으로 들어갈 준비가 되어 있다.
4. `PatternSeedScout`와 DOUNI `find_similar_patterns` bridge는 이미 mainline에 머지되어 있다.
5. `engine/state/pattern_capture.sqlite`와 ledger artifacts가 이미 존재해 founder smoke loop를 돌릴 데이터가 있다.

## Assumptions

1. benchmark_search 후보가 부족하면 founder capture / benchmark artifact를 기준으로 smoke loop를 먼저 닫을 수 있다.
2. app의 Save Setup 경로는 이미 `research_context`를 포함해 저장하고 있어 `pattern_draft` 추가가 bounded change로 끝날 가능성이 높다.
3. 최소 loop proof는 최종 UX보다 우선이며, adapter가 필요하면 route-local로 먼저 닫아도 된다.

## Open Questions

- benchmark_search 응답 포맷이 app UI에서 바로 소비 가능한가, 아니면 adapter 필요한가?
- "Find Similar" 버튼을 어디에 두나: capture detail sheet vs. TradeMode HUD?

## Decisions

- 다음 execution branch는 `codex/w-0200-core-loop-proof`로 새로 만든다.
- UI는 "작동하는 것" 우선이며, 결과가 비면 `"유사 케이스 없음"`으로 처리한다.
- engine route truth가 이미 존재하면 surface는 그 truth를 소비만 하고 search 로직을 app에 복제하지 않는다.
- W-0149의 남은 loop-proof 범위는 이 work item에 흡수한다.

## Next Steps

1. fresh main에서 `codex/w-0200-core-loop-proof` 브랜치를 만들고 capture `benchmark_search` route truth가 그대로 있는지 먼저 확인한다.
2. Save Setup 후 capture detail 또는 가장 가까운 existing surface에서 `Find Similar`를 트리거할 최소 insertion point를 고정한다.
3. 결과 리스트 UI와 outcome 표시를 연결한 뒤 app/engine smoke를 함께 통과시킨다.

## Exit Criteria

- [ ] 트레이더가 터미널에서 임의의 심볼 열고 Save Setup 누를 수 있다
- [ ] 저장된 capture에서 "Find Similar" 트리거 시 유사 케이스 10개 이상 반환된다
- [ ] 각 케이스마다 심볼 / 타임스탬프 / 유사도 / outcome (수익률 또는 stop) 이 표시된다
- [ ] 엔진 테스트 통과 (`tests/test_capture_routes.py` 포함)

## Handoff Checklist

- active work item: `work/active/W-0200-core-loop-proof.md`
- branch: `codex/w-0200-core-loop-proof` (미생성, 다음 단계)
- prerequisite merge: post-merge refresh PR must land first so `benchmark_search` route truth is back on `main`
