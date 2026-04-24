# W-0200 — Core Loop Proof

## Goal

트레이더가 화면에서 **Save → Find Similar (10개) → Outcome** 을 실제로 돌릴 수 있게 한다.
기술 완성도가 아니라 **루프가 사용자 손에서 돌아가는 것**이 목적이다.

## Owner

engine + app (surface)

## Primary Change Type

Product surface change (engine 연결 포함)

## Scope

### Engine (이미 있는 코드 연결)
- `POST /captures/{capture_id}/benchmark_search` — stash에 보존됨, 이 브랜치에서 커밋
  - `PatternDraftBody` schema (capture에 phase+signals+trade_plan 저장)
  - `_normalize_research_context` (draft → capture research_context 변환)
  - `build_manual_hypothesis_benchmark_pack_draft` → `run_pattern_benchmark_search` 연결
- 위 엔드포인트가 실제로 유사 케이스 10개를 반환하는지 smoke test

### App Surface (연결)
- Save Setup 시 `pattern_draft` 포함해서 capture 저장하는 경로 확인/수정
- 저장된 capture에서 "Find Similar" 버튼 → `POST /captures/{id}/benchmark_search` 호출
- 결과 10개 표시: 심볼, 타임스탬프, 유사도 점수, outcome (+X% or stop)

### Out of scope (이번에 하지 않음)
- definition_ref 마이그레이션
- plane contract 재정렬
- feature plane canonical 연결
- UI 완성도 (스타일, 애니메이션 등)

## Non-Goals

- W-0148 plane contract 작업 없음
- W-0160 definition truth 마이그레이션 없음
- 새 데이터 provider 추가 없음
- Refinement threshold 자동 조정 없음

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0200-core-loop-proof.md`
- `engine/api/routes/captures.py` ← stash에 핵심 변경사항 있음
- `engine/research/manual_hypothesis_pack_builder.py`
- `engine/research/pattern_search.py`
- `engine/research/query_transformer.py`
- `engine/capture/store.py`
- `app/src/routes/terminal/+page.svelte` (Save Setup 진입점)
- `app/src/lib/cogochi/modes/` (TradeMode Save 흐름)

## Facts

1. `engine/research/pattern_search.py` (3,155줄)에 `run_pattern_benchmark_search`가 이미 구현되어 있다.
2. `engine/research/manual_hypothesis_pack_builder.py`에 capture → benchmark pack 변환 로직이 이미 있다.
3. stash에 `POST /captures/{id}/benchmark_pack_draft` + `POST /captures/{id}/benchmark_search` 엔드포인트가 완성되어 있다.
4. `engine/pattern_registry/`에 16개 패턴이 있고 `engine/ledger_records/`에 실제 ledger data가 있다.
5. `engine/state/pattern_capture.sqlite`에 400+개 capture가 실제로 쌓여있다.
6. `PatternSeedScout` + `find_similar_patterns` (PR#230/#239)는 이미 main에 머지되어 있다.

## Assumptions

1. stash의 captures.py 변경사항이 현재 engine 의존성과 충돌 없이 적용된다.
2. benchmark_search가 실제 유사 케이스를 반환하려면 corpus가 충분히 쌓여있어야 한다 — 부족하면 seeded founder patterns으로 smoke test한다.
3. app의 Save Setup 경로는 이미 `research_context`를 포함해 저장하고 있다 (W-0139에서 완료됨).

## Open Questions

- benchmark_search 응답 포맷이 app UI에서 바로 소비 가능한가, 아니면 adapter 필요한가?
- "Find Similar" 버튼을 어디에 두나: capture detail sheet vs. TradeMode HUD?

## Decisions

- stash pop → `codex/w-0200-core-loop-proof` 브랜치에서 시작.
- UI는 "작동하는 것" 우선, 스타일은 나중에.
- benchmark_search 결과가 비면 "유사 케이스 없음" 표시 — 에러 처리 아님.
- W-0149가 이 work item에 흡수된다 (별도 완료 처리 불필요).

## Next Steps

1. `git checkout -b codex/w-0200-core-loop-proof` 후 `git stash pop`
2. `uv run pytest tests/test_capture_routes.py -q` — stash 코드 smoke test
3. benchmark_search 응답 포맷 확인 → app 연결 경로 결정
4. app에서 "Find Similar" 호출 + 결과 표시

## Exit Criteria

- [ ] 트레이더가 터미널에서 임의의 심볼 열고 Save Setup 누를 수 있다
- [ ] 저장된 capture에서 "Find Similar" 트리거 시 유사 케이스 10개 이상 반환된다
- [ ] 각 케이스마다 심볼 / 타임스탬프 / 유사도 / outcome (수익률 또는 stop) 이 표시된다
- [ ] 엔진 테스트 통과 (`tests/test_capture_routes.py` 포함)

## Handoff Checklist

- active work item: `work/active/W-0200-core-loop-proof.md`
- branch: `codex/w-0200-core-loop-proof` (미생성, 다음 단계)
- stash: `core-loop: capture benchmark_search endpoints + PatternDraft schema [W-0149 scope]`
