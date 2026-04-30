# W-0352 — Pipeline top-patterns REST API

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (pipeline Stage 6+7 결과 노출 — 신규 컴퓨트 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
pipeline.py Stage 6 (paper verification) + Stage 7 (composite_score) 결과로 만들어진
date-stamped parquet을 REST API로 노출해 프런트엔드(`TopPatternsPanel`)가 polling 소비할 수
있게 한다.

## Scope
- 포함:
  - `GET /research/top-patterns?limit=20&min_grade=B`
  - **Parquet path pattern (코드 검증 기반)**:
    `engine/experiments/pipeline_results/results_{YYYY-MM-DD}.parquet`
    - pipeline.py 가 `out_dir / f"results_{run_ts[:10]}.parquet"`로 저장 (date-stamped).
    - 최신 파일은 `glob("results_*.parquet")` + `max(mtime)`으로 결정.
  - **Parquet schema (검증 필요 컬럼 집합 = `REQUIRED_COLUMNS`)**:
    `pattern`, `symbol`, `direction`, `n_signals`, `n_executed`, `win_rate`,
    `expectancy_pct`, `sharpe`, `calmar`, `max_drawdown_pct`, `final_equity`, `scan_ts`,
    `composite_score` (float, NaN if Stage 7 실패), `quality_grade`
    (str: S/A/B/C, NaN if not scored).
  - LRU cache key = `(parquet_path, mtime)`, TTL=60s, maxsize=4 (다중 날짜 동시 캐시 대비).
  - pydantic `TopPatternItem` / `TopPatternsResponse` 스키마.
  - parquet 미존재 시 200 + `patterns: []` (404 금지).
- 파일:
  - `engine/api/routes/research.py` (GET endpoint 추가)
  - `engine/pipeline.py` (`latest_top_patterns_path()` helper 추가)
  - `engine/tests/api/test_top_patterns_endpoint.py` (신규)
- API:
  - `GET /research/top-patterns`
  - Query params: `limit` (int, default 20, server-cap 100), `min_grade` (str,
    default "B", values S/A/B/C).
  - Response: `TopPatternsResponse` (patterns, generated_at, pipeline_run_id, total_available).

## Non-Goals
- parquet 재생성 트리거 — pipeline.py 실행은 별도 스케줄러 담당.
- WebSocket / streaming — 단순 REST polling.
- grade 외 필터(composite_score 범위, sharpe 임계 등) — 추후 W-0358+.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| parquet 파일 absent → 500 | 중 | 중 | try/except + 빈 리스트 반환 (D-0352-01) |
| stale parquet (pipeline 미실행) | 중 | 저 | `generated_at` 노출, > 24h 이면 클라이언트가 warning surface |
| parquet 컬럼 schema drift | 중 | 고 | `REQUIRED_COLUMNS` 사전 검증 → 422, pydantic 보다 먼저 (F1) |
| LRU cache 메모리 증가 | 저 | 저 | maxsize=4 (최대 4 days × ~1MB) |
| 동시 요청 중 parquet 파일 교체 | 저 | 중 | 파일 경로 resolve 후 단일 read; pipeline은 `tempfile.replace()` atomic write 가정 (검증 필요) |
| 모든 composite_score=NaN | 저 | 중 | min_grade 필터 후 `patterns:[]` → empty 응답 misleading. F2 처리 |

### Dependencies / Rollback / Files Touched
- **Dependencies**: pipeline.py Stage 6+7 (paper verification + composite_score) 이미 머지됨
  (W-0348, W-0314).
- **Rollback**: endpoint 제거 또는 feature flag `TOP_PATTERNS_API_ENABLED=false`.
- **Files Touched**:
  - 수정: `engine/api/routes/research.py`, `engine/pipeline.py`
  - 신규: `engine/tests/api/test_top_patterns_endpoint.py`

## AI Researcher 관점

### Data Impact (paper-precision)

**TopPatternItem ← parquet column mapping**:
| API 필드 | parquet 컬럼 | 타입 | 비고 |
|---|---|---|---|
| `pattern_slug` | `pattern` | str | LIBRARY_COMBOS 키 |
| `symbol` | `symbol` | str | optional, 일부 패턴은 symbol-agnostic |
| `direction` | `direction` | str | long/short |
| `composite_score` | `composite_score` | float | 0~100, NaN if Stage 7 실패 |
| `quality_grade` | `quality_grade` | str | S≥85 / A≥70 / B≥55 / C<55 |
| `n_trades_paper` | `n_executed` | int | Stage 6 paper trades |
| `win_rate_paper` | `win_rate` | float ∈ [0,1] | |
| `sharpe_paper` | `sharpe` | float | annualized |
| `max_drawdown_pct_paper` | `max_drawdown_pct` | float ≤ 0 | |
| `expectancy_pct_paper` | `expectancy_pct` | float | |
| `model_source` | (W-0357 산출) | str|None | "registry" / "fallback" / None (legacy parquet) |

**Composite score grading** (`engine/verification/composite_score.py`):
- S: composite ≥ 85
- A: 70 ≤ composite < 85
- B: 55 ≤ composite < 70
- C: composite < 55
- NaN → grade 미부여, min_grade 필터에서 자동 제외.

**`min_grade=B` 분포 효과**: BH-FDR pass 패턴 중 통상 40~60%가 grade≥B에 해당 (Wave 4
backtest 분포 기준). `min_grade=A`는 상위 ~15%, `S`는 ~3%.

**`pipeline_run_id`**: parquet 파일명에서 직접 파생. `results_2026-04-30.parquet` →
`pipeline_run_id = "2026-04-30"`. 같은 날 multiple runs 시 mtime이 가장 최신인 파일 사용,
`generated_at`은 mtime을 ISO8601 UTC로 노출.

### Statistical Validation (paper-level)

1. **Schema drift guard** —
   `REQUIRED_COLUMNS = {"pattern", "symbol", "direction", "n_signals", "n_executed",
                        "win_rate", "expectancy_pct", "sharpe", "calmar",
                        "max_drawdown_pct", "final_equity", "scan_ts",
                        "composite_score", "quality_grade"}`.
   Pydantic parsing 이전에 `if not REQUIRED_COLUMNS.issubset(df.columns): raise 422`.
   부분 응답 금지.
2. **Grade distribution sanity** — `S+A` 비율은 정상 운영 시 ≤ 20% 예상. > 50% 라면 score
   inflation 의심 → log.warn (응답은 정상 반환).
3. **Staleness metric** — `generated_at`은 mtime의 ISO8601 UTC. `now - generated_at > 24h`
   면 클라이언트가 banner로 표시하도록 명세에 기재 (서버는 단순 노출).
4. **Cache correctness** — LRU key는 `(path, mtime)`. mtime이 바뀌면 key가 바뀌어 자동
   invalidation. 동일 mtime + 동일 path는 동일 응답 보장 (pytest로 검증).
5. **Determinism** — 동일 parquet, 동일 query → 동일 응답 (정렬 안정성: `sort_values(
   "composite_score", ascending=False, kind="mergesort")` — equal scores tie-break은 입력
   순서 유지).
6. **Limit cap correctness** — `limit > 100` 요청 → 서버는 100으로 강제 + 응답에
   `total_available` 필드로 원본 row 수 노출 (truncation transparency).

### Failure Modes (expanded)

- **F1 — parquet schema drift (column rename/removal)**:
  pipeline.py 리팩터로 `composite_score` → `score_composite` 같은 변경 발생 시 pydantic 422
  대신 우리가 먼저 422 with 명시적 메시지 (`missing columns: [...]`).
  완화: `REQUIRED_COLUMNS` 검증, pydantic은 그 다음.
- **F2 — 모든 composite_score=NaN (Stage 7 전체 실패)**:
  `min_grade` 필터가 NaN을 제외하면 `patterns:[]`만 반환되어 "데이터 없음"처럼 보임.
  완화: 응답에 별도 `unscored_count` 필드 추가. 또는 응답 본문 + 404 대신 200 with
  `warning="all_unscored"` 메타를 포함.
- **F3 — 동시 parquet write/read race**:
  pipeline.py 가 `to_parquet` 중간 상태를 노출하면 부분 read → corrupt error.
  완화: pipeline.py가 `tempfile.NamedTemporaryFile(...) → os.replace(tmp, final)` 같은
  atomic rename을 사용하는지 검증. 만약 사용하지 않으면 W-0352와 별도로 pipeline 측에서
  보강 필요 (Open Question).
- **F4 — `limit` cap silent truncation**:
  사용자가 `limit=500` 요청 시 100으로 자르고 침묵 truncation은 디버깅 어렵게 함.
  완화: 응답에 `total_available: int`, `limit_applied: int` 필드 추가.
- **F5 — NaN composite_score row가 grade 필터를 통과**:
  pandas `df[df.quality_grade >= "B"]` 비교에서 NaN은 False지만, 일부 path는 True 가능.
  완화: 명시적으로 `df = df.dropna(subset=["composite_score", "quality_grade"])` 먼저
  적용.

## Decisions

- [D-0352-01] parquet 미존재 시 200 + 빈 리스트 — 클라이언트 polling 일시 absent 대응 단순화.
- [D-0352-02] LRU cache key=`(path, mtime)`, maxsize=4, TTL=60s — 단일 최신 파일 + 다중 날짜 동시 조회.
- [D-0352-03] `limit` 서버 cap = 100, 초과 시 truncate + `total_available` 노출.
- [D-0352-04] **NaN composite_score 행은 min_grade 필터 이전에 제거.** Stage 7 실패 패턴이
  grade 필터를 우회해 응답에 포함되는 것을 방지.
- [D-0352-05] **`pipeline_run_id` = parquet 파일명에서 추출한 날짜 문자열** (예:
  `"2026-04-30"`). UUID 아님. 같은 날 multiple run은 mtime 최대값을 사용. 향후 multi-run
  per day 빈도가 높아지면 `pipeline_run_id` 포맷을 `"{date}_{mtime_unix}"`로 확장 가능.

## Open Questions

- [ ] [Q-0352-01] pipeline.py의 parquet write가 atomic rename을 사용하는지 검증 필요
  (F3 대응). 미사용 시 W-0352 안에서 보강할지, 별도 W-item으로 분리할지 결정.
- [ ] [Q-0352-02] `min_grade` 기본값 "B"가 적절한지 (베타 사용자에게 더 많은 surface 위해
  "C"가 나을 수도). 초기 데이터 분포 확인 후 결정.
- [ ] [Q-0352-03] `model_source` 컬럼은 W-0357 머지 후에야 parquet에 채워짐. 그 이전 응답은
  `model_source: None`으로 노출하고, 프런트엔드는 None을 "(unknown)"으로 표시.

## Implementation Plan

1. `engine/pipeline.py`에 `latest_top_patterns_path() -> Path | None`
   (glob `results_*.parquet` + `max(mtime)`).
2. `engine/api/routes/research.py`에 `TopPatternItem`, `TopPatternsResponse` pydantic 스키마.
3. `GET /research/top-patterns`:
   1) path resolve
   2) `REQUIRED_COLUMNS` 검증 (F1)
   3) `dropna(subset=["composite_score", "quality_grade"])` (D-0352-04)
   4) min_grade 필터
   5) `composite_score` DESC 정렬 (mergesort)
   6) limit (cap=100, total_available 기록)
   7) pydantic serialize
   8) `(path, mtime)` 키 LRU cache wrap.
4. pytest:
   - parquet 존재 / 미존재
   - schema drift (필수 컬럼 누락 → 422)
   - NaN composite_score 행 제외 검증 (F2 / D-0352-04)
   - `min_grade` filter (B → A → S 단조 감소 row count)
   - `limit > 100` cap + `total_available` 정확성
   - cache hit (동일 mtime → 동일 결과, mtime 변경 → 재계산)

## Exit Criteria

- [ ] AC1: `GET /research/top-patterns` → 200 + `patterns` array.
- [ ] AC2: 응답 row에 `pattern_slug`, `composite_score`, `quality_grade`, `n_trades_paper`,
  `win_rate_paper`, `sharpe_paper`, `max_drawdown_pct_paper`, `expectancy_pct_paper`,
  `model_source` 9개 컬럼 모두 존재 (None 허용).
- [ ] AC3: parquet 미존재 시 200 + `patterns: []` + `pipeline_run_id: null`.
- [ ] AC4: cache hit p50 < 50ms, cold p95 < 300ms (pytest `time.perf_counter` assert).
- [ ] AC5: schema drift (`composite_score` 컬럼 제거) → 422 with 명시 message.
- [ ] AC6: `limit=500` 요청 → 응답 `len(patterns)==100` + `total_available==<원본 row 수>` +
  `limit_applied==100`.
- [ ] AC7: pytest ≥ 6 PASS (신규 테스트 파일).
- [ ] CI green.
- [ ] PR merged + CURRENT.md SHA 업데이트.
