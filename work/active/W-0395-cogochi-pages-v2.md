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

## Next Steps
1. Phase 0: GA4 + Sentry baseline 수집 (1주)
2. Phase 1: /cogochi 개편
3. 이후 Phase 2-7 순서대로

## Handoff Checklist
- [ ] Phase 0 baseline 측정 완료
- [ ] 설계 보강 → 각 Phase별 AC 수치 확정
