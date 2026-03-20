# Terminal UIUX Optimization V2 (2026-03-06)

## 1) 목표
- 한 번에 이해: 현재 방향/신뢰도/액션을 3초 안에 파악
- 바로 실행: 사용자가 다음 행동(스캔/차트적용/트레이드)을 1클릭으로 수행
- 신뢰 유지: 데이터 실패 시에도 화면이 비지 않게 fallback 제공
- 밀도 최적화: 모바일/태블릿/데스크톱에서 핵심 정보 가시량 최대화

## 2) 핵심 UX 원칙
- Single Source of Truth:
  - 방향 표시는 `DirectionBadge`로 통일
  - 합의 방향은 활성 스캔 데이터 기준으로만 계산
- Action First:
  - 각 패널 하단/헤더에 명확한 CTA 1순위 배치
  - “읽기”보다 “실행”이 먼저 보이게 구성
- Trustful Degradation:
  - API 오류 시 `blank` 금지, `demo/last-known/fallback` 중 하나를 표시
- Progressive Density:
  - 요약(상단) → 상세(중단) → 원본/로그(하단) 구조 고정

## 3) 패널별 상태 모델 (SSOT)
## WarRoom
- `idle`: scan 미실행
- `scanning`: 진행상태 + 중단 없는 피드백
- `ready`: 시그널 카드 + 상단 요약칩 + 하단 CTA
- `degraded`: 스캔 실패 시 마지막 성공 스캔 유지 + 재시도

## Chart
- `pre-scan`: 우상단 경량 CTA (`RUN FIRST SCAN`)
- `post-scan`: 액션 바(차트 적용/드로잉/트레이드)

## Intel / Positions
- `loading`: sync 상태 표시
- `ready`: 실데이터 렌더
- `error-with-live`: 기존 데이터 유지 + 오류 배너
- `error-empty`: demo fallback 자동 표시 (이번 반영)

## 4) 정보구조 (IA)
- 상단: 상태/방향/토큰/타임프레임
- 중단: 의사결정 데이터(시그널, 온체인, 트렌드)
- 하단: 행동(Apply to Chart, Copy Trade, Open Perp, Browse Markets)

## 5) GTM 이벤트 설계 (운영 기준)
- First impression:
  - `terminal_scan_request_shell`
  - `terminal_mobile_view`
- Activation:
  - `terminal_mobile_tab_change`
  - `showonchart` (WarRoom→Chart)
- Conversion proxy:
  - copy trade modal open
  - perp open action
- Reliability:
  - positions sync error 발생률
  - demo fallback 노출률/복구률

## 6) 품질 게이트
- UX:
  - 빈 화면 금지, 오류 시 대체 상태 노출
  - 방향 표기 컴포넌트 중복 금지
- 코드:
  - 패널별 상태 변수 명시 (`ready/error/demo`)
  - 중복 스타일은 공통 클래스로 통합
- 성능:
  - 불필요 overlay/animation 최소화
  - 스크롤 영역은 `min-height: 0` + 내부 스크롤 원칙 유지

## 7) 현 상태 점검
- 완료:
  - 방향 뱃지 공통화
  - WarRoom 요약칩 + CTA
  - Intel empty/error 친화 UI
  - On-chain 미니 게이지
  - 티커 하이라이트
  - 알림 벨 겹침 완화
  - Positions error-empty demo fallback
  - Decision Rail 추가: 상단에 Pair/TF + Consensus + Primary CTA + Density 토글 통합
  - Essential 모드에서 Intel 필터/트렌딩 탭 축소(핵심만 노출)
- 다음:
  - demo fallback을 “마지막 성공 스냅샷” 우선으로 확장
  - CTA 이벤트를 conversion funnel 대시보드에 연결
  - warning budget 정리(기존 전역 경고 47건)

## 8) 수용 기준 (Definition of Done)
- `npm run check` / `npm run build` 통과
- 모바일/태블릿/데스크톱에서 동일한 상태 모델 동작
- API 실패 시에도 최소 1개 이상의 actionable UI 노출
- 방향/신뢰도 표시 컴포넌트 일관성 유지 (`DirectionBadge`)
