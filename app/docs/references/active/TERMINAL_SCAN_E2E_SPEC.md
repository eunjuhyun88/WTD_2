# STOCKCLAW Terminal Scan E2E Spec

작성일: 2026-02-22
목적: 차트 변경 -> SCAN 클릭 1회 기준으로, 좌/중앙/우 패널과 히스토리/채팅/타 페이지 반영까지 제품 동작을 고정한다.
Doc index: `docs/README.md`

## 1. Scope

1. 대상 화면: `/terminal` (War Room, Chart, Intel)
2. 연동 화면: `/signals`, `/passport`, `/arena`
3. 대상 기능: 스캔 실행, 스캔 누적 히스토리, 인텔 결과 표시, AGENT CHAT 입력, TRACK/COPY/QUICK TRADE 전이

## 2. 클릭 1회 E2E 플로우

## 2.1 Pair/Timeframe 변경

트리거:
1. 차트 상단 토큰 드롭다운 또는 타임프레임 버튼 클릭

호출 체인:
1. `gameState.update({ pair, timeframe })`
2. War Room reactive 블록에서 `currentPair/currentTF` 반영
3. 같은 `pair+timeframe` 스캔 탭 존재 시 해당 탭 자동 활성화

상태 변경:
1. `gameState.pair`
2. `gameState.timeframe`
3. `WarRoom.activeScanId` (조건부)

UI 변경:
1. 중앙 차트 심볼/타임프레임 변경
2. 좌측 ticker-flow 라벨 변경
3. 우측 뉴스 필터 토큰 변경

## 2.2 SCAN 클릭

트리거:
1. 차트 상단 `SCAN` 버튼
2. War Room 내 스캔 실행

호출 체인:
1. `ChartPanel` -> `scanrequest` 이벤트
2. `/terminal/+page.svelte` `handleChartScanRequest()`
3. `warRoomRef.triggerScanFromChart()`
4. `WarRoom.runAgentScan()`
5. `runWarRoomScan(pair, timeframe)`
6. 결과를 `scanTabs`에 upsert
7. `dispatch('scancomplete', detail)`
8. `/terminal/+page.svelte` `handleScanComplete()`
9. `latestScan`, `chatMessages` 갱신

상태 변경:
1. `WarRoom.scanRunning/scanStep/scanError`
2. `WarRoom.scanTabs/activeScanId/activeToken`
3. `terminal.latestScan`
4. `terminal.chatMessages`

UI 변경:
1. 좌측 스캔 탭 누적
2. 좌측 에이전트 시그널 카드 갱신
3. 우측 Intel Chat 상단에 스캔 브리프 표시
4. 우측 채팅 타임라인에 스캔 완료 메시지 추가

## 2.3 스캔 에이전트 범위 (5 vs 8)

CURRENT:
1. Terminal 스캔은 5개 에이전트 사용
2. 대상: `STRUCTURE`, `FLOW`, `DERIV`, `SENTI`, `MACRO`
3. 역할: 데이터 수집/요약/추천 시나리오 생성

ARENA와 구분:
1. Arena Draft/분석은 8개 에이전트 풀 기준
2. 추가 3개(`VPA`, `ICT`, `VALUATION`)는 Arena 중심 고급 분석에 우선 적용

TARGET 옵션:
1. 옵션 A: Terminal은 5개 유지 (속도/가독성 우선)
2. 옵션 B: Terminal도 8개 확장 (심화 분석 우선)
3. 최종 결정 전까지 본 문서와 `ARCHITECTURE_DESIGN.md`는 5개 기준을 정본으로 유지

의사결정 경계:
1. Terminal `consensus`는 트레이더 보조 신호다.
2. Terminal 스캔만으로 자동 포지션 집행을 하지 않는다.
3. 최종 진입/리스크 결정은 사용자가 수행한다.

## 3. 좌측 히스토리 누적 구조

## 3.1 현재 구현 (CURRENT)

저장 구조:

```ts
type ScanTab = {
  id: string;
  pair: string;
  timeframe: string;
  token: string;
  createdAt: number;
  label: string;
  signals: AgentSignal[];
};
```

누적 정책:
1. 동일 `pair+timeframe` 재스캔 시 같은 탭에 결과 prepend
2. 탭 최대 개수 `6`
3. 탭당 시그널 최대 `60`
4. `localStorage` 키 `stockclaw.warroom.scanstate.v1`에 저장/복원

UI 정책:
1. `LIVE FEED` + 스캔 탭 버튼을 가로 스크롤로 유지
2. 탭 클릭 시 해당 시점 시그널 묶음 복원
3. 토큰 필터(`ALL/BTC/ETH...`)는 활성 탭 컨텍스트에서만 동작

## 3.2 타겟 구현 (TARGET)

문제:
1. 브라우저/디바이스가 바뀌면 스캔 히스토리가 사라짐
2. 스캔의 품질 평가(승률, 사후 결과 비교)가 어려움

추가 저장:
1. `terminal_scan_runs` (scan_id, user_id, pair, timeframe, consensus, avg_confidence, summary, created_at)
2. `terminal_scan_signals` (scan_id, agent_id, vote, conf, entry, tp, sl, factors_json)

결과:
1. 좌측 패널에 최근 스캔 히스토리를 서버 기반으로 복원
2. 스캔별 성과 회고(예: 24h 후 hit/miss) 가능

## 4. 우측 Intel 결과 구조 (트레이더 기준)

## 4.1 현재 구현 (CURRENT)

노출 데이터:
1. `latestScan.summary`
2. `latestScan.highlights[]` 일부
3. 채팅 로그에 텍스트 한 줄

제약:
1. 왜 LONG/SHORT인지 수치 근거가 약함
2. 리스크 구간/무효화 조건이 눈에 띄지 않음

## 4.2 타겟 구현 (TARGET)

우측 패널은 스캔 1회마다 아래 6블록을 고정 노출:
1. `Consensus` 방향, 신뢰도, 에이전트 분포
2. `Setup` 엔트리/손절/익절, R:R, invalidation 가격
3. `Regime` 추세 상태(상승/하락/횡보), 변동성 상태
4. `Derivatives` OI, Funding, L/S, 청산 편향
5. `Flow` 거래량 레짐, 순유입/순유출, 이상치
6. `Action` TRACK, QUICK TRADE, COPY TRADE

필드 정의:
| 필드 | 의미 | 트레이더 의사결정 |
|---|---|---|
| consensusDirection | 에이전트 집계 방향 | 참고 방향(최종 결정은 트레이더가 수행) |
| consensusConfidence | 집계 신뢰도(0-100) | 진입 강도/분할 여부 |
| disagreementScore | 에이전트 불일치 정도 | 확신 낮으면 보수적 진입 |
| entry/sl/tp | 추천 진입/손절/익절 | 주문 파라미터 즉시 적용 |
| rr | 보상/위험 비율 | 최소 기준(R:R 1.5+) 필터 |
| invalidation | 아이디어 무효화 가격 | 손절 자동화 기준 |
| regime | 추세+변동성 상태 | 추세추종/역추세 선택 |
| derivStress | 파생 과열 지수 | 과열 시 레버리지 축소 |

## 5. 멀티모달 AGENT CHAT 플로우

## 5.1 입력 모델 (TARGET)

```ts
type ChatInput = {
  text: string;
  mentions: string[]; // ["STRUCTURE", "DERIV"]
  attachments: {
    id: string;
    kind: 'image' | 'csv' | 'json' | 'note';
    url: string;
    mime: string;
  }[];
  context: {
    pair: string;
    timeframe: string;
    scanId?: string;
    selectedSignalIds?: string[];
  };
};
```

## 5.2 처리 체인 (TARGET)

1. 사용자 입력 -> `POST /api/chat/messages`
2. 첨부 파일이 있으면 사전 업로드 -> `POST /api/chat/uploads`
3. Orchestrator가 `context.scanId` 기반으로 최신 스캔/지표 참조
4. 응답 생성 후 `agent_chat_messages`에 저장
5. 응답 내 `actionIntent`가 있으면 후속 액션 실행 가능

## 5.3 후속 액션 매핑 (TARGET)

1. `TRACK_THIS_SIGNAL` -> `/api/signals/track`
2. `OPEN_QUICK_TRADE` -> `/api/quick-trades/open`
3. `PUBLISH_COPY_TRADE` -> `/api/copy-trades/publish`
4. `OPEN_ARENA_WITH_CONTEXT` -> `/arena?pair=...&timeframe=...`

## 5.4 현재 구현 (CURRENT)

1. Intel 입력은 텍스트 기반
2. 응답은 로컬 랜덤 응답 풀 기반
3. `/api/chat/messages` API는 존재하지만, Terminal UI는 아직 서버 저장/조회를 완전 사용하지 않음

## 6. 클릭 결과의 페이지 간 전파

| 사용자 액션 | 저장 위치 | 반영 화면 |
|---|---|---|
| Scan 완료 | CURRENT: localStorage, TARGET: `terminal_scan_runs` | Terminal 좌/우 |
| Track 클릭 | `tracked_signals`, `signal_actions` | Terminal, Signals, Passport |
| Quick Trade | `quick_trades` | Terminal Positions, Passport Positions |
| Copy Trade Publish | `copy_trade_runs`, `tracked_signals`, `quick_trades` | Signals, Terminal, Passport |
| Agent Chat 전송 | `agent_chat_messages` | Terminal Intel Chat |

## 7. FE/BE 책임 분리

## 7.1 FE 책임

1. 클릭 이벤트 수집과 즉시 피드백
2. 탭/패널/필터 상태 관리
3. 스캔 결과 렌더링과 액션 CTA 제공
4. optimistic update 후 실패 롤백

## 7.2 BE 책임

1. 스캔 결과 영속화와 이력 조회
2. 에이전트 분석 파이프라인 실행
3. 채팅 기록/첨부/액션 로그 저장
4. 사용자별 권한/세션/레이트리밋

## 8. 구현 순서 제안

1. `CURRENT` 플로우 문서 기준으로 QA 케이스 고정
2. Scan History 서버 저장 API 추가 (`scan runs`)
3. Intel 우측 6블록 UI 고정 템플릿 적용
4. Chat API 실제 연결 (`agent_chat_messages`)
5. 멀티모달 업로드/첨부 파이프라인 추가
6. 액션 인텐트 자동 실행(Track/Trade) 연결

## 9. 수용 기준

1. 스캔 10회 누적 후 새로고침해도 좌측 히스토리가 동일하게 복원된다.
2. 우측에서 스캔 근거(방향, 신뢰도, 리스크, 파생 데이터)를 1스크린에서 확인할 수 있다.
3. 채팅 입력에 현재 pair/timeframe/scanId 컨텍스트가 자동 포함된다.
4. 채팅 결과가 Track/QuickTrade/CopyTrade로 끊김 없이 이어진다.
5. Terminal, Signals, Passport 간 tracked/open-position 수치가 일치한다.
