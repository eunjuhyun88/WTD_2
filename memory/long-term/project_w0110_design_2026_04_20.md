---
name: W-0110 CTO 설계 + 시스템 현황 2026-04-20
description: 2026-04-20 세션 종료: 12패턴 시스템 완성 + W-0103 UI dedup PR#102 open. W-0110 CTO 설계문서 작성 (Pattern #13 후보 분석 + ChartBoard 모듈화 전략 + 캔들 연속성 버그 분석)
type: project
---

## 시스템 현황 (2026-04-20)

**Pattern Library 12개 완성** (PR #108 merged, main b6d1e5a):
- Long patterns (10): TRADOOR, FFR, WSR, WHALE, VAR, CBR, RADAR_GOLDEN, RADAR_BREAKOUT, FUNDING_FLIP, INSTITUTIONAL_DISTRIBUTION
- Short patterns (2): FFR_SHORT, GAP_FADE_SHORT
- Building blocks: 29개 안정화
- Test coverage: 1079 tests green

**Terminal UI 진행상황:**
- W-0102 (Prompt Agent): PR #99 merged (URL ?q= auto-submit, chart_action SSE, CVD sub-pane)
- W-0103 (UI Dedup design): PR #102 open, unimplemented (Header pill/CommandBar TF/VerdictHeader/24H change dedup 설계만 완료)
- W-0110 설계: 이 세션에서 CTO 문서 작성 (W-0110-cto-design-2026-04-20.md)

## W-0110 CTO 설계 핵심 결정

### 결정 1: Pattern #13 = Liquidity Sweep Reversal

**선택 이유:**
- 암호시장 고유: 시장조성자 stop sweep → reversal (높은 신뢰도)
- 데이터 독립: 기존 breakout_above_high, volume_spike 블록 재사용, 새 API 불필요
- Paradigm framework 적용 가능
- W-0110-A: 1주 내 promotion candidate 도달 목표

**후보 비교:**
- VWAP Reclaim (backup): 간단하지만 crypto-native 아님 (W-0114 시점으로 밀어)
- CME Gap Fill (defer): COT parser 완성 대기 (W-0111+)

### 결정 2: ChartBoard.svelte 분할 전략

**현황:** 2300줄, 캔들 렌더링 + 툴바 + 지표패널 + 범례 혼재

**분할 계획 (W-0110-B):**
```
ChartBoard.svelte (800줄, 메인 캔버스만)
├── ChartToolbar.svelte (300줄, 신규)
├── IndicatorPaneStack.svelte (400줄, 신규)
└── ChartCanvas.svelte (1000줄, 추출)
```

**목표:**
- 캔들 연속성 버그 격리 (작은 blast radius)
- 지표 패널 독립 렌더링 (W-0111 real-time split 활성화)
- Dashboard sidebar 재사용 (W-0116)

### 결정 3: 캔들 연속성 버그 근본원인

**증상:** API 500 bars 반환 → LWC는 6-8 bars만 표시

**의심 원인들 (우선순위):**
1. **Timestamp 단위 불일치** (가능성 높): LWC는 unix 초 기대, API가 밀리초 반환
2. **fitContent() 타이밍** (중): 매 업데이트마다 호출 → 사용자 팬 후 리셋
3. **데이터 갭 감지** (가능성 낮): LWC timeScale 스킵 동작

**수정 전략 (W-0110-B Phase 1):**
- Timestamp 단위 확인 (grep engine code)
- `fitContent()` 첫 로드만 호출, 이후 금지
- `scrollToRealTime()` 추가

### 결정 4: Terminal UI 부채 통합

**현황:** 심볼 이름 3곳 중복 (Header pill + CommandBar + VerdictHeader), TF 2곳 중복

**W-0110-C 계획:**
- `terminalState` store = 단일 진실 공급원 (canonical symbol/TF/24H change)
- Header pill, VerdictHeader, CommandBar 모두 store 읽기
- SymbolPicker 선택 → store 쓰기 → 모든 UI 동기 업데이트

## 다음 실행 순서

1. **W-0110-A** (Pattern #13 준비): liquidity_sweep_reversal 블록 정의, paradigm pass, promotion candidate → 2026-04-21
2. **W-0110-B** (ChartBoard 분할 + 버그 수정): Phase 1-3, candle 렌더링 테스트 → 2026-04-23
3. **W-0110-C** (UI Dedup 구현): terminalState 통합, PR #102 merge → 2026-04-24
4. **W-0111** (W-0110 이후): COT parser + CME OI 블록

## CTO 사고방식

**Liquidity Sweep Reversal 선택:**
- Stop hunts는 암호시장의 현실 (on-chain visible in mev-inspect, price action에 흔적)
- 기존 12패턴과 상보적 (WHALE + WSR는 accumulation 후 reversal, Sweep은 liquidity run 후 reversal)
- Paradigm framework 기준 재사용 가능 (기술적 부채 아님)

**ChartBoard 분할 지금:**
- Cognitive load: 2300줄 파일은 신규 엔지니어 온보딩 2시간 소비
- Render perf: 모든 지표 업데이트 → 전체 ChartBoard 재렌더
- Bug isolation: 캔들 연속성 버그는 4곳 가능, 분할로 범위 축소

**Terminal UI 일관성:**
- 12패턴 도달했으니 다음 8개 추가 전 boring infrastructure 정리 필요
- 심볼 변경 시 UI 비동기 = 사용자 신뢰 상실 risk

## 관련 파일

- `work/active/W-0110-cto-design-2026-04-20.md` — 전체 CTO 설계 (Goal/Scope/Decisions/Exit Criteria)
- `engine/pattern_library.py` — 12패턴 레지스트리
- `app/src/components/terminal/workspace/ChartBoard.svelte` — 분할 대상
- `app/src/lib/stores/terminalState.ts` — UI 통합 대상

**세션 마감 (2026-04-20)**
