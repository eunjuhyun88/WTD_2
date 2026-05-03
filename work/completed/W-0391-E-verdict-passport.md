# W-0391-E — Verdict 모바일 스와이프 + Passport 공유 URL

> Wave: 5 | Priority: P2 | Effort: M (2-3d)
> Charter: In-Scope
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Created: 2026-05-03

## Goal

Verdict 딥링크에서 모바일 스와이프 제스처로 agree/disagree 제출. Passport 공개 URL `/passport/[username]` 공유 가능.

## Scope

### Phase E1 — Verdict 스와이프 (1d)
파일: `app/src/routes/verdict/[token]/+page.svelte`

현황: 243줄, 버튼 only (agree/disagree)

추가:
```
모바일 좌/우 스와이프:
  → swipeLeft  = disagree
  → swipeRight = agree
  threshold: 80px, velocity: 0.3px/ms
```

구현: touch event (pointerdown/pointermove/pointerup) — 의존성 없이 native
- 스와이프 중 visual feedback: 카드 기울기 (transform: rotate(-3deg) to +3deg)
- agree: green flash, disagree: red flash
- 완료 카드: "cogochi에서 더 분석하기 →" CTA

### Phase E2 — Passport 공개 URL (1-2d)
파일:
- `app/src/routes/passport/[username]/+page.svelte` (신규)
- `app/src/routes/passport/[username]/+page.ts` (신규)
- `engine/api/routes/passport.py` — `GET /api/passport/[username]` (공개 stats)

공개 데이터:
```
@username  accuracy 67.3%  verdict 203개  연속 12일 🔥
최강 패턴: bull_flag 89%
배지: [7일 연속] [첫 50 verdict] [정확도 70%+]
```

공개/비공개 toggle: settings에서 (기본 공개)
비로그인 방문 → "나도 만들기 →" CTA

OG Card (SSR):
```html
<meta property="og:title" content="@username — Cogochi 트레이더">
<meta property="og:description" content="정확도 67.3% · verdict 203개">
<meta property="og:image" content="/api/og/passport/[username]">
```

`/api/og/passport/[username]`: sveltekit endpoint → html→canvas (satori 또는 @vercel/og)

## Non-Goals

- 실시간 verdict 알림
- 팔로우/소셜 기능
- 리더보드

## Open Questions

- [ ] **OQ-5**: Public verdict URL — Free 유저도 공개 가능? (현재 가정: 공개)
- [ ] **OQ-satori**: satori vs @vercel/og OG image 생성 — 번들 크기 고려 (satori ~40KB gzip)

## Exit Criteria

- [ ] AC1: Verdict 스와이프 80px 이상 시 제출 동작 확인 (모바일 viewport)
- [ ] AC2: 스와이프 visual feedback (rotate transform) CSS 존재
- [ ] AC3: `/passport/[username]` SSR 200 응답
- [ ] AC4: OG meta `og:image` URL 응답 200
- [ ] AC5: 비로그인 방문 시 CTA 렌더
- [ ] CI green

## Files Touched (stream-exclusive)

```
app/src/routes/verdict/[token]/+page.svelte  (스와이프 추가)
app/src/routes/passport/[username]/+page.svelte  (신규)
app/src/routes/passport/[username]/+page.ts  (신규)
app/src/routes/api/og/passport/[username]/+server.ts  (신규)
engine/api/routes/passport.py  (공개 endpoint)
```
