# W-0298 — V-PV-01 engine/verification scaffold 구현

> Wave: Wave4 | Priority: P1 | Effort: M (2-3일)
> Charter: In-Scope L7 (AutoResearch — paper trading verification)
> Status: 🟡 Implementation PR Ready
> Created: 2026-04-29
> Issue: #595
> Depends on: W-0282 (설계 lock-in ✅), W-0284 (GateV2DecisionStore ✅)

---

## Goal

`engine/verification/` 모듈 신규 구현으로 기록된 outcome ledger 기반 paper 검증 레인을 연다. 실매매 없이 패턴별 HIT/MISS/EXPIRED 결과를 집계하고, copy trading publish 전 최소 표본/승률 게이트를 제공한다.

---

## Owner

engine

## Scope

**포함**:
- `engine/verification/__init__.py` — 모듈 공개 인터페이스
- `engine/verification/types.py` — PaperTrade, PaperVerificationResult
- `engine/verification/executor.py` — outcome ledger 기반 검증 집계기
- `engine/tests/verification/test_executor.py` — executor unit tests
- `engine/api/routes/patterns.py` — `POST /patterns/{slug}/verify-paper` endpoint 추가
- `app/src/lib/contracts/generated/engine-openapi.d.ts` — route contract 반영

**제외**:
- UI 없음 (engine-only)
- 실매매 연결 없음
- WebSocket streaming 없음
- Supabase 별도 테이블 없음
- backtest 시뮬레이터 직접 호출 없음 (V-PV-03+)

## Non-Goals

- copy trading 자동 publish 없음 (F-60 gate 후 단계)
- 새 ML 모델 학습 없음
- 실시간 alerting 없음

## Canonical Files

- `engine/verification/` (신규 디렉토리)
- `engine/ledger/types.py` — OutcomePayload
- `engine/ledger/store.py` — LedgerRecordStore
- `engine/api/routes/patterns.py` — endpoint 추가
- `engine/tests/verification/` (신규)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| backtest 재활용 시 signature mismatch | 중 | 중 | engine/backtest/*.py 먼저 grep 후 타입 확인 |
| Supabase JSONB 저장 크기 초과 | 저 | 저 | 결과 slim → 핵심 지표만 저장 |
| CI 실패 (import path) | 저 | 저 | `engine/backtest/__init__.py` export 확인 후 import |

### Dependencies
- `engine/backtest/simulator.py:run_backtest()` ✅ 존재
- `engine/backtest/metrics.py:MetricsResult` — 확인 필요
- `engine/backtest/types.py` — BacktestConfig 타입 확인

### Performance
- paper_executor는 on-demand (scan job과 분리), cold start 무방

## AI Researcher 관점

- Paper trading 검증이 copy trading 신뢰도의 핵심 (실매매 전 안전망)
- **통계 유효성**: 첫 PR은 최소 운영 게이트 `n_trades >= 10`, `win_rate >= 55%`만 제공. n>=30/DSR/Calmar는 V-PV-03+에서 확장.
- **Failure mode**: Binance 데이터 부재 → paper executor skip (non-fatal, warn log)
- V-PV-01 결과가 F-60 gate accuracy score와 독립적으로 동작해야 함

## Facts

- `engine/ledger/store.py:LedgerRecordStore.list(pattern_slug, record_type=...)` 존재 확인
- outcome payload의 `exit_return_pct`, `max_gain_pct`는 ratio 단위 `(exit-entry)/entry`
- `engine/verification/` 디렉토리 신규 생성
- W-0282 design lock-in 완료 (work/completed/W-0282-f3-telegram-deeplink-impl.md... 실제 active W-0282 = v-pv-01 설계)

## Assumptions

- recorded outcome ledger가 paper 검증의 첫 데이터 소스
- expired outcome은 trade count에는 포함하되 win_rate denominator에서는 제외
- `/patterns/{slug}/verify-paper` POST → PaperVerificationResult JSON 반환

## Decisions

- **[D-0298-1]** 첫 구현은 backtest 재시뮬레이션이 아니라 outcome ledger 집계. 이유: 이미 resolver가 72h outcome을 쓰고 있어 API를 빠르게 닫을 수 있음.
- **[D-0298-2]** pass gate: `n_trades >= 10` and `win_rate >= 0.55`. F-60 production gate와 독립된 preflight 점검.
- **[D-0298-3]** expired 처리: `n_trades`에는 포함, `win_rate`에는 제외. 이유: timeout/expired는 실패 확정이 아니라 미판정 표본.

## Open Questions

- [ ] [Q-0298-1] V-PV-03에서 backtest simulator와 outcome ledger 결과를 병합할지, 별도 endpoint로 둘지 결정
- [ ] [Q-0298-2] n>=30/DSR/Calmar를 언제 gate에 승격할지 결정

## Implementation Plan

1. `engine/verification/types.py` — PaperTrade, PaperVerificationResult
2. `engine/verification/executor.py` — LedgerRecordStore outcome aggregation
3. `engine/tests/verification/test_executor.py` — unit tests
4. `engine/api/routes/patterns.py` — POST /patterns/{slug}/verify-paper
5. generated OpenAPI TS contract 반영
6. pytest + CI green

## Exit Criteria

- [ ] AC1: `engine/verification/__init__.py` + `executor.py` + `types.py` 생성
- [ ] AC2: `pytest engine/tests/verification/` ≥ 5 tests, all pass
- [ ] AC3: `POST /patterns/{slug}/verify-paper` — 200 OK + PaperVerificationResult JSON
- [ ] AC4: CI green
- [ ] AC5: CURRENT.md main SHA 업데이트

## Next Steps

1. 새 worktree `feat/W-0298-vpv01-impl` 생성
2. `engine/backtest/*.py` 실측 후 타입 확인
3. verification/ 모듈 구현

## Handoff Checklist

- [ ] 새 worktree 생성 + branch `feat/W-0298-vpv01-impl`
- [ ] backtest/ grep 완료
- [ ] paper_executor 구현 완료
- [ ] pytest green

---

## References

- `work/active/W-0282-v-pv-01-engine-verification-scaffold.md` — 설계 원본
- `engine/backtest/simulator.py:run_backtest()` — 재활용 대상
- `engine/backtest/portfolio.py:Portfolio` — 재활용 대상
- W-0284 (GateV2DecisionStore) — 결과 저장 패턴 참조
