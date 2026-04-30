# W-0352 — Pipeline top-patterns REST API

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (pipeline Stage 6+7 결과 노출 — 신규 컴퓨트 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
pipeline.py Stage 6+7이 만든 composite_score를 REST API로 노출해서 프런트엔드가 소비할 수 있게 한다.

## Scope
- 포함:
  - `GET /research/top-patterns?limit=20&min_grade=B`
  - 가장 최근 `top_patterns.parquet` 로드 (mtime 기준), LRU cache TTL=60s
  - pydantic `TopPatternItem` / `TopPatternsResponse` 스키마
  - parquet 미존재 시 200 + `patterns: []` (404 금지)
- 파일:
  - `engine/api/routes/research.py` (GET endpoint 추가)
  - `engine/pipeline.py` (`latest_top_patterns_path()` helper 추가)
  - `engine/tests/api/test_top_patterns_endpoint.py` (신규)
- API:
  - `GET /research/top-patterns`
  - Query params: `limit` (int, default 20), `min_grade` (str, default "B")
  - Response: `TopPatternsResponse`

## Non-Goals
- parquet 재생성 트리거 — pipeline.py 실행은 별도 스케줄러 담당
- WebSocket / streaming 응답 — 단순 REST polling
- grade 이외의 필터링 (composite_score 범위 등) — 추후 W-0358+

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| parquet 파일 absent → 500 | 중 | 중 | try/except + 빈 리스트 반환 |
| stale parquet (pipeline 오랫동안 미실행) | 중 | 저 | `generated_at` 필드로 클라이언트가 staleness 판단 |
| LRU cache 메모리 증가 | 저 | 저 | maxsize=1 (최신 파일 1개만 캐시) |
| 동시 요청 중 parquet 파일 교체 | 저 | 저 | 파일 경로 resolving 후 immutable read |

### Dependencies / Rollback / Files Touched
- **Dependencies**: pipeline.py Stage 6+7 (`top_patterns.parquet` 생성) — 이미 존재
- **Rollback**: endpoint 제거 또는 feature flag `TOP_PATTERNS_API_ENABLED=false`
- **Files Touched**:
  - 수정: `engine/api/routes/research.py`, `engine/pipeline.py`
  - 신규: `engine/tests/api/test_top_patterns_endpoint.py`

## AI Researcher 관점

### Data Impact
- 읽기 전용 — 기존 `top_patterns.parquet` 소비
- `pipeline_run_id`는 parquet 파일명 또는 메타데이터에서 파생

### Statistical Validation
- `min_grade` 필터 적용 후 반환 rows 수 sanity: grade S/A/B/C 분포가 [0,1] 범위 내
- composite_score DESC 정렬 정확성: 상위 `limit`개가 실제 최고값인지 assert

### Failure Modes
- F1: parquet 컬럼 누락 (스키마 drift) → `TopPatternItem` pydantic validation error → 500 → 스키마 버전 고정 필요
- F2: grade 필터로 결과 0건 → `patterns: []` 정상 반환
- F3: limit 과대 (예: 10000) → parquet 전체 로드 → maxsize 파라미터 서버사이드 cap (≤100)

## Decisions
- [D-0352-01] parquet 미존재 시 404 대신 200 + 빈 리스트 — 클라이언트가 polling 중 일시적 absent에 에러 처리 불필요
- [D-0352-02] LRU cache maxsize=1, TTL=60s — 단일 최신 파일 패턴에 충분
- [D-0352-03] limit 서버사이드 max=100 강제

## Open Questions
- [ ] [Q-0352-01] `pipeline_run_id` 출처: 파일명 prefix vs. 별도 metadata.json?
- [ ] [Q-0352-02] min_grade 기본값 "B"가 맞는지 (C 포함해야 하는 경우)?

## Implementation Plan
1. `engine/pipeline.py`에 `latest_top_patterns_path() -> Path | None` helper 추가 (glob + max mtime)
2. `engine/api/routes/research.py`에 `TopPatternItem`, `TopPatternsResponse` pydantic 스키마 정의
3. `GET /research/top-patterns` endpoint 구현: path resolve → parquet 로드 → grade 필터 → limit 슬라이스 → 캐시
4. LRU cache wrapping (`functools.lru_cache` or `cachetools.TTLCache`)
5. pytest: parquet 존재/미존재, grade 필터, limit cap, cache hit 시나리오

## Exit Criteria
- [ ] AC1: `GET /research/top-patterns` → 200 + `patterns` array
- [ ] AC2: 응답 rows에 `pattern_slug`, `composite_score`, `quality_grade`, `n_trades_paper`, `win_rate_paper`, `sharpe_paper`, `max_drawdown_pct_paper`, `expectancy_pct_paper`, `model_source` 7개 컬럼 모두 존재 (None 허용)
- [ ] AC3: parquet 없을 때 200 + `patterns: []`
- [ ] AC4: cache hit p50 < 50ms, cold p95 < 300ms (pytest benchmark 또는 time.perf_counter assert)
- [ ] AC5: pytest ≥ 6 PASS (신규 테스트 파일 기준)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
