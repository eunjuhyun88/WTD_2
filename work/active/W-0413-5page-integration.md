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
| W-0408 | Dashboard | 7 | 16 | VerdictInboxSection unmount 순서, /api/pnl/summary wiring (PR1·PR2·PR2.5·PR3·PR4·PR5·PR6) |
| W-0409 | Patterns + Lab 흡수 | 8 | 22 | Workshop kieran.ai-style auto-rerun 성능, /lab/* 8곳 링크 교체 |
| W-0411 | Settings | 7 | 22 | GeneralPanel 450줄 분해, AC10 Badge layout 승격 |
| W-0412 | i18n (W-0411 K9 분리) | 4 (계획) | 8 (계획) | Settings 외 페이지 전체 번역 키 추가 — `work/active/W-0412-i18n-rollout.md` 참조 |

총 **37+ PR (W-0412 4건 포함 시 41+)**, **102 결정 락**.

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

### C1. Wave 단위 머지 (의존성 그래프) — §J12 갱신본

```
Wave A0 — Spike Gate (단독, 1~2일 timebox)
  └ W-0407 W-T0 (lightweight-charts v5 panes API + 드로잉 layer 결정 spike)
       Exit gate: §J5 — pass 안 나오면 Wave A 진입 금지

Wave A — 무의존 골격 (W-T0 통과 후, 병렬)
  ├ W-0408 PR1 (Dashboard 골격)
  ├ W-0409 PR1 (탭 골격 + Compare 흡수 + redirect query-param 통일)
  ├ W-0411 PR1 (Layout sidebar + AC10 승격 + AppTopBar K7 통합)
  └ W-0407 W-T1, W-T2 (TabBar 신설 + ChartPane v5 마이그레이션)

Wave B — Cross-page 단일화 (Wave A 후)
  ├ W-0408 PR2 (VerdictInboxSection **unmount only** — 컴포넌트 파일 보존, §J4)
  ├ W-0409 PR3 (Patterns 단독 owner)          [W-0408 PR2 후]
  ├ W-0408 PR2.5 (cross-page mount 1차)
  ├ W-0409 PR2 (Search + Lifecycle)
  ├ W-0411 PR2 (GeneralPanel 분해 — inboxCountStore 잠정 read, §J7)
  └ W-0407 W-T3, W-T4 (drawing overlay + range capture)

Wave C — 핵심 기능 흡수 (Wave B 후)
  ├ W-0409 PR4 ([slug] Formula + CopyTradingLeaderboard 단독 owner, §J10)
  ├ W-0409 PR5 (Workshop 골격 + Lab 흡수 1차 + Terminal /lab URL 교체)
  ├ W-0411 PR3 (Subscription + /upgrade 흡수)
  ├ W-0411 PR4 (Profile + /passport 정리 + Privy/wallet)
  ├ W-0407 W-T5 (engine aggregated indicator API — **백엔드 PR 별도, §J6**)
  └ W-0407 W-T6~W-T8 (Velo/TV 통합)

Wave D — 고급 기능 (Wave C 후)
  ├ W-0409 PR6 (Workshop Refinement/Counterfactual + Live)
  ├ W-0409 PR7 (Research + lab surface 제거)
  ├ W-0411 PR5 (Privacy/Legal + Data export + Usage)
  ├ W-0411 PR6 (AI key 서버 persist + LLM provider)
  └ W-0408 PR3~PR5 (흡수 + 모바일 + WVPL — **inboxCountStore 삭제 포함, §J7**)

Wave E — 모바일 + 폴리시 + 잔여 (Wave D 후)
  ├ W-0411 정리 sub-PR (inboxBadge 단일화 — W-0408 inboxCountStore 삭제 후, §J7)
  ├ W-0409 PR8 (모바일 drawer)
  ├ W-0411 PR7 (System + Theme/Lang + 모바일 + 테스트)
  ├ W-0408 PR6 (cross-page mount 3차)
  ├ W-0407 W-T9 (AppTopBar 통합 — **W-0411 PR1 후**, §J8)
  ├ W-0407 W-T10~W-T13 (잔여 surface 정리)
  ├ W-0407 W-T14 (orphan 일괄 삭제 — ChartBoardHeader/SaveStrip/ChartBoard, **W-0409 PR5 URL 교체 후**, §J8)
  └ W-0412 i18n PR1~PR4 (모든 페이지 번역 키)
```

### C2. 핵심 머지 순서 제약

| 제약 | 이유 |
|------|------|
| W-0408 PR2 < W-0409 PR3 | VerdictInboxSection unmount → Patterns 단독 owner 순서 |
| W-0409 PR1 < W-0409 PR5~PR7 | 탭 골격 후 Lab 흡수 |
| W-0409 PR5 < Terminal `/lab` 링크 정합 검증 | Workshop 진입 URL 살아있어야 Terminal 링크 작동 |
| W-0411 PR1 < W-0411 PR2~PR7 | Layout sidebar 가 모든 섹션 진입 root |
| W-0411 PR4 < /passport (내) redirect | Profile 섹션이 흡수 콘텐츠 |
| W-0407 W-T0 spike < W-0407 W-T1~W-T14 | spike 결과 따라 후속 PR scope 변경 가능 (Wave A0 → Wave A 게이트, §J5) |
| W-0407 W-T5 (engine 백엔드) < W-T6 frontend 통합 | aggregated API 가 contract-stable 해야 frontend wiring 가능 (§J6) |
| W-0411 PR1 (AppTopBar K7) < W-0407 W-T9 (AppTopBar 통합) | settings 진입점 + AC10 layout 먼저 확정 (§J8) |
| W-0409 PR5 (`ChartBoardHeader`/`SaveStrip` URL 교체) < W-0407 W-T14 (orphan 삭제) | URL 교체 후 폐기 — 역순 시 link 깨짐 (§J8) |
| W-0408 PR3~PR5 (inboxCountStore 삭제) < W-0411 정리 sub-PR | store 삭제 → consumer cleanup 순서 (§J7) |
| 모든 W < W-0412 i18n PR4 | 페이지 IA 확정 후 번역 키 추출 — W-0412 PR1~PR3 는 인프라/우선 페이지부터 병행 가능 |

### C3. 충돌 회피 — 파일 락 테이블

| 파일 | W item | 머지 순서 | 출처 |
|------|--------|----------|------|
| `routes/dashboard/+page.svelte` | W-0408 다수 PR + **W-0409 PR5** (`goto('/lab')` → `/patterns?tab=workshop` 교체) | W-0408 PR1→PR6 직렬 → W-0409 PR5 rebase | §J8 |
| `routes/patterns/+page.svelte` | W-0409 PR1~PR8 | 직렬 | — |
| `routes/settings/+layout.svelte` | W-0411 PR1 단독 | 단일 PR | — |
| `routes/settings/+page.svelte` | W-0411 PR1 단독 | 단일 PR | — |
| `lib/utils/appSurfaces.ts` | W-0409 PR7 단독 (`lab` surface 제거, `patterns` activePaths 확장) | W-0407/W-0408/W-0411 건드리지 않음 — settings 는 utility nav 하드코딩 (§J3) | §J3 |
| `hubs/cogochi/AiSearchBar.svelte` | W-0407 다수 PR | 직렬 | — |
| `routes/cogochi/+page.svelte` | W-0407 다수 PR | 직렬 | — |
| `lib/shared/panels/MobileFooter.svelte` | W-0409 PR5 (LAB 항목 **삭제**) + W-0411 PR1 (Settings 항목 **신규 추가**) — 같은 `navItems` line 24~27 영역 (§J2) | W-0409 PR5 → W-0411 PR1 (LAB 삭제 후 Settings 추가) | §J2 |
| `lib/shared/panels/AppNavRail.svelte` (or `MobileBottomNav.svelte`) | W-0409 PR7 (lab 항목 제거) + W-0411 PR1 (Settings 진입점) | W-0409 PR7 → W-0411 PR1 | §J8 |
| `lib/components/layout/AppTopBar.svelte` | W-0407 W-T9 (AppTopBar 통합) + W-0411 §K7 PR1 (settings 진입점 + AC10 layout 승격) | **W-0411 PR1 → W-0407 W-T9** (settings + AC10 먼저) | §J8 |
| `hubs/terminal/workspace/ChartBoardHeader.svelte` | W-0407 W-T14 (orphan 폐기) + W-0409 PR5 (`/lab` URL → `/patterns?tab=workshop` 교체) | **W-0409 PR5 → W-0407 W-T14** (URL 교체 후 폐기) | §J8 |
| `hubs/terminal/workspace/SaveStrip.svelte` | 위 동일 | 위 동일 | §J8 |
| `hubs/terminal/workspace/ChartBoard.svelte` | 위 동일 | 위 동일 | §J8 |
| `lib/stores/inboxCountStore.ts` | W-0408 PR3~PR5 (삭제) + W-0411 PR2 (잠정 read) + W-0411 정리 sub-PR (inboxBadge 단일화) | **W-0411 PR2 잠정 read → W-0408 삭제 → W-0411 정리 sub-PR** (Wave B → D → E) | §J7 |
| `lib/stores/inboxBadge.store.ts` | W-0408 단일 source 정의 + W-0411 read | W-0408 → W-0411 | §J7 |
| `ProfileDrawer.svelte` | W-0411 PR1 단독 | 단일 PR | — |
| `WalletModal.svelte` | W-0411 PR1 단독 | 단일 PR | — |

→ **CURRENT.md 파일 락 테이블**에 PR 시작 시 등록 (위 표 17행 전부).

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
| IAC16 | Cross-page 단일 source 검증: tier (`walletStore`), inbox count (**`inboxBadge.store` 단일** — `inboxCountStore` 는 W-0408 에서 삭제, §J7), density (`density.store`), preferences (`/api/preferences`) |

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
| **inboxCountStore wave 순서 역전 (§J7)** — W-0411 PR2 (Wave B) read vs W-0408 PR3~PR5 (Wave D) 삭제 | Notifications 섹션 빌드 깨짐 가능 | W-0411 PR2 잠정 두 store 모두 read → W-0408 삭제 후 W-0411 정리 sub-PR (Wave E) |
| **W-0407 cross-cut 4건 (§J9)**: #1 v5↔W-0399 indicators 재배선, #2 SVG↔W-0403 drawing layer, #3 aggregator↔W-0404 Scan mode, #10 mode 4→1↔W-0402 | 산출물 재작업 / contract drift | W-T0 spike 본문에 4건 검증 항목 명시, W-T2/W-T5 PR body 에 cross-cut 영향 표기 필수 |
| **CopyTradingLeaderboard 2-owner (§J10)** — W-0408 cross-page mount + W-0409 PR4 (Compare) | 코드 복제 / behaviour 분기 | **W-0409 PR4 단독 owner**, W-0408 cross-page mount 후보에서 제외 |
| **ResearchBlockRenderer 2-owner (§J10)** — W-0407 흡수 vs W-0409 PR7 (Research 탭) | 코드 복제 | **W-0409 PR7 단독 owner**, W-0407 AI Research mode 는 별도 컴포넌트 신설 |
| **EquityCurve 3-component (§J1)** — Lab/Patterns/Agent props 전부 다름 | 단일화 시도 시 Agent fetch wrapper 깨짐 | W-0409 PR5 단일화는 **Lab + Patterns 2개로 한정**, `lib/hubs/agent/panels/EquityCurve.svelte` 별도 owner 유지 |
| **W-T0 spike fail 시 SVG 결정 미정 (§J9 #2)** — DrawingManager 는 현재 Canvas 2D 기반 | overlay 재구현 비용 폭증 | spike 항목에 "현 Canvas 유지 vs SVG 신규" 비교 필수, 결과를 W-0403 drawing layer 결정과 동기화 |
| **`paneLayoutStore` vs `IChartApi.addPane()` 충돌 (§J9, W-0407 검증)** — store 기반 자체 멀티 pane 이미 작동 중 | W-0407 의 v5 panes 마이그레이션 가정 와해 | spike 결과로 (a) store 폐기 + native panes 또는 (b) store 유지 + adapter 결정. W-T2 본문에 결정 반영 |
| **lightweight-charts v5.2.0 minor drift** | 향후 마이너 업데이트 시 panes API 시그니처 변경 위험 | W-T0 spike 시 `app/package.json` 의 `^5.1.0` → `~5.2.0` (caret→tilde) 검토 |

---

## F. 권장 실행 순서 — §J11 갱신본

1. **Wave A0: W-0407 W-T0 spike** — lightweight-charts v5 panes API + 드로잉 layer (Canvas vs SVG) POC (1~2일 timebox, §J5)
   - Exit gate (필수 검증):
     - (a) v5 `IChartApi.addPane()` 와 기존 `paneLayoutStore` 양립 가능 여부 (§J9)
     - (b) Canvas 유지 vs SVG 마이그레이션 비용 비교 (§J9 #2)
     - (c) W-0399 multi-instance indicator 재배선 비용 (§J9 #1)
     - (d) SSR `browser` guard 전략 (lightweight-charts 는 browser-only)
     - (e) perf budget — LCP < 2.5s, 차트 mount < 500ms
   - 성공 → Wave A 진입
   - 실패 → W-0407 재설계 (차트 라이브러리 변경 또는 단일 차트 결정)
2. **Wave A 4 PR 병렬** (W-0408 PR1, W-0409 PR1, W-0411 PR1, W-0407 W-T1+W-T2)
3. **Wave B 직렬** (W-0408 PR2 → W-0409 PR3 순서 엄수, W-0411 PR2 inboxCountStore 잠정 read)
4. **Wave C 병렬** (W-0409 PR4~5, W-0411 PR3~4, W-0407 W-T5~W-T8) — W-T5 는 engine 백엔드 PR 별도
5. **Wave D 병렬** (W-0409 PR6~7, W-0411 PR5~6, W-0408 PR3~5 inboxCountStore 삭제)
6. **Wave E 병렬** (W-0411 정리 sub-PR, W-0409 PR8, W-0411 PR7, W-0408 PR6, W-0407 W-T9 (W-0411 PR1 후), W-0407 W-T10~W-T13, W-0407 W-T14 (W-0409 PR5 후), W-0412 i18n)

예상 timeline (§J11):
- Wave A0: 0.5주 (spike + gate decision)
- Wave A~B: 1주
- Wave C~D: 2주 (W-T5 engine 백엔드 병목 +0.3주, ChartBoardHeader 직렬화 +0.2주 흡수)
- Wave E + W-0412: 1.5주 (inboxCountStore 정리 sub-PR +0.2주, W-T14 잔여 정리 +0.3주)

**총 ~5주** (기존 4주 → 1주 buffer 추가).

---

## G. 신규 W item 분기

| W | 분기 사유 | 처리 |
|---|----------|------|
| W-0410 (Lab 별도) | W-0409 가 흡수 | **취소** (CURRENT.md 등록 안 함) |
| W-0412 i18n | W-0411 K9 분리 | **stub 작성 완료** — `work/active/W-0412-i18n-rollout.md`. 5페이지 IA 확정 후 PR1~PR4 진행 |

---

## H. 다음 단계

1. CURRENT.md 에 W-0413 등록 (완료)
2. **Wave A0 = W-0407 W-T0 spike 부터 시작** — lightweight-charts v5 panes + Canvas vs SVG drawing layer POC (1~2일)
3. Spike Exit Gate 5개 항목 (§F.1) 통과 확인 → Wave A 머지 시작 합의
4. Wave 단위 진행 (총 5주, §J11)
5. inboxCountStore 정리 sub-PR 발급 시점은 W-0408 삭제 PR 머지 직후 (Wave D → E 경계)
6. W-0412 i18n 은 Wave E 진입 시 W-0412 PR1 (인프라/extractor) 부터 병행 가능

---

## J. 검증 후 보강 (2026-05-05 4-agent 실측 audit)

### J1. EquityCurve — 3개 컴포넌트 (가정 부정확)

기존 §B1 가정: "Lab + Patterns/[slug] 2개, W-0409 PR5 에서 단일화".

실측: **3개 별개 컴포넌트, props 전부 다름.**

| 컴포넌트 | 경로 | Props | 사용처 |
|----------|------|-------|--------|
| `EquityCurveChart` | `components/lab/EquityCurveChart.svelte` | `series: EquitySeries\|null` | LabHub |
| `PatternEquityCurve` | `lib/components/patterns/PatternEquityCurve.svelte` | `points: PnLStatsPoint[]` | patterns/[slug] |
| `EquityCurve` | `lib/hubs/agent/panels/EquityCurve.svelte` | `agentId: string` | AgentHub |

→ **단순 props superset 통합 불가**. W-0409 PR5 의 "단일화" 는 Lab+Patterns 2개로 한정. **Agent 의 `EquityCurve` 는 별도 owner 유지** (props 가 fetch 래퍼 — agentId only). W-0409 PR5 에서 Lab/Patterns 두 개만 통합, Agent 컴포넌트는 그대로.

### J2. MobileFooter — 현재 Settings 항목 없음

기존 §B2: "MobileFooter `/lab` LAB 항목 → 삭제" + "Settings 진입점 갱신".

실측: 현재 `navItems = [{cogochi}, {home}, {lab}, {dashboard}]`. **Settings 항목 자체가 없음.** Settings 는 `Header.svelte` desktop 에만.

→ W-0409 PR5 = LAB 삭제. W-0411 PR1 = **Settings 항목 신규 추가** (갱신이 아니라). 두 PR 이 같은 `navItems` 배열 같은 영역(line 24~27) 수정 → 충돌 위험. **머지 순서: W-0409 PR5 → W-0411 PR1** (LAB 삭제 후 Settings 추가).

### J3. appSurfaces.ts — settings surface 부재 + MobileFooter 미사용

기존 §B4: "W-0411 settings surface 변경 없음 (utility nav, 직접 하드코딩)".

실측: **`AppSurfaceId` 타입에도 SURFACE_MAP 에도 `settings` 정의 없음.** MobileFooter 는 이 파일 미사용 (자체 navItems 하드코딩). 소비처는 `Header.svelte` (DESKTOP_NAV_SURFACES) 만.

→ W-0411 가 Settings 를 nav 에 통합 노출하려면 **AppSurfaceId 타입 + SURFACE_MAP 신규 항목 추가** 필요. 현 W-0411 §K15 "settings 는 utility nav 별도 하드코딩" 결정과 일치하나, 만약 통합 nav 로 가면 appSurfaces 도 W-0411 owner. **결정 유지**: settings 는 utility nav, appSurfaces 건드리지 않음.

### J4. W-0408 PR2 "VerdictInboxSection 삭제" 용어 모호성

W-0408 §E PR2 본문: "DashActivityGrid + VerdictInboxSection **삭제**". §C: "dashboard 에서만 unmount — 컴포넌트 자체 삭제 금지".

→ PR2 구현 시 컴포넌트 파일을 실수로 삭제하면 W-0409 PR3 의 rail Inbox 깨짐. **W-0408 §E PR2 본문 용어 정정 필요**: "삭제" → "Dashboard 에서 unmount (컴포넌트 파일 보존)".

### J5. W-0407 W-T0 spike → W-T2 게이트 명시

기존 §C1 Wave A: "W-0407 PR1~PR3 (Terminal spike + lightweight-charts v5 마이그레이션)".

실측: W-T0 spike 통과 후에야 W-T2 (lightweight-charts v5 마이그레이션) 발급. Wave A 에 W-T0+W-T2 묶으면 **순서 위반 위험**.

→ Wave A 분리: **W-T0 spike 단독 = Wave A0** → spike Exit Gate (§F.1 5개 항목) 통과 → W-T1+W-T2 진행 = Wave A. (§C1·§F·§J12 모두 "Wave A0" 명칭 통일)

### J6. W-T5 백엔드 병목 (Aggregated API engine/)

W-T5 = Aggregated 인디케이터 API (engine/) 신규. **engine 측 PR 필요** — frontend PR 와 별도 직렬.

→ W-0413 timeline 추정에 engine 백엔드 병목 미반영. **W-T5 는 별도 백엔드 PR + frontend 통합 PR 2단**.

### J7. inboxCountStore — W-0408 삭제 vs W-0411 read

W-0408 M4: `inboxCountStore` 삭제, `inboxBadge.store` 단일 source 통합.
W-0411 §K13: Notifications 섹션이 `inboxBadge.store` / `inboxCountStore` 표시 — **삭제될 store 를 read 명시**.

→ **W-0411 §K13 정정**: `inboxCountStore` 제거, `inboxBadge.store` 만 read. **머지 순서: W-0408 PR (M4 포함) → W-0411 PR2 (Notifications)** — 하지만 §C1 Wave 분류는 W-0408 흡수가 Wave D, W-0411 PR2 가 Wave B → 순서 역전. **W-0411 PR2 가 잠정적으로 두 store 모두 read 후 W-0408 머지 시점에 정리 sub-PR 필요**.

### J8. §C3 파일 락 테이블 — 7건 추가 완료 (§C3 본문 갱신 반영)

| 파일 | W item | 머지 순서 |
|------|--------|----------|
| `components/layout/AppTopBar.svelte` | W-0407 W-T9 + W-0411 K7 PR1 | W-0411 PR1 → W-0407 W-T9 |
| `lib/shared/panels/AppNavRail.svelte` 또는 `MobileBottomNav.svelte` | W-0409 PR7 (lab 항목 제거) + W-0411 PR1 (Settings 진입점) | W-0409 PR7 → W-0411 PR1 |
| `routes/dashboard/+page.svelte` | W-0408 다수 PR + **W-0409 PR5** (`goto('/lab')` 교체) | W-0408 직렬 완료 → W-0409 PR5 rebase |
| `hubs/terminal/workspace/ChartBoardHeader.svelte` | W-0407 W-T14 (폐기) + W-0409 PR5 (URL 교체) | **W-0409 PR5 → W-0407 W-T14** (URL 먼저, 폐기 나중) |
| `hubs/terminal/workspace/SaveStrip.svelte` | 위 동일 | 위 동일 |
| `hubs/terminal/workspace/ChartBoard.svelte` | 위 동일 | 위 동일 |
| `lib/stores/inboxCountStore.ts` | W-0408 (삭제) + W-0411 (read) | W-0411 잠정 read → W-0408 삭제 → W-0411 정리 sub-PR |

→ **§C3 본문에 7행 통합 완료** (이 §J8 표는 변경 이력 보존용). CURRENT.md 파일 락 테이블에 PR 시작 시 등록.

### J9. W-0407 Cross-cut Decision (12개 중 4개)

| W-0407 Decision | Cross-cut 대상 | 영향 |
|-----------------|---------------|------|
| #1 lightweight-charts v5 | W-0399 (multi-instance indicators, clientIndicators.ts) | v5 마이그레이션 후 W-0399 산출물 재배선 필요 |
| #2 SVG overlay | W-0403 (surface decomposition) drawing layer | 정합 검증 필요 |
| #10 Mode 4→1축 (workMode 단일) | W-0402 (terminal foldable panels) mode 처리 | 직접 cross-cut |
| #3 자체 aggregator | W-0404 (AI NL litellm) Scan mode 결과 | aggregated data 소유권 명확화 |

→ §B1 컴포넌트 공유 표에 추가 cross-cut 4건 명시.

### J10. W-0407 Cross-page orphan disposition

| Orphan | W-0407 처리 → 실제 owner |
|--------|-------------------------|
| `PatternLibraryPanelAdapter`, `PatternClassBreakdown` | AI 패널 Pattern mode 흡수 — Patterns(W-0409) 와 공유 가능성 |
| `PineGenerator` | Lab 귀속 → W-0409 (Lab 흡수) |
| `DogeOSWalletButton` | Settings 귀속 → W-0411 §K16 |
| `CopyTradingLeaderboard` | Dashboard 귀속 → W-0408 cross-page mount + W-0409 PR4 (Compare 탭) — **2 owner 충돌** |
| `AIAgentPanel` | W-0404 multi-provider litellm 대상과 동일 — 중첩 |
| `ResearchBlockRenderer` | W-0407 흡수 + W-0409 PR7 흡수 — **2 owner 충돌** |

→ **`CopyTradingLeaderboard` + `ResearchBlockRenderer` 2건 owner 충돌**. 결정 필요:
- `CopyTradingLeaderboard`: W-0409 PR4 (Compare 탭) **단독 owner**, W-0408 cross-page mount 후보에서 제외
- `ResearchBlockRenderer`: W-0409 PR7 (Research 탭) **단독 owner**, W-0407 AI Research mode 는 별도 컴포넌트 신설

### J11. 통합 timeline 재추정

기존: 4주.

실측 보강 후:
- W-T0 spike 단독 → +0.5주 (game gate)
- W-T5 백엔드 병목 → +0.5주
- inboxCountStore 정리 sub-PR → +0.2주
- ChartBoardHeader 등 머지 순서 직렬화 (W-0409 PR5 → W-0407 W-T14) → +0.3주

→ **재추정: ~5주** (기존 4주 + 1주 buffer).

### J12. Wave 분류 갱신

```
Wave A0 — Spike gate (단독)
  └ W-0407 W-T0 (lightweight-charts v5 + SVG overlay POC)

Wave A — 무의존 골격 (W-T0 통과 후)
  ├ W-0408 PR1 (Dashboard 골격)
  ├ W-0409 PR1 (탭 골격 + Compare 흡수)
  ├ W-0411 PR1 (Layout sidebar + AC10 + AppTopBar K7)
  └ W-0407 W-T1, W-T2 (TabBar + ChartPane v5)

Wave B — Cross-page 단일화
  ├ W-0408 PR2 (VerdictInboxSection unmount, 컴포넌트 보존)
  ├ W-0409 PR3 (Patterns 단독 owner)
  ├ W-0408 PR2.5 (cross-page mount 1차)
  ├ W-0409 PR2 (Search + Lifecycle)
  ├ W-0411 PR2 (GeneralPanel 분해, inboxCountStore 잠정 read)
  └ W-0407 W-T3, W-T4 (drawing overlay + range capture)

Wave C — 핵심 기능 흡수
  ├ W-0409 PR4 ([slug] Formula + CopyTradingLeaderboard 단독 owner)
  ├ W-0409 PR5 (Workshop + Lab 흡수 1차 + Terminal /lab URL 교체)
  ├ W-0411 PR3 (Subscription + /upgrade)
  ├ W-0411 PR4 (Profile + /passport + Privy/wallet)
  ├ W-0407 W-T5 (engine aggregated API — 백엔드)
  └ W-0407 W-T6, W-T7, W-T8

Wave D — 고급 기능
  ├ W-0409 PR6 (Workshop Refinement/Counterfactual + Live)
  ├ W-0409 PR7 (Research + lab surface 제거)
  ├ W-0411 PR5 (Privacy/Legal + Usage)
  ├ W-0411 PR6 (AI key 서버 persist)
  └ W-0408 PR3~PR5 (흡수 + 모바일 + WVPL, inboxCountStore 삭제)

Wave E — 모바일 + 폴리시 + 잔여
  ├ W-0411 정리 sub-PR (inboxBadge 단일화)
  ├ W-0409 PR8 (모바일 drawer)
  ├ W-0411 PR7 (System + Theme/Lang + 모바일 + 테스트)
  ├ W-0408 PR6 (cross-page mount 3차)
  ├ W-0407 W-T9 (AppTopBar 통합 — W-0411 PR1 후)
  ├ W-0407 W-T10~W-T13
  ├ W-0407 W-T14 (orphan 일괄 삭제 — 모든 Cross-W 정리 후)
  └ W-0412 i18n
```

### J13. 추가 IAC

| AC | 검증 |
|----|------|
| IAC17 | W-0407 W-T0 spike 통과 후에만 W-T2 시작 (게이트 검증) |
| IAC18 | EquityCurve Lab+Patterns 통합, Agent 별도 owner 유지 |
| IAC19 | MobileFooter LAB 항목 제거 + Settings 항목 추가 (충돌 없는 머지 순서) |
| IAC20 | inboxCountStore 삭제 후 inboxBadge.store 단일 source — Notifications 섹션 정상 작동 |
| IAC21 | CopyTradingLeaderboard W-0409 PR4 단독 owner (W-0408 mount 0) |
| IAC22 | ResearchBlockRenderer W-0409 PR7 단독 owner |
| IAC23 | W-0408 PR2 머지 후 VerdictInboxSection.svelte 파일 존재 (unmount only, 삭제 X) |
