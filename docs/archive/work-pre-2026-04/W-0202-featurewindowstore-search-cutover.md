# W-0202 — FeatureWindowStore Search Cutover

## Goal

SearchCorpusStore를 FeatureWindowStore 기반으로 완전히 전환하고, 검색 corpus를 build-time에 feature signals로 풍부하게 만든다. (W-0162 Layer A Upgrade의 마무리)

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `engine/research/pattern_search.py`: SearchCorpusStore → FeatureWindowStore 기반 cutover
- `engine/research/corpus_builder.py` (신규): feature signals를 corpus 생성 시 bake-in
- Build-time enrichment: `_materialize_feature_signals_into_corpus()`
- DB schema: corpus_signals 테이블 (window_id, signal_name, signal_value)

## Non-Goals

- Real-time corpus updates (batch rebuild만)
- Search-time fallback 제거 (graceful fallback 유지)
- Layer B/C 변경 (Layer A만)

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0162-layer-a-upgrade.md` (context)
- `engine/research/pattern_search.py`
- `engine/research/corpus_builder.py`
- `memory/project_search_layer_a_upgrade_2026_04_25.md`

## Facts

1. W-0162 Layer A는 3→40+ 차원으로 업그레이드 완료 (search time enrichment)
2. 현재 SearchCorpusStore는 여전히 기존 3차원 시그니처만 저장
3. Build-time enrichment로 corpus를 FeatureWindowStore signals로 bake-in하면:
   - Search time N+1 쿼리 제거 → 성능 3-5배 향상
   - Corpus 시간 정보 활용 가능 (temporal sensitivity)
4. FeatureWindowStore는 이미 build phase에 available (W-0156, W-0157 완료)

## Assumptions

1. FeatureWindowStore SQLite 성능이 충분 (10M+ rows 조회 < 100ms)
2. Corpus 빌드가 배치 작업 (온디맨드 X)
3. Feature signals 추출이 idempotent

## Open Questions

- Corpus rebuild 빈도: 일주일? 한 달?
- Historical corpus (1년 이상 패턴)를 모두 enrichment할까? (저장소 크기)
- Signal fallback 순서: feature_snapshot → fw_enrichment → legacy search_hints?

## Decisions

- FeatureWindowStore를 corpus의 source-of-truth로 정의
- Search time에는 baked-in signals 우선, fallback 유지
- Strangler pattern: 기존 SearchCorpusStore와 병행 운영 후 점진적 전환

## Next Steps

1. `corpus_builder.py` 신규 작성: `_materialize_feature_signals_into_corpus()`
2. `pattern_search.py` cutover: FeatureWindowStore signals 우선 사용
3. Corpus rebuild 스크립트 작성 + Cloud Scheduler 등록
4. A/B test: old corpus vs new corpus 성능 비교
5. Main corpus로 전환 (점진적 — 기존 fallback 유지)

## Exit Criteria

- `_materialize_feature_signals_into_corpus()` 완료 (corpus에 40+ signals 저장)
- `pattern_search.py` Layer A가 corpus signals 먼저 사용
- Corpus rebuild 스크립트 동작 확인
- A/B 테스트: 유사도 검색 품질 동등 이상 (precision/recall)
- CURRENT.md에 W-0202 완료로 표기

## Handoff Checklist

- active work item: `work/active/W-0202-featurewindowstore-search-cutover.md`
- active branch: `feat/w-0202-fws-cutover` (생성 필요)
- verification: pytest `test_corpus_builder.py` + A/B comparison
- remaining blockers: Historical corpus enrichment 범위 결정 필요
