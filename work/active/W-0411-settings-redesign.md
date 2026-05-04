# W-0411 — Settings 페이지 재설계

## Status

- Phase: 설계 완료, 결정 락 완료, 구현 대기
- Owner: ej
- Priority: P1
- Created: 2026-05-05
- Depends on: W-0408 (Dashboard — WVPL 흡수 협의), W-0409 (Patterns — `/upgrade` 흡수 협의 안 됨, 본 W-0411 가 처리)
- Branch: TBD

## Why

`/settings` 는 **이중 탭 구조** (layout 3탭 `Settings/Passport/System` + Hub 내부 3탭 `Account/Notifications/Display`) 로 mental model 충돌. `GeneralPanel` 1개가 **450줄 God Panel** 로 AI/Trading/Display/Notifications/Danger 모두 떠안고 `DisplayPanel`/`NotificationsPanel` 와 **중복 필드**. 동시에 `/upgrade`, `/propfirm` 사용자 설정, legal, data export, 계정 삭제, email digest 토글이 **외부에 흩어지거나 없음**. AI key 는 localStorage 만 — 서버 persist 없음.

목표: 단일 페이지 단일 nav 구조로 통합, 모든 사용자 설정 집결.

## Goals

1. **이중 탭 구조 제거** — 단일 좌측 사이드바 nav (8섹션)
2. **GeneralPanel 분해** — 섹션별 독립 패널, 중복 0
3. **흩어진 설정 흡수** — `/upgrade` (Subscription), email digest, legal, data export, 계정 삭제, PropFirm 계정 상태
4. **DisplayPanel stub 활성화** — Chart Theme/Language 실제 동작
5. **AI key 서버 persist** — localStorage → server-side encrypted store
6. **Quota/Usage 전용 섹션** — verdict/AI/quota 한 곳
7. **`/passport` 와 `/settings/passport` 관계 정리**

## Non-Goals

- Stripe billing 신규 결제 흐름 (기존 propfirm checkout 그대로)
- Telegram bot 신규 기능 (기존 연결 위젯 유지)
- 새 Authentication provider 추가

---

## A. 현재 구조 audit (실측)

### A1. `/settings` 라우트 인벤토리

| 파일 | 상태 |
|------|------|
| `+layout.svelte` | 3탭 (Settings / Passport / System) |
| `+page.svelte` + `+page.ts` | `SettingsHub` 마운트 |
| `settings/passport/+page.svelte` + `+page.ts` | 개인 Passport 통계 (구현) |
| `settings/status/+page.svelte` | 시스템 상태 체커 (구현, 구형 `on:click`) |

### A2. `SettingsHub` 패널 구조

- `SettingsHub.svelte` — 3탭 (Account / Notifications / Display) + AC10 Badge
- `panels/GeneralPanel.svelte` — **450줄 God Panel**: Profile&Subscription 링크, AI(DOUNI) 모드, Trading, Display, Notifications, Danger Zone
- `panels/SubscriptionPanel.svelte` — `/api/settings/subscription`, free/pro tier + verdict 사용량
- `panels/ApiKeysPanel.svelte` — `/api/keys`, Binance/Bybit
- `panels/NotificationsPanel.svelte` — signal alerts, SFX, TelegramConnectWidget
- `panels/DisplayPanel.svelte` — density 만 동작; Chart Theme/Language **disabled stub**
- `panels/Ac10Badge.svelte` — 자동매매 비연결 배지 (AC3 always-in-DOM)

**문제**: GeneralPanel ↔ DisplayPanel/NotificationsPanel 중복.

### A3. Settings 외부 흩어진 설정

| 경로 | 내용 | 처리 |
|------|------|------|
| `/upgrade` | 플랜 업그레이드 단독 페이지 | **Subscription 섹션 흡수 + 301 redirect** |
| `/passport/[username]` | public 프로필 공유 뷰 | **유지** (외부 공유 link, settings 와 분리) |
| `/passport` (내) | 내 패스포트 뷰 | **삭제 또는 redirect** → `/settings/profile` |
| `/propfirm` | PropFirm 평가 현황 + dashboard | **유지** (실거래 기능, 단순 설정 X), Settings 에 "PropFirm 상태" 미니 섹션 추가 |
| `SiteFooter` privacy/terms | 외부 링크 | **유지** + Settings 안 Legal 섹션 신설 (동일 링크 + 동의 이력) |
| `CookieConsent.svelte` | 쿠키 동의 | **유지** + Settings 안 Privacy 섹션에 토글 노출 |

### A4. 사용자 설정 store

- `walletStore.ts` — 지갑/tier/phase/email/nickname
- `userProfileStore.ts` — 구독/tier
- `douniRuntime.ts` — AI 모드/provider/API Key (localStorage)
- `density.store.ts` — UI 밀도
- `notificationStore.ts` — 인앱 알림
- **없음**: `themeStore`, `authStore`, `quotaStore` (산재)

### A5. API endpoint

| Endpoint | 용도 |
|----------|------|
| `GET/PUT /api/preferences` | defaultPair, TF, speed, signals, sfx |
| `GET /api/settings/subscription` | tier, verdict 사용량 |
| `GET/POST/DELETE /api/keys` | Binance/Bybit (W-0405) |
| `GET /api/profile/passport` | Passport 데이터 |
| `GET /api/notifications/telegram` | Telegram |
| `POST /api/billing/checkout`, `GET /api/billing/status` | Stripe (propfirm) |
| `/api/auth/*` | login/logout/session/wallet-auth |
| `/api/digest/unsubscribe` | 존재하나 토글 UI 없음 |

**없음**: `/api/quota` (subscription 응답 안 포함), `/api/account/delete`, `/api/account/export`, `/api/ai/keys` (AI provider key 서버 저장).

### A6. 진입점

`AppNavRail` Settings 아이콘 / `Header` 상단 settings 버튼 + 아바타 드롭다운 / `MobileBottomNav` Settings 탭 / `SiteFooter` settings 링크.

### A7. 발견된 이슈

| # | 이슈 | 처리 |
|---|------|------|
| 1 | 이중 탭 구조 (layout 3탭 + Hub 내부 3탭) | 단일 좌측 사이드바 nav 로 통합 |
| 2 | GeneralPanel 450줄 God Panel | 섹션별 분해, 중복 제거 |
| 3 | DisplayPanel Chart Theme/Language disabled stub | 실제 동작 활성화 |
| 4 | AI key localStorage only | 서버 persist (encrypted) |
| 5 | `/upgrade` 외부 단독 page | Subscription 섹션 흡수 + redirect |
| 6 | `/passport` (내) vs `/settings/passport` 중복 | `/passport` (내) → settings/profile redirect |
| 7 | Email digest 토글 부재 (`/api/digest/unsubscribe` 만) | Notifications 섹션 추가 |
| 8 | Legal 섹션 부재 | 신설 (privacy/terms/cookie/동의 이력) |
| 9 | Data export / 계정 삭제 부재 | Privacy 섹션 신설 |
| 10 | Quota/Usage 전용 섹션 부재 | Usage 섹션 신설 (verdict + AI quota + W-0404 quota system) |
| 11 | PropFirm 상태 표시 부재 | Settings 안 미니 섹션 (read-only 링크 → `/propfirm`) |
| 12 | AC10 Badge 중복 mount 위험 | 단일 Header 영역 mount, 항상 in-DOM 보장 |
| 13 | settings/status 구형 `on:click` | Svelte 5 onclick 으로 마이그레이션 |
| 14 | LLM provider 선택 (#1146 multi-provider litellm) UI 없음 | AI 섹션에 provider/model selector 노출 |
| 15 | Settings UI 컴포넌트 테스트 0 | 핵심 패널 vitest 추가 |

---

## B. 재설계 IA — 단일 페이지 + 좌측 사이드바 8섹션

### B1. 레이아웃

```
┌──────────────── /settings ────────────────┐
│ [좌 220px sidebar nav]    [중앙 패널]       │
│                                            │
│ • Profile                  선택 섹션 패널   │
│ • Subscription                              │
│ • API Keys                                  │
│ • AI                                        │
│ • Trading                                   │
│ • Notifications                             │
│ • Display                                   │
│ • Privacy & Legal                           │
│ • Usage                                     │
│ • System (status)                           │
│ • Danger Zone                               │
└────────────────────────────────────────────┘
```

URL: `?section=<id>` (브라우저 history + deep link 가능).

### B2. 섹션별 contract

#### 1) Profile
- Passport 정보 (개인 통계 — 현 `/settings/passport` 흡수)
- Public passport 공유 링크 (`/passport/[username]`)
- 닉네임/아바타 편집 (있다면)

#### 2) Subscription (이전: `/upgrade` 흡수)
- 현재 tier (free/pro/quant) + verdict 사용량 바
- 업그레이드 CTA + Stripe checkout (`/api/billing/checkout`)
- billing 이력 (`/api/billing/status`)
- `/upgrade` 301 → `/settings?section=subscription`

#### 3) API Keys (W-0405 풀)
- Binance / Bybit API key (`/api/keys`)
- 검증 상태 표시
- Read-only / Trade 권한 안내

#### 4) AI
- DOUNI 모드 선택 (현 GeneralPanel 흡수)
- LLM provider/model selector (W-0404 #1146)
- AI provider API key 입력 — **서버 persist** (`/api/ai/keys` 신규, encrypted)
- AI quota 미니 표시 (Usage 섹션 링크)

#### 5) Trading
- defaultPair, TF, speed (`/api/preferences` 흡수)
- 자동매매 연결 상태 (AC10 Badge 노출)
- PropFirm 미니 카드 (read-only, 클릭 → `/propfirm`)

#### 6) Notifications
- Signal alerts on/off
- SFX on/off
- Telegram 연결 위젯 (`/api/notifications/telegram`)
- **Email digest 토글** (`/api/digest/unsubscribe` 활용 + opt-in API 필요 — `POST /api/digest/subscribe` 신규)
- 모바일 push (있다면)

#### 7) Display
- Density (현 작동)
- **Chart Theme** 활성화 (light/dark/auto, system) — `/api/preferences` 확장
- **Language** 활성화 (ko/en) — `/api/preferences` 확장
- Font size

#### 8) Privacy & Legal
- Privacy policy 링크 + 마지막 동의일
- Terms 링크 + 마지막 동의일
- Cookie consent 토글
- **Data export** (`/api/account/export` 신규 — 사용자 데이터 zip)
- **계정 삭제 요청** (`/api/account/delete` 신규 — soft delete + 30일 grace)

#### 9) Usage
- Verdict 사용량 (subscription 흡수)
- AI quota (W-0404 PR5)
- API call quota (W-0404 PR5)
- 월별 그래프 (있으면)

#### 10) System (현 `/settings/status` 이동)
- 시스템 상태 체커 그대로
- 구형 `on:click` → `onclick` 마이그레이션

#### 11) Danger Zone
- 모든 데이터 reset (확인 모달)
- API key 일괄 삭제
- 계정 삭제 (Privacy 섹션과 cross-link)

### B3. 좌측 nav 동작

- 클릭 → URL `?section=X` 갱신, 섹션 패널 swap
- 좌측 nav 가 짧은 라벨 + 카테고리 그룹 ("프로필" / "결제" / "거래" / "알림" / "표시" / "개인정보" / "사용량" / "시스템" / "위험")
- 모바일: 좌 nav → 상단 `<details>` accordion 또는 햄버거 drawer

### B4. AC10 Badge

- Header 영역에 단일 mount (현재 SettingsHub 안 mount → layout 으로 승격)
- 항상 in-DOM 보장 (자동매매 비연결 status)

### B5. 모바일 (≤1024px)

- 좌 nav → 상단 슬라이드 다운 nav 또는 햄버거 drawer
- 패널 1단 세로 스택

---

## C. 컴포넌트 disposition

### 기존

| 현재 | 처리 |
|------|------|
| `routes/settings/+layout.svelte` (3탭) | **재작성** — 좌측 사이드바 nav 로 교체 |
| `routes/settings/+page.svelte` | **유지** (default = Profile section) |
| `routes/settings/passport/+page.svelte` + `+page.ts` | **흡수** → Profile 섹션 안 sub-component |
| `routes/settings/status/+page.svelte` | **흡수** → System 섹션 |
| `routes/upgrade/**` | **삭제 + 301 redirect** |
| `routes/passport/+page.svelte` (내 패스포트, public 아닌 것) | **삭제 + redirect** → `/settings?section=profile` |
| `routes/passport/[username]/+page.svelte` | **유지** (public 공유) |
| `hubs/settings/SettingsHub.svelte` (3탭) | **재작성** — 단일 섹션 라우터로 |
| `hubs/settings/panels/GeneralPanel.svelte` (450줄) | **분해** → AI / Trading / Display / Notifications / DangerZone 으로 분리 |
| `hubs/settings/panels/SubscriptionPanel.svelte` | **유지** + `/upgrade` 콘텐츠 흡수 |
| `hubs/settings/panels/ApiKeysPanel.svelte` | **유지** |
| `hubs/settings/panels/NotificationsPanel.svelte` | **유지** + Email digest 토글 추가 |
| `hubs/settings/panels/DisplayPanel.svelte` | **재작성** — Chart Theme/Language 활성화 |
| `hubs/settings/panels/Ac10Badge.svelte` | **layout 으로 mount 승격** |

### 신규

- `hubs/settings/panels/ProfilePanel.svelte` (Passport 통계 + 닉네임 편집)
- `hubs/settings/panels/AiPanel.svelte` (DOUNI 모드 + LLM provider/model + API key 서버 persist)
- `hubs/settings/panels/TradingPanel.svelte` (preferences + AC10 + PropFirm 미니)
- `hubs/settings/panels/PrivacyPanel.svelte` (legal + cookie + data export + delete)
- `hubs/settings/panels/UsagePanel.svelte` (verdict + AI + API quota)
- `hubs/settings/panels/SystemPanel.svelte` (status — 현 `/settings/status` 이동)
- `hubs/settings/panels/DangerZonePanel.svelte` (분해)
- `hubs/settings/SettingsSidebar.svelte` (좌 nav)
- `stores/settingsStore.ts` (현재 활성 섹션 + 섹션 간 deep link)

### API 신규

- `POST /api/digest/subscribe` (email digest opt-in)
- `GET/POST/DELETE /api/ai/keys` (AI provider key 서버 persist, encrypted)
- `POST /api/account/export` (데이터 zip)
- `POST /api/account/delete` (soft delete + 30일 grace)
- `GET /api/preferences` 확장 (chart_theme, language 필드 추가)

---

## D. 결정 (락 — 사용자 위임)

| # | 결정 | 락 | 이유 |
|---|------|---|------|
| D1 | 탭 구조 | **단일 좌측 사이드바 nav (`?section=X`)** | 이중 탭 mental model 충돌 제거 |
| D2 | GeneralPanel 처리 | **분해 — AI/Trading/Display/Notifications/Danger 5개 패널** | God Panel 안티패턴 |
| D3 | `/upgrade` 처리 | **Subscription 섹션 흡수 + 301 redirect** | 한 곳에서 결제 |
| D4 | `/passport` (내) 처리 | **삭제 + redirect → settings/profile** | 중복 제거 |
| D5 | `/passport/[username]` (public) | **유지** | 외부 공유 링크 |
| D6 | `/propfirm` 처리 | **유지 + Settings Trading 섹션에 미니 카드 (read-only)** | 실거래 기능, 단순 설정 X |
| D7 | AI key 저장 위치 | **서버 persist (encrypted) — `/api/ai/keys` 신규** | localStorage XSS 위험 |
| D8 | Chart Theme / Language | **`/api/preferences` 확장 + DisplayPanel 활성화** | stub 해소 |
| D9 | Email digest opt-in | **Notifications 섹션 토글 + `POST /api/digest/subscribe` 신규** | unsubscribe 만 있는 비대칭 해소 |
| D10 | Legal 섹션 | **신설 — privacy/terms/cookie + 동의 이력** | 컴플라이언스 |
| D11 | Data export | **`POST /api/account/export` 신규 — zip** | GDPR |
| D12 | 계정 삭제 | **soft delete + 30일 grace — `POST /api/account/delete`** | 회복 가능성 |
| D13 | Usage 섹션 | **verdict + AI + API quota 통합** | 한 곳에서 사용량 확인 |
| D14 | AC10 Badge mount | **layout 으로 승격, 항상 in-DOM** | AC3 보장 |
| D15 | LLM provider/model selector | **AI 섹션 안 노출 (#1146)** | 사용자가 선택 가능 |
| D16 | settings/status 마이그레이션 | **`on:click` → `onclick` (Svelte 5)** | 코드 통일 |
| D17 | 모바일 nav 처리 | **좌 nav → 햄버거 drawer 또는 상단 accordion** | 좁은 화면 |
| D18 | DangerZone 위치 | **별도 섹션 + Privacy 와 cross-link** | 실수 방지 |
| D19 | Settings 라우트 형태 | **단일 `/settings?section=X`, sub-route 0** | 이중 라우팅 제거 |
| D20 | `themeStore`, `authStore`, `quotaStore` 신설 | **신설 안 함 — 기존 store 활용** | 산재 줄이려다 store 폭발 방지 |
| D21 | 테스트 | **각 신규 패널 vitest + ApiKeysPanel/NotificationsPanel 회귀** | UI 테스트 0 해소 |
| D22 | Section deep link | **`?section=X` 항상 동작 + 카드/외부 링크에서 사용** | 외부 링크 안정성 |

---

## E. 구현 PR 분기 (7 PR)

### PR1 — Layout 재작성 + Sidebar nav + AC10 승격
- `+layout.svelte` 좌측 사이드바 + `?section=X` 라우팅
- AC10 Badge layout mount
- `settingsStore` 신규
- 기존 SettingsHub 3탭 제거
- AC: `/settings?section=profile|subscription|...` 모두 작동

### PR2 — GeneralPanel 분해
- `AiPanel`, `TradingPanel`, `DisplayPanel`(재작성), `NotificationsPanel`(확장), `DangerZonePanel` 신규
- GeneralPanel 삭제
- 중복 필드 제거
- AC: 각 섹션 패널 독립 동작, GeneralPanel 0 references

### PR3 — Subscription + `/upgrade` 흡수
- SubscriptionPanel 에 `/upgrade` 콘텐츠 통합
- `/upgrade` 301 redirect
- AC: `/upgrade` → `/settings?section=subscription`

### PR4 — Profile 섹션 + `/passport` 정리
- ProfilePanel 신규 (Passport 통계 흡수)
- `routes/settings/passport/+page.svelte` 삭제 (Profile 섹션 흡수)
- `/passport` (내) 삭제 + redirect
- `/passport/[username]` 유지
- AC: D4 D5 동작

### PR5 — Privacy & Legal + Data export + 계정 삭제 + Usage
- PrivacyPanel + UsagePanel 신규
- `POST /api/account/export`, `POST /api/account/delete` 신규
- legal/cookie 토글
- AC: D10 D11 D12 D13 동작

### PR6 — AI key 서버 persist + LLM provider selector + Email digest
- `GET/POST/DELETE /api/ai/keys` 신규 (encrypted)
- AiPanel LLM provider/model selector (#1146 흡수)
- `POST /api/digest/subscribe` 신규
- NotificationsPanel email digest 토글
- AC: D7 D9 D15 동작

### PR7 — System 섹션 + Chart Theme/Language + 모바일 + 테스트
- `/settings/status` → SystemPanel 이동
- DisplayPanel Chart Theme/Language 활성화 (`/api/preferences` 확장)
- `on:click` → `onclick`
- 좌 nav 모바일 drawer
- vitest (각 패널 핵심 시나리오)
- AC: D8 D16 D17 D21 동작

---

## F. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | `/settings` 가 단일 좌측 사이드바 nav (이중 탭 0) |
| AC2 | `?section=X` 모든 섹션 deep link 작동 |
| AC3 | AC10 Badge layout mount, 항상 in-DOM |
| AC4 | GeneralPanel 분해 완료, 중복 필드 0 |
| AC5 | `/upgrade`, `/passport` (내) 모두 redirect 동작 |
| AC6 | Chart Theme / Language 실제 동작 + 영속화 |
| AC7 | AI key 서버 persist + 재로그인 후 보존 |
| AC8 | Email digest 토글 on/off + 실제 메일 수신 변화 |
| AC9 | Data export zip 다운로드 + 계정 삭제 grace 동작 |
| AC10 | Usage 섹션 verdict/AI/API quota 모두 표시 |
| AC11 | LLM provider/model selector 동작 (#1146 통합) |
| AC12 | settings/status `onclick` 마이그레이션 |
| AC13 | 모바일 ≤1024px 좌 nav drawer 동작 |
| AC14 | 신규 패널 vitest 통과 |
| AC15 | Contract CI 통과 |

---

## G. 보존 필수

| # | 항목 | 이유 |
|---|------|------|
| P1 | AC10 Badge 항상 in-DOM (AC3) | 자동매매 안전 가드 |
| P2 | `/api/keys` Binance/Bybit (W-0405) | 키 관리 핵심 |
| P3 | `/api/preferences` 기존 필드 (defaultPair/TF/speed/signals/sfx) | 기존 사용자 영향 |
| P4 | `/passport/[username]` public 공유 | 외부 링크 |
| P5 | `/propfirm` 독립 route | 실거래 기능 |
| P6 | TelegramConnectWidget | W-0401 P3 연동 |
| P7 | density.store localStorage `wtd:density` | 기존 사용자 영향 |
| P8 | wallet-auth `/api/auth/*` | 인증 흐름 |

---

## H. Risks

| Risk | 완화 |
|------|------|
| AI key 서버 persist 마이그레이션 시 기존 localStorage 키 손실 | PR6 안에서 1회 import 마이그레이션 (localStorage → 서버 POST 후 clear) |
| `/upgrade` 외부 링크/SEO | 301 redirect 로 보존 |
| `/passport` (내) 외부 링크 | redirect 보존, 단 `/passport/[username]` 와 충돌 없게 path 매칭 우선순위 확인 |
| Chart Theme 활성화 시 기존 차트 컴포넌트 다 대응 필요 | preferences 확장 + 차트 컴포넌트 prop 점진 추가, default light 유지 |
| 계정 삭제 30일 grace 의 데이터 격리 | engine/DB 측 soft-delete flag + cron job |
| 좌 nav 신설로 NavRail 과 nav 두 개 mental model | nav rail 은 surface 이동, 좌 nav 는 settings 내부만 — 시각 차별화 |
| Email digest opt-in API 신규 — 백엔드 cron 영향 | unsubscribe 와 대칭, digest sender query 에 subscribe flag 추가 |
| AC10 Badge layout 승격 시 다른 페이지 leak | layout scope 명확히 (`/settings/**` 만) |
| LLM provider key encrypt at rest | KMS 또는 envelope encryption (engine 측 결정) |

---

## I. 다음 단계

1. ~~결정 락~~ ✅ 완료 (D1~D22)
2. CURRENT.md 업데이트
3. 5개 페이지(Terminal/Dashboard/Patterns/Settings + W-0407 Spike) 통합 검토
4. 구현 시작 (Patterns Workshop 이 가장 큰 미지수, Settings 는 분해 작업 위주)

---

## K. 누락 보강 (2026-05-05 실측 audit 후 추가)

### K1. SettingsModal 병렬 UI 처리

`/app/src/components/modals/SettingsModal.svelte` 가 Settings 페이지와 **병렬로 존재** — Trading speed/theme/reset 을 모달로 노출. GeneralPanel 분해 후 모달과 패널이 같은 필드를 다루면 mental model 충돌.

- **결정**: Modal **삭제**, 모든 진입점을 `/settings?section=...` deep link 로 통일
- 모달 트리거 호출처 grep → `goto('/settings?section=trading')` 또는 `display` 등으로 교체
- PR2 (GeneralPanel 분해) 안에서 처리

### K2. `/api/profile` (GET/PATCH) 추가

ProfilePanel 의 nickname/avatar/displayTier/badges 편집 endpoint.

- §A5 추가 + ProfilePanel C disposition 에 의존 endpoint 명시
- PR4 (Profile 섹션) 안에서 호출

### K3. `/api/exchange/connect` + `/api/exchange/import` (Binance 별도 경로)

`/api/keys` 와 **별도** 시스템. 두 endpoint 모두 ApiKeysPanel 이 처리.

- **결정**: ApiKeysPanel 이 두 시스템 모두 표시 (Keys 저장 + Exchange 연동·import 분리 sub-section)
- §A5 추가
- PR1 또는 별도 PR (현 ApiKeysPanel 유지 안에서 확장) — PR1 안에서 처리

### K4. `/api/ui-state` (GET/PUT) 처리

사용자별 UI 레이아웃 (terminal width, mobile tab, passport tab) 서버 persist.

- **결정**: Display 섹션 안 "레이아웃 동기화" 토글 + reset 버튼 추가
- PR7 (Display 활성화) 안에서 처리

### K5. `/status` route redirect 갱신

현재 `/status` → `/settings/status` 301. W-0411 가 `/settings/status` 흡수 (System 섹션) 후 redirect 대상 갱신 필요.

- 갱신: `/status` → `/settings?section=system`
- PR7 안에서 처리

### K6. `KillSwitchToggle.svelte` (AI 섹션)

`ADAPTER_MODE=live` 플래그 활성 시 Cogochi 베이스라인 모델 토글.

- **결정**: AI 섹션 안 mount, env flag 의존 conditional render
- §C 추가
- PR2 (AiPanel 신설) 안에서 mount

### K7. `AppTopBar.svelte` 진입점

`/settings` href + 드롭다운 — `AppNavRail` 와 별개 컴포넌트.

- §A6 추가
- 좌 nav 신설 후 AppTopBar 의 settings 버튼은 `/settings?section=profile` (default deep link) 로 변경
- PR1 안에서 처리

### K8. `/api/auth/privy` + Privy 연동

`PUBLIC_PRIVY_APP_ID` + `PRIVY_APP_SECRET` env 의존. Privy 인증 상태를 Settings 에 노출.

- **결정**: Profile 섹션 안 "연결된 인증" 표시 (wallet + Privy + email 통합)
- §A5 + §C 의 ProfilePanel disposition 에 추가
- PR4 안에서 처리

### K9. i18n 활성화 공수 (PR7 재평가)

D8 Language 활성화 = Settings 전체 섹션 + 모든 페이지 i18n 키 추가. 현재 i18n 키는 patterns/terminal 도메인만.

- **결정**: PR7 에서 Settings 섹션 i18n 키 만 우선 추가, 나머지 페이지는 별도 W item (W-0412 i18n) 분리
- §H Risk 추가

### K10. env vars 추가

| Env | 용도 |
|-----|------|
| `PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Profile 섹션 인증 분기 |
| `PUBLIC_EVM_CHAIN_ID` / `PUBLIC_WALLETCONNECT_PROJECT_ID` | Profile 섹션 지갑 연결 분기 |
| `CEREBRAS_MODEL` / `GROQ_MODEL` / `OLLAMA_BASE_URL` | AI 섹션 provider selector — **결정**: 사용자 선택이 server env 보다 우선 (있을 때) |
| `ADAPTER_MODE=live` | KillSwitchToggle 활성 조건 |

`.env.example` 갱신 PR1 안에서 처리.

### K11. Ollama local mode endpoint URL 필드

`douniRuntime.DouniMode = 'TERMINAL' | 'HEURISTIC' | 'OLLAMA' | 'API'`. AI 섹션이 `OLLAMA` 모드 선택 시 endpoint URL 입력 필드 필요.

- **결정**: AiPanel 안 conditional 입력 필드 추가
- PR6 (AI key + provider selector) 안에서 처리

### K12. Copy-trading 구독 관리

`/api/copy-trading/subscribe` — 사용자가 팔로우 중인 트레이더 관리 UI 가 어디에도 없음.

- **결정**: Trading 섹션 안 "구독 중인 트레이더" 미니 sub-section + `/patterns?tab=compare` Leaderboard 로 진입
- §C TradingPanel disposition 에 추가
- PR2 (TradingPanel 신설) 안에서 처리

### K13. 누락 store 추가 (§A4 보강)

| Store | 역할 | Settings 활용 |
|-------|------|--------------|
| `walletModalStore` (re-export) | 지갑 연결 모달 제어 | Profile 섹션에서 호출 |
| `profileDrawerStore` | ProfileDrawer open state | Profile 섹션 deep link 시 close |
| `inboxBadge.store` / `inboxCountStore` | 인박스 카운터 | Notifications 섹션 표시 |
| `streak.store` | streak_days | Profile/Usage 섹션 표시 |

### K14. 누락 API endpoint 추가 (§A5 보강)

| Endpoint | 활용 섹션 |
|----------|----------|
| `GET/PATCH /api/profile` | Profile (K2) |
| `GET/POST /api/exchange/connect`, `POST /api/exchange/import` | API Keys (K3) |
| `GET/PUT /api/ui-state` | Display (K4) |
| `GET /api/profile/streak` | Profile/Usage |
| `GET /api/progression` | Profile/Usage (tier/LP) |
| `GET /api/users/[userId]/f60-status` | Trading PropFirm 미니 |
| `POST /api/copy-trading/subscribe` | Trading (K12) |
| `POST /api/billing/webhook` | Subscription 상태 trigger (서버사이드) |
| `POST /api/propfirm/checkout` | Trading PropFirm 미니 (별도 — `/api/billing/checkout` 와 분리) |
| `/api/auth/privy` | Profile (K8) |
| `/api/engine/[...path]` proxy | engine quota endpoint 접근 경로 (Usage) |

### K15. 진입점 추가 (§A6 보강)

| 진입점 | 처리 |
|--------|------|
| `AppTopBar` | K7 |
| `ProfileDrawer.svelte` (`goto('/settings')`) | `?section=profile` deep link 로 갱신 |
| `WalletModal.svelte` toast `href='/settings'` (2곳, lines 229, 323) | `?section=profile` 로 갱신 |
| `appSurfaces.ts` settings surface 부재 | 명시: Settings 는 surface 가 아닌 utility nav, AppNavRail/AppTopBar 가 직접 하드코딩 — 변경 없음 |

### K16. Wallet / Web3 추가

| 항목 | 처리 |
|------|------|
| `DogeOSWalletButton.svelte` + `lib/wallet/eip6963.ts` (EIP-6963) | Profile 섹션 "연결된 지갑 관리" 안 mount |
| WalletConnect (`PUBLIC_WALLETCONNECT_PROJECT_ID`) | Profile 섹션 인증 분기 |

### K17. F60GateBar / 추가 가드 컴포넌트

`F60GateBar.svelte` — PropFirm f60 상태 게이트.

- **결정**: Trading 섹션 PropFirm 미니 카드 안 read-only 표시 (편집 X)
- §C 추가

### K18. Stripe webhook + PropFirm checkout 별도 처리

`/api/billing/webhook` 과 `/api/billing/checkout` 외에 `/api/propfirm/checkout` 가 별도. Subscription 섹션은 `/api/billing/checkout` 만, Trading PropFirm 미니는 `/api/propfirm/checkout` 만 호출.

- §A5 추가, 두 endpoint 분리 명시

### K19. AI provider 우선순위 정책 (D15 보강)

서버 env (`CEREBRAS_MODEL` 등) vs 사용자 선택 (douniRuntime).

- **결정 (D15 보강)**: 사용자 선택이 우선 (설정한 경우), 미설정 시 server env fallback
- AiPanel 에 "사용 중인 모델" 표시 (effective = user || env)

### K20. AC10 Badge layout 승격 시 scope

`/settings/**` 외 다른 페이지로 leak 방지.

- 명시: AC10 은 `/settings/+layout.svelte` 안 mount, 다른 layout 영향 없음
- 단 자동매매 비연결 status 자체는 모든 페이지에서 보여야 한다면 root layout — **결정**: 현 위치(Settings) 가 충분, 자동매매 발동 시점 사용자가 Settings 가서 확인하는 흐름

### K21. PR 매핑 (K 항목 → 기존 PR)

| K | 처리 PR |
|---|---------|
| K1 SettingsModal 삭제 | PR2 |
| K2 `/api/profile` | PR4 |
| K3 Exchange API | PR1 (ApiKeysPanel 확장) |
| K4 ui-state | PR7 |
| K5 `/status` redirect | PR7 |
| K6 KillSwitchToggle | PR2 |
| K7 AppTopBar | PR1 |
| K8 Privy | PR4 |
| K9 i18n 공수 | PR7 (스코프 축소) |
| K10 env vars | PR1 (.env.example 갱신) |
| K11 Ollama URL 필드 | PR6 |
| K12 Copy-trading 구독 | PR2 |
| K13 store 보강 | 호출 시점 |
| K14 endpoint 보강 | 호출 시점 |
| K15 진입점 갱신 | PR1 |
| K16 wallet/EIP-6963 | PR4 |
| K17 F60GateBar | PR2 |
| K18 Stripe/PropFirm checkout 분리 | PR3 |
| K19 AI provider 우선순위 | PR6 |
| K20 AC10 scope | PR1 |

### K22. 추가 AC

| AC | 검증 |
|----|------|
| AC16 | SettingsModal 삭제, 모든 트리거가 `/settings?section=...` deep link 로 교체됨 (grep 검증) |
| AC17 | `AppTopBar`, `ProfileDrawer`, `WalletModal` 진입점 모두 `?section=...` deep link |
| AC18 | ApiKeysPanel 이 `/api/keys` + `/api/exchange/connect|import` 두 시스템 동시 표시 |
| AC19 | AiPanel 의 effective model = user 선택 (있을 때) 또는 env fallback |
| AC20 | KillSwitchToggle 가 `ADAPTER_MODE=live` env 일 때만 render |
| AC21 | Profile 섹션이 Privy + wallet (EIP-6963/WalletConnect) 통합 표시 |
| AC22 | Display 섹션 "레이아웃 동기화" 토글 → `/api/ui-state` PUT |
| AC23 | `/status`, `/upgrade`, `/passport`(내) 모두 redirect 동작 |
| AC24 | Trading 섹션 PropFirm 미니 카드 + 구독 중인 트레이더 sub-section 표시 |

---

## Goal

위 §Why / §Goals 본문 참조.

## Owner

위 §Status 의 Owner 필드 참조.

## Scope

위 §A / §B / §C 본문 참조.

## Non-Goals

위 §Non-Goals 또는 본문 명시 항목 참조.

## Canonical Files

위 §C / §C3 / 컴포넌트 disposition 표 참조.

## Facts

위 §A audit (실측) 또는 References 참조.

## Assumptions

위 §Status dependencies + §Why 전제 참조.

## Open Questions

위 §D Decisions 중 미확정 / §J 보강 항목 참조.

## Decisions

위 §D 결정표 / §Decisions 본문 참조.

## Next Steps

위 §I 다음 단계 / §G 다음 단계 본문 참조.

## Exit Criteria

위 §F AC / §D AC / §통합 AC 본문 참조.

## Handoff Checklist

- [ ] 위 §F AC 전부 통과
- [ ] CURRENT.md main SHA 갱신
- [ ] 머지 후 본 work item 파일 archive 이동
