# App Context (app/src/ 작업 시 필수 로드)

> 이 파일은 `app/src/` Svelte/TS 코드를 수정할 때 로드. engine/ 전용 작업에는 불필요.

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
