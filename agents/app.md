# App Context (app/src/ 작업 시 필수 로드)

> 이 파일은 `app/src/` Svelte/TS 코드를 수정할 때 로드. engine/ 전용 작업에는 불필요.

---

## 진입 체크리스트 (3-step, skip 금지)

1. `spec/NAMING.md` 확인 — 탭 이름, SHELL_KEY, 파일 경로 계약
2. `work/active/CURRENT.md` 확인 — 에이전트 락 테이블 (내 락 파일 범위 확인)
3. 도메인 게이트 확인 (아래 표) — 건드리는 폴더에 따라 추가 문서 로드

---

## 도메인 게이트

| 건드리는 경로 | 추가 로드 필수 |
|---|---|
| `app/src/lib/cogochi/**` | `docs/product/PRODUCT-DESIGN-PAGES-V2.md` + `spec/NAMING.md §1~§5` |
| `app/src/components/terminal/**` | `spec/NAMING.md §7` (Layout Contracts) |
| `app/src/routes/**` | `spec/NAMING.md §6` (API Routes) |
| `engine/**` | `agents/engine.md` |

---

## P 문서 지도

| 문서 | 경로 | 언제 읽는가 |
|---|---|---|
| **PRODUCT-DESIGN-PAGES-V2** | `docs/product/PRODUCT-DESIGN-PAGES-V2.md` | cogochi/ 컴포넌트 신규 작성 또는 레이아웃 변경 시 |
| **PTRACK** | `docs/product/PTRACK.md` | 패턴 엔진 / 퀀트 실적 추적 관련 작업 시 |
| **PRD** | `docs/product/PRD.md` | 제품 요구사항 전체 확인 필요 시 |
| **PRIORITIES** | `spec/PRIORITIES.md` | Wave 우선순위 / frozen 항목 확인 시 |
| **PATTERN_ENGINE** | `docs/domains/pattern-engine.md` | 패턴 탐지 로직 변경 시 |
| **P-00~P-03** | `docs/decisions/P-00.md` ~ `P-03.md` | 주요 아키텍처 결정 검토 시 |

---

## Cogochi 컴포넌트 구조

```
app/src/lib/cogochi/
├── AIAgentPanel.svelte          — 5탭 패널 (decision/pattern/verdict/research/judge)
├── aiQueryRouter.ts             — 자연어 → AIQueryAction 라우터
├── shell.store.ts               — 전역 상태 (SHELL_KEY: cogochi_shell_v12)
├── components/
│   ├── DrawerSlide.svelte       — 슬라이드 드로어
│   ├── DrawingToolbar.svelte    — 드로잉 도구 툴바
│   └── IndicatorLibrary.svelte  — TV-style 인디케이터 추가/검색/핀
└── modes/
    ├── TradeMode.svelte         — 메인 트레이딩 레이아웃
    ├── AnalyzePanel.svelte      — verdict 탭 콘텐츠
    └── ScanPanel.svelte         — research 탭 콘텐츠
```

---

## Cogochi 핵심 계약 (spec/NAMING.md 요약)

- **RightPanelTab**: `decision | pattern | verdict | research | judge` (`analyze`/`scan` 금지)
- **SHELL_KEY**: `cogochi_shell_v12`
- **drawerTab**: `'verdict' | 'research' | 'judge'`
- **DrawerSlide 경로**: `cogochi/components/DrawerSlide.svelte` (top-level 금지)
- **drawing API**: `shellStore.setDrawingTool(tool)` (`toggleDrawingMode` 금지)

---

## App 구조

```
app/src/
├── routes/         — SvelteKit 페이지 (+page.svelte, +server.ts)
│   ├── patterns/   — Pattern 목록 + 검색 + 상세
│   ├── api/        — BFF API routes
│   └── status/     — Health check
├── lib/
│   ├── components/ — 공용 UI 컴포넌트
│   ├── cogochi/    — Bloomberg UX 전용 (위 구조 참조)
│   ├── server/     — 서버 전용 로직 (authGuard, db)
│   ├── home/       — 홈 랜딩
│   └── i18n/       — 국제화
└── hooks.server.ts — 서버 훅 (auth, session)
```

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `routes/patterns/+page.svelte` | 패턴 목록 페이지 |
| `routes/patterns/search/+page.svelte` | 패턴 검색 |
| `lib/server/authGuard.ts` | 인증 가드 |
| `app.d.ts` | 전역 타입 |
| `hooks.server.ts` | 서버 미들웨어 |

## 개발 서버

```bash
cd app && npm run dev
```

## 타입 체크 + 린트

```bash
cd app && npm run check    # svelte-check + tsc
cd app && npm run lint
```

## Contract 동기화 (engine API 변경 후 필수)

```bash
cd app && npm run contract:sync:engine-types
```

## 인증 패턴

```typescript
// 모든 server-side route에 필수
import { requireAuth } from '$lib/server/authGuard';
const user = await requireAuth(event);
```

## 환경 변수

- `ENGINE_URL` — Cloud Run engine URL
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — Supabase 접근
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용

## Vercel 배포

- production: `release` 브랜치 → Vercel auto-deploy
- preview: PR → Vercel preview URL
- 수동: `cd app && vercel deploy --prod` (프로덕션 긴급 배포)

## 도메인 docs

- `docs/runbooks/deploy-app.md`
- `docs/runbooks/secrets.md`
