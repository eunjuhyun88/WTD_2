---
id: W-0353
title: composite_score render in IntelPanel + VerdictInbox
status: design
wave: 5
priority: P1
effort: S
owner: app
issue: "#763"
created: 2026-04-30
---

# W-0353 — composite_score render in IntelPanel + VerdictInbox

> Wave: 5 | Priority: P1 | Effort: S
> Owner: app
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 IntelPanel pick과 VerdictInbox capture 양쪽에서 patternscan composite_score (CVD/funding/OI/HTF 합산 정규화 점수)를 한 번에 보고 setup 강도를 즉시 비교한다.

## Scope
### Files
- `app/src/components/terminal/IntelPanel.svelte` — pick-card 영역 (1234~1246행 근방)에 `composite_score` 게이지 (0~1 → bar) 추가. 기존 totalScore (0~100 momentum 합)와 시각적으로 분리 (다른 색)
- `app/src/components/terminal/peek/VerdictInboxPanel.svelte` — capture row에 composite_score 작은 chip 추가 (snapshot 시점 값)
- `app/src/lib/engine/cogochiTypes.ts` — `SignalSnapshot.compositeScore`(camelCase, 20행 기존 존재) 활용 또는 별도 OpportunityScore.composite_score 필드 (snake_case) 매핑 명시. 둘이 다른 개념이므로 컨벤션 정리 주석 추가
- `app/src/lib/engine/opportunityScanner.ts` — `OpportunityScore` interface에 `composite_score: number | null` 추가 (engine 응답 직렬화 후 매핑)
- `engine/api/schemas_opportunity.py` — `OpportunityScore`에 `composite_score: float | None` 추가 (W-0350과 동시 머지 시 충돌 방지 위해 PR 순서 명시)
- `engine/api/routes/opportunity.py` — scanner DataFrame에서 `composite_score` 컬럼 (이미 존재 가정, 미존재 시 W-0350 PR과 통합)

### API Changes
- `GET /opportunity/run` 응답 `OpportunityScore`에 `composite_score: float | None` 추가

### Schema Changes
- Pydantic 1 필드 추가
- DB 변경 없음

## Non-Goals
- composite_score 계산 로직 변경
- VerdictInbox 정렬 기준 변경
- W-0350 sector/mtf 필드와의 결합 ranking (별도)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| W-0350과 PR 충돌 (같은 파일 4개) | H | M | W-0350 머지 직후 W-0353 rebase, 또는 W-0350 PR에 합치기 (final 결정은 구현 시점) |
| composite_score 의미 모호 (Doctrine vs Opportunity) | M | M | 코드 코멘트 + Storybook 문서화 |
| capture snapshot의 composite_score가 null 다수 (구버전 데이터) | H | L | null일 때 chip 미렌더 (조건부) |
| 시각적 클러터 (이미 chip 많음) | M | M | progressive disclosure: hover 시만 상세 |

### Dependencies
- W-0350 (sector API surface) — 같은 schema 파일을 건드리므로 머지 순서 합의 필요

### Rollback
- frontend revert만으로 UI 사라짐, backend는 backward compatible

## AI Researcher 관점

### Data Impact
- 사용자가 composite_score를 보고 verdict를 누를 때 인지 편향 발생 가능 (label leakage 우려)
- 단, 학습 데이터는 verdict 자체이므로 영향 미미. capture timestamp 시점 값 기록만 보존하면 분석 가능

### Statistical Validation
- A/B: composite_score 노출 (treatment) vs 미노출 (control) 그룹의 verdict 분포 차이 측정
- 가설: 노출 시 valid 비율 ≥ 5pp 증가 (정확한 setup 식별), invalid 비율 감소

### Failure Modes
- snapshot 당시 composite_score가 nan → null fallback
- 0~1 범위 외 값 (range error) → clamp to [0, 1] + warn log
- color scale이 colorblind 사용자에게 분간 안 됨 → 텍스트 % 병기

## Implementation Plan
1. engine: `OpportunityScore.composite_score: float | None` 추가 (W-0350과 같은 PR 가능성)
2. app: `OpportunityScore` ts interface 1 필드 추가
3. app: IntelPanel pick-card에 composite_score 게이지 추가 (기존 stat-bar 컴포넌트 재사용)
4. app: VerdictInboxPanel capture row에 composite_score chip 추가
5. visual snapshot test 갱신

## Exit Criteria
- [ ] AC1: IntelPanel pick-card에 composite_score 게이지 100% 렌더 (n=10 코인 fixture, null은 placeholder)
- [ ] AC2: VerdictInboxPanel section 2 (REVIEW)에 composite_score chip 표시 (null 제외)
- [ ] AC3: composite_score 표시 값이 engine 응답과 일치 (rounding 소수점 2자리)
- [ ] AC4: 색맹 시뮬레이션에서 게이지 구분 가능 (텍스트 병기)
- [ ] CI green (pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
