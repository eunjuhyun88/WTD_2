# W-0234 — F-3: Telegram → Verdict deep link (L7 Refinement)

> Wave 4 P1 | Owner: app + engine | Branch: `feat/F3-telegram-verdict-deeplink`
> **선행 조건: 없음. W-0233과 병렬 가능.**

---

## Goal

Telegram 알림에 포함된 패턴 캡처 링크를 클릭하면 앱에서 즉시 VerdictInbox로 이동,
`user_verdict` 를 5-cat 버튼으로 입력할 수 있도록 deep link 경로 완성.

## Owner

app + engine

## Primary Change Type

feature (deep link routing + UI)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/verdict/[capture_id]/+page.svelte` | 신규 — deep link 착지 페이지 (VerdictInbox 단독 뷰) |
| `app/src/lib/components/terminal/peek/VerdictInboxPanel.svelte` | 변경 — standalone 모드 지원 (capture_id prop) |
| `engine/api/routes/captures.py` | 변경 — `GET /captures/{capture_id}` 인증 없이 preview 가능 여부 확인 |
| `engine/notifications/telegram_notifier.py` | 변경 — 알림 메시지에 `APP_ORIGIN/verdict/{capture_id}` URL 포함 |

## Non-Goals

- Telegram Bot 신규 구축 (기존 notifier 재사용)
- 자동 verdict 입력 (AI 제안은 Phase 2)
- 모바일 앱 / PWA (웹 기반만)

## Exit Criteria

- [ ] Telegram 알림 메시지에 deep link URL 포함 확인
- [ ] `APP_ORIGIN/verdict/{capture_id}` 접근 시 VerdictInbox 렌더링
- [ ] 5-cat 버튼 클릭 → `PATCH /outcomes/{id}/verdict` 호출 → DB 저장 확인
- [ ] 비인증 접근 시 로그인 redirect (Supabase Auth)
- [ ] App CI ✅, Engine Tests ✅

## Facts

1. `engine/notifications/telegram_notifier.py` — 기존 알림 전송 코드 존재.
2. `VerdictInboxPanel.svelte` — 현재 terminal peek 내부에만 존재, standalone 미지원.
3. `PATCH /outcomes/{id}/verdict` — H-08 PR #377에서 구현 완료 (user_verdict 업데이트).
4. `APP_ORIGIN` env var — `engine/api/config.py` 또는 `.env`에 설정 필요.
5. Supabase Auth — app에 이미 구현. 비인증 redirect 패턴 존재.

## Assumptions

1. `APP_ORIGIN` env var 설정됨 (GCP 배포 시 `https://cogochi.app`).
2. Telegram Bot Token 이미 운영 환경에 설정됨.
3. capture_id는 UUID 형식 (URL-safe).

## Canonical Files

- `app/src/routes/verdict/[capture_id]/+page.svelte` (신규)
- `app/src/lib/components/terminal/peek/VerdictInboxPanel.svelte`
- `engine/notifications/telegram_notifier.py`
- `engine/api/routes/captures.py`

## Decisions

- **인증**: deep link 접근 시 Supabase Auth 필요 — 비인증 → 로그인 후 redirect back
- **URL 형식**: `{APP_ORIGIN}/verdict/{capture_id}` (단순, bookmarkable)
- **standalone 모드**: VerdictInboxPanel에 `standalone` prop 추가 (기존 terminal 뷰 유지)

## Next Steps

1. `telegram_notifier.py` deep link 추가 (1줄)
2. `app/src/routes/verdict/[capture_id]/` 신규 라우트 생성
3. VerdictInboxPanel standalone 모드 지원
4. App CI + 수동 E2E 테스트 (Telegram → 앱)

## Handoff Checklist

- [ ] `engine/notifications/telegram_notifier.py` 현재 알림 포맷 파악
- [ ] `VerdictInboxPanel.svelte` props 파악
- [ ] `APP_ORIGIN` env var 설정 여부 확인
- [ ] `PATCH /outcomes/{id}/verdict` API 스펙 확인 (PR #377)
