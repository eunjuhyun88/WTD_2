# W-0395 — Cogochi Pages V2: 전면 UX 개편 (10 Pages)

> Wave: 6 | Priority: P0 | Effort: XL
> Charter: In-Scope (L1 Product UX)
> Issue: #955
> Status: 🟡 이슈 등록, 설계 보강 필요
> Created: 2026-05-03

## Goal
Cogochi 10개 사용자 표면을 단일 디자인 시스템·데이터 평면으로 정렬하여 D+1 activation ≥35%, Verdict P95 <3s, DAU 체류 +25% 달성.

## Owner
engine+app

## Scope
- 10 Pages: /cogochi, /patterns/search, /lab, /dashboard, /settings, /agent, /research/*, /passport/*, /cogochi/terminal, Landing
- 8-Phase 구현 (총 8주 예상)

## Non-Goals
- Copy Trading Phase 1+
- ORPO/DPO (GPU 필요)

## Exit Criteria
- [ ] AC1: D+1 activation ≥35% (GA4 기준, 1주 측정)
- [ ] AC2: Verdict submit P95 <3s (Sentry perf)
- [ ] AC3: DAU 체류 +25% (GA4 세션 시간)
- [ ] AC4: CI green (App + Engine + Contract)

## Facts
- Issue: #955 — see gh issue view 955 for full 8-phase breakdown
- Baseline 수집: Phase 0 (GA4 + Sentry 1주)

## Canonical Files
- app/src/routes/ (각 페이지 route 파일)
- app/src/lib/hubs/ (hub 컴포넌트)
- app/src/components/ (공유 컴포넌트)

## Assumptions
- GA4 + Sentry 이미 설치됨 (W-A108 기준)
- 기존 10개 페이지 라우트 유지, 리다이렉트 없음
- 디자인 시스템 CSS 변수는 W-0389 기준 유지

## Decisions
- **[D-1]** 8-Phase 순차 구현: 페이지별 독립 PR. 이유: XL 범위 → 단계별 CI 검증.
- **[D-2]** Phase 0 baseline 먼저: 수치 없는 UX 개편은 검증 불가.

## Open Questions
- [ ] [Q-1] Phase별 세부 AC 수치 (GA4 D+1 activation 현재 baseline)
- [ ] [Q-2] /research/*, /passport/* 하위 라우트 전체 목록 확인
- [ ] [Q-3] 디자인 목업 존재 여부 (PRODUCT-DESIGN-PAGES-V2.md 참고)

## Next Steps
1. Phase 0: GA4 + Sentry baseline 수집 (1주)
2. Phase 1: /cogochi 개편
3. 이후 Phase 2-7 순서대로

## Handoff Checklist
- [ ] Phase 0 baseline 측정 완료
- [ ] 설계 보강 → 각 Phase별 AC 수치 확정
