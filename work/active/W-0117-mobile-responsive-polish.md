# W-0117 Mobile Responsive — Cogochi 실사용 버그 수정

## Goal

모바일에서 Cogochi 터미널이 실제로 동작하도록 수정. 탭 전환/TF·심볼 변경/AI 접근/페이지 이동 — 4가지 핵심 흐름이 모두 막혀있음.

## Owner

app

---

## 현황 (2026-04-21 조사)

| # | 심각도 | 파일:라인 | 버그 |
|---|--------|-----------|------|
| 1 | **P0** | TradeMode.svelte:293–296 | CHART 탭 없음 — ANL/SCAN/JUDGE만 있어서 한번 탭 전환하면 차트로 못 돌아옴 |
| 2 | **P0** | mobileMode.ts:12 vs AppShell.svelte:111 | store 타입 `'detail'` vs AppShell이 실제 쓰는 `'analyze'` 미스매치 |
| 3 | **P0** | AppShell.svelte:94–114 | mobileTF / mobileSymbol → TradeMode 전달되지만 ChartBoard까지 반응형으로 연결 안 됨 확인 필요 |
| 4 | **P1** | AppShell.svelte / +layout.svelte | Cogochi 모바일에서 다른 페이지로 이동할 방법 없음 (MobileBottomNav 숨김, footer는 24px 상태 텍스트만) |
| 5 | **P1** | AppShell.svelte:255–268 | AI 시트 `position:fixed, bottom:0, height:52%` — safe-area-inset-bottom 없음 |
| 6 | **P1** | TradeMode.svelte:2267–2276 | `.mobile-panel` padding-bottom safe-area 없음, 컨텐츠 잘림 |
| 7 | **P1** | TradeMode.svelte:317–319 | analyzeData 없을 때 힌트 텍스트 거의 안 보임 |
| 8 | **P2** | TradeMode.svelte:165–171 | scanCandidates 하드코딩 더미 데이터 (LDO/INJ/FET…) |
| 9 | **P2** | TradeMode.svelte:2248–2265 | `.mts-tab` white-space:nowrap 없음, 좁은 폰에서 탭 레이블 줄바꿈 |
| 10 | **P2** | TradeMode.svelte:330–354 | JUDGE 탭 버튼 375px 이하에서 레이아웃 깨짐 |

---

## Scope

### Slice A — P0 탭·스토어 수정 (핵심, ~60줄)

**A1. CHART 탭 추가** (`TradeMode.svelte`)
```svelte
<!-- mobile-tab-strip에 01 CHART 추가 -->
<button class="mts-tab" class:active={mobileView === 'chart'}
  onclick={() => mobileView = 'chart'}>01 CHART</button>
<button class="mts-tab" class:active={mobileView === 'analyze'}
  onclick={() => mobileView = 'analyze'}>02 ANL</button>
...
```
- CHART 탭 활성 시 `.mobile-chart-section` 전체 표시, panel 숨김
- 다른 탭 활성 시 chart는 접기 (height: 80px thumbnail) or 숨기기

**A2. mobileMode store 타입 정정** (`mobileMode.ts`)
```ts
// 'detail' → 'analyze' 로 통일 (AppShell 실사용 기준)
type MobileMode = 'chart' | 'analyze' | 'scan' | 'judge';
```

**A3. mobileTF/mobileSymbol 체인 검증 + 수정** (`AppShell.svelte` → `TradeMode.svelte` → `ChartBoard`)
- AppShell: `mobileTF`, `mobileSymbol` state 선언 ✓
- TradeMode props로 전달 ✓ — 내부에서 ChartBoard/CenterPanel까지 실제 전달되는지 추적
- 끊긴 지점 수정

### Slice B — P1 페이지 이동 (중요, ~40줄)

**B1. Cogochi 내 모바일 페이지 이동**

옵션 2가지:
- **Option A**: AppShell `mobile-footer`를 `mobile-nav-footer`로 교체 — 24px 상태텍스트 대신 Home/Lab/Dashboard 3개 텍스트 링크 (56px)
- **Option B**: MobileTopBar 좌측에 `←` 홈 아이콘 버튼 추가

→ **Option A 선택** (footer 공간 활용, W-0078 4-mode 탭바 패턴과 충돌 없음)

```svelte
<!-- AppShell mobile-footer 교체 -->
<div class="mobile-nav-footer">
  <a href="/">HOME</a>
  <a href="/lab">LAB</a>
  <a href="/dashboard">DASHBOARD</a>
  <span class="mf-status">{statusText}</span>
</div>
```

**B2. +layout.svelte `$isTerminal` 조건 재확인**
- 현재: `pathname.startsWith('/terminal') || pathname.startsWith('/cogochi')`
- MobileBottomNav가 cogochi에서 안 보이는 건 의도적 — 수정 불필요
- 단, `/lab`, `/dashboard`, `/market` 페이지들이 실제로 존재하고 라우트 작동하는지 확인

### Slice C — P1/P2 Safe Area + 폴리시 (~50줄)

**C1. safe-area-inset-bottom** (`AppShell.svelte`, `TradeMode.svelte`)
```css
.mobile-ai-sheet {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.mobile-panel {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
}
.mobile-nav-footer {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

**C2. 탭 레이블 nowrap** (`TradeMode.svelte`)
```css
.mts-tab { white-space: nowrap; flex: 1; }
```

**C3. analyzeData 없을 때 힌트 가시성 개선**
- 현재 작은 텍스트 → 뱃지 스타일 or 상단 배너로 위치 조정

---

## Non-Goals

- W-0087 tablet 2-column shell (별도 슬라이스)
- MobileHomeHero 연결
- swipe 제스처 (W-0087 Phase 5b)
- scanCandidates 실 데이터 연결 (엔진 API 의존)
- JUDGE 탭 완전 재설계

## Canonical Files

- `app/src/lib/cogochi/AppShell.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/stores/mobileMode.ts`
- `app/src/routes/+layout.svelte`
- `app/src/components/layout/MobileBottomNav.svelte`

## Facts

- `/cogochi`에서 MobileBottomNav는 의도적으로 숨김 (`!$isTerminal`) — 바꾸지 않음
- `mobileMode.ts` 타입이 `'detail'`인데 AppShell은 `'analyze'`를 실제 사용 — 미스매치 확인됨
- TradeMode tab strip에 `01 CHART` 탭 없음 — 차트로 돌아가는 경로 없음 확인됨
- mobile-footer는 24px 상태 텍스트 전용, 페이지 이동 불가 확인됨
- preview 환경은 인증 없이 `/cogochi` → `/` 리다이렉트 → 실기기 테스트 필요

## Assumptions

- ChartBoard까지 mobileTF/mobileSymbol 전달 체인은 중간에 끊겼을 가능성 있음 — Slice A3에서 추적
- `/lab`, `/dashboard` 라우트는 실제로 존재하는 것으로 가정 (dashboard가 auth 없이 `/` 리다이렉트 되는 것은 auth guard 동작)

## Open Questions

- CHART 탭 활성 시 panel을 완전히 숨길지, 80px 썸네일로 접을지? → 완전히 숨기는 게 차트 가시성 극대화
- mobile-footer를 nav로 교체할 때 스캐너 상태 텍스트는 어디에 표시할지? → MobileTopBar에 인라인

## Decisions

- **탭 순서**: 01 CHART → 02 ANL → 03 SCAN → 04 JUDGE (CHART 탭 맨 앞에 추가)
- **CHART 탭 활성**: chart section full height, panel display:none
- **다른 탭 활성**: chart section display:none (화면 공간 최대 확보), panel full height
- **mobileMode 타입**: `'analyze'` 통일 (store 수정, AppShell 변경 없음)
- **Slice 순서**: A → B → C (P0 먼저)

## Exit Criteria

- [ ] CHART 탭 탭 → 차트 전체 표시, ANL/SCAN/JUDGE 탭 탭 → 패널 전체 표시
- [ ] TF 변경 (4h→1d) → 차트 TF 실제 반영
- [ ] Symbol 변경 → 차트 심볼 실제 반영
- [ ] 모바일에서 HOME/LAB/DASHBOARD 링크로 페이지 이동 가능
- [ ] iOS: AI 시트 + mobile-panel 하단이 홈 인디케이터에 가려지지 않음
- [ ] 375px 이하: 탭 레이블 줄바꿈 없음
- [ ] `pnpm check` 타입 에러 없음

## Handoff Checklist

- 구현 시작 전: `AppShell.svelte` + `TradeMode.svelte` + `mobileMode.ts` 전체 읽기
- Slice A3: mobileTF prop이 AppShell → TradeMode → ChartBoard(or CenterPanel) 어디서 끊기는지 추적
- 실 디바이스 테스트 불가 시 Chrome DevTools 375×812 기준으로 검증
