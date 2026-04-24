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
- `app/src/components/terminal/workspace/ResearchPanel.svelte`
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`
- `app/src/lib/server/patternSeed/match.ts`
- `app/src/routes/api/terminal/pattern-captures/[id]/benchmark/+server.ts`

## Facts

1. `engine/research/pattern_search.py`에는 `run_pattern_benchmark_search`가 이미 구현되어 있다.
2. `engine/research/manual_hypothesis_pack_builder.py`에는 capture → benchmark pack 변환 로직이 이미 있다.
3. `POST /captures/{id}/benchmark_search` route truth가 `captures.py`에 복구되어 있다.
4. `PatternSeedScout`와 DOUNI `find_similar_patterns` bridge는 이미 mainline에 머지되어 있다.
5. ResearchPanel은 구간 선택 → 자동분석 → 유사 패턴 10개 → 저장 전 과정을 한 화면에서 처리한다.
6. 저장 후 백그라운드로 `POST /captures/{id}/benchmark_search`가 fire-and-forget으로 호출된다.
7. 3-layer search (Layer A: feature signature, Layer B: phase path LCS, Layer C: ML p_win) 구현 완료.
8. Search Quality Ledger (+/-  판단 → A/B/C 블렌드 재보정) 구현 완료.
9. `close_return_pct` outcome proxy가 유사 케이스 카드에 표시된다.
10. Supabase `capture_records`에 `definition_id`, `definition_ref_json`, `research_context_json` 컬럼 추가 (migration 020).

## Decisions

- ResearchPanel에서 인라인으로 유사 패턴을 보여주는 것이 loop proof의 최소 요건을 충족한다.
- 저장 후 benchmark_search는 fire-and-forget (비동기 background, 결과는 다음 방문 시 corpus에 반영).
- engine route truth가 이미 존재하면 surface는 그 truth를 소비만 하고 search 로직을 app에 복제하지 않는다.
- W-0149의 남은 loop-proof 범위는 이 work item에 흡수 완료.

## Exit Criteria

- [x] 트레이더가 터미널에서 임의의 심볼 열고 Save Setup 누를 수 있다
- [x] 저장된 capture에서 "Find Similar" 트리거 시 유사 케이스 10개 이상 반환된다 (ResearchPanel 인라인 표시)
- [x] 각 케이스마다 심볼 / 타임스탬프 / 유사도 / outcome (수익률 %) 이 표시된다
- [x] 엔진 테스트 통과 — 1374 passed, 5 skipped (2026-04-25)

## Status

🟢 COMPLETE — PR #254 open on `codex/w-0200-core-loop-proof`, awaiting merge.

## PR

- **#252** — `/jobs/feature_materialization/run` + `/jobs/raw_ingest/run` (branch: `claude/strange-proskuriakova`)
- **#254** — W-0200 core loop (branch: `codex/w-0200-core-loop-proof`)

## Post-Merge Actions (사람 실행 필요)

1. GCP Cloud Run 재배포 후 `/jobs/status` 확인
2. Cloud Scheduler HTTP jobs 등록:
   - `POST /jobs/feature_materialization/run` — 15분 간격
   - `POST /jobs/raw_ingest/run` — 60분 간격
   - Header: `Authorization: Bearer <SCHEDULER_SECRET>`
3. Vercel `EXCHANGE_ENCRYPTION_KEY` 환경변수 설정 (프로덕션)
4. 프로덕션 스모크 테스트: 터미널 → 심볼 선택 → 구간 드래그 → ResearchPanel 열림 → 유사 패턴 표시 → 저장
