# W-0227 — Chart Drag App UI

## Goal
차트 위에서 마우스 드래그로 구간을 선택하면 PatternDraft가 자동 생성되는 UI 제공.

## Owner
app

## Scope
- `app/src/lib/components/ChartRangeSelector.svelte` 신규 (드래그 오버레이)
- `app/src/routes/api/patterns/draft-from-range/+server.ts` 신규 프록시
- 기존 차트 컴포넌트에 ChartRangeSelector 통합
- PatternDraft 미리보기는 W-0226의 컴포넌트 재사용

## Non-Goals
- 실시간 드래그 중 feature 미리보기 (mouseup 후 1회 API 호출)
- 모바일 터치 드래그 (데스크탑 first)
- 다중 범위 선택

## Exit Criteria
- 차트 드래그 → 범위 하이라이트 표시
- mouseup → POST /patterns/draft-from-range → PatternDraft 미리보기 팝업
- 저장 버튼 → Capture 생성
- App CI 0 TS errors

## Facts
1. 엔진 `POST /patterns/draft-from-range` Wave 1에서 완료 (PR #372)
2. W-0226 PatternDraft 미리보기 컴포넌트 재사용 가능 (선행 조건)
3. 기존 차트 컴포넌트 파악 필요 (app/src/lib/cogochi/modes/ 또는 terminal)

## Assumptions
1. 선행: W-0226 (A-03-app) 완료 후 — 미리보기 컴포넌트 재사용
2. 차트 컴포넌트가 pixel → timestamp 변환 API 노출하는지 확인 필요

## Canonical Files
- `app/src/lib/components/ChartRangeSelector.svelte` (신규)
- `app/src/routes/api/patterns/draft-from-range/+server.ts` (신규)

## 성능 / 보안 설계
- **드래그 성능**: mousemove 이벤트 throttle 16ms (60fps)
- **API 호출**: mouseup 1회만 (드래그 중 호출 없음)
- **보안**: `+server.ts` session guard 필수
- **입력 검증**: `end_ts > start_ts`, 범위 ≤ 7일 zod 검증
