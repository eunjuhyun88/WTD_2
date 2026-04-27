# W-0237 — F-4: Decision HUD (5-card)

> Wave 4 P0 | Owner: app | Branch: `feat/F4-decision-hud`
> **병렬 Stream B — W-0236(F-2)와 동시 진행 가능**

---

## Goal

패턴 진입 판단을 위한 5-card Decision HUD:
1. Pattern Status (현재 Phase + State Machine 상태)
2. Top Evidence (search 유사 캡처 top 3)
3. Risk (entry_p_win + threshold + btc_trend)
4. Next Transition (다음 Phase 조건)
5. Actions (Capture / Watch / Verdict)

## Owner

app

## Primary Change Type

feature (UI)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/lib/components/terminal/hud/DecisionHUD.svelte` | 신규 — 5-card HUD wrapper |
| `app/src/lib/components/terminal/hud/PatternStatusCard.svelte` | 신규 — Phase + state |
| `app/src/lib/components/terminal/hud/EvidenceCard.svelte` | 신규 — top 3 유사 캡처 |
| `app/src/lib/components/terminal/hud/RiskCard.svelte` | 신규 — ML score + threshold |
| `app/src/lib/components/terminal/hud/TransitionCard.svelte` | 신규 — next phase 조건 |
| `app/src/lib/components/terminal/hud/ActionsCard.svelte` | 신규 — Capture/Watch/Verdict |
| `app/src/routes/api/terminal/hud/+server.ts` | 신규 — HUD data aggregation endpoint |

## Non-Goals

- 실시간 HUD 자동 갱신 (polling 1분 주기면 충분)
- 모바일 최적화 (데스크톱 우선)
- HUD 커스터마이징

## Exit Criteria

- [ ] 5개 카드 렌더링 (Pattern Status / Evidence / Risk / Transition / Actions)
- [ ] `GET /api/terminal/hud?capture_id=...` 응답에 5개 섹션 포함
- [ ] Actions 카드에서 Watch/Verdict 1-click 작동
- [ ] App CI ✅

## Facts

1. `engine/api/routes/captures.py` — capture 상태 조회 가능.
2. `engine/api/routes/search.py` — `/search/similar` 유사 캡처 조회.
3. H-08 (`/users/{user_id}/verdict-accuracy`) — accuracy 데이터 존재.
4. `entry_p_win`, `entry_threshold`, `entry_threshold_passed` — PatternOutcome에 존재.
5. Watch/Verdict API — D-03-app(PR #383), F-02-app(PR #381)에서 구현 완료.

## Assumptions

1. HUD는 capture_id 기준으로 조회.
2. Evidence = search/similar API top 3 결과 재사용.
3. HUD 데이터는 60초 TTL 클라이언트 캐시.

## Canonical Files

- `app/src/lib/components/terminal/hud/` (디렉토리 신규)
- `app/src/routes/api/terminal/hud/+server.ts`

## Decisions

- **5-card 레이아웃**: 2+3 grid (Status+Evidence 상단 / Risk+Transition+Actions 하단)
- **HUD 진입점**: terminal peek panel에서 캡처 선택 시 우측에 표시
- **데이터 집계**: app `api/terminal/hud/` → engine 3개 route fan-out

## Next Steps

1. `GET /api/terminal/hud?capture_id=` 응답 스키마 설계
2. engine fan-out (capture + search/similar top3 + verdict-accuracy)
3. 5개 카드 컴포넌트 작성
4. terminal에 HUD 통합

## Open Questions

- **Q1**: HUD 데이터 집계를 app BFF fan-out으로 할지 engine 단일 endpoint로 할지?
- **Q2**: Evidence card에서 유사 캡처 클릭 시 새 탭 vs 동일 terminal 내 이동?

## Handoff Checklist

- [ ] `engine/api/routes/captures.py` GET capture 스키마 확인
- [ ] `engine/api/routes/search.py` similar 응답 확인
- [ ] terminal peek 현재 레이아웃 파악 (HUD 삽입 위치)
