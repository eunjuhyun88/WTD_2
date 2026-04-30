---
id: W-0367
title: "Pattern Alpha Verification Loop: 패턴파인딩 루프 실증"
status: design
wave: 5
priority: P0
effort: L
owner: engine
issue: "#810"
created: 2026-05-01
---

# W-0367 — Pattern Alpha Verification Loop: 패턴파인딩 루프 실증

> Wave: 5 | Priority: P0 | Effort: L
> Charter: In-Scope — Research Engine, Pattern Quality
> Status: 🟡 Design Draft
> Created: 2026-05-01

## Goal

패턴파인딩 코어루프가 실제로 작동하는지를 컴포넌트 단위 점수 + 멀티호라이즌 P&L로 실증한다 — 알람이 울리는 게 아니라 수익과 이어지는지를 수치로 확인한다.

## Scope

### 포함
- `scan_signal_events` 테이블: 시그널 발화 시 `component_scores` JSONB (phase_scores + indicator_snapshot) 저장
- `scan_signal_outcomes` 테이블: 1h/4h/24h/72h 호라이즌별 `triple_barrier_outcome` + realized/peak P&L 기록
- `scanner.py` 훅: `similarity_ranker.compute_feature_score()` → `component_scores` 추출 + 저장
- `verification_loop.py`: APScheduler 1h 주기, 미완료 시그널 가격 조회 → `triple_barrier_outcome` 계산
- `alpha_quality.py`: Welch t-test + BH-FDR + Spearman correlation → 패턴별 알파 품질 리포트
- API: `GET /research/alpha-quality` + `GET /research/signals/{id}/components`
- Migration 037: 두 테이블 + 인덱스

### 파일
| 파일 | 변경 |
|---|---|
| `engine/research/pattern_scan/scanner.py` | per-signal 저장 훅 추가 |
| `engine/research/verification_loop.py` | 신규 — 호라이즌 outcome 추적기 |
| `engine/research/alpha_quality.py` | 신규 — 통계 집계 |
| `engine/routers/research.py` | 2개 엔드포인트 추가 |
| `app/supabase/migrations/037_scan_signal_tables.sql` | 신규 |

### API
- `GET /research/alpha-quality?lookback=30d&pattern_slug=BTCUSDT_2024_bull`
- `GET /research/signals/{signal_id}/components`

## Non-Goals

- W-0282 paper executor 실행 — 본 work item은 read-only 관측, 실제 주문 아님
- 신규 통계 엔진 — `validation/stats.py` 재사용만 (Welch/BH-FDR/Bootstrap 이미 구현됨)
- OOS_WIRING 불일치 수정 (`autoresearch_loop.py` vs `scanner.py`) — W-0368 별도
- UI 시각화 — 컴포넌트 점수 카드 디스플레이는 W-0369 (Alpha Terminal 스타일 UI)
- 신규 피처 계산 — `feature_calc.py` 기존 출력 스냅샷만

## component_scores JSONB 구조

```json
{
  "phase_scores": [
    {"phase": "compression", "score": 0.82, "weight": 0.40},
    {"phase": "expansion",   "score": 0.71, "weight": 0.35},
    {"phase": "confirmation","score": 0.65, "weight": 0.25}
  ],
  "indicator_snapshot": {
    "momentum_zscore": 1.8,
    "cvd_ratio":       0.62,
    "ob_imbalance":    0.44,
    "oi_delta_pct":    0.031,
    "bb_squeeze_pct":  0.12,
    "volume_acceleration": 2.1
  },
  "overall_score": 0.74,
  "schema_version": 1
}
```

**왜 두 레이어?**
- `phase_scores`: similarity_ranker.PhaseFeatureScore — "패턴에 얼마나 닮았나" (유사도)
- `indicator_snapshot`: feature_calc.py 출력 스냅샷 — "시그널 발화 시점 시장 상태" (맥락)
→ Spearman: "indicator_snapshot.cvd_ratio가 높을 때 profit_take가 실제로 더 많나?" 검증 가능

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 가격 조회 실패로 outcome 누락 | 중 | 중 | retry=3 + `outcome_error` 상태 컬럼 |
| scan_signal_events 무한 성장 | 중 | 중 | `fired_at < NOW()-90d` 파티션 or TTL 정책 |
| feature_calc 스냅샷 컬럼 rename drift | 저 | 고 | `schema_version` 필드 + migration 시 알림 |
| BH-FDR false discovery (52×4=208 테스트) | 중 | 중 | α=0.10, bootstrap CI 보조 |

### Dependencies
- `similarity_ranker.compute_feature_score` 이미 구현 (line 224)
- `validation/labels.triple_barrier_outcome` 이미 구현 (line 37)
- `validation/stats.welch_t_test`, `bh_correct`, `bootstrap_ci` 이미 구현
- APScheduler 11개 job 이미 등록됨 → 12번째 추가

### Rollback
- Migration 036: DROP TABLE scan_signal_events, scan_signal_outcomes CASCADE
- scanner.py 훅: feature flag `ENABLE_SIGNAL_EVENTS=false` 으로 비활성화

### Files Touched (실측 기반)
```
engine/research/similarity_ranker.py:224  — compute_feature_score (재사용)
engine/research/validation/labels.py:37   — triple_barrier_outcome (재사용)
engine/research/validation/stats.py       — welch_t_test, bh_correct, bootstrap_ci (재사용)
engine/research/validation/entries.py     — PhaseEntryEvent (참고)
engine/research/live_monitor.py:133       — canonical_feature_score: float = 0.5 (현재 단일값, 교체)
engine/research/pattern_scan/scanner.py:135 — PatternScanResult (aggregate per-pattern, per-signal 없음)
engine/pipeline.py:238                    — expectancy_pct_paper, pass_gate_paper (paper mode 기존)
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
- **[D-0367-B]** component_scores 스냅샷: JSON 직렬화 (JSONB) — 이유: 컬럼 수 40+로 고정 스키마 비현실적, JSONB GIN 인덱스로 쿼리 가능
  - 거절 옵션: 별도 feature_snapshot 테이블 — join 복잡도, 성능 열위
- **[D-0367-C]** 통계 집계 주기: API 요청 시 on-demand (cache 1h) — 이유: 30d 데이터 집계 ~2초, 실시간 필요 없음
  - 거절 옵션: 사전 계산 materialized view — 208 tests * 매시간 재계산 불필요

## Open Questions

- [ ] [Q-0367-A] scan_signal_events 90일 이후 보존 정책? TTL vs 파티셔닝
- [ ] [Q-0367-B] indicator_snapshot 컬럼 목록 고정 vs feature_calc 동적 출력 전체? (현재 설계: 6개 핵심 지표 고정)

## Implementation Plan

1. **Migration 036** — `scan_signal_events` + `scan_signal_outcomes` 테이블 생성 (인덱스 포함)
2. **scanner.py 훅** — `PatternScanResult` emit 시 `compute_feature_score()` 호출 → `scan_signal_events` upsert
3. **verification_loop.py** — APScheduler 1h job: 미완료 시그널 가격 조회 → `triple_barrier_outcome` 계산 → `scan_signal_outcomes` upsert
4. **alpha_quality.py** — `aggregate(lookback_days, pattern_slug)` → Welch + BH-FDR + Spearman → JSON 리포트
5. **API** — `GET /research/alpha-quality` + `GET /research/signals/{id}/components` 엔드포인트
6. **Tests** — unit: 각 모듈, integration: scanner → event 저장 → outcome 계산 흐름 1 cycle

## Exit Criteria

- [ ] AC1: `scan_signal_events`에 시그널 발화 시 `component_scores.phase_scores` 2개 이상 + `indicator_snapshot` 4개 이상 저장됨 (pytest 검증)
- [ ] AC2: `scan_signal_outcomes`에 1h/4h/24h/72h 4개 호라이즌 레코드 생성 (테스트 픽스처 기준)
- [ ] AC3: `triple_barrier_outcome` 3개 값 ("profit_take"/"stop_loss"/"timeout") 모두 실제 계산됨 (unit test)
- [ ] AC4: `alpha_quality.aggregate(lookback_days=30)` 실행 시 BH-FDR 보정 p-value 208개 반환 (pytest)
- [ ] AC5: Spearman correlation: 각 indicator_snapshot 필드 vs realized_pnl_pct 계산됨 (unit test)
- [ ] AC6: `GET /research/alpha-quality?lookback=30d` p95 < 3s (30d 데이터 기준 benchmark)
- [ ] AC7: `GET /research/signals/{id}/components` JSON 응답 schema validation 통과
- [ ] AC8: 30d 실데이터 기준 패턴별 시그널 수 ≥ 20개 이상인 패턴이 1개 이상 존재
- [ ] AC9: CI green (pytest + typecheck)
- [ ] AC10: PR merged + CURRENT.md SHA 업데이트
