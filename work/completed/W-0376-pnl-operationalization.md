# W-0376 — Alpha 1-Cycle P&L Full Operationalization

> Wave: 5 | Priority: P0 | Effort: M (3d)
> Charter: In-Scope (F-14 pattern lifecycle, F-30 ledger)
> Status: 🟡 Design Draft
> Issue: #831
> Created: 2026-05-01

## Goal

데이터 레이어 3개 구멍(entry_px/exit_px 누락 버그 + btc_hold None + TradeHistoryTab 잘못된 필드)을 막고, migration 038 적용 + backfill 스크립트 실행으로 PatternStatsCard에 실데이터가 표시되는 1사이클 시각 검증을 완료한다.

## 실측 기반 현황 (Gap)

| 항목 | 상태 | 근거 |
|---|---|---|
| `simulate_trade()` | ✅ 완전구현 | `pnl_compute.py:33-131`, 12개 필드 완비 |
| `DEFAULT_TIER` 15bps | ✅ | `cost_model.py:17-22` |
| `_write_pnl_to_ledger_outcomes()` | 🟡 **버그** | `outcome_resolver.py:155-167` — `entry_px`/`exit_px` UPDATE dict 누락 |
| `seed_pnl_demo.py` rows | 🟡 **버그** | `seed_pnl_demo.py:67-88` — 동일 컬럼 누락 |
| Migration 038 SQL | ✅ 작성완료 | 14개 컬럼 정의됨, DB 미적용 |
| `get_pnl_stats()` 계산 | 🟡 절반 | `patterns.py:759-826` — `btc_hold_return_pct` 항상 None |
| `get_pnl_stats()` 쿼리 | 🟡 절반 | 3개 컬럼만 조회, per-trade 필드 없음 |
| `PatternStatsCard.svelte` | ✅ 완전구현 | N=0 fallback, CI 표시 |
| `PatternEquityCurve.svelte` | ✅ 완전구현 | SVG polyline, pos/neg 색상 |
| `TradeHistoryTab.svelte` | 🟡 **잘못 연결** | `equity_curve`로 trade 행 렌더 — per-trade 필드 아님 |
| `BenchmarkChart.svelte` | ✅ 완전구현 | 다중 equity curve + BTC 대시선 |
| `PatternStrategyCard` sparkline | ✅ 완전구현 | svgSparkline() 80×32 |
| `outcome_resolver_job` | ✅ 등록됨 | `scheduler.py:383-393`, 1h interval, default ON |
| `BacktestResult.equity_curve` | ✅ 존재 | `backtest.py:93-102` |
| `benchmark_packs/` | ❌ 미존재 | 디렉토리 없음 |
| `backfill_pnl_outcomes.py` | ❌ 미존재 | |
| `ENABLE_BACKTEST_STATS_REFRESH_JOB` | ❌ default "false" | `scheduler.py:135` |

## Scope (파일:라인 단위)

### Phase 1 — 버그 수정 (0.5d)

**P1-1**: `engine/scanner/jobs/outcome_resolver.py:155-167` update dict에 2개 컬럼 추가
```python
"entry_px": float(ohlcv.iloc[entry_bar_idx + 1]["open"]),
"exit_px": result.exit_px,
```

**P1-2**: `engine/scripts/seed_pnl_demo.py:67-88` rows dict에 동일 2개 추가
```python
"entry_px": float(df.iloc[i + 1]["open"]),
"exit_px": float(r.exit_px) if r.exit_px else None,
```

### Phase 2 — Migration 번호 충돌 해결 + 적용 (0.5d)

**P2-1**: `git mv` renumber
```
app/supabase/migrations/038_ledger_outcome_pnl_columns.sql → 039_ledger_outcome_pnl_columns.sql
app/supabase/migrations/038_pattern_backtest_stats.sql     → 040_pattern_backtest_stats.sql
app/supabase/migrations/038_signal_events_dlq.sql          → 041_signal_events_dlq.sql
```

**P2-2**: Supabase 대시보드에서 039 SQL 직접 적용 (D-0373-1)

### Phase 3 — btc_hold + per-trade API (1d)

**P3-1**: `engine/api/routes/patterns.py:776-826` `get_pnl_stats()` — btc_hold 계산 추가
- rows의 `min(created_at)` ~ `max(created_at)` 구간
- `data_cache.loader.load_klines("BTCUSDT", "1h", offline=True)`
- `btc_hold = (close_at_end / close_at_start) - 1`

**P3-2**: `engine/api/routes/patterns.py:779-786` 쿼리 확장
```python
# 현재: pnl_bps_net, pnl_verdict, created_at
# 추가: entry_px, exit_px, exit_reason, holding_bars
```

**P3-3**: `engine/api/schemas_search.py:215-233` `PnLStatsResponse`에 `trades: list[TradeRow]` 추가
```python
class TradeRow(BaseModel):
    ts: str
    entry_px: float | None
    exit_px: float | None
    exit_reason: str | None
    pnl_bps_net: float | None
    verdict: str | None
    holding_bars: int | None
```

**P3-4**: `app/src/lib/types/pnlStats.ts` — TS 타입 동기화

**P3-5**: `app/src/lib/components/patterns/TradeHistoryTab.svelte:17-35` — `stats.trades` 배열로 컬럼 확장
```
Date | Entry px | Exit px | Reason | Net bps | Verdict
```

### Phase 4 — Backfill 스크립트 (0.5d)

**P4-1**: `engine/scripts/backfill_pnl_outcomes.py` 신규
- `ledger_outcomes WHERE pnl_verdict IS NULL` 조회
- capture 시점 OHLCV 로드 → `simulate_trade` → UPDATE
- batch 100, dry-run 모드, idempotent

### Phase 5 — Benchmark Packs T3/T9 (1d)

**P5-1**: `engine/research/benchmark_packs/` 디렉토리 생성 + 12 JSON 스냅샷 freeze

**P5-2**: `engine/scripts/run_benchmark_backtest.py` 신규 — 12 packs × `run_pattern_backtest()` → 결과 CSV

**P5-3**: `engine/tests/research/test_benchmark_pack_pnl.py` ≥ 5 tests

**P5-4**: `engine/scanner/scheduler.py:135` `ENABLE_BACKTEST_STATS_REFRESH_JOB` default → `"true"` 또는 `.env.example` 문서화

### Phase 6 — 검증 + Runbook (0.5d)

**P6-1**: backfill 실행 → `ledger_outcomes pnl_verdict IS NOT NULL` row count 확인

**P6-2**: Vercel production PatternStatsCard N>0 스크린샷 + `/api/patterns/bull_flag/pnl-stats` curl

**P6-3**: `docs/runbooks/pnl_one_cycle_ops.md` — monitoring SQL 3개, alert 기준

## Non-Goals

- W-0370 signal feed 통합 (별도 work item)
- INDETERMINATE 비율 줄이기 (알고리즘 개선은 후속)
- GH Actions supabase migrate CI (이번은 수동 적용, 자동화는 P2 이후)
- Live trading / 자동매매 (Frozen)

## Decisions

**D-0373-1: Supabase Migration 적용**
- **채택: 대시보드 수동 paste** — 로컬 차단 영구 제약, 가장 빠르고 확실

**D-0373-2: TradeHistoryTab 데이터 소스**
- **채택: A** — `PnLStatsResponse`에 `trades[]` 배열 추가 (단일 API 호출)
- 거절: B 별도 endpoint — 추가 fetch 불필요

**D-0373-3: btc_hold 계산 기준**
- **채택: A** — 패턴 첫 verdict ts ~ 마지막 ts 구간 (실제 활성 구간과 일치)

## Open Questions

- [ ] Q-1: GH Actions `SUPABASE_DB_URL` secret 설정 여부?
- [ ] Q-2: `PnLResult.exit_px` 필드 존재 여부 (`result.exit_px` 접근 가능한지)

## Exit Criteria

- [ ] AC1: `outcome_resolver.py` update dict에 `entry_px`/`exit_px` 포함, unit test 통과
- [ ] AC2: migration 번호 충돌 0건 (`ls migrations/ | grep "^038_" | wc -l` = 0)
- [ ] AC3: `ledger_outcomes` pnl_verdict IS NOT NULL row ≥ 28 (backfill 후)
- [ ] AC4: `/api/patterns/bull_flag/pnl-stats` N≥10, `btc_hold_return_pct` NOT NULL
- [ ] AC5: TradeHistoryTab에 entry_px/exit_px/verdict 컬럼 렌더 확인
- [ ] AC6: PatternStatsCard 스크린샷 1장 (equity curve + stats 표시)
- [ ] AC7: `benchmark_packs/` ≥ 12 JSON, T9 test ≥ 5 PASS
- [ ] AC8: `pnpm typecheck` 0 errors, pytest 신규 ≥ 10 PASS
- [ ] AC9: CI green + PR merged + CURRENT.md SHA 업데이트
