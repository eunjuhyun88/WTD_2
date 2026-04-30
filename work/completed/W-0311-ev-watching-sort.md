# W-0311 — EV 기반 WATCHING 후보 정렬

> Wave: 4 | Priority: P1 | Effort: S
> Status: 🟡 Design Draft
> Created: 2026-04-29

## Goal

WATCHING 목록 정렬을 "유사도(match_score) only"에서 "기대값(EV) 우선 + 유사도 tie-break"로 전환한다. 트레이더가 WATCHING을 열었을 때 **과거에 실제로 돈을 벌어준 패턴이 위로**, 신규/검증 부족 패턴이 아래로 오도록 한다. EV는 `win_rate × avg_hit_pnl + (1 − win_rate) × avg_miss_pnl` 로 정의하며, 버딕트 표본 크기에 따라 `confirmed (N≥10)` / `provisional (1≤N<10)` / `match_only (N=0)` 3계층으로 분리한다.

## Scope

**포함**
- WATCHING 후보 응답에 `ev_score: float | None`, `ev_tier: "confirmed" | "provisional" | "match_only"`, `ev_sample_size: int`, `win_rate`, `avg_hit_pnl`, `avg_miss_pnl` 필드 추가
- 복합 정렬키 `(ev_tier_rank, ev_score DESC, match_score DESC)` 적용
- EV 계산 유틸: `engine/scoring/ev_score.py` (신규) — `_compute_result`에서 EV 계산 로직만 추출/공유
- `engine/ledger/types.py` `PatternLedgerFamilyStats`에 5개 필드 추가 (Optional, 하위 호환)
- `GET /patterns/candidates` 응답 schema 변경 + 정렬 로직 변경
- Feature flag `EV_WATCHING_SORT_ENABLED`

**파일**
- `engine/ledger/types.py:253` — `PatternLedgerFamilyStats` 확장 (5 Optional fields)
- `engine/verification/executor.py` — `_compute_result` EV 산식 재사용 지점
- `engine/scoring/ev_score.py` — 신규 (`compute_ev_from_outcomes`)
- `engine/api/routes/patterns.py` — candidates 핸들러 정렬 + 응답 schema
- `app/src/lib/components/Watching/*.svelte` — EV 컬럼/배지 추가
- `engine/tests/scoring/test_ev_score.py`, `engine/tests/api/test_candidates_sort.py`

**API 변경**
```
GET /patterns/candidates
→ items[].ev_score: number | null
→ items[].ev_tier: "confirmed" | "provisional" | "match_only"
→ items[].ev_sample_size: int
→ items[].win_rate: number | null
→ items[].avg_hit_pnl: number | null
→ items[].avg_miss_pnl: number | null
정렬: ev_tier_rank ASC, ev_score DESC NULLS LAST, match_score DESC
```

## Non-Goals

- Kelly fraction / position sizing (정렬 신호 도입이 목적)
- Live verdict 실시간 스트림 (72h verdict 배치성으로 aggregate 충분)
- Public leaderboard 정렬 반영 (Wave 4 leaderboard frozen — 개인 WATCHING만)
- Sharpe/Sortino 기반 정렬 (N<30에서 std bias 심각)
- EV historical backfill (outcome 레코드 이미 ledger에 있음)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| match_score 의존 UX 회귀 | Medium | Low | EV 컬럼 명시 + tier 배지 + `?sort=ev\|match` toggle |
| candidates P95 악화 | Medium | Medium | per-slug `ev_cache` TTL 60s, outcome insert 시 invalidate |
| PatternLedgerFamilyStats 직렬화 호환 깨짐 | Low | High | 모든 신규 필드 Optional + 기본값 None |
| EV 계산 산식이 paper verification과 드리프트 | Medium | High | `ev_score.py` 단일 함수 → drift test 1개 (동일 trades → 동일 EV) |
| outcome record_type 혼입 | Low | High | `record_type=="outcome"` + `verdict in {HIT,MISS,EXPIRED}` 가드 |
| EXPIRED 처리 모호 | Medium | Medium | EXPIRED 제외, `expired_count` 별도 필드 |

### Dependencies / Files Touched

- 의존: `engine/ledger/store.py`의 `LedgerRecordStore.list(slug, record_type=...)` (기존)
- 의존: `engine/verification/executor.py:_compute_result` (산식 원본)
- 변경: `engine/ledger/types.py:253`, `engine/api/routes/patterns.py`
- 신규: `engine/scoring/ev_score.py`
- 무관: copy_trading, marketplace, leaderboard

### Rollback

- Feature flag `EV_WATCHING_SORT_ENABLED=false` → 기존 match_score 정렬 유지
- types.py 필드는 Optional이므로 flag off 상태에서도 무해

## AI Researcher 관점

### 통계적 타당성

EV = `mean(pnl_pct)` 와 수학적으로 동치. 선택 근거:
- **추정 분산 최소**: mean은 unbiased + minimum variance estimator. Sharpe는 std 추정 noise 추가
- **표본 부족 robust**: N=10에서도 표현 가능. Sharpe는 N≤30에서 bias 심각
- **paper verification과 동일 정의**: drift 0

### 데이터 충분성 조건

| Tier | 조건 | 통계적 근거 |
|---|---|---|
| `match_only` | N=0 | EV 추정 불가 |
| `provisional` | 1≤N<10 | SE=σ/√N가 점수 자체와 동급 |
| `confirmed` | N≥10 | CLT 근접 시작점, Wave 4에서 도달 가능 |

### Failure Modes

1. Survivorship bias: 손실 패턴 archive 시 EV 우편향 → outcome 전체 사용 (archive 무관)
2. Regime shift: 과거 EV 무효화 → outcome 윈도우 옵션 (Q-0311-5)
3. Verdict imbalance: 첫 HIT 1개로 ev=+5% over-confidence → provisional 배지 + N 노출
4. Selection bias: 확신 있을 때만 capture → win_rate inflated → 상대 정렬에는 무관

## Decisions

- **[D-0311-1]** EV 공식 = `mean(pnl_pct)` = `expectancy_pct` (paper verification 동일 정의, drift 0)
- **[D-0311-2]** N=0 → `ev_score=None`, `ev_tier="match_only"`, 정렬 후미
- **[D-0311-3]** EXPIRED → EV 표본 제외, `expired_count` 별도 노출
- **[D-0311-4]** 캐시 = per-slug TTL 60s + outcome insert 시 invalidate
- **[D-0311-5]** Provisional/Confirmed 경계 = N=10

## Open Questions

- [ ] [Q-0311-1] outcome 레코드 schema의 정확한 pnl 필드명 (`pnl_pct` vs `return_pct`) — 구현 시작 시 확정
- [ ] [Q-0311-2] EXPIRED를 0% 처리할지 제외할지 — D-0311-3으로 "제외" 결정, 사용자 확인 필요
- [ ] [Q-0311-5] Outcome 윈도우 (last 90d) — regime shift 발생 시 도입. 사용자 의견

## Implementation Plan

1. `engine/scoring/ev_score.py` — `compute_ev_from_outcomes(outcomes) -> EVStats`
2. Drift test — `_compute_result.expectancy_pct` == `compute_ev_from_outcomes.ev_score` (1e-9)
3. `PatternLedgerFamilyStats` 5 Optional fields 추가 + 직렬화 호환 테스트
4. Stats aggregator — per-slug 캐시 (TTL 60s, dict + lock)
5. Candidates route — 응답 schema + 정렬키 + `EV_WATCHING_SORT_ENABLED` flag
6. Cache invalidation hook (outcome insert 경로)
7. API 테스트 (4 시나리오: confirmed > provisional > match_only / tier 우선 / tie-break / EXPIRED only)
8. FE: EV 컬럼 + tier 배지 (W-0283 30s refresh 호환)
9. CURRENT.md 업데이트 + PR

## Exit Criteria

- [ ] AC1: HIT×8+MISS×2(N=10, win=0.8) 패턴이 match_score=0.9의 N=0 패턴보다 위에 정렬됨
- [ ] AC2: `compute_ev_from_outcomes` 결과가 `_compute_result.expectancy_pct`와 1e-9 이내 일치
- [ ] AC3: candidates 응답에 6필드 모두 노출, 신규 패턴 `ev_score=null`, `ev_tier="match_only"`, `ev_sample_size=0`
- [ ] AC4: candidates P95 응답시간 변경 전 대비 +20% 이내
- [ ] AC5: `EV_WATCHING_SORT_ENABLED=false` 시 기존 match_score 정렬과 byte-identical
- [ ] AC6: outcome insert → 60s 이내 다음 candidates 호출의 EV 반영
- [ ] AC7: EXPIRED only 패턴 → `ev_tier="match_only"`, `ev_score=null`
- [ ] AC8: Provisional(N=3, win=1.0) 이 confirmed(N=10, ev=+0.5%) 보다 아래 (tier 우선)
- [ ] AC9: copy_trading / leaderboard / marketplace 코드 경로 무변경
- [ ] AC10: CI green (engine pytest + svelte-check 0 errors)
