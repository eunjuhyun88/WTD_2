# W-0298 — V-PV-01 engine/verification scaffold 구현

> Wave: Wave4 | Priority: P1 | Effort: M (2-3일)
> Charter: In-Scope L7 (AutoResearch — paper trading verification)
> Status: 🟡 Design Approved
> Created: 2026-04-29
> Issue: #595
> Depends on: W-0282 (설계 lock-in ✅), W-0284 (GateV2DecisionStore ✅)

---

## Goal

`engine/verification/` 모듈 신규 구현으로 패턴 paper trading 검증 레인 완성 — 실매매 없이 신호 품질을 통계적으로 검증하고 copy trading publish 전 안전망 제공.

---

## Owner

engine

## Scope

**포함**:
- `engine/verification/__init__.py` — 모듈 공개 인터페이스
- `engine/verification/types.py` — PaperExecutionRequest, PaperExecutionResult
- `engine/verification/paper_executor.py` — backtest 재활용 paper trading 실행기
- `engine/verification/metrics.py` — Sharpe/Calmar/MaxDD 집계 (backtest/metrics.py 재활용)
- `engine/tests/verification/test_paper_executor.py` — ≥5 tests
- `engine/api/routes/patterns.py` — `POST /patterns/{slug}/verify-paper` endpoint 추가

**제외**:
- UI 없음 (engine-only)
- 실매매 연결 없음
- WebSocket streaming 없음
- Supabase 별도 테이블 없음 (PatternSearchArtifactStore 재활용)

## Non-Goals

- copy trading 자동 publish 없음 (F-60 gate 후 단계)
- 새 ML 모델 학습 없음
- 실시간 alerting 없음

## Canonical Files

- `engine/verification/` (신규 디렉토리)
- `engine/backtest/simulator.py` — `run_backtest()` 재활용
- `engine/backtest/metrics.py` — MetricsResult 재활용
- `engine/backtest/portfolio.py` — Portfolio 재활용
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
- **통계 유효성**: n < 30 패턴에서 Sharpe > 2.0은 overfitting 위험 → min_trades = 30 가드
- **Failure mode**: Binance 데이터 부재 → paper executor skip (non-fatal, warn log)
- V-PV-01 결과가 F-60 gate accuracy score와 독립적으로 동작해야 함

## Facts

- `engine/backtest/simulator.py:run_backtest()` 존재 확인
- `engine/backtest/portfolio.py:Portfolio` 존재 확인
- `engine/verification/` 디렉토리 없음 (ls 실측)
- W-0282 design lock-in 완료 (work/completed/W-0282-f3-telegram-deeplink-impl.md... 실제 active W-0282 = v-pv-01 설계)

## Assumptions

- `engine/backtest/` 모듈 import 경로: `from backtest.simulator import run_backtest`
- paper_executor는 기존 capture records 기반 시뮬레이션
- `/patterns/{slug}/verify-paper` POST → `PaperExecutionResult` JSON 반환

## Decisions

- **[D-0298-1]** backtest 재활용 vs 새 구현: 재활용 선택 (DRY, 9-file backtest 이미 있음)
- **[D-0298-2]** DB 저장 방식: PatternSearchArtifactStore JSONB (별도 테이블 No)

## Open Questions

- [ ] [Q-0298-1] `engine/backtest/metrics.py` MetricsResult 정확한 필드명 확인 필요
- [ ] [Q-0298-2] paper_executor가 실행할 과거 데이터 소스 — CachedKlineProvider vs Supabase?

## Implementation Plan

1. `engine/backtest/*.py` 타입/API grep 실측
2. `engine/verification/types.py` — PaperExecutionRequest, PaperExecutionResult
3. `engine/verification/paper_executor.py` — run_backtest() 래핑
4. `engine/verification/metrics.py` — slim 집계 함수
5. `engine/tests/verification/test_paper_executor.py` — ≥5 unit tests
6. `engine/api/routes/patterns.py` — POST /patterns/{slug}/verify-paper
7. pytest + CI green

## Exit Criteria

- [ ] AC1: `engine/verification/__init__.py` + `paper_executor.py` + `types.py` 생성
- [ ] AC2: `pytest engine/tests/verification/` ≥ 5 tests, all pass
- [ ] AC3: `POST /patterns/{slug}/verify-paper` — 200 OK + PaperExecutionResult JSON
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
