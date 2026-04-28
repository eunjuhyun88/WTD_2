---
name: Pattern Engine Session (jovial-cori)
description: TRADOOR/PTB 패턴 엔진 전체 구현 — building blocks 5개, StateMachine, Ledger, ChartBoard, PatternStatusBar
type: project
---

# Pattern Engine 구현 완료 (2026-04-13, branch: claude/jovial-cori)

## 핵심 아이디어
TRADOOR/PTB 고래 숏스퀘즈 패턴을 바이낸스 전 종목에서 자동 감시. ACCUMULATION 진입 기회 알림 + 결과 기록으로 데이터 해자 구축.

## 5-Phase 패턴 (TRADOOR_OI_REVERSAL)
```
FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION(진입★) → BREAKOUT(목표)
```

## 신규 Engine 파일

### Building Blocks (5개)
- `engine/building_blocks/confirmations/oi_spike_with_dump.py` — 가격↓ + OI↑ + 거래량 폭발
- `engine/building_blocks/confirmations/higher_lows_sequence.py` — 저점 상승 시퀀스
- `engine/building_blocks/confirmations/funding_flip.py` — 펀딩비 음→양 전환
- `engine/building_blocks/confirmations/oi_hold_after_spike.py` — OI 급등 후 유지
- `engine/building_blocks/confirmations/sideways_compression.py` — 횡보 압축

**Why:** 모두 `ctx: Context`, `ctx.features[col]` 사용, `pd.Series[bool]` 반환 (ctx.perp, ctx.df, SignalContext 없음)

### Universe
- `engine/universe/dynamic.py` — 바이낸스 USDT-M 전 종목 동적 로딩 (~300개, volume 필터 $500K)
- `engine/universe/loader.py` — 'binance_dynamic', 'binance_all' 케이스 추가

### Patterns (신규)
- `engine/patterns/types.py` — PhaseCondition, PatternObject, SymbolPhaseState, PhaseTransition
- `engine/patterns/library.py` — TRADOOR_OI_REVERSAL 정의, PATTERN_LIBRARY dict
- `engine/patterns/state_machine.py` — PatternStateMachine (종목별 phase 추적, timeout, 콜백)
- `engine/patterns/scanner.py` — 전 종목 스캔, ledger 연동

### Ledger (신규)
- `engine/ledger/types.py` — PatternOutcome, PatternStats
- `engine/ledger/store.py` — JSON 저장/로드, 결과 기록, 통계 집계

### API
- `engine/api/routes/patterns.py` — 8개 엔드포인트 (/states, /candidates, /{slug}/stats, /scan 등)
- `engine/api/main.py` — patterns 라우터 등록

### Tests
- `engine/tests/test_confirmations_*.py` — 5개 블록 유닛 테스트
- `engine/tests/test_ledger_store.py`
- `engine/tests/test_patterns_state_machine.py`

## 신규 App 파일

- `app/src/routes/api/chart/klines/+server.ts` — OHLCV + OI + SMA5/20/60 + RSI-14 서버사이드
- `ChartBoard.svelte` — lightweight-charts v5, 4패널 (캔들+SMA, 볼륨, RSI, OI Δ%)
- `PatternStatusBar.svelte` — ACCUMULATION 진입 신호 알림 바 (60s 폴링)
- `app/src/routes/api/patterns/` — engine proxy 엔드포인트

## 수정된 파일
- `terminal/+page.svelte` — ChartBoard, PatternStatusBar 통합 (unconditional render)
- `WorkspaceGrid.svelte` — ChartBoard 임포트 + handleSaveSetup
- `workspace/index.ts` — 2개 컴포넌트 익스포트 추가

## Architecture Notes
- PatternObject (rule-based phases) ← 신규, ChallengeRecord (vector similarity) ← 기존. 두 레이어 병렬 존재
- lightweight-charts v5: `addSeries(CandlestickSeries, ...)` — v4의 `addCandlestickSeries()` 아님
- Context API: `ctx: Context`, `ctx.features[col]` — `ctx.df`, `ctx.perp`, `SignalContext` 없음
- OI history: 바이낸스 FAPI 20일 제한

## Why: 제품 방향성
Cogochi = "셋업 저장-감시-검증 표준 시스템". 단순 AI 트레이딩앱이 아닌 트레이더의 판단을 저장하고 유사 시점에 다시 불러오는 personal market memory.
