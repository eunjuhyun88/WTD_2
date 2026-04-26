# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines. 50 lines 넘으면 archive로 이전.
> 진행중 작업 = 자기 P0 자기가 maintain. 완료 = 다음 priority promotion.

---

## P0 — W-0132 Copy Trading Phase 1

**Owner**: 미할당
**Branch**: feat/w-0132-copy-trading-phase1
**Spec**: `work/active/W-next-design-20260426.md`

- Supabase migration 022 (trader_profiles, copy_subscriptions)
- engine/copy_trading/: leader_score.py, leaderboard.py, routes
- App: CopyTradingLeaderboard.svelte + 3개 API 라우트

Exit: GET /leaderboard 응답 + UI 렌더링 + CI pass

## P1 — W-0212 Chart UX Polish

**Owner**: 미할당
**Branch**: feat/w-0212-chart-ux-polish

- 패인 드래그 리사이즈 검증
- 크로스헤어 값 업데이트
- KPI 스파크라인 확인

Spec: `work/active/CURRENT.md`

---

## Frozen / Waiting

- PR #285 (W-0114 research compare) — stale branch라 재적용/종료 판단 필요
- 인프라 (사람 작업): GCP worker Cloud Build trigger, Vercel `EXCHANGE_ENCRYPTION_KEY`
