# W-PF-202 — MLL + MinTradingDays 룰 엔진 + fill hook

> Wave: 6 | Priority: P0 | Effort: M
> Charter: In-Scope (Paper trading 검증 도구)
> Issue: #1097 (parent: #1005)
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Depends on: W-PF-201 (migration 064)

## Goal

PropFirm 챌린지 평가에 필요한 두 핵심 룰(MLL, MinTradingDays)을 순수 함수로 구현하고, `LimitMatcher.try_fill()` 직후 fill hook으로 wiring하여 위반 시 `rule_violations` 기록 + `evaluations.status=FAILED` 전이를 자동 트리거한다. 24 시나리오 fixture로 FP/FN=0을 보증하고, fill 평가 지연을 P95 ≤ 50ms로 유지한다.

## Owner

engine (propfirm rules submodule)

## Scope

**포함 파일:**
- `engine/propfirm/rules/__init__.py`
- `engine/propfirm/rules/types.py` — `RuleResult`, `RuleEnum`, `MllInput`, `MinDaysInput` dataclass
- `engine/propfirm/rules/mll.py` — `evaluate_mll(input: MllInput) -> RuleResult`
- `engine/propfirm/rules/min_days.py` — `evaluate_min_days(input: MinDaysInput) -> RuleResult`
- `engine/propfirm/rules/hook.py` — `on_fill(fill, db) -> list[RuleResult]`
- `engine/propfirm/match.py` — try_fill 끝에 hook 호출 ≤10줄 추가
- `engine/tests/propfirm/__init__.py`
- `engine/tests/propfirm/test_rules_mll.py` (12 시나리오)
- `engine/tests/propfirm/test_rules_min_days.py` (12 시나리오)
- `engine/tests/propfirm/test_hook_integration.py` (6 케이스)

**추가 필요 (migration 064 갭):**
- `app/supabase/migrations/065_evaluations_unique_active.sql` — `UNIQUE(user_id) WHERE status='ACTIVE'` partial index

## Non-Goals

- **max_drawdown/consistency/profit_goal 룰**: W-PF-203 별도
- **PASSED 전이**: profit_goal 룰과 묶여야 함 — W-PF-205로 위임
- **Frontend 대시보드**: backend only
- **Live mode (is_simulated=false)**: paper trading만 평가

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| fill hook이 try_fill latency 증가 | M | H | try/except 격리, P95 실측 후 50ms 초과 시 background task 분리 |
| evaluation 없는 account N+1 쿼리 | H | M | early return + LRU 캐시 (TTL 60s) |
| mark_px stale → unrealized PnL 부정확 | M | H | 30s 초과 시 `stale_mark=true` 플래그, 보수적 평가(현재 mark 사용) |
| 동시 fill 2건 FAIL 중복 기록 | L | M | CAS 패턴 — `UPDATE WHERE status='ACTIVE'` row count 체크 |

### Dependencies / Files Touched (실측)

- `trading_accounts`에 `user_id` 컬럼 존재 → hook 경로: `fill.account_id → trading_accounts.user_id → evaluations WHERE user_id=? AND status='ACTIVE'`
- `evaluations`에 `UNIQUE(user_id) WHERE status='ACTIVE'` **미존재** → migration 065 필요
- `pf_fills` 테이블에 `fee` 컬럼 존재 → realized PnL = SUM(fill_px * qty * side_sign) - SUM(fee)

## AI Researcher 관점

### Statistical Validation (24 시나리오 fixture)

**MLL 룰 (12 시나리오)**

| # | 시나리오 | equity_start | realized PnL today | unrealized PnL | 기대 |
|---|---|---|---|---|---|
| M01 | 손실 없음 | 100k | 0 | 0 | PASS |
| M02 | -4.99% 경계 직전 | 100k | -4990 | 0 | PASS |
| M03 | -5.00% 정확 경계 | 100k | -5000 | 0 | FAIL (≤) |
| M04 | -5.01% 초과 | 100k | -5010 | 0 | FAIL |
| M05 | realized + unrealized 합산 | 100k | -3000 | -2500 | FAIL |
| M06 | 어제 손실 무관 | 100k | 0 today | 0 | PASS |
| M07 | 다른 날짜 fill 섞임 | 100k | -4000 today, -3000 yesterday | 0 | PASS |
| M08 | 수수료 포함 | 100k | -4900 + fee 200 → total -5100 | 0 | FAIL |
| M09 | unrealized 흑자가 적자 상쇄 | 100k | -6000 | +2000 | PASS |
| M10 | 다중 포지션 unrealized 합산 | 100k | -2000 | -1500 + -2000 | FAIL |
| M11 | stale mark_px (30s 초과) | 100k | -4000 | -2000 (stale) | FAIL + stale_mark=true |
| M12 | evaluation status != ACTIVE | 100k | -10000 | 0 | NO-OP |

**MinTradingDays 룰 (12 시나리오)**

| # | 시나리오 | distinct fill dates | required | 기대 |
|---|---|---|---|---|
| D01 | 첫 거래일 | 1 | 10 | INCOMPLETE |
| D02 | 9일차 | 9 | 10 | INCOMPLETE |
| D03 | 10일차 정확 | 10 | 10 | SATISFIED |
| D04 | 11일차 초과 | 11 | 10 | SATISFIED |
| D05 | 같은 날 다중 fill | 1 | 10 | INCOMPLETE (1일 카운트) |
| D06 | UTC 자정 경계 | 2 (23:59 + 00:01) | 10 | INCOMPLETE (2일) |
| D07 | 주말 포함 | 10 (주말 2일) | 10 | SATISFIED (캘린더 일자) |
| D08 | 비연속 일자 분산 | 10 (2주 분산) | 10 | SATISFIED |
| D09 | trading_days 캐시 신규 날짜 | 9→+1 신규 | 10 | UPDATE to 10 |
| D10 | trading_days 캐시 동일 날짜 | 10, 같은 날 추가 fill | 10 | no-op |
| D11 | evaluation PASSED 후 fill | 10 | 10 | NO-OP |
| D12 | timezone 혼동 방지 | 10 (UTC 기준) | 10 | SATISFIED |

### Failure Modes

- F1: mark_px 업데이트 파이프라인 장애 → unrealized 0 평가 → FN 위험 (stale_mark 플래그 + alert)
- F2: hook 예외 → try_fill 실패 전파 (try/except 격리로 방지)
- F3: 동시 active evaluation 2개 → CAS 가정 깨짐 (migration 065 partial index 필수)

## Decisions

- **D-1 (MLL 경계)**: `realized + unrealized + fee <= -mll_pct * equity_start` 일 때 FAIL. 수수료 포함 (FTMO/MFF 기준). `<=` 채택 (보수적 해석).
- **D-2 (realized PnL 소스)**: `pf_fills` SUM 재계산. `pf_positions.realized_pnl` 캐시 미신뢰.
  - 거절: positions 캐시 — 청산 시점에만 갱신, stale 위험
- **D-3 (timezone)**: UTC 자정 기준 통일.
  - 거절: account-local TZ — trading_accounts에 TZ 컬럼 없음
- **D-4 (hook 실행)**: 동기 호출. P95 > 50ms 실측 시 background task 분리 follow-up 이슈.
  - 거절: 처음부터 asyncio.create_task — violation 누락 시 추적 곤란
- **D-5 (MinDays 평가)**: fill hook에서 `trading_days` 캐시 +1만. PASSED 전이는 W-PF-205 위임.
- **D-6 (violation.detail 스키마)**: `{equity_start, realized_today, unrealized, fee_today, total_loss_pct, stale_mark, evaluated_at}`
- **D-7 (CAS)**: `UPDATE evaluations SET status='FAILED' WHERE id=? AND status='ACTIVE'` row count로 leader 결정.

## Open Questions

- [Q1] 24 시나리오 커버리지 domain expert 검토 필요 여부?
- [Q4] 수수료 포함 여부 → **확정: 포함** (사용자 결정 2026-05-04, FTMO 기준 참조)

## PR 분해 계획

### PR 1 — Pure Rule Logic (Effort: S)

**목적**: DB/IO 의존 없이 순수 함수 2개 + 24 fixture. PR 2 wiring과 독립 배포 가능.
**검증 포인트**: 24/24 PASS, 함수 호출 <1ms, mock 불필요.

신규 파일 (6):
- `engine/propfirm/rules/__init__.py`
- `engine/propfirm/rules/types.py`
- `engine/propfirm/rules/mll.py`
- `engine/propfirm/rules/min_days.py`
- `engine/tests/propfirm/__init__.py`
- `engine/tests/propfirm/test_rules_mll.py`
- `engine/tests/propfirm/test_rules_min_days.py`

Exit Criteria:
- [ ] pytest 24/24 PASS (est.)
- [ ] mypy strict 통과
- [ ] ruff clean
- [ ] import smoke PASS

### PR 2 — Fill Hook Wiring (Effort: M)

**목적**: 순수 함수를 try_fill 직후 hook으로 연결, DB CAS 통합, latency P95 실측.
**검증 포인트**: P95 ≤ 50ms 실측, 동시 fill CAS 검증, hook 예외 격리 확인.

신규 파일 (2):
- `engine/propfirm/rules/hook.py`
- `engine/tests/propfirm/test_hook_integration.py`

수정 파일 (1):
- `engine/propfirm/match.py` (≤10줄)

별도 PR (선행):
- `app/supabase/migrations/065_evaluations_unique_active.sql`

Exit Criteria:
- [ ] 통합 테스트 6/6 PASS (실측)
- [ ] P95 latency ≤ 50ms (pytest-benchmark 결과 PR body 첨부)
- [ ] match.py diff ≤ 10줄
- [ ] 24 시나리오 회귀 PASS
- [ ] 동시 fill CAS 중복 없음 (1행만 insert)

## 전체 Exit Criteria

- [ ] AC1: 24 시나리오 FP=0 / FN=0
- [ ] AC2: P95 fill evaluation latency ≤ 50ms (실측)
- [ ] AC3: 동시 fill 2건 → rule_violations 1행만 insert
- [ ] AC4: hook 예외 시 try_fill 결과 변경 없음
- [ ] AC5: mypy strict + ruff clean + CI green
- [ ] AC6: CURRENT.md SHA 업데이트

## Next Steps

1. migration 065 (partial index) 적용
2. PR 1: pure rule logic + 24 fixture 구현
3. PR 2: fill hook wiring + latency 실측
