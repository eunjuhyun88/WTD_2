# W-0239 — F-13: Telegram Bot 연결 UI (6자리 코드 인증)

> Wave 4 P1 | Owner: app + engine | Branch: `feat/F13-telegram-bot-connect`
> **병렬 Stream C — W-0234(F-3 deep link)와 순서 무관 (독립적)**
> **선행 조건: W-0234 F-3 deep link 완료 권장 (Bot connect → alert 전송 → deep link 검증 순서)**

---

## Goal

사용자가 Telegram Bot을 앱에 연결하는 UI. 현재 사용자가 `.env`에 Chat ID를 직접 넣어야 함.
6자리 코드 방식으로 셀프서비스 연결:
1. 앱에서 코드 생성 (`/api/notifications/telegram/connect`)
2. 사용자가 Telegram Bot에 `/connect {code}` 전송
3. Bot이 chat_id 확인 → 서버에 등록

## Owner

app + engine (경량 webhook 처리)

---

## CTO 설계

### 플로우

```
[앱 UI]
  ↓ 클릭 "Telegram 연결"
  ↓ POST /api/notifications/telegram/connect
  ← {code: "A1B2C3", expires_in: 600}
  ↓ 화면에 코드 표시

[사용자]
  → Telegram 앱 열기
  → @cogochi_bot 에 "/connect A1B2C3" 전송

[Bot webhook]
  ← Telegram이 POST /api/telegram/webhook 전송
  ↓ code 검증 → user_id 매핑 → chat_id 저장
  → Bot이 "✅ 연결 완료!" 전송

[앱 UI]
  → polling (3초) → 연결 완료 감지 → 성공 화면
```

### 코드 생성 알고리즘

```python
import secrets, string

def generate_connect_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))
```

### 보안

- 코드 TTL: **10분** (600초)
- 사용 1회 후 무효화 (idempotent)
- 코드는 Redis or Supabase `telegram_connect_codes` 임시 테이블
- webhook endpoint: 공개 (Telegram IP 화이트리스트 권장)
- Bot token: `TELEGRAM_BOT_TOKEN` env var (기존)

### DB 스키마 (신규)

```sql
-- Supabase migration 027
CREATE TABLE telegram_connect_codes (
    code        TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tcc_expires ON telegram_connect_codes (expires_at);

-- user preferences에 chat_id 저장 (기존 테이블 확장)
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
```

### API 계약

```
POST /api/notifications/telegram/connect
  → requireAuth()
  → {code: string, expires_in: number}

GET /api/notifications/telegram/status
  → requireAuth()
  → {connected: boolean, chat_id?: string}

POST /api/telegram/webhook  (공개, Telegram 전용)
  → Telegram Update 처리
  → /connect {code} 명령 처리
```

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/api/notifications/telegram/connect/+server.ts` | 신규 — 코드 생성 |
| `app/src/routes/api/notifications/telegram/status/+server.ts` | 신규 — 연결 상태 조회 |
| `app/src/routes/api/telegram/webhook/+server.ts` | 신규 — Bot webhook 수신 |
| `app/src/lib/components/settings/TelegramConnectWidget.svelte` | 신규 — 6자리 코드 UI |
| `app/src/routes/settings/+page.svelte` | 변경 — TelegramConnectWidget 삽입 |
| `app/supabase/migrations/027_telegram_connect.sql` | 신규 — connect_codes 테이블 |

## Non-Goals

- 다중 Chat 연결 (1 user = 1 chat)
- Telegram 그룹 지원
- Bot 커맨드 고도화 (/help, /status 등)

## Exit Criteria

- [ ] 코드 생성 → Telegram 전송 → chat_id 등록 E2E 작동
- [ ] 연결 완료 후 `/api/notifications/telegram/status` → `{connected: true}`
- [ ] 코드 만료(10분) 시 재생성 가능
- [ ] `TELEGRAM_BOT_TOKEN` 미설정 시 graceful degradation (UI "Bot 미설정" 표시)
- [ ] migration 027 적용
- [ ] App CI ✅

## Facts

1. `app/src/lib/server/telegram.ts` — `sendTelegramMessage()` 이미 구현.
2. `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID` env var 존재.
3. Supabase Auth — `auth.users.id` UUID, session에서 user_id 추출 가능.
4. W-0234 (F-3 deep link) 완료 시 Telegram alert에 deep link URL 포함됨.

## Assumptions

1. SvelteKit `+server.ts` webhook route — 공개 접근 가능 (인증 없음, Telegram IP 검증).
2. `user_preferences` 테이블 존재 (`app/supabase/migrations/` 확인 필요).
3. Bot이 webhook으로 동작 (polling 아님) → Vercel serverless 함수 적합.

## Canonical Files

- `app/src/routes/api/notifications/telegram/connect/+server.ts`
- `app/src/routes/api/notifications/telegram/status/+server.ts`
- `app/src/routes/api/telegram/webhook/+server.ts`
- `app/src/lib/components/settings/TelegramConnectWidget.svelte`
- `app/supabase/migrations/027_telegram_connect.sql`

## Decisions

- **코드 저장소**: Supabase `telegram_connect_codes` (TTL index, 10분 후 cron cleanup)
- **polling 방식**: 앱에서 3초마다 `/status` 조회 (WebSocket 불필요)
- **Bot webhook URL**: `{APP_ORIGIN}/api/telegram/webhook` — Telegram BotFather 설정 필요
- **인증 없는 webhook**: Telegram IP 화이트리스트 + secret_token 검증 (`X-Telegram-Bot-Api-Secret-Token`)

## Next Steps

1. migration 027 작성
2. webhook route 작성 (Bot 명령 파싱)
3. connect/status API route 작성
4. TelegramConnectWidget UI (코드 표시 + polling)
5. Settings 페이지에 통합
6. BotFather에서 webhook URL 등록 (운영 배포 후)

## Handoff Checklist

- [ ] `app/src/lib/server/telegram.ts` 현재 구현 파악
- [ ] `app/supabase/migrations/` 최신 번호 확인 (027 사용 여부)
- [ ] `TELEGRAM_BOT_TOKEN` env var 설정 여부 확인
- [ ] Vercel project에 Bot webhook URL 등록 방법 확인
