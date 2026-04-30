---
id: W-0367
title: "Pattern Alpha Verification Loop — Phase 1: 시그널 저장 + 멀티호라이즌 추적"
status: in-progress
wave: 5
priority: P0
effort: M
owner: engine
issue: "#810"
pr: "#813"
created: 2026-05-01
---

# W-0367 — Pattern Alpha Verification Loop (Phase 1)

> Wave: 5 | Priority: P0 | Effort: M
> Charter: In-Scope — Research Engine, Pattern Quality
> Status: 🟢 In Progress (PR #813 open)
> Created: 2026-05-01

## Goal

패턴스캐너가 내보내는 시그널을 DB에 기록하고, 1h/4h/24h/72h 실현 P&L을 자동 추적하여 "알람이 울리는 게 아니라 수익과 이어지는지"를 수치로 확인할 수 있는 관측 인프라를 구축한다.

## Scope

### 포함
- **`scan_signal_events`** 테이블: 시그널 발화 시 `component_scores` JSONB 저장 (phase_scores + indicator_snapshot)
- **`scan_signal_outcomes`** 테이블: 1h/4h/24h/72h 호라이즌별 `triple_barrier_outcome` + realized/peak P&L 기록
- **`signal_event_store.py`**: Supabase CRUD (insert, init_outcomes, fetch_unresolved, resolve_outcome, fetch_components, fetch_resolved)
- **`scanner.py` 훅**: `_record_latest_signal()` — background thread, `ENABLE_SIGNAL_EVENTS=true` 시 활성
- **`verification_loop.py`**: APScheduler 1h job — 미완료 시그널 가격 조회 → triple_barrier 계산 → outcomes upsert
- **`alpha_quality.py`**: Welch t-test + BH-FDR + Spearman → 패턴별 알파 품질 리포트
- **API**: `GET /research/alpha-quality` + `GET /research/signals/{id}/components`
- **Migration 037**: `scan_signal_events` + `scan_signal_outcomes` (인덱스 포함)

### 파일
| 파일 | 변경 |
|---|---|
| `engine/research/signal_event_store.py` | 신규 |
| `engine/research/verification_loop.py` | 신규 |
| `engine/research/alpha_quality.py` | 신규 |
| `engine/research/pattern_scan/scanner.py` | 훅 추가 |
| `engine/scanner/scheduler.py` | verification_loop 등록 |
| `engine/api/routes/research.py` | 2개 엔드포인트 추가 |
| `engine/tests/research/test_signal_events.py` | 신규 (16 tests) |
| `app/supabase/migrations/037_scan_signal_tables.sql` | 신규 |

### API
- `GET /research/alpha-quality?lookback=30d&pattern_slug=BTCUSDT_2024_bull`
- `GET /research/signals/{signal_id}/components`

## Non-Goals (→ W-0368)

- Dead-letter queue (DLQ) + retry FSM — W-0368
- Batch UPSERT 100 events/tx 최적화 — W-0368
- Circuit breaker (Supabase 과부하 보호) — W-0368
- Lookahead-free property-based test — W-0368
- `ENABLE_SIGNAL_EVENTS` / `ENGINE_ENABLE_SCHEDULER` flag parity test — W-0368
- Decay alert (2σ rolling baseline + Sentry) — W-0368 Phase 2-C
- p95 < 500ms SLO 달성 — W-0368 (Phase 1 허용치: < 3s)
- UI 시각화 — W-0369 (Alpha Terminal)
- W-0282 paper executor 실행 — 본 work item은 read-only 관측
- OOS_WIRING 불일치 수정 (`autoresearch_loop.py` vs `scanner.py`) — W-0368 별도

## component_scores JSONB 구조

```json
{
  "phase_scores": [
    {"phase": "compression", "score": 0.82, "weight": 0.40},
    {"phase": "expansion",   "score": 0.71, "weight": 0.35},
    {"phase": "confirmation","score": 0.65, "weight": 0.25}
  ],
  "indicator_snapshot": {
    "cvd_change_zscore":  1.8,
    "bb_squeeze":         0.12,
    "oi_change_1h":       0.031,
    "oi_change_24h":      0.044,
    "vol_zscore":         2.1
  },
  "overall_score": 0.74,
  "schema_version": 1
}
```

**왜 두 레이어?**
- `phase_scores`: similarity_ranker.PhaseFeatureScore — "패턴에 얼마나 닮았나" (유사도)
- `indicator_snapshot`: feature_calc.py 출력 스냅샷 6개 핵심 지표 — "시그널 발화 시점 시장 상태" (맥락)
→ Spearman: "indicator_snapshot.cvd_change_zscore가 높을 때 profit_take가 실제로 더 많나?" 검증 가능

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 가격 조회 실패로 outcome 누락 | 중 | 중 | `outcome_error` 컬럼 기록, W-0368에서 retry FSM 추가 |
| scan_signal_events 무한 성장 | 중 | 중 | 90일 TTL 정책 — W-0368 Open Question |
| feature_calc 스냅샷 컬럼 rename drift | 저 | 고 | `schema_version` 필드로 버전 추적 |
| BH-FDR false discovery (52×4=208 테스트) | 중 | 중 | α=0.10, bootstrap CI 보조 |
| Supabase 단건 write 부하 | 저 | 저 | Phase 1 허용; W-0368에서 batch 100/tx |

### Dependencies
- `similarity_ranker.compute_feature_score` 이미 구현 (line 224)
- `validation/labels.triple_barrier_outcome` 이미 구현 (line 37)
- `validation/stats.welch_t_test`, `bh_correct`, `bootstrap_ci` 이미 구현
- APScheduler 11개 job 이미 등록됨 → 12번째 추가
- Migration 037 적용됨 (Supabase cogotchi 프로젝트 `hbcgipcqpuintokoooyg`)

### Rollback
- Migration DROP: `DROP TABLE scan_signal_outcomes; DROP TABLE scan_signal_events;`
- scanner.py 훅: `ENABLE_SIGNAL_EVENTS=false` 으로 즉시 비활성화

### Files Touched (실측)
```
engine/research/signal_event_store.py      — 신규 (164 LOC)
engine/research/verification_loop.py       — 신규 (139 LOC)
engine/research/alpha_quality.py           — 신규 (157 LOC)
engine/research/pattern_scan/scanner.py    — 훅 추가 (_record_latest_signal)
engine/scanner/scheduler.py                — verification_loop.register_scheduler 추가
engine/api/routes/research.py              — alpha-quality + components 엔드포인트
engine/tests/research/test_signal_events.py — 16 tests (AC1~AC6 커버)
app/supabase/migrations/037_scan_signal_tables.sql — 신규
```

## AI Researcher 관점

### 통계 설계

**샘플 크기 추정**
- 7d: ~350 signals / 52 patterns ≈ 7/패턴 → 검정력 부족
- 30d: ~1,500 signals / 52 patterns ≈ 30/패턴 → Welch t-test 유효 (n≥20 권장)
- Primary window: 30d | Supplementary: 7d (트렌드 관측용)

**Multiple Testing**
- 52 patterns × 4 horizons = 208 tests
- BH-FDR α = 0.10 (기존 `bh_correct` 재사용)
- Significant threshold: adjusted p < 0.10

**Spearman Correlation**
- 각 `indicator_snapshot` 필드 vs `realized_pnl_pct`
- Bootstrap CI 1,000회 → 안정적 상관계수 추정

### 검증 실패 모드

| 시나리오 | 지표 | 대응 |
|---|---|---|
| 모든 패턴 p-value > 0.10 | 알파 없음 | 패턴 재생성 필요 (W-0364 피드백) |
| profit_take 비율 < 40% | 엔트리 타이밍 문제 | tp_pct/sl_pct 파라미터 조정 |
| Spearman 모두 < 0.1 | 인디케이터-수익 무관 | 피처 선택 재검토 |

## Decisions

- **[D-0367-A]** outcome 추적 주기: 1h (APScheduler) — 이유: 24h/72h 호라이즌에 hourly resolution으로도 충분, WebSocket 실시간 불필요
  - 거절 옵션: 5분 주기 — DB 부하 과다, 72h 데이터 90% 중복
- **[D-0367-B]** component_scores 스냅샷: JSONB — 이유: 컬럼 수 40+로 고정 스키마 비현실적, JSONB GIN 인덱스로 쿼리 가능
  - 거절 옵션: 별도 feature_snapshot 테이블 — join 복잡도, 성능 열위
- **[D-0367-C]** 통계 집계 주기: API 요청 시 on-demand (cache 1h) — 이유: 30d 데이터 집계 ~2초, 실시간 필요 없음
  - 거절 옵션: materialized view — 208 tests * 매시간 재계산 불필요
- **[D-0367-D]** Phase 1 p95 SLO: 3s (W-0368에서 500ms로 강화) — 이유: 데이터 없는 상태에서 벤치마크 무의미
  - 거절 옵션: 500ms 즉시 — batch/캐싱 없이 달성 불가

## Open Questions

- [ ] [Q-0367-A] scan_signal_events 90일 이후 보존 정책? TTL vs 파티셔닝 (W-0368에서 결정)
- [ ] [Q-0367-B] indicator_snapshot 컬럼 목록 고정 vs feature_calc 동적 출력 전체? (현재: 5개 핵심 지표 고정)

## Implementation Plan

1. ✅ **Migration 037** — `scan_signal_events` + `scan_signal_outcomes` 테이블 생성 (Supabase 적용 완료)
2. ✅ **`signal_event_store.py`** — Supabase CRUD 함수
3. ✅ **`scanner.py` 훅** — `_record_latest_signal()` background thread, `ENABLE_SIGNAL_EVENTS` flag guard
4. ✅ **`verification_loop.py`** — APScheduler 1h job, Binance FAPI 가격 조회, triple_barrier 계산
5. ✅ **`alpha_quality.py`** — Welch + BH-FDR + Spearman, `aggregate()` API
6. ✅ **`research.py` API** — `GET /research/alpha-quality` + `GET /research/signals/{id}/components`
7. ✅ **`scheduler.py`** — verification_loop job 등록
8. ✅ **Tests** — 16 tests, AC1~AC6 커버
9. ✅ **Cloud Run** — `ENABLE_SIGNAL_EVENTS=true`, `ENGINE_ENABLE_SCHEDULER=true`, `AUTORESEARCH_ENABLED=true` 적용

## Exit Criteria

- [x] AC1: `scan_signal_events`에 시그널 발화 시 `component_scores.phase_scores` 2개 이상 + `indicator_snapshot` 4개 이상 저장됨 (pytest 검증)
- [x] AC2: `scan_signal_outcomes`에 1h/4h/24h/72h 4개 호라이즌 레코드 생성 (테스트 픽스처 기준)
- [x] AC3: `triple_barrier_outcome` 3개 값 ("profit_take"/"stop_loss"/"timeout") 모두 실제 계산됨 (unit test)
- [x] AC4: `alpha_quality.aggregate(lookback_days=30)` 실행 시 BH-FDR 보정 p-value 208개 반환 (pytest)
- [x] AC5: Spearman correlation: 각 indicator_snapshot 필드 vs realized_pnl_pct 계산됨 (unit test)
- [ ] AC6: `GET /research/alpha-quality?lookback=30d` p95 < 3s (30d 실데이터 벤치마크 — 데이터 축적 후 측정)
- [x] AC7: `GET /research/signals/{id}/components` JSON 응답 schema validation 통과 (unit test)
- [ ] AC8: 30d 실데이터 기준 패턴별 시그널 수 ≥ 20개 이상인 패턴이 1개 이상 존재 (데이터 축적 후)
- [x] AC9: CI green (pytest + typecheck) — PR #813
- [ ] AC10: PR merged + CURRENT.md SHA 업데이트
