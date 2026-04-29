# W-0309 — F-4: Decision HUD 실제 데이터 연결 (Mock → Live)

> Wave 4 P1 | Owner: app | Branch: `feat/W-0309-f4-hud-wiring`
> **D4 lock-in: 5-card Decision HUD (Pattern/Evidence/Risk/Next/Actions)**

---

## Goal

`/api/terminal/hud` 가 현재 mock 데이터 반환 → 실제 engine 엔드포인트에서 capture 당 Decision HUD 5-card 데이터를 받아 terminal Analyze 모드에 표시한다.
Jin 페르소나: "캡처하면 즉시 HUD에서 유사 패턴 + 진입 확률 + 다음 단계 조건을 본다."

## Owner

app (engine API는 이미 존재)

---

## CTO 설계

### 현재 상태
- `app/src/routes/api/terminal/hud/+server.ts` — GET, TODO 주석으로 mock 데이터 반환
- `app/src/lib/components/terminal/hud/DecisionHUD.svelte` — 5-card UI 완성
- `app/src/lib/components/terminal/hud/types.ts` — `HudPayload` 타입 완성
- Engine 엔드포인트 실측:
  - `GET /captures/{id}` → phase, state, `p_win` 포함 (`engine/api/routes/captures.py:651`)
  - `GET /patterns/transitions` → 최근 전이 데이터 (`engine/api/routes/patterns.py:421`)
- Terminal SplitPaneLayout rightPane: RightRailPanel 상단에 HUD 공간 있음 (PR #625)

### 데이터 흐름

```
terminal/+page.svelte (activeAnalysisData?.capture_id)
  ↓ capture_id 있을 때만 fetch
  ↓ GET /api/terminal/hud?capture_id=<uuid>
  ↓ HUD server: CLOUD_RUN_URL + /captures/{id} 호출
  ↓ HudPayload 반환
  → DecisionHUD.svelte (Analyze 모드 rightPane 상단)
```

### API 변경 계획

`app/src/routes/api/terminal/hud/+server.ts`:
1. capture_id 검증 (UUID 형식)
2. `CLOUD_RUN_URL + /captures/{id}` 호출 → `p_win`, `phase`, `state_label` 추출
3. `CLOUD_RUN_URL + /patterns/transitions?capture_id={id}` → transition 데이터
4. graceful degradation: engine 실패(5s timeout) → mock 데이터 반환

### Terminal 연결

`app/src/routes/terminal/+page.svelte`:
- `activeAnalysisData?.capture_id` watch → HUD fetch trigger
- rightPane 상단에 `{#if hudPayload}<DecisionHUD payload={hudPayload} />{/if}`
- 3초 polling (capture_id 변경 감지)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/api/terminal/hud/+server.ts` | 변경 — mock → engine 실제 호출 |
| `app/src/routes/terminal/+page.svelte` | 변경 — DecisionHUD Analyze 모드 rightPane 연결 |

## Non-Goals

- Engine 엔드포인트 변경 (기존 API 그대로 사용)
- HUD 카드 UI 변경 (이미 완성)
- Mobile HUD
- Real-time SSE (polling 충분)

## Exit Criteria

- [ ] `?capture_id=<uuid>` 조회 시 engine 실제 데이터 반환 (mock 아님)
- [ ] Terminal Analyze 모드 rightPane에 DecisionHUD 표시됨
- [ ] `p_win` 값이 Risk 카드에 정확히 노출됨
- [ ] Engine timeout(5s) 시 UI 깨지지 않음 (graceful degradation)
- [ ] capture_id 없을 때 HUD 숨김 (빈 화면 아님)
- [ ] `svelte-check` 0 errors

## Facts

```bash
grep -n "p_win\|phase\|state_label" engine/api/routes/captures.py | head -5
grep -n "TODO\|mock\|MOCK" app/src/routes/api/terminal/hud/+server.ts | head -10
grep -n "capture_id\|activeAnalysisData" app/src/routes/terminal/+page.svelte | head -10
echo "CLOUD_RUN_URL env var 확인:"
grep -rn "CLOUD_RUN_URL" app/src/ --include="*.ts" | head -3
```

## Canonical Files

- `app/src/routes/api/terminal/hud/+server.ts`
- `app/src/routes/terminal/+page.svelte`

## Assumptions

- `CLOUD_RUN_URL` env var이 설정되어 있다.
- Engine `GET /captures/{id}` 응답에 `p_win`, `phase`, `state_label` 필드가 존재한다.
- 3초 polling은 Analyze 모드 UX에 충분하다.

## Open Questions

- [ ] [Q-0309-1] `GET /patterns/transitions?capture_id=` 파라미터가 실제로 존재하는가?

## Decisions

- **engine 호출**: `CLOUD_RUN_URL` env var (기존 패턴)
- **HUD 위치**: rightPane 내부 상단 — `{#snippet rightPane()}` 안에 DecisionHUD 추가
- **polling**: 3초, capture_id change로 trigger
- **fallback**: engine 실패 시 mock 반환 (UX 깨짐 방지)

## Next Steps

1. `app/src/routes/api/terminal/hud/+server.ts` mock → engine 실제 호출로 교체
2. `app/src/routes/terminal/+page.svelte` Analyze 모드 rightPane에 DecisionHUD 연결
3. `svelte-check` + 브라우저 smoke test

## Handoff Checklist

- [ ] HUD server route engine 호출 확인
- [ ] Terminal Analyze 모드 DecisionHUD 노출 확인
- [ ] PR merged + CURRENT.md SHA 업데이트
