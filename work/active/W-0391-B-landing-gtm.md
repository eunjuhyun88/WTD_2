# W-0391-B — Landing + GTM 퍼널 + analytics.ts

> Wave: 5 | Priority: P1 | Effort: M (2-3d)
> Charter: In-Scope
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Created: 2026-05-03

## Goal

Landing → Signup → First Analyze → First Verdict 퍼널 p50 ≤ 90초. analytics.ts 이벤트 P-01~P-10 전체 wire.

## Gap

- `app/src/routes/+page.svelte` (284줄): WebGL hero 있으나 live 지표 없음, CTA 미최적화
- analytics.ts: PRODUCT-DESIGN-PAGES-V2 설계됐으나 실제 파일 없음 (`grep -r "analytics" app/src/ --include="*.ts"` → 없음)
- Onboarding flow: 첫 진입 → cogochi → 첫 analyze 유도 UX 없음

## Scope

### Phase B1 — analytics.ts 신설 + 이벤트 wire (1d)
파일:
- `app/src/lib/analytics.ts` (신규)

```ts
export const track = (event: string, props?: Record<string, unknown>) => {
  // PostHog / Vercel Analytics 연동 (env에 따라 분기)
  if (typeof window === 'undefined') return;
  window.posthog?.capture(event, props);
};
```

이벤트 목록 (PRODUCT-DESIGN-PAGES-V2 §Analytics 기준):
```ts
page_view, cta_click, workmode_switch, rightpanel_tab_switch,
analyze_panel_view, verdict_submit, topbar_tf_switch,
dashboard_opportunity_click, pattern_to_cogochi_click,
pattern_share_click, passport_share_click, lab_feature_gate_hit,
verdict_submitted (deeplink), home_scroll_depth
```

### Phase B2 — Landing 강화 (1d)
파일: `app/src/routes/+page.svelte`

추가 항목:
- Live 지표 strip (30s poll): accuracy%, verdict count, active traders
  - endpoint: `/api/stats/live` (신규 또는 기존 `/api/stats` 재사용)
- CTA 2개 명확화: "무료로 시작" → `/cogochi` + "패턴 라이브러리" → `/patterns`
- OG/SEO meta: `<title>Cogochi — 패턴 검증 트레이딩 OS</title>`, og:image 동적

### Phase B3 — Onboarding First-Run (1d)
파일:
- `app/src/lib/shared/OnboardingBanner.svelte` (신규)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (배너 마운트)

진입 조건: `localStorage.getItem('onboarding.v1')` 없을 때
```
┌─ 첫 방문 안내 ────────────────────────────────────┐
│  1. 심볼 선택 (j/k 또는 클릭)                      │
│  2. ⌘K로 분석 시작                                 │
│  3. Verdict 제출 → 정확도 축적                      │
│                                [시작하기] [닫기]   │
└──────────────────────────────────────────────────┘
```
- 완료 시 `localStorage.setItem('onboarding.v1', 'done')` + track('onboarding_complete')
- 강제 아님 — 닫기 가능

## Non-Goals

- A/B 테스트 플랫폼 구축
- 이메일 onboarding 시퀀스
- PostHog 대시보드 설정 (에이전트 범위 밖)

## Exit Criteria

- [ ] AC1: `app/src/lib/analytics.ts` 존재 + `track` export 확인
- [ ] AC2: `grep -r "track(" app/src/routes --include="*.svelte" | wc -l` ≥ 10 (주요 페이지 이벤트)
- [ ] AC3: Landing `/` live stats 노출 확인 (dev server screenshot)
- [ ] AC4: OnboardingBanner `localStorage.onboarding.v1` 없을 때 렌더 확인
- [ ] AC5: `<title>` og:image meta 존재 (`grep -n "og:image" app/src/routes/+layout.svelte`)
- [ ] CI green, svelte-check 0 errors

## Files Touched (stream-exclusive)

```
app/src/lib/analytics.ts  (신규)
app/src/routes/+page.svelte
app/src/routes/+layout.svelte  (meta 추가)
app/src/lib/shared/OnboardingBanner.svelte  (신규)
app/src/lib/hubs/terminal/TerminalHub.svelte  (배너 마운트 1줄)
app/src/routes/api/stats/live/+server.ts  (신규 또는 기존 재사용)
```
