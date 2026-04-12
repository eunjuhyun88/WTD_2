# Community Flow Redesign: Chart Opinion -> Signal -> Copy Trade

작성일: 2026-03-06  
범위: `terminal` 차트 액션 기반 커뮤니티 시그널 생성 플로우 개선

## 1) 문제 정의

현재는 차트에서 사용자가 LONG/SHORT 관점을 즉시 커뮤니티 시그널로 발행하고, 그 시그널을 카피트레이드로 이어가는 단일 플로우가 약하다.  
결과적으로 사용자는 `차트 해석`, `커뮤니티 공유`, `실행(Copy Trade)` 사이를 수동으로 오가야 한다.

## 2) 근거 문서(기존 설계/감사)

1. `docs/references/active/click-backend-navigation-audit.md`
   - 커뮤니티 반응/액티비티 연동 필요 항목 존재
2. `docs/STRUCTURE_ALIGNMENT_ACTION_PLAN.md`
   - mock -> community 실데이터 전환 지시
3. `docs/references/active/structure-mismatch-audit-latest.md`
   - 커뮤니티 데이터 잔존 mock 이슈
4. `docs/references/active/schema-redesign-analysis.md`
   - activity/community 반응 이벤트 영속화 방향

## 3) 목표 UX 플로우

1. 사용자가 차트에서 `LONG VIEW` 또는 `SHORT VIEW` 버튼 클릭
2. 시스템이 시그널 초안 생성
   - pair, dir, entry, tp, sl, confidence, reason
3. 시그널을 즉시 3곳에 반영
   - `trackedSignalStore`: 추적 시그널 생성
   - `communityStore`: 커뮤니티 포스트 생성
   - `copyTradeStore`: Copy Trade 모달 오픈
4. 사용자는 모달에서 최종 수정 후 발행

## 4) 데이터 플로우

1. `ChartPanel` 이벤트 발행: `communitysignal`
2. `routes/terminal/+page.svelte`가 이벤트 수신 후 orchestration
   - `trackSignal(...)`
   - `addCommunityPost(...)`
   - `copyTradeStore.openFromSignal(...)`
3. UI 피드백
   - 차트 notice
   - chat/system 메시지

## 5) 경계 조건

1. 실시간 가격 없음: 이벤트 생성 차단 + notice 표시
2. 비정상 가격(tp/sl 역전): 최소 리스크 규칙으로 보정
3. 커뮤니티 API 실패: local optimistic 포스트 유지(기존 store 동작)
4. Copy Trade 모달 오픈 실패 시에도 tracked/community 기록은 유지

## 6) 구현 범위

1. `src/components/arena/ChartPanel.svelte`
   - `communitysignal` dispatcher 타입 추가
   - LONG/SHORT 관점 버튼 추가
   - 시그널 payload 생성 로직 추가
2. `src/routes/terminal/+page.svelte`
   - `handleChartCommunitySignal` 추가
   - 모바일/태블릿/데스크톱 ChartPanel에 이벤트 핸들러 연결
3. `CLAUDE.md` 규칙 강화
   - 설계 우선 프로토콜 명시

## 7) 수용 기준 (DoD)

1. 차트에서 `LONG VIEW`/`SHORT VIEW` 클릭 시 Copy Trade 모달이 열린다.
2. 같은 액션으로 tracked signal이 1개 생성된다.
3. 같은 액션으로 community 피드에 포스트가 1개 생성된다.
4. 모바일/태블릿/데스크톱 모두 동일하게 동작한다.
5. `npm run check`와 `npm run build`가 통과한다.

