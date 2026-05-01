# W-0369 — Strategy Library + Benchmark Pipeline

> Wave: 5 | Priority: P1 | Effort: L
> Charter: In-Scope (F-14 pattern lifecycle, F-17 visualization)
> Status: 🟡 Design Draft
> Issue: #815
> Created: 2026-05-01

## Goal

사용자가 등록된 52개 패턴 각각의 백테스트 성과(APR, Win Rate, Sharpe, Equity Curve)를 카드 형태로 확인하고, 여러 패턴을 선택해 BTC 벤치마크와 수익률을 비교할 수 있다.

## Context

Minara.ai가 보여주는 전략 카드 + 벤치마크 비교 기능이 레퍼런스. 우리는 이미 `run_pattern_backtest()` + 52패턴 Supabase 저장까지 완성. 시각화 레이어만 추가하면 된다.

## Scope

### Phase 1 — Engine Backtest API Endpoint
- `engine/research/backtest.py` — `run_pattern_backtest()` 활용
- `engine/api/routes/patterns.py` — `GET /patterns/{slug}/backtest` 신규
- `engine/tests/test_pattern_backtest_api.py` — ≥ 7 tests

### Phase 2 — Supabase Cache Layer
- `app/supabase/migrations/038_pattern_backtest_stats.sql` — 신규
- `engine/api/routes/patterns.py` — cache read/write 로직 추가
- `engine/scheduler.py` — 일 1회 전체 패턴 백테스트 갱신 job (12th job)

### Phase 3 — Strategy Library UI
- `app/src/routes/strategies/+page.svelte` — 신규
- `app/src/lib/strategy/PatternStrategyCard.svelte` — 신규
- `app/src/lib/strategy/StrategyGrid.svelte` — 신규
- `app/src/lib/api/strategyBackend.ts` — 신규

### Phase 4 — Benchmark Comparison UI
- `app/src/routes/benchmark/+page.svelte` — 신규
- `app/src/lib/strategy/BenchmarkChart.svelte` — 신규 (SVG equity curves)
- `app/src/lib/strategy/PatternSelector.svelte` — 신규

## Non-Goals

- 자동매매 / 라이브 신호 실행 — Charter Frozen
- Copy Trading, Leaderboard — Charter Frozen
- 실시간 백테스트 (사용자 요청 즉시) — Phase 1에서는 캐시된 데이터만 제공
- 커스텀 전략 코드 편집기 (Minara wizard) — 별도 W-XXXX
- 백테스트 파라미터 커스터마이징 UI — P2 이후

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 52패턴 × daily refresh = Cloud Run 부하 | 중 | 중 | 순차 처리 + 5초 간격 sleep |
| equity_curve 필드 없음 (BacktestResult) | 높 | 중 | Phase 1에서 추가 |
| APR 계산 오류 (관측 기간 짧음) | 중 | 높 | observation_days ≥ 30 guard |
| BH-FDR 52개 동시 노출 — false positive | 중 | 중 | card에 "N signals" + p-value 표시 |

### Dependencies

- W-0350 — 52 patterns in Supabase `pattern_objects` (머지 완료 ✅)
- W-0348 — migration 033 완료 ✅
- `engine/research/backtest.py:263` — `run_pattern_backtest()` 존재 ✅
- `engine/api/routes/patterns.py:1155` — Sharpe 계산 존재 ✅

### Rollback

- Phase 1: 독립 엔드포인트 — route 제거로 롤백
- Phase 2: migration 038 — `DROP TABLE pattern_backtest_stats`
- Phase 3/4: 신규 페이지 — route 파일 제거

### Files Touched (실측 기반)

```
engine/research/backtest.py         # equity_curve 필드 추가
engine/api/routes/patterns.py       # /patterns/{slug}/backtest 추가
engine/tests/test_pattern_backtest_api.py  # 신규
engine/scheduler.py                 # daily refresh job
app/supabase/migrations/038_pattern_backtest_stats.sql  # 신규
app/src/routes/strategies/+page.svelte    # 신규
app/src/routes/benchmark/+page.svelte     # 신규
app/src/lib/strategy/PatternStrategyCard.svelte  # 신규
app/src/lib/strategy/StrategyGrid.svelte  # 신규
app/src/lib/strategy/BenchmarkChart.svelte  # 신규 (SVG)
app/src/lib/strategy/PatternSelector.svelte  # 신규
app/src/lib/api/strategyBackend.ts        # 신규
```

## AI Researcher 관점

### Data Impact

- Backtest forward window: 72h (기존 `run_pattern_backtest` 기본값 유지)
- Equity curve: 누적 복리 `(1 + r1)(1 + r2)...` — additive 아님
- APR formula: `(1 + total_return) ** (365 / observation_days) - 1`
- Sharpe: `mean_return / std_return * sqrt(365)` (annualized)

### Statistical Validation

- BH-FDR 적용: 52 패턴 동시 노출 → card에 raw p-value + adjusted 표시
- n_signals < 10 → card에 "데이터 부족" 경고 표시
- observation_days < 30 → APR 계산 제한 (NaN 표시)

### Failure Modes

- `run_pattern_backtest()` 에 매칭 신호 0개 → `n_signals=0` → empty state card
- Cloud Run memory: 52패턴 순차 처리 시 peak ~512MB → 기존 1GB 내 안전
- Equity curve flatline (win_rate=0) → SVG에 수평선으로 정상 렌더

## Decisions

- [D-0369-1] **SVG sparkline** (vs Lightweight Charts 52 instances): 52개 카드 = 52개 LW Charts 인스턴스는 메모리 과부하. SVG path로 충분. ✅ 채택
- [D-0369-2] **캐시 우선 (daily refresh)**: 즉시 계산은 p95 >> 2s. Supabase cache + APScheduler daily job. ✅ 채택
- [D-0369-3] **migration 038** (037 = scan_signal_tables 완료 기준). ✅ 채택
- [D-0369-4] **Minara wizard (NL → 전략 코드) 제외**: 별도 Charter 검토 필요 + 범위 과대. ❌ 거절 (이번 W에서)

## Open Questions

- [ ] [Q-0369-1] BTC 벤치마크 equity curve 데이터 소스: `/api/chart/klines?symbol=BTCUSDT` 재사용 vs 별도 API?
- [ ] [Q-0369-2] 전략 카드 정렬 기본값: APR 내림차순 vs Win Rate 내림차순?
- [ ] [Q-0369-3] 벤치마크 페이지 접근: Sidebar 새 섹션 vs Tab 내 패널?
- [ ] [Q-0369-4] `pattern_backtest_stats` 갱신 주기: daily 1회 vs 48시간마다?
- [ ] [Q-0369-5] 패턴 카드 클릭 시 drill-down: 개별 신호 목록 슬라이드 패널?
- [ ] [Q-0369-6] Free tier 사용자 접근 범위: 상위 N개만 표시 vs 전체 표시?

## Implementation Plan

### Phase 1 — Engine Backtest API (engine-only)

1. `BacktestResult` dataclass에 `equity_curve: list[float]` 필드 추가
2. `run_pattern_backtest()` 내부에서 cumulative product 계산 → `equity_curve` 채우기
3. `GET /patterns/{slug}/backtest` 엔드포인트 추가 (params: `universe`, `tf`, `since`)
4. 응답 구조: `{ slug, n_signals, win_rate, avg_return_72h, sharpe, apr, equity_curve, cached_at }`
5. `pytest engine/tests/test_pattern_backtest_api.py` — ≥ 7 tests (happy path + empty signals + invalid slug + APR formula)

### Phase 2 — Supabase Cache (engine + migration)

1. Migration 038: `pattern_backtest_stats (slug PK, stats jsonb, computed_at timestamptz, universe text, tf text)`
2. `/patterns/{slug}/backtest` — Supabase cache read first (`computed_at` < 25h → return cache)
3. APScheduler 12th job: 매일 03:00 UTC, 52패턴 순차 백테스트 → upsert Supabase
4. Cache miss → 실시간 계산 (cold path, p95 허용 5s)

### Phase 3 — Strategy Library UI

1. `app/src/lib/api/strategyBackend.ts` — `fetchPatternBacktest(slug)` + `fetchAllPatternStats()`
2. `PatternStrategyCard.svelte` — APR/WinRate/Sharpe 수치 + SVG equity curve sparkline + n_signals badge
3. `StrategyGrid.svelte` — 52 cards grid, 정렬/필터 controls
4. `/strategies` route + page

### Phase 4 — Benchmark Comparison UI

1. `PatternSelector.svelte` — 최대 5개 패턴 선택 checkbox
2. `BenchmarkChart.svelte` — SVG multi-line equity curves (패턴 N개 + BTC baseline)
3. `/benchmark` route + page
4. BTC baseline: BTCUSDT klines → cumulative return

## Exit Criteria

- [ ] AC1: `GET /patterns/{slug}/backtest` p95 < 2s (캐시 히트 기준 p95 < 200ms)
- [ ] AC2: `pytest engine/tests/test_pattern_backtest_api.py` ≥ 7 tests PASS
- [ ] AC3: APR 계산 오차 ±0.1% (단위 테스트)
- [ ] AC4: Migration 038 적용 완료 (Supabase prod)
- [ ] AC5: Daily scheduler job 등록 (APScheduler 12th job)
- [ ] AC6: `/strategies` 페이지에서 52개 패턴 카드 렌더링 확인
- [ ] AC7: `/benchmark` 페이지에서 5개 패턴 + BTC 오버레이 렌더링 확인
- [ ] AC8: `pnpm typecheck` 0 errors
- [ ] AC9: vitest ≥ 10 tests (Phase 3+4 합산)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
