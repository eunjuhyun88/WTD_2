---
name: Core Loop Flywheel 완성 체크포인트 (2026-04-21)
description: 터미널 코어루프 감사 + Verdict Inbox(axis 3) + Refinement API(axis 4) 구현 완료 — PR #146
type: project
originSessionId: dc8e1123-05ee-46ad-bcd8-293ffa62b4ea
---
코어루프 전체 감사 후 flywheel axis 3-4 구현 완료.

**Why:** SCAN→CAPTURE는 작동했지만 ANALYZE→LEARN 루프가 미완성이라 제품이 학습하지 못했음.

## 감사 결과 (실제 상태)

| 단계 | 상태 |
|------|------|
| SCAN (PatternStateMachine) | ✅ engine_alerts → Supabase |
| JUDGE (block evaluator) | ✅ |
| CAPTURE (Save Setup dual-write) | ✅ |
| ANALYZE (cogochi/analyze) | ✅ |
| live_signals → live_monitor.py | ✅ 이미 연결됨 |
| Verdict Inbox (axis 3) | ✅ **이번에 완성** |
| Refinement API (axis 4) | ✅ **이번에 완성** |

## 이번 세션 구현 (PR #146, commit 06ac0014)

- `app/src/routes/api/captures/outcomes/+server.ts` — engine 프록시
- `app/src/routes/api/captures/[id]/verdict/+server.ts` — engine 프록시
- `app/src/components/terminal/peek/VerdictInboxPanel.svelte` — 판정 UI
- PeekDrawer REVIEW 탭 (키 `4`) + reviewCount 뱃지
- `engine/api/routes/refinement.py` — 4개 엔드포인트
  - `/refinement/stats` — 전 패턴 EV/승률/decay
  - `/refinement/stats/{slug}` — 단일 패턴 상세
  - `/refinement/suggestions` — 자동 임계값 개선 제안
  - `/refinement/leaderboard` — EV 기준 패턴 랭킹

## 다음 우선순위

1. **Refinement UI** — `/lab` 또는 dashboard에 leaderboard + suggestions 표시
2. **engine_alerts 테이블 실데이터 확인** — GCP 엔진에서 scanner가 실제로 쓰고 있는지 검증
3. **outcome_resolver 검증** — pending_outcome → outcome_ready 전환이 GCP에서 작동하는지
4. **Live signals UX 개선** — RightRailPanel의 liveSignals 표시 방식 개선

**How to apply:** PR #146 머지 후 Refinement UI 설계부터. engine_alerts 데이터 확인은 Supabase 직접 쿼리.
