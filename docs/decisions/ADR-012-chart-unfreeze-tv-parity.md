# ADR-012: Chart UX Freeze 해제 — TradingView-style 기능 정확성 작업 허용

## Status

Accepted (2026-05-01)

## Context

`spec/CHARTER.md §Polish 동결`에 `Chart UX polish (chart.polish, W-0212류)`가 Frozen으로 등록됨.
원래 취지: W-0210/W-0211 머지로 충분한 시각 decoration 추가 금지 (야크쉐이빙 차단).

그러나 alpha 1-cycle 운영 중 다음 기능 정확성 문제가 확인됨:

1. **티커 전환 UI 부재**: `ChartPane.svelte:79` text input 방식 — 심볼 검색 드롭다운 없어 사용 불가
2. **지표 데이터 정확성**: CVD/OI/Funding 지표의 출처·계산 기준이 불명확. 알파테스터가 "지표가 정확하냐"를 신뢰하지 못함
3. **TradingView-style 레이아웃**: 정보 전달 구조 (캔들+하위 지표 패인 구조) 개선 필요 — 화려함이 아니라 정확한 자료 전달이 목표

사용자 판단: "화려하게 하는 거보다 정확한 자료 전달이 목표." — 이는 polish가 아닌 **데이터 신뢰성 문제**.

## Decision

`chart.polish` Frozen 항목을 **W-0374 범위에 한해 해제**:

- ✅ 허용: 심볼 검색 드롭다운 UI, 지표 데이터 출처 명시, 페인 레이아웃 정보 밀도 개선
- ✅ 허용: TradingView-style 구조적 개선 (기능 정확성 + 정보 전달 목적)
- ❌ 여전히 금지: 애니메이션/테마/색상 팔레트 개편 등 순수 시각 decoration
- ❌ 여전히 금지: TradingView 기능 완전 복제 (Pine Script editor, alerts, social features)

## Consequences

- `spec/CHARTER.md:73` 수정: `W-0212류` 한정 동결 → `순수 decoration 동결`로 범위 축소
- `spec/CHARTER.md:116` gate keyword: `chart.polish` → `chart.decoration`으로 변경
- W-0374 작업 완료 후 Charter 재검토
