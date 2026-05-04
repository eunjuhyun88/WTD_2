# W-0413 — 5페이지 재설계 통합 검토

## Status

- Phase: 통합 검토 완료, 구현 대기
- Owner: ej
- Priority: P1 (모든 5페이지 머지 순서/공유 의존성 결정)
- Created: 2026-05-05
- Covers: W-0407 Terminal, W-0408 Dashboard, W-0409 Patterns(+Lab), W-0411 Settings, W-0412 i18n
- Branch: 없음 (메타 work item, 코드 변경 X)

## Why

5개 페이지 재설계가 동시에 진행 — 같은 컴포넌트/store/API/링크를 여러 W item 이 건드림. 통합 머지 순서 + 공유 의존성 + 충돌 위험 + 통합 AC 정의 필요.

## A. 5 Work Item 한눈에

| W | 페이지 | PR 수 | 결정 락 | 핵심 위험 |
|---|--------|-------|---------|----------|
| W-0407 | Terminal | 15 | 12 | lightweight-charts v5 + SVG overlay spike 미검증 |
| W-0408 | Dashboard | 6 | 16 | VerdictInboxSection unmount 순서, /api/pnl/summary wiring |
| W-0409 | Patterns + Lab 흡수 | 8 | 22 | Workshop kieran.ai-style auto-rerun 성능, /lab/* 8곳 링크 교체 |
| W-0411 | Settings | 7 | 22 | GeneralPanel 450줄 분해, AC10 Badge layout 승격 |
| W-0412 | i18n (W-0411 K9 분리) | TBD | TBD | Settings 외 페이지 전체 번역 키 추가 |

총 **36+ PR**, **94 결정 락**.

---

## B. Cross-page 공유 의존성

### B1. 컴포넌트 공유 (충돌 위험)

| 컴포넌트 | W-0407 | W-0408 | W-0409 | W-0411 | 처리 |
|----------|--------|--------|--------|--------|------|
| `VerdictInboxSection` | — | unmount | 단독 owner | — | W-0408 PR2 → W-0409 PR3 순서 (W-0409 가 늦게 머지) |
| `EquityCurveChart` | — | — | Patterns/[slug] + Lab 통합 | — | W-0409 PR5 안에서 단일화 |
| `PatternLibraryPanel` | Tab 안 mount | — | 유지 | — | adapter 그대로 유지, 양쪽 read-only |
| `AC10 Badge` | — | — | — | layout 승격 | W-0411 PR1, 다른 페이지 영향 0 |
| `inboxBadge.store` / `inboxCountStore` | — | 단일 source | — | Notifications 표시 | W-0408 가 단일 source 정의 → W-0411 read |
| `density.store` | localStorage | 영향 | 영향 | Display 섹션 직접 제어 | W-0411 PR2 가 owner |
| `walletStore` / `userProfileStore` | — | header tier | — | Profile 섹션 owner | W-0411 PR4 가 source |
| `themeStore` (신설 안 함) | — | — | — | preferences 활용 | W-0411 PR7 |

### B2. URL 링크 교체 (Cross-page hardcoding)

| 출발 → 도착 (현재) | 갱신 후 | 처리 W |
|--------------------|---------|--------|
| Terminal `/lab?captureId=...` (4곳) | `/patterns?tab=workshop&capture=...` | W-0409 PR5 |
| Dashboard `goto('/lab')` "Open Lab" | `goto('/patterns?tab=workshop')` "Open in Workshop" | W-0409 PR5 |
| Mobile `MobileFooter` `/lab` LAB 항목 | 삭제 (Patterns 통합) | W-0409 PR5 |
| `/dashboard` "전체보기 → /patterns" | 변경 없음 | — |
| `/patterns/formula?slug=` → `/lab` | `[slug]?section=formula` | W-0409 PR4 |
| `WalletModal` toast `href='/settings'` (2곳) | `?section=profile` | W-0411 PR1 |
| `ProfileDrawer` `goto('/settings')` | `?section=profile` | W-0411 PR1 |
| `/upgrade` 외부 링크 | `/settings?section=subscription` (301) | W-0411 PR3 |
| `/passport` (내) | `/settings?section=profile` (301) | W-0411 PR4 |
| `/status` → `/settings/status` (현 redirect) | `/settings?section=system` | W-0411 PR7 |
| `/strategies`, `/benchmark` | `/patterns?tab=compare` (301, query-param) | W-0409 PR1 |

### B3. API 신규 endpoint

W-0409 (Lab 흡수) 와 W-0411 둘 다 신규 endpoint 추가:
- W-0409: 없음 (기존 endpoint 재사용)
- W-0411: `/api/ai/keys`, `/api/account/export`, `/api/account/delete`, `/api/digest/subscribe`, `/api/profile` (GET/PATCH), `/api/preferences` 확장 (chart_theme, language)

### B4. appSurfaces.ts 수정

- W-0409 PR7: `lab` surface **제거**, `patterns` surface 의 `activePaths` 에 `/lab`, `/strategies`, `/benchmark` 추가
- W-0411: `settings` surface 변경 없음 (utility nav, 직접 하드코딩)
- 충돌 없음 — 다른 W item 이 건드리지 않음

---

## C. PR 머지 순서

### C1. Wave 단위 머지 (의존성 그래프)

```
Wave A — 무의존 골격 (병렬)
  ├ W-0408 PR1 (Dashboard 골격)
  ├ W-0409 PR1 (탭 골격 + Compare 흡수 + redirect query-param 통일)
  ├ W-0411 PR1 (Layout sidebar + AC10 승격 + AppTopBar 갱신)
  └ W-0407 PR1~PR3 (Terminal spike + lightweight-charts v5 마이그레이션)

Wave B — Cross-page 단일화 (Wave A 후)
  ├ W-0408 PR2 (VerdictInboxSection unmount)  [선행]
  ├ W-0409 PR3 (Patterns 단독 owner)          [W-0408 PR2 후]
  ├ W-0408 PR2.5 (cross-page mount 1차)
  ├ W-0409 PR2 (Search + Lifecycle)
  └ W-0411 PR2 (GeneralPanel 분해)

Wave C — 핵심 기능 흡수 (Wave B 후)
  ├ W-0409 PR4 ([slug] Formula + CopyTradingLeaderboard)
  ├ W-0409 PR5 (Workshop 골격 + Lab 흡수 1차 — Terminal 링크 교체)
  ├ W-0411 PR3 (Subscription + /upgrade 흡수)
  ├ W-0411 PR4 (Profile + /passport 정리 + Privy/wallet)
  └ W-0407 PR4~PR8 (Terminal Tab/Velo/TV)

Wave D — 고급 기능 (Wave C 후)
  ├ W-0409 PR6 (Workshop Refinement/Counterfactual + Live)
  ├ W-0409 PR7 (Research + lab surface 제거)
  ├ W-0411 PR5 (Privacy/Legal + Data export + Usage)
  ├ W-0411 PR6 (AI key 서버 persist + LLM provider)
  └ W-0408 PR3~PR5 (흡수 + 모바일 + WVPL)

Wave E — 모바일 + 폴리시 (Wave D 후)
  ├ W-0409 PR8 (모바일 drawer)
  ├ W-0411 PR7 (System + Theme/Lang + 모바일 + 테스트)
  ├ W-0408 PR6 (cross-page mount 3차)
  ├ W-0407 PR9~PR15 (잔여)
  └ W-0412 i18n (모든 페이지 번역 키)
```

### C2. 핵심 머지 순서 제약

| 제약 | 이유 |
|------|------|
| W-0408 PR2 < W-0409 PR3 | VerdictInboxSection unmount → Patterns 단독 owner 순서 |
| W-0409 PR1 < W-0409 PR5~PR7 | 탭 골격 후 Lab 흡수 |
| W-0409 PR5 < Terminal `/lab` 링크 정합 검증 | Workshop 진입 URL 살아있어야 Terminal 링크 작동 |
| W-0411 PR1 < W-0411 PR2~PR7 | Layout sidebar 가 모든 섹션 진입 root |
| W-0411 PR4 < /passport (내) redirect | Profile 섹션이 흡수 콘텐츠 |
| W-0407 spike (PR1) < W-0407 PR2~PR15 | spike 결과 따라 후속 PR scope 변경 가능 |
| 모든 W < W-0412 i18n | 페이지 IA 확정 후 번역 키 추출 |

### C3. 충돌 회피 — 파일 락 테이블

| 파일 | W item | 머지 순서 |
|------|--------|----------|
| `routes/dashboard/+page.svelte` | W-0408 다수 PR | PR1→PR6 직렬 |
| `routes/patterns/+page.svelte` | W-0409 PR1~PR8 | 직렬 |
| `routes/settings/+layout.svelte` | W-0411 PR1 단독 | 단일 PR |
| `routes/settings/+page.svelte` | W-0411 PR1 단독 | 단일 PR |
| `appSurfaces.ts` | W-0409 PR7 단독 | W-0407/W-0408/W-0411 건드리지 않음 |
| `hubs/cogochi/AiSearchBar.svelte` | W-0407 다수 PR | 직렬 |
| `routes/cogochi/+page.svelte` | W-0407 다수 PR | 직렬 |
| `MobileFooter.svelte` | W-0409 PR5 + W-0411 PR1 | W-0409 PR5 → W-0411 PR1 |
| `ProfileDrawer.svelte` | W-0411 PR1 단독 | 단일 PR |
| `WalletModal.svelte` | W-0411 PR1 단독 | 단일 PR |

→ **CURRENT.md 파일 락 테이블**에 PR 시작 시 등록.

---

## D. 통합 AC

5페이지 redesign 전체 완료 시점의 통합 검증.

| AC | 검증 |
|----|------|
| IAC1 | 5페이지 모두 빈 stub 0, 실제 콘텐츠 (Terminal/Dashboard/Patterns/Settings/Mobile) |
| IAC2 | `/lab/*`, `/strategies`, `/benchmark`, `/upgrade`, `/passport`(내), `/status`, `/patterns/formula` 모두 redirect 동작 |
| IAC3 | 모든 hardcoded `/lab`, `/upgrade`, `/passport`(내) 링크 grep 결과 0 (codebase 전체) |
| IAC4 | Dashboard ↔ Patterns ↔ Settings cross-link 모두 deep link (`?tab=`, `?section=`) |
| IAC5 | VerdictInboxSection 단일 mount (Patterns rail 만), Dashboard mount 0 |
| IAC6 | EquityCurveChart 단일 컴포넌트 (Lab/Patterns 중복 0) |
| IAC7 | Workshop kieran.ai 스타일 — 슬라이더 → 300ms debounce → auto-rerun |
| IAC8 | Settings 좌 사이드바 nav, `?section=X` 모든 섹션 deep link |
| IAC9 | AC10 Badge `/settings` layout 단독 mount, 항상 in-DOM |
| IAC10 | AI key 서버 persist, 재로그인 후 보존 |
| IAC11 | Chart Theme/Language `/api/preferences` 확장 — 모든 페이지 영향 (Workshop 차트, Terminal 차트, Dashboard 카드) |
| IAC12 | 모바일 ≤1024px — 5페이지 모두 drawer/세로 스택 정상 |
| IAC13 | i18n 키 ko/en — Settings 우선, 나머지 페이지 W-0412 |
| IAC14 | Contract CI 통과 — 5 work item 모두 active 테이블 등록 |
| IAC15 | Lighthouse — 5페이지 LCP < 2.5s 유지 (재설계 회귀 없음) |
| IAC16 | Cross-page 단일 source 검증: tier (walletStore), inbox count (inboxCountStore), density (density.store), preferences (`/api/preferences`) |

---

## E. 위험 요소 + 완화

| Risk | 영향 | 완화 |
|------|------|------|
| W-0407 spike 실패 (lightweight-charts v5 + SVG overlay 양립 불가) | Terminal 재설계 전체 보류 | 사용자 합의 후 차선 (별도 차트 라이브러리 또는 단일 차트 결정) |
| Workshop auto-rerun 성능 (universe×기간 큰 조합) | UI 블록 / 사용자 이탈 | Web Worker 격리 + engine `backtest_thread` fallback (W-0409 §J12) |
| GeneralPanel 분해 시 사용자 설정 손실 | 회귀 | PR2 안에서 마이그레이션 스크립트 + 회귀 테스트 |
| Dashboard `/api/pnl/summary` wiring 후 데이터 형식 불일치 | 잘못된 P&L 표시 | W-0408 PR2 안에서 endpoint contract 검증 |
| AI key localStorage → 서버 마이그레이션 | 기존 사용자 키 손실 | W-0411 PR6 1회 import (localStorage POST 후 clear) |
| 36+ PR 동시 진행 시 main 충돌 | rebase 폭증 | Wave 단위 직렬 머지 + 파일 락 테이블 엄수 |
| W-0412 i18n 미실행 | Language 토글 noop | W-0411 PR7 는 Settings 섹션 키만, 나머지 W-0412 별도 work item |
| `/lab/*` 외부 SEO 영향 | 트래픽 손실 | 301 redirect (W-0409 PR5/6/7) |
| AC10 Badge layout 승격 후 다른 페이지 leak | mental model 혼란 | scope `/settings/**` 만, 다른 layout 영향 0 |
| 36+ PR 의 사용자 검토 부담 | 검토 누락 | Wave 단위로 demo 영상 + IAC 체크리스트 검증 |

---

## F. 권장 실행 순서

1. **W-0407 PR1 spike 먼저** — lightweight-charts v5 + SVG overlay POC (1~2일 timebox)
   - 성공 → 기존 plan 진행
   - 실패 → W-0407 재설계 (차트 라이브러리 변경 또는 다른 접근)
2. **Wave A 4 PR 병렬** (W-0408 PR1, W-0409 PR1, W-0411 PR1, W-0407 PR2~3)
3. **Wave B 직렬** (W-0408 PR2 → W-0409 PR3 순서 엄수)
4. **Wave C 병렬** (W-0409 PR4~5, W-0411 PR3~4, W-0407 PR4~8)
5. **Wave D 병렬** (W-0409 PR6~7, W-0411 PR5~6, W-0408 PR3~5)
6. **Wave E 병렬** (W-0409 PR8, W-0411 PR7, W-0408 PR6, W-0407 잔여)
7. **W-0412 i18n** — 5페이지 IA 확정 후

예상 timeline: Wave A~B 1주, Wave C~D 2주, Wave E + W-0412 1주. **총 ~4주**.

---

## G. 신규 W item 분기

| W | 분기 사유 | 처리 |
|---|----------|------|
| W-0410 (Lab 별도) | W-0409 가 흡수 | **취소** (CURRENT.md 등록 안 함) |
| W-0412 i18n | W-0411 K9 분리 | 5페이지 IA 확정 후 별도 진행 |

---

## H. 다음 단계

1. CURRENT.md 에 W-0413 등록
2. **W-0407 spike 부터 시작** (lightweight-charts v5 + SVG overlay POC)
3. spike 결과 보고 → Wave A 머지 시작 합의
4. Wave 단위 진행
