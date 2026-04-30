# W-0249 — F-19: Sentry + Observability Dashboard

> Wave 4 P2 | Owner: engine+app | Status: 🟡 Design Draft
> Issue: TBD
> Charter: F-19 (spec/PRIORITIES.md L210)

---

## Goal

Jin이 "오늘 p95 latency 얼마야?" 물을 때 Sentry 대시보드에서 즉시 확인할 수 있다. engine API + app 모두 에러율/지연 추적.

## Owner

engine+app

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/pyproject.toml` | `sentry-sdk[fastapi]` 추가 |
| `engine/api/main.py` | Sentry init (DSN env var, traces_sample_rate=0.1) |
| `engine/observability/sentry.py` | 신규 — Sentry wrapper: capture_exception, set_tag |
| `app/package.json` | `@sentry/sveltekit` 추가 |
| `app/src/hooks.server.ts` | Sentry handleErrorWithSentry 추가 |
| `app/src/hooks.client.ts` | Sentry init (browser DSN) |
| `.env.example` | SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE 추가 |

## Non-Goals

- Grafana 전체 스택 구축 (Sentry만)
- cost-per-WAA 자동 계산 (별도 W-item)
- custom metric 대시보드 (Sentry defaults로 충분)
- 알림 정책 설정 (수동으로 Sentry UI에서)

## Exit Criteria

- [ ] EC-1: engine FastAPI에 Sentry middleware 연결 — Sentry에 트랜잭션 전송 확인
- [ ] EC-2: app SvelteKit에 Sentry client/server init — 에러 캡처 확인
- [ ] EC-3: p95 latency ≤ 2s 측정 가능 (Sentry Performance 탭)
- [ ] EC-4: error rate < 0.5% 측정 가능 (Sentry Issues 탭)
- [ ] EC-5: `SENTRY_DSN` env var 없을 때 Sentry 비활성화 (graceful skip)
- [ ] EC-6: Engine CI green (Sentry 미설치 환경에서도 mock 없이 pass)

## AI Researcher 리스크

- traces_sample_rate=1.0 시 고트래픽에서 Sentry quota 초과 → 0.1 (10%) 설정 필수
- PII 포함 파라미터 (wallet address 등) → `before_send` hook으로 필터링 필요
- 사용자 ID → Sentry에 hashed 형태만 전송

## CTO 설계 결정

- DSN = environment variable (절대 하드코딩 금지)
- traces_sample_rate = 0.1 (prod), 1.0 (staging)
- release 태깅: Git SHA 자동 주입 (`GIT_SHA` env var)
- engine: `sentry-sdk[fastapi]` → FastAPI integration 자동 middleware
- app: `@sentry/sveltekit` → handleErrorWithSentry 하나로 충분

## Facts

1. `engine/observability/metrics.py` — `increment()`, `observe_ms()`, `snapshot()` 자체 metrics 존재
2. `engine/api/main.py` — FastAPI app init 위치 (Sentry init 삽입 지점)
3. `app/src/hooks.server.ts` — SvelteKit server hooks (handleError 삽입 지점)
4. `app/src/hooks.client.ts` — SvelteKit client hooks (Sentry browser init 지점)
5. Sentry SDK: engine=0 설치, app=0 설치 — 신규 추가

## Canonical Files

- `engine/api/main.py`
- `engine/observability/sentry.py` (신규)
- `engine/pyproject.toml`
- `app/src/hooks.server.ts`
- `app/src/hooks.client.ts`
- `app/package.json`

## Assumptions

- Sentry 계정 + DSN 존재 (사용자가 제공)
- Cloud Run/Vercel 환경 변수에 SENTRY_DSN 설정 가능
- traces_sample_rate=0.1 이면 Sentry Free plan quota (50K events/mo) 내 운용 가능

## Decisions

- [D-0249-1] Sentry 단일 도구 (Grafana 미도입). 운영 복잡도 최소화.
- [D-0249-2] DSN 없으면 no-op (CI/로컬 환경 영향 없음).
- [D-0249-3] engine + app 별도 Sentry project (에러 분리).

## Open Questions

- [ ] [Q-1] Sentry DSN은 engine/app 각각인가 하나인가? (현재: 별도 권장)
- [ ] [Q-2] PII 필터링 대상 필드 목록 확정 필요 (wallet_address, email 등)

## Next Steps

1. Sentry 계정에서 engine/app 두 project 생성 → DSN 획득
2. `engine/pyproject.toml` + `app/package.json` 패키지 추가
3. engine: `sentry.py` wrapper + `main.py` init
4. app: `hooks.server.ts` + `hooks.client.ts` init
5. `.env.example` 업데이트
6. CI: SENTRY_DSN 없을 때 graceful skip 확인

## Handoff Checklist

- [ ] Sentry DSN env vars 준비 (사용자 액션)
- [ ] engine Sentry middleware CI green
- [ ] app Sentry init CI green
- [ ] p95/error rate Sentry Performance 탭 확인
