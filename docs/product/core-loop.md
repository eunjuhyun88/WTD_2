# Product Core Loop

## Purpose

이 문서는 제품의 진짜 코어 루프를 canonical 하게 정의한다.

여기서 말하는 코어 루프는 `worker-control`의 런타임 루프가 아니다. 실제 트레이더의 매매 복기에서 출발해, 패턴을 구조화하고, 전 종목에서 추적하고, 결과를 기록하고, 그 기록으로 다음 탐지를 더 정교하게 만드는 학습 루프다.

## Why This Exists

이 루프는 이론에서 나온 게 아니다. TRADOOR/PTB 실매매 복기에서 나왔다.

실제 문제는 늘 비슷했다.

- 예전에 봤던 구조가 다른 코인에서 다시 보임
- "이거 트라도어랑 비슷한데?" 같은 감각은 있었음
- 하지만 전 종목을 계속 눈으로 볼 수는 없음
- 너무 일찍 들어가거나, 너무 늦게 들어가거나, 아예 놓침
- 나중에 복기해도 그때의 맥락이 데이터로 남지 않음

즉, 인간은 패턴을 느끼지만 지속적으로 추적하고 축적하지 못한다.

제품이 대신해야 하는 일은 명확하다.

1. 복기에서 패턴을 뽑아낸다
2. 그 패턴을 기계가 읽을 수 있게 구조화한다
3. 전 종목에서 그 패턴의 진행 상태를 추적한다
4. 가장 중요한 진입 구간만 표면으로 올린다
5. 결과를 기록한다
6. 그 결과를 다음 탐지 품질 개선에 다시 넣는다

이게 코어 루프다.

## Reference Story

기준이 된 레퍼런스는 TRADOOR/PTB OI 반전 구조다.

핵심 관찰은 다음이었다.

- 모든 급락이 같은 급락은 아니다
- OI가 조금만 느는 약한 급락은 가짜일 수 있다
- OI가 크게 늘고 거래량이 붙는 급락은 진짜 포지셔닝 이벤트일 가능성이 높다
- 그 뒤에 바로 진입하는 게 아니라, 번지대와 축적 구간을 더 봐야 한다
- 진짜 돈 되는 구간은 대개 `BREAKOUT`이 아니라 `ACCUMULATION`이다

즉, 제품은 "급등을 잡는 기계"가 아니라 "급등 전에 의미 있는 축적 구간을 찾는 기계"가 되어야 한다.

## Five-Phase State Model

레퍼런스 패턴은 다음 5단계로 표현하는 것이 가장 자연스럽다.

| Phase | Name | Typical Evidence | Trading Meaning |
|---|---|---|---|
| 1 | `FAKE_DUMP` | 급락, OI 소폭 증가, 거래량 확신 부족 | 진입 금지 |
| 2 | `ARCH_ZONE` | 아치형 반등 또는 횡보 압축, 번지대 형성 | 저갱 가능성 대기 |
| 3 | `REAL_DUMP` | 급락, OI 대폭 증가, 거래량 확신 강화 | 세력 포지셔닝 확인 |
| 4 | `ACCUMULATION` | 저점 상승, OI 유지, 펀딩 전환, 구조 개선 | 핵심 진입 구간 |
| 5 | `BREAKOUT` | OI 동반 확장, 빠른 가격 상승 | 결과 확인, 종종 늦음 |

이 패턴에서 가장 중요한 구분은 둘이다.

- `FAKE_DUMP`와 `REAL_DUMP`를 구분하는 것
- `ACCUMULATION`을 `BREAKOUT`보다 더 중요한 phase로 취급하는 것

첫 번째는 함정을 피하게 해주고, 두 번째는 늦지 않은 진입을 가능하게 한다.

## Canonical Core Loop

```text
실전 매매 복기
  -> 차트 검토와 Save Setup
  -> 랩 평가 / 가설 정리
  -> 워치 활성화
  -> 전 종목 스캔
  -> 페이즈 추적
  -> 액션 구간 알림
  -> 결과 기록
  -> 유저 판정
  -> 임계값 / 패턴 / 모델 보정
  -> 다시 전 종목 스캔
```

The concrete operating spec for one full cycle lives in [`docs/product/core-loop-system-spec.md`](/Users/ej/Projects/wtd-v2/docs/product/core-loop-system-spec.md).
Day-1 route ownership is explicit: the review and `Save Setup` moment lives in `/terminal`, not in `/lab` or `/dashboard`.

## Loop Stages

### 1. 실전 매매 복기

출발점은 모델이 아니라 사람의 매매 복기다.

입력은 보통 이런 것들이다.

- 어디서 들어갔는지
- 왜 놓쳤는지
- 어디서 손절하거나 복구했는지
- 차트가 어떤 구조였는지
- OI, 펀딩비, 거래량이 어땠는지
- 스크린샷과 메모가 무엇이었는지

이 단계의 산출물은 예측값이 아니다. 패턴 가설이다.

### 2. 차트 검토와 Save Setup

유저는 실전 복기에서 떠올린 구조를 실제 차트 구간으로 명시하고 저장한다.

이 단계의 surface owner는 `/terminal` 이다.
즉, 제품은 터미널에서 복기 맥락을 확인하고, 정확한 차트 구간을 지정하고, `Save Setup` 으로 저장할 수 있어야 한다.

이 단계의 핵심은 규칙을 먼저 쓰는 게 아니다.
먼저 "내가 말하는 정확한 구간"을 durable evidence로 남기는 것이다.

`Save Setup`이 중요한 이유는 세 가지다.

- 인간이 아직 더 잘 보는 뉘앙스가 있다
- 그 시점의 시장 맥락을 그대로 박제할 수 있다
- 이 저장물이 미래 학습 데이터가 된다

핵심 철학:

- 수동 레이블링이 AI 훈련 데이터가 된다

그래서 `Save Setup`은 UI 편의 기능이 아니라 해자의 일부다.

### 3. 랩 평가와 가설 정리

저장된 setup은 `/lab` 에서 평가 가능한 가설이나 challenge로 정리된다.

여기서 중요한 것은 사용자가 처음부터 규칙을 작성하는 게 아니라, 저장된 증거를 바탕으로 일반화 가능성을 검토하는 것이다.

여기서 담아야 하는 것은:

- 이벤트의 순서
- phase의 순서
- 반드시 필요한 조건
- 보조 조건
- 무효화 조건
- 기대 결과

중요한 철학은 단순하다.

- 패턴은 한 시점 스냅샷이 아니다
- 패턴은 시간 순서가 있는 이벤트 시퀀스다
- Day-1에서는 capture가 먼저고, pattern/watch는 그 다음 단계다

### 4. 워치 활성화

가설이 충분히 일반화된다고 판단되면 `/lab` 에서 live monitoring 대상으로 올린다.

Day-1 규칙은 명확하다.

- `/terminal` 은 capture와 handoff를 담당한다
- `/lab` 만 새 `watch` 를 활성화할 수 있다
- `/dashboard` 는 기존 `watch` 의 상태를 관리한다

### 5. 전 종목 스캔

엔진은 활성 유니버스 전체를 스캔하면서 그 패턴에 필요한 증거를 계산한다.

핵심은 "내가 지금 보고 있던 코인"을 판정하는 게 아니라, "내가 못 보고 있는 다음 코인"까지 찾는 것이다.

그래서 이 단계는 작은 watchlist보다 넓은 유니버스에서 의미가 크다.

### 6. 페이즈 추적

스캔 결과는 상태를 가져야 한다.

시스템은 단순히 "지금 비슷하다"만 묻지 않는다.

- 지금 몇 phase인가
- 직전 스캔 대비 앞으로 갔는가
- 무효화됐는가
- 액션 구간에 들어오는 중인가
- 이미 너무 늦었는가

이게 State Machine의 역할이다.

### 7. 액션 구간 알림

시스템은 가장 중요한 phase에 들어온 종목만 올려야 한다.

레퍼런스 패턴에서는 보통 `ACCUMULATION`이 그 구간이다.

이때 기대하는 구조는:

- 저점이 점점 높아짐
- 급락 후 OI가 유지됨
- 펀딩이나 레짐이 전환됨
- 스탑을 짧게 잡을 수 있음

알림의 목표는 "와, 이미 올랐다"가 아니라 "지금이면 아직 구조적으로 들어갈 수 있다"여야 한다.

알림으로 올라온 후보도 다시 `/terminal` 에서 검토되고 필요하면 추가 capture로 저장된다.

즉, capture는 루프의 시작점일 뿐 아니라, 라이브 후보를 다시 학습 데이터로 회수하는 반복 지점이기도 하다.

### 8. 결과 기록

저장된 setup은 나중에 실제 결과로 닫혀야 한다.

기록해야 할 질문은 보통 이렇다.

- 결국 breakout이 나왔는가
- 얼마나 갔는가
- 어디서 실패했는가
- 어떤 시장 레짐이었는가
- 경로가 어땠는가

이 단계가 있어야 복기가 감상이 아니라 데이터가 된다.

### 9. 유저 판정

결과를 본 뒤 유저는 다시 판정한다.

예를 들면:

- valid
- invalid
- late
- noisy
- 거의 맞았지만 특정 이유로 실패

이 판정은 단순 라벨이 아니다. 유저가 어떤 setup을 좋은 setup으로 보는지 시스템에 알려주는 신호다.

### 10. 보정과 재투입

유저 판정과 결과 기록은 다시 시스템으로 들어가서 다음을 고친다.

- 블록 임계값
- phase 조건
- 알림 민감도
- feature 가중치
- 시퀀스 매칭 규칙
- LLM 태깅 프롬프트
- 유저별 변형 패턴

여기까지 돌아와야 루프가 닫힌다.

보정이 없으면 이 제품은 그냥 스캐너다.

보정까지 있어야 학습 시스템이 된다.

## Three Auto-Research Layers

오토리서치는 한 가지 방식이 아니라 3개 레이어가 쌓이는 구조여야 한다.

### Layer 1: Feature Vector Similarity

역할:

- 수치 feature snapshot 유사도 비교
- 빠른 1차 필터

장점:

- 지금 당장 실용적이고 싸다

한계:

- 시간 순서와 차트의 "느낌"을 압축해버릴 수 있다

### Layer 2: Event Sequence Matching

역할:

- phase와 이벤트 순서를 비교
- 현재 종목이 비슷한 구조를 밟고 있는지 판단

장점:

- 레퍼런스 패턴을 더 정확히 반영한다

한계:

- phase semantics와 상태 추적이 먼저 정리돼 있어야 한다

### Layer 3: LLM Chart Interpretation

역할:

- 차트 이미지와 수치 컨텍스트를 같이 LLM에 넣는다
- 그 해석을 구조화된 태그나 설명으로 변환한다

장점:

- 가장 강력한 표현력
- 수치 유사도만으로 잡기 어려운 차트 문법을 다룰 수 있다

한계:

- 비용이 가장 높다
- 출력 구조를 엄격히 관리하지 않으면 신뢰성이 흔들린다

핵심은 이 셋이 경쟁 관계가 아니라는 점이다.

1. feature vector가 넓게 거른다
2. event sequence가 시간 구조를 이해한다
3. LLM chart interpretation이 상위 문법을 해석한다

## Four-Layer Flywheel

코어 루프를 시스템 관점으로 쓰면 다음 4레이어 순환이다.

```text
Pattern Object
  -> State Machine
  -> Result Ledger
  -> User Refinement
  -> revised Pattern Object / thresholds / model state
```

의미는 명확하다.

- `Pattern Object`는 패턴을 정의한다
- `State Machine`은 각 종목이 그 패턴의 어디에 있는지 판단한다
- `Result Ledger`는 그 패턴이 실제로 먹혔는지 기록한다
- `User Refinement`는 그 결과를 다음 버전의 패턴과 정책으로 되돌린다

이 4레이어가 코어 루프의 엔진이다.

## What Validation Changed

검증 과정에서 설계와 현실 사이의 차이도 분명히 드러났다.

### 1. 일부 설계 문서는 실제 코드와 달랐다

예:

- Context API에 대한 가정이 틀린 부분이 있었다
- 제안된 블록 구현 일부가 실제 엔진 인터페이스와 맞지 않았다

즉, 코어 루프는 상상 속 아키텍처가 아니라 실제 코드 위에 다시 적어야 했다.

### 2. 생각보다 이미 있는 것들이 많았다

이미 있던 것:

- `engine/autoresearch_ml.py`
- challenge / similarity 관련 기반
- LightGBM training / scoring primitive

즉, 모든 걸 새로 만드는 문제가 아니었다.

진짜 필요한 것은 기존 기반을 연결하고 승격시키는 일이었다.

### 3. 진짜 비어 있는 조각은 더 좁고 더 중요했다

실제 핵심 공백은 이쪽이다.

- `State Machine`
- `Result Ledger`
- 더 넓은 동적 유니버스 처리

이 세 조각이 붙어야 루프가 완성된다.

## UI Integrity Matters

차트 렌더링 버그도 같은 교훈을 줬다.

문제는 `loading=false` 전에 chart DOM이 아직 없는데 `renderCharts()`가 먼저 호출된 것이었다. 결국 div를 못 찾고 초기화가 즉시 return됐다. `tick()` 이후 DOM 업데이트를 기다린 다음 초기화하도록 바꾸는 방식으로 고쳐야 했다.

이게 왜 중요하냐면:

- 코어 루프는 모델만의 문제가 아니다
- 액션 구간이 떠도 유저가 차트를 못 보면 검토가 끊긴다
- 검토가 끊기면 Save Setup이 끊긴다
- Save Setup이 끊기면 훈련 데이터 축적도 끊긴다

즉, 차트 안정성도 코어 루프 무결성의 일부다.

## Runtime Loops Are Not The Core Loop

리포지토리에는 이런 실행 루프도 있다.

- scheduler loop
- periodic scan job
- background evaluation job

이것들은 실행 기계다.

필요하긴 하지만 제품의 코어 루프 자체는 아니다. 제품의 코어 루프는 이 실행 기계들이 돌려주는 학습 순환이다.

## Current Repository Mapping

### Implemented

| Area | Status | Notes |
|---|---|---|
| block / feature evaluation | implemented | `engine/building_blocks`, `engine/scanner` |
| challenge / similarity primitives | implemented | `engine/challenge` 기반 존재 |
| ML scoring / training primitives | implemented | `engine/scoring`, `engine/autoresearch_ml.py` |
| scheduler execution machinery | implemented | `engine/scanner/scheduler.py`, `engine/worker/main.py` |

### Partial

| Area | Status | Notes |
|---|---|---|
| Save Setup as training capture | partial | 제품 철학상 핵심이나 ledger/refinement까지는 아직 미완 |
| auto-research layering | partial | feature / ML 기반은 있으나 sequence / LLM layer는 미완 |
| user refinement wiring | partial | scoring 기반은 있으나 user feedback loop는 완전히 닫히지 않음 |

### Missing

| Area | Status | Notes |
|---|---|---|
| canonical `Pattern Object` module | missing | `engine/patterns` 부재 |
| canonical phase `State Machine` | missing | phase 추적 엔진 부재 |
| durable `Result Ledger` | missing | 결과 누적과 성과 집계의 canonical plane 부재 |
| full save-to-ledger-to-refinement wiring | missing | app와 engine을 닫는 핵심 연결 미완 |
| productionized LLM chart interpretation | missing | 고비용 상위 해석 레이어 미구현 |

## Product Rule

우선순위가 헷갈릴 때는 항상 이 순서를 따른다.

1. 실제 트레이더의 통찰을 제대로 포착한다
2. 이미 오른 뒤가 아니라 오르기 전 구조를 잡는다
3. 결과를 반드시 기록한다
4. 그 결과와 유저 판정을 다음 탐지 개선으로 되돌린다

이 순환을 강화하지 않는 기능은 전부 2순위다.
