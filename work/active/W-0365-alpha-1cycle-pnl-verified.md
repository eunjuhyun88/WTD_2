# W-0365 — Alpha 1-Cycle: 수익 실현 폐쇄루프 (v2, P&L-Verified)

> Wave: 5 | Priority: P0 | Effort: L+ (15–18 days)
> Charter: In-Scope L3–L7
> Status: 🟡 Design Draft v2
> Created: 2026-05-01
> Issue: #806
> Supersedes: v1 (사용자 피드백: HIT/MISS → realized P&L)

---

## Why v2 (사용자 피드백)

> "우리는 HIT/MISS 이게 **수익 났다**로 가야 하는데"

v1의 추상적 패턴 판정(`target_hit` / `stop_hit` / `timeout`)은 알파테스터에게 "이게 정말 돈 됐냐"를 답하지 못한다. v2는 **realized P&L** 중심으로 재설계한다. cost model은 W-0214 D3 lockdown(15bps round-trip)을 강제 적용하고, 결과는 화폐 단위(bps, %)로 표시한다. verdict는 패턴 매치 여부가 아니라 "진입했으면 수익이 났냐"의 질문에 답한다.

### v1 vs v2 Diff (요약)

| 영역 | v1 | v2 |
|---|---|---|
| Verdict 정의 | `HIT` (target) / `MISS` (stop) / `INDETERMINATE` (timeout) | `WIN` (pnl_net>0) / `LOSS` (pnl_net≤0) / `INDETERMINATE` (\|pnl\|<cost OR bar-gap) |
| Cost | 명시 없음 | **15bps round-trip 강제 적용** (W-0214 D3) |
| Outcome schema | entry_ts / exit_ts / exit_reason | + entry_px, exit_px, fee/slippage, pnl_bps_gross/net, pnl_pct, mfe/mae, holding_bars |
| UI | "HIT" 배지 | "+1.85% net (13h hold) WIN" + 패턴 카드: N=23, mean=+0.42%, win_rate=61%, Sharpe=0.8 |
| Refinement signal | hit_rate ≥ 0.55 | mean_pnl_bps + Sharpe-like + win_rate (셋 다 추적) |
| 알파 충분 기준 | candidates ≥ 1 | N≥30 verdict + mean_pnl_bps 95% CI + INDETERMINATE 비율 ≤ 25% |
| Sub-Tasks | T1~T7 | T1~T9 (T8: cost model, T9: historical P&L on 12 packs) |
| Effort | L (12d) | L+ (15–18d) |

v1의 다음 항목은 **그대로 유지**: market_index_2026 backfill (T1), search_run candidates 누적 (T2), benchmark pack snapshot (T3), 0-candidate 사유 표시, Frozen 영역 회피, W-0361/W-0358/W-0364 충돌 회피.

---

## Goal

알파테스터가 패턴 카드를 보고 "이 패턴 +1.85% (cost 15bps 차감 후, 13h 보유) 수익 났음, 누적 N=30 mean +0.42%, win 61%" 같은 **realized P&L 통계**를 시스템에서 직접 검증할 수 있는 1사이클 폐쇄루프 (L3 search → L4 verdict → L5 ledger → L6 stats → L7 refinement) 완성.

---

## Scope

### 포함 (P&L 강조)

- L3: market_index_2026 backfill + 사용자 검색 트리거 (`POST /research/market-search`) → search_run 생성, candidates ≥ 1 보장
- L4: candidate trigger → next-bar-open entry 시뮬레이션 → stop/target/timeout exit → cost 차감 → **pnl_bps_net + verdict 라벨**
- L5: W-0233 ledger outcome 테이블에 P&L 필드 확장 저장 (entry_px, exit_px, fee_bps, slippage_bps, pnl_bps_gross/net, mfe/mae, holding_bars)
- L6: 패턴별 누적 통계 API (`GET /patterns/{slug}/pnl-stats`) — N, mean_pnl_bps, std, Sharpe-like, win_rate, INDETERMINATE_rate, 95% CI (N≥30 시)
- L7: refinement loop — mean_pnl_bps ≤ 0 OR Sharpe < 0 → blocked_patterns 자동 등록 (W-0247 _W_ABC_DEFAULT 게이팅과 병렬)
- UI: 카드에 net P&L 숫자 + 보유 시간 + verdict 라벨; 패턴 dashboard에 누적 통계 카드 (N<30이면 "preliminary" 배지)
- UI: **패턴 카드 미니 수익 곡선 sparkline** (최근 N건 verdict P&L 누적 equity curve) — mihara.ai 스타일, "이 패턴 잘 되고 있나" 한눈 파악
- UI: **BTC Holding 대비 초과 수익 비교 차트** — 패턴 상세 페이지에 내 패턴 누적 수익 vs BTC Buy&Hold returns 라인 차트 (mihara.ai 핵심 가치 명제: "Strategy +66% vs BTC Hold -36%" 패턴)
- UI: **완료된 거래 이력 탭** — 각 verdict 건 행 (심볼, 방향 LONG/SHORT, 진입가→청산가, net P&L bps, 보유 기간, verdict WIN/LOSS/INDETERMINATE)
- T8: `engine/pnl/cost_model.py` (fee/slippage tier 모듈) + 단위 테스트 ≥ 8개
- T9: 12 benchmark packs 전부 historical P&L backtest (alpha sanity check, fixture pattern 1개) + **BTC Holding 동기간 수익 비교**

### 변경 파일

- `engine/research/market_search.py` (T1, T2)
- `engine/data/market_index_2026.py` 신규 (T1)
- `engine/pnl/cost_model.py` 신규 (T8)
- `engine/pnl/pnl_compute.py` 신규 — entry/exit/cost/verdict 계산 (T4)
- `engine/ledger/outcome.py` (W-0233 phase3+4 호환 컬럼 확장, T4)
- Supabase migration `031_outcome_pnl_columns.sql` (T4)
- `engine/api/research.py` (T2: market-search 엔드포인트)
- `engine/api/patterns.py` (T6: pnl-stats 엔드포인트)
- `app/src/lib/components/PatternCard.svelte` (T5)
- `app/src/lib/components/PatternStatsCard.svelte` 신규 (T5)
- `app/src/lib/components/PatternEquityCurve.svelte` 신규 (T5, 미니 sparkline)
- `app/src/lib/components/PatternBenchmarkChart.svelte` 신규 (T5, BTC Holding 비교)
- `app/src/lib/components/TradeHistoryTab.svelte` 신규 (T5, 거래 이력 탭)
- `engine/research/blocked_patterns.py` (T7)
- `engine/tests/research/test_pnl_compute.py` 신규 (T8)
- `engine/tests/research/test_benchmark_pack_pnl.py` 신규 (T9)
- `work/active/CURRENT.md` (P0 갱신)

### API

- `POST /research/market-search` — body `{symbol_universe, lookback_bars, pattern_filter?}` → search_run row + candidates (W-0361 AutoResearch와 별도 `run_type='user'` 컬럼)
- `GET /patterns/{slug}/pnl-stats` → `{n, mean_pnl_bps, std_pnl_bps, sharpe_like, win_rate, indeterminate_rate, ci_low, ci_high, preliminary: bool, btc_hold_return_pct: float, equity_curve: list[{ts, cumulative_pnl_bps}]}`

---

## Non-Goals

- Live trading / paper trading 자동 진입 (W-0281 별도, **Frozen 위반 아님**이지만 본 epic 범위 외)
- Multi-exchange 가격 (W-0358 별도) — 알파엔 **Binance perp만**
- Copy-trading / leaderboard / AI 차트 분석 / 자동매매 (Frozen)
- 500 CCU 부하 (W-0364) — 알파 N=20 무관
- Maker fill probability 모델링 — D-8에서 **always-taker 가정** (보수적, 후속 epic에서 정교화)
- Real-time streaming verdict (이번엔 batch refresh, scheduler 5min)

---

## P&L 정의 (Frozen Math)

### Entry
- candidate trigger 발생 bar `t`의 **`t+1` open price** = `entry_px` (W-0290 lookahead-free 강제)
- `entry_side ∈ {+1: long, -1: short}` (패턴이 long/short 중 어느 방향인지 PatternObject 메타에 명시 — 미명시 시 long 기본)
- `entry_ts = bar(t+1).open_ts`

### Exit (우선순위)

각 bar `[t+1, t+2, …, t+horizon]`에서 순서대로 평가:
1. **stop_loss hit**: `low ≤ stop_px` (long) / `high ≥ stop_px` (short) → `exit_px = stop_px`, reason='stop'
2. **target hit**: `high ≥ target_px` (long) / `low ≤ target_px` (short) → `exit_px = target_px`, reason='target'
3. **timeout**: `t + horizon` 도달 → `exit_px = bar(t+horizon).close`, reason='timeout'
   - `horizon = pattern.expected_horizon_bars` 우선, 없으면 24h equivalent (W-0214 D2 4h primary 기준 → 24h timeout)
4. (가스파일 D-11) bar gap이 stop과 entry를 동시에 통과하는 케이스 → reason='indeterminate_gap'

같은 bar에서 stop/target 동시 발생 시 **stop 우선** (보수적).

### Cost (W-0214 D3 lockdown, 15bps round-trip)

```
fee_bps_total      = 10  (entry 5bps taker + exit 5bps taker)
slippage_bps_total = 5   (D-10 tier 기본 mid; high=2, low=10)
total_cost_bps     = fee_bps_total + slippage_bps_total = 15  (mid tier 기본)
```

D-8에서 split 확정 필요. 현재 제안: 진입/청산 각 7.5bps (대칭) — 단순성.

### P&L

```python
direction = entry_side  # +1 long, -1 short
gross_bps = (exit_px / entry_px - 1) * 10000 * direction
net_bps   = gross_bps - total_cost_bps
pnl_pct_net = net_bps / 10000

mfe_bps = max over [t+1..exit] of (max_favorable_price/entry_px - 1)*10000*direction
mae_bps = min over [t+1..exit] of (max_adverse_price/entry_px - 1)*10000*direction
```

### Verdict 라벨 (3-state, 의미 변경)

```python
if exit_reason == 'indeterminate_gap':
    verdict = 'INDETERMINATE'
elif exit_reason == 'timeout' and abs(net_bps) < total_cost_bps:
    verdict = 'INDETERMINATE'  # cost-band 안에 묻힘 (D-9)
elif net_bps > 0:
    verdict = 'WIN'
else:
    verdict = 'LOSS'
```

### Sharpe-like (per pattern_slug, N≥30)

```python
sharpe_like = mean(net_bps_array) / std(net_bps_array)  # annualization 없음, 알파엔 raw ratio
```

추가 메트릭 (D-12): Profit Factor `sum(wins) / |sum(losses)|`, Sortino-like.

### 95% CI (mean_pnl_bps, N≥30)

```python
se = std / sqrt(N)
ci = mean ± 1.96 * se
```

---

## Ledger Outcome Schema (W-0233 호환 확장)

기존 `ledger_outcome` 테이블에 컬럼 추가 (migration 031):

```sql
ALTER TABLE ledger_outcome ADD COLUMN entry_px         NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN entry_side       SMALLINT;        -- +1 long / -1 short
ALTER TABLE ledger_outcome ADD COLUMN exit_px          NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN exit_reason      TEXT;            -- 'target'|'stop'|'timeout'|'indeterminate_gap'|'manual'
ALTER TABLE ledger_outcome ADD COLUMN fee_bps_total    NUMERIC DEFAULT 10;
ALTER TABLE ledger_outcome ADD COLUMN slippage_bps_total NUMERIC DEFAULT 5;
ALTER TABLE ledger_outcome ADD COLUMN pnl_bps_gross    NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN pnl_bps_net      NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN pnl_pct_net      NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN holding_bars     INTEGER;
ALTER TABLE ledger_outcome ADD COLUMN holding_seconds  INTEGER;
ALTER TABLE ledger_outcome ADD COLUMN mfe_bps          NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN mae_bps          NUMERIC;
ALTER TABLE ledger_outcome ADD COLUMN verdict          TEXT CHECK (verdict IN ('WIN','LOSS','INDETERMINATE'));
CREATE INDEX idx_ledger_outcome_pattern_verdict ON ledger_outcome(pattern_slug, verdict);
```

기존 `target_hit` / `stop_hit` boolean 컬럼은 **deprecated 표시만**, drop 안 함 (W-0233 PR #767 호환). 신규 read path는 `verdict` 사용.

---

## Sub-Tasks

| ID | 이름 | Effort | Blocker | P&L 변경점 |
|---|---|---|---|---|
| T1 | market_index_2026 backfill (8d stale → fresh) | M (2d) | data freshness 8일 | v1 그대로 |
| T2 | `POST /research/market-search` user-driven endpoint + run_type='user' | M (2d) | T1 | v1 그대로, search_run에 run_type 컬럼만 추가 |
| T3 | benchmark pack 12개 snapshot freeze (alpha 시작 시점) | S (1d) | T1 | v1 그대로 |
| T4 | candidate → entry/exit 시뮬 + **P&L 계산 + verdict 라벨링** | **M (3d)** | T2, T8 | **v1 S→M**: 단순 outcome wiring 아니라 cost 적용 + mfe/mae + verdict 3-state |
| T5 | UI: 카드에 net P&L + 보유시간 + verdict + **미니 수익 곡선 sparkline + BTC 비교 차트 + 거래 이력 탭** | **M (2d)** | T6 | **v1 S→M**: 배지가 아니라 숫자 + Sharpe + CI 표시, "preliminary" 배지, mihara.ai 스타일 equity curve / BTC benchmark / trade history |
| T6 | `GET /patterns/{slug}/pnl-stats` API + 누적 통계 집계 | S (1d) | T4 | 신규 (v1엔 hit_rate만) |
| T7 | refinement: mean_pnl_bps ≤ 0 또는 Sharpe < 0 → blocked_patterns 자동 등록 | S (1d) | T6 | v1 hit_rate < 0.55 → P&L 기반 |
| T8 | `engine/pnl/cost_model.py` + 단위 테스트 ≥ 8개 (long/short × win/loss × stop/target/timeout) | **S (1d)** | — | **신규** |
| T9 | 12 benchmark packs 전부 historical P&L backtest + **BTC Holding 동기간 수익 비교** (sanity check) | **M (2d)** | T4, T8 | **신규** |

총 **15일** (병렬 일부 가능 시 12–13일).

---

## CTO 관점

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| P&L 미스계산 (부호 오류, lookahead) | Mid | High | T8 단위 테스트 8개 필수 (long/short × win/loss × stop/target/timeout 매트릭스 커버) |
| Cost 가정 잘못 (taker로 계산했는데 실제 maker fill) | High | Mid | D-8: 보수적 always-taker 가정, "이론치 net P&L"임을 UI에 명시 |
| Bar-gap stop 통과로 false WIN | Mid | High | D-11: gap > 0.5% 시 INDETERMINATE 강제 |
| Slippage tier 실측 부재 | High | Mid | D-10: 24h volume 기반 tier (high/mid/low), 후속 W-0XXX에서 실측 보정 |
| Survivorship (delisted symbol 제외) | Mid | Mid | benchmark pack snapshot freeze (T3) — 알파 기간 내 universe 고정 |
| W-0233 ledger 컬럼 충돌 | Low | High | migration 031 신규 추가만, 기존 컬럼 drop 안 함 |
| W-0361 AutoResearch와 search_run 충돌 | Mid | Low | run_type 컬럼 분리, 기본 user-only 표시 |
| N<30에서 통계 오해 | High | Mid | UI에 "preliminary" 배지 + CI 표시 안 함 |

### Dependencies

- **W-0233 Phase 3+4** (PR #767, merged) — ledger 4-table
- **W-0214 D3** — cost model 15bps lockdown
- **W-0214 D2** — forward return horizon (4h primary, 24h timeout)
- **W-0247 F-16** — `_W_ABC_DEFAULT` weight + hit_rate 게이팅 (**병렬 유지**, 본 epic의 P&L 게이팅은 추가 채널)
- **W-0290 Ph2** — OOS holdout, BH-FDR α=0.10, lookahead-free shift(1)
- **W-0316** — Bybit OI (선택, 알파엔 Binance만)

### Rollback

- migration 031: `DROP COLUMN` 11개 (기존 row는 NULL로 fallback, target_hit/stop_hit boolean이 살아있음)
- API `GET /patterns/{slug}/pnl-stats`: feature flag `ENABLE_PNL_STATS` (기본 false, alpha env에서만 true)
- UI: PatternStatsCard.svelte는 별도 컴포넌트 → import 제거만으로 롤백
- T7 blocked_patterns 자동 등록: dry-run mode 1주 운영 후 enforce

---

## AI Researcher 관점

### Data Impact

- **Lookahead-free entry**: bar(t)에서 트리거 → bar(t+1) open 진입. shift(1) 강제, W-0290 Ph2 lookahead 가드 통과.
- **OOS**: benchmark pack snapshot freeze (T3) → train/test split. T9에서 12 packs 전부 OOS P&L 산출.
- **Survivorship bias**: snapshot 시점 universe 고정 (delisted 포함). 후속 분석에서 delisted-only subset P&L 비교.
- **Sample independence**: 같은 symbol 동일 시간대 중복 trigger 시 첫 건만 채택 (cool-down 4h).

### Failure Modes (5개)

1. **Cost over-charge**: maker fill 가능했는데 taker로 계산해 win을 loss로 오판. → D-8 always-taker 보수적 가정, fee_bps_total 컬럼 별도 저장하여 사후 재계산 가능.
2. **Slippage underestimate**: 저유동성 코인 5bps로 부족. → D-10 symbol 24h volume tier (high=2bps, mid=5bps, low=10bps).
3. **Survivorship**: delisted symbol 제외 시 win_rate 과대평가. → snapshot freeze + 후속 delisted subset 분석.
4. **Look-ahead via next-bar-open with gap**: bar(t→t+1) 갭이 stop을 통과하면 entry_px 도달 불가. → D-11 gap > 0.5% 시 INDETERMINATE.
5. **Realized vs Unrealized at timeout**: timeout 시 mark-to-market close vs 강제 청산 슬리피지. → D-12 변형: timeout exit도 slippage 5bps (mid) 추가 적용 (이미 total_cost_bps에 포함).

### Statistical Validation

- **mean_pnl_bps 95% CI** (N≥30): standard error ± 1.96·SE
- **BH-FDR α=0.10** (W-0290): 다수 패턴 동시 검증 시 mean_pnl_bps > 0 가설에 적용
- **Sharpe-like ≥ 0.5** (N≥30) — preliminary 알파 기준; profit factor ≥ 1.2 보조
- **INDETERMINATE 비율 ≤ 25%**: cost-band/gap에 너무 많이 묻히면 cost 가정 또는 horizon 재검토 신호

---

## Decisions

### v1 유지 (D-1 ~ D-7)

- **D-1**: market-search은 user-driven (run_type='user'), W-0361 AutoResearch는 run_type='auto'. 분리 컬럼.
- **D-2**: benchmark pack 12개 → 알파 시작 시점 snapshot freeze, 알파 기간 내 unfreeze 금지.
- **D-3**: 0-candidate 시 사유 표시 (universe stale / pattern blocked / no symbol matched). UI text + ledger 사유 컬럼.
- **D-4**: alpha 사용자 N=20 고정.
- **D-5**: scheduler refresh 5min batch (real-time stream 아님).
- **D-6**: Frozen 영역 (copy-trading, leaderboard, AI 차트 분석, 자동매매, 신규 메모리 stack) 절대 손대지 않음.
- **D-7**: W-0358 multi-exchange 충돌 회피 — 알파엔 Binance perp 1개만.

### v2 신규 (D-8 ~ D-12)

- **D-8**: Cost split = **대칭 7.5bps entry + 7.5bps exit** (합 15bps, W-0214 D3 일치). 단순성 우선. 거절 옵션: split 5+5+slippage 2.5×2 (mfe/mae 시점 분리, 과잉 복잡성).
- **D-9**: Verdict = WIN/LOSS/INDETERMINATE (3-state 유지하지만 의미 변경). INDETERMINATE = (timeout AND |net_bps|<cost) OR bar-gap. 거절 옵션: 2-state (WIN/LOSS만, INDETERMINATE는 LOSS로 흡수). **제안 채택**: cost-band 안 의미 없는 결과를 LOSS로 묻으면 mean이 오염됨.
- **D-10**: Slippage tier = **24h volume 기준 high(top 50)=2bps / mid(50–200)=5bps / low(나머지)=10bps**. 알파 universe 106 symbols에 BTC/ETH~long-tail 혼재, flat은 비현실적. 거절 옵션: flat 5bps (단순하나 고유동성 과대계산/저유동성 과소계산).
- **D-11**: Bar-gap 처리 — `(bar_t+1.open / bar_t.close - 1) > 0.5%` 시 INDETERMINATE 강제. 거절 옵션: gap 무시하고 next-bar-open에서 정상 처리. **제안 채택**: gap에 stop 통과 false WIN 위험.
- **D-12**: Refinement trigger = **`mean_pnl_bps ≤ 0 OR Sharpe-like < 0`** (둘 다 OR). 셋 다(Sharpe/Sortino/PF) 표시하되 blocked_patterns 자동 등록은 이 OR 조건으로. 거절 옵션: Profit Factor < 1.0 단독(극단 손실 패턴만 차단).

---

## Open Questions

- [ ] [Q-0365-1] **Long/short 방향 미명시 패턴**: 기본 long 가정으로 진행. 양방향 시뮬은 후속 epic.
- [ ] [Q-0365-2] **N<30 UX**: "preliminary" 배지 표시 + 숫자(mean_pnl) 가시. 숫자 가리는 것은 알파테스터 피드백 동기 저하. N<30임을 UI에서 명시.
- [ ] [Q-0365-3] **Realized vs Unrealized timeout**: timeout exit도 slippage 5bps(mid) 추가 적용 (total_cost에 이미 포함). 별도 계산 없음.
- [ ] [Q-0365-4] **Pattern.entry_side 미설정 심볼**: 알파 12 benchmark packs 전부 long/short 방향 명시 필요 (T3 snapshot freeze 전 체크).

---

## Implementation Plan

### Phase 1 — Foundation (4d)
- T1: market_index_2026 backfill (2d)
- T8: cost_model.py + 단위 테스트 8개 (1d)
- T3: benchmark pack snapshot freeze (1d)

### Phase 2 — P&L Engine (4d)
- T4: pnl_compute.py (entry/exit/cost/verdict) + ledger migration 031 (3d)
- T2: market-search endpoint + run_type 컬럼 (1d, 병렬)

### Phase 3 — Stats & UI (4d)
- T6: pnl-stats API (1d)
- T5: PatternCard P&L 표시 + PatternStatsCard 신규 (2d)
- T9: 12 benchmark packs historical P&L backtest (1d, 병렬)

### Phase 4 — Refinement & Verify (3d)
- T7: blocked_patterns auto-register (1d, dry-run mode)
- 통합 검증: 알파 1-cycle E2E (사용자 검색 → candidate → P&L → ledger → stats → UI) (1d)
- 문서화 + CURRENT.md 갱신 + PR (1d)

**Total: 15d** (병렬화 시 12–13d)

---

## Exit Criteria

### v1 그대로 (AC1–AC10 재인용 요약)

- **AC1**: market_index_2026 freshness ≤ 24h (T1)
- **AC2**: `POST /research/market-search` candidates ≥ 1 (universe 정상 시) (T2)
- **AC3**: search_run row 12 benchmark packs 전부 fresh snapshot 보유 (T3)
- **AC4**: ledger outcome row 알파 1주 ≥ 50개 누적
- **AC5**: refinement loop dry-run 1주 내 blocked_patterns 자동 등록 ≥ 1개
- **AC6**: UI 0-candidate 사유, verdict 배지, **미니 수익 곡선 sparkline, BTC 비교 차트, 거래 이력 탭** Playwright 검증
- **AC7**: 알파 사용자 N=20 invitee 모두 검색 트리거 ≥ 1회
- **AC8**: W-0247 `_W_ABC_DEFAULT` 게이팅과 병렬 동작 (충돌 없음)
- **AC9**: W-0361 AutoResearch run_type='auto'와 분리 (run_type='user' 필터링)
- **AC10**: scheduler 5min refresh 알파 1주 무중단

### v2 신규 (AC11–AC13)

- **AC11**: `engine/pnl/cost_model.py` + `pnl_compute.py` 단위 테스트 ≥ 8개 PASS (long/short × win/loss × stop/target/timeout 매트릭스)
- **AC12**: T9 — 12 benchmark packs 전부 historical P&L 산출 완료, fixture pattern 1개 기준 mean_pnl_bps 명시 (양수든 음수든 sanity check 통과)
- **AC13**: 알파 1주 후 N≥30 도달 패턴 ≥ 1개에서 mean_pnl_bps 95% CI 산출 가능, INDETERMINATE 비율 ≤ 25%

---

## References

- W-0214 D2/D3 — cost model + horizon lockdown
- W-0233 Phase 3+4 (PR #767) — ledger 4-table
- W-0247 F-16 — `_W_ABC_DEFAULT` weight + hit_rate 게이팅
- W-0290 Ph2 — OOS holdout, BH-FDR, lookahead-free
- W-0361 (#795) — AutoResearch (run_type 분리 대상)
- W-0358 (#785) — Multi-exchange (Non-Goal)
- W-0364 (#800) — 500 CCU (무관)
- W-0281 — Paper trading (별도 epic)

## Owner
engine+app

## Canonical Files
- `engine/pnl/cost_model.py`
- `engine/pnl/pnl_compute.py`
- `engine/tests/pnl/`
- `app/src/components/research/`

## Facts
- W-0233 Phase 3+4 (PR #767) ledger 4-table 머지됨
- W-0247 F-16 `_W_ABC_DEFAULT` 머지됨
- W-0361 AutoResearch run_type='auto' 머지됨 (#795)

## Assumptions
- 알파 1주 후 N≥30 패턴 도달 가능
- ledger outcome row ≥ 50개 1주 내 누적 가능

## Next Steps
1. cost_model.py + pnl_compute.py 구현
2. T9 benchmark packs 12개 historical P&L 산출
3. AC1~AC13 pytest 검증

## Handoff Checklist
- [ ] AC1~AC13 구현 + CI green
- [ ] PR merged + CURRENT.md 갱신
