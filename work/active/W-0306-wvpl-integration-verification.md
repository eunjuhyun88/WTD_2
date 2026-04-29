# W-0306 — WVPL Integration Verification Automation

> Wave: Wave4/D | Priority: P1 | Effort: M (2-3일)
> Charter: In-Scope L7 (Refinement) — verification 인프라
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Parent: W-0305 (D2 NSM WVPL)
> Issue: #642

## Goal

W-0305에서 추가된 WVPL 파이프라인(엔진 aggregator → Supabase → 앱 프록시 → WVPLCard)이 단위 테스트로 못 잡는 integration 갭(실 DB upsert / 프록시 런타임 계약 / DOM 렌더)을 자동화 검증으로 메워, 머지 직후 회귀를 사전에 차단한다.

## Owner

engine + app

## Scope

### 포함
- 엔진: 스테이징 통합 테스트 (실 Supabase 호출, env-gated)
- 앱: 프록시 contract 테스트 (런타임 fetch + cookies mock)
- 앱: 컴포넌트 DOM 테스트 (jsdom + @testing-library/svelte)

### 파일 (신규/수정 — 실측 기반)

- `engine/tests/integration/__init__.py` (신규, 빈 패키지 init)
- `engine/tests/integration/test_wvpl_supabase.py` (신규 ~50줄)
- `app/src/routes/api/dashboard/wvpl/+server.test.ts` (신규 ~70줄)
- `app/src/lib/components/dashboard/WVPLCard.test.ts` (신규 ~80줄)
- `app/vitest.config.ts` (수정 — environmentMatchGlobs 추가)
- `app/package.json` (수정 — devDeps: `@testing-library/svelte ^5.2.0`, `jsdom`)

## Non-Goals

- 비주얼 회귀 테스트 (Percy/Chromatic) — 수동 review로 충분
- 멀티 브라우저 E2E (Playwright cross-browser) — 단일 페르소나 Jin이라 불필요
- 부하 테스트 (k6/locust) — Exit Criteria의 p95는 단위 측정으로 충분
- 신규 coordination 도구/스크립트 — Charter 250줄 룰 회피
- GitHub Actions secret 주입 자동화 — 별도 인프라 작업으로 분리 (Q-0306-3 결정)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| jsdom 추가가 기존 19개 node 테스트에 부작용 | 중 | 중 | `environmentMatchGlobs`로 글롭 분리, CI에서 기존 테스트 회귀 게이트 |
| Supabase 스테이징 미존재/secret 미주입 | 높음 | 저 | env-gated skip — 미설정 시 자동 skip, CI red 안 됨 |
| 테스트 row 누적으로 staging 오염 | 중 | 저 | 고정 `TEST_USER_ID = 00000000-0000-0000-0000-000000000305` + try/finally DELETE |
| @testing-library/svelte와 Svelte 5.51 호환성 | 저 | 중 | 사전조사 완료 — `^5.2.0` 호환 (Q-0306-4 해소) |
| network flake로 CI red | 중 | 저 | retry 1회 + skip |
| 250줄 룰 초과 | 저 | 저 | AC7로 라인 budget 명시 (~220줄 예산) |

### Dependencies

- `@testing-library/svelte ^5.2.0` (신규 devDep, Svelte 5 호환 확인)
- `jsdom` (신규 devDep)
- `supabase-py` (이미 `_supabase_writer`에서 사용)
- 스테이징 Supabase project (외부 의존, secret 주입은 별도 작업)

### Rollback

- 각 테스트 파일 단독 — 실패 시 해당 파일만 `.skip` 또는 삭제
- `vitest.config.ts`의 `environmentMatchGlobs`만 revert하면 기존 node 환경 복귀
- devDeps 2개는 dev 전용 → production 영향 0

### Files Touched (실측)

- 신규: `engine/tests/integration/__init__.py`
- 신규: `engine/tests/integration/test_wvpl_supabase.py`
- 신규: `app/src/routes/api/dashboard/wvpl/+server.test.ts`
- 신규: `app/src/lib/components/dashboard/WVPLCard.test.ts`
- 수정: `app/vitest.config.ts`
- 수정: `app/package.json` + lockfile

## AI Researcher 관점

### Data Impact

- 스테이징 DB `user_wvpl_weekly`에 테스트 row 1-2건 임시 INSERT
- cleanup으로 0 누적 보장 — 단, 테스트 중간 crash 시 잔존 가능 → 고정 UUID라 다음 실행 시 자연 정리
- 프로덕션 DB는 미접근

### Statistical Validation

- integration test이므로 deterministic — 통계 검증 불필요
- upsert idempotency는 같은 key로 2회 write 후 row count = 1 검증

### Failure Modes

- 스테이징 Supabase down → `pytest.skip("staging unavailable")` (CI 안 깨야 함)
- Auth/RLS 정책 변경 → 401/403 캡처 후 명확한 assertion 메시지
- network flake → retry 1회 + skip
- WVPLCard prop schema drift → DOM 테스트가 먼저 fail로 알림 (조기 경보)

## Decisions

### [D-0306-A] DOM 테스트 도구 — Vitest+jsdom+@testing-library/svelte

- **선택**: Vitest + jsdom + @testing-library/svelte ^5.2.0
- **거절**: Playwright — 신규 인프라, 헤드리스 브라우저 다운로드, CI 비용 ↑, 단일 페르소나엔 과잉
- **거절**: happy-dom — jsdom 대비 Svelte 5 SSR/transition 호환 사례 부족
- **이유**: 기존 vitest 3.2.4 재활용, 신규 도구 0개, devDep만 2개

### [D-0306-B] 스테이징 통합 테스트 게이팅 — env-gated skip

- **선택**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 둘 다 set일 때만 실행, else `pytest.skip`
- **거절**: CI 항상 실행 — 스테이징 비용 + flake 위험
- **이유**: 로컬 개발자가 무환경에서도 `uv run pytest` 깨짐 없이 실행, 기존 `_supabase_writer` silent skip 패턴과 일치

### [D-0306-C] 프록시 테스트 mock 전략 — vi.fn() 직접 mock

- **선택**: `engineFetch` 모듈 vi.mock + cookies API mock으로 SvelteKit RequestEvent 흉내
- **거절**: MSW (Mock Service Worker) — overkill, 신규 의존성, 1개 endpoint뿐
- **이유**: 기존 `*.test.ts` 19개가 모두 vi.mock 패턴 — 일관성

### [D-0306-D] 통합 테스트 디렉토리 — `engine/tests/integration/` 신설

- **선택**: 신규 디렉토리, `verification/`은 1회성 스모크 용도로 분리 유지
- **거절**: `verification/` 재활용 — 의미가 다름
- **이유**: 의도 분리, 향후 다른 integration 테스트 확장 base

### [D-0306-E] 테스트 row 격리 — 고정 UUID

- **선택**: `TEST_USER_ID = "00000000-0000-0000-0000-000000000305"` (W-0305 매핑)
- **거절**: 매 테스트 random UUID — cleanup 누락 시 누적 위험 ↑
- **이유**: 고정 UUID는 다음 실행 시 upsert로 자연 정리, cleanup race 영향 0

### [D-0306-F] CI secret 주입 — 본 PR 분리

- **선택**: 본 PR은 코드만, GitHub Actions secret 주입은 별도 작업
- **거절**: 본 PR에서 workflow까지 수정 — secret 주입은 운영 권한 작업
- **이유**: 코드는 env-gated이므로 secret 없어도 CI green, 인프라 작업 분리로 PR 단순화

## Open Questions (해소됨 — 로컬 실측 기반)

- [x] [Q-0306-1] 스테이징 Supabase project? → **`.env.example`에 placeholder만**. 사용자가 GitHub Secrets에 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 추가 필요 (별도 작업)
- [x] [Q-0306-2] 테스트 row 격리? → **고정 UUID `00000000-0000-0000-0000-000000000305`** + try/finally DELETE
- [x] [Q-0306-3] CI secret 주입? → **본 PR 코드만, secret 주입 별도 인프라 작업** (D-0306-F)
- [x] [Q-0306-4] @testing-library/svelte 호환? → **Svelte 5.51.0 + @testing-library/svelte ^5.2.0 호환 OK**
- [x] [Q-0306-5] Svelte 5 runes 마운트 추가 설정? → **`@sveltejs/vite-plugin-svelte` 이미 설치 — 추가 설정 불필요**

## Implementation Plan

1. **Vitest 환경 분리** (`app/vitest.config.ts`)
   ```ts
   test: {
     environmentMatchGlobs: [
       ['**/*.svelte.test.ts', 'jsdom'],
       ['**/components/**/*.test.ts', 'jsdom'],
     ],
     environment: 'node', // default for non-component tests
   }
   ```

2. **devDeps 추가**: `pnpm add -D @testing-library/svelte@^5.2.0 jsdom`

3. **WVPLCard.test.ts** (~80줄, 5+ 케이스)
   - mock weeks 데이터 (상승 / 하락 / 평탄) → `render()` 후 `getByText` / `container.querySelector`
   - trend class 검증 (good/warn/danger)
   - sparkline `<path d>` 검증 (정규식 또는 path command 카운트)
   - loading / error / empty state 분기

4. **+server.test.ts** (~70줄, 4+ 케이스)
   - cookies mock + `vi.mock('$lib/server/engineTransport')` → 401 / 200 / weeks clamp / `x-user-id` 헤더 forwarding / `Content-Type: application/json`

5. **test_wvpl_supabase.py** (~50줄, env-gated)
   - `pytestmark = pytest.mark.skipif(not os.getenv("SUPABASE_URL"), reason="staging unavailable")`
   - `WVPLBreakdown` 인스턴스 → `_supabase_writer` 직접 호출 → SELECT 검증
   - 같은 (user_id, week_start) 2회 write → row count = 1
   - try/finally cleanup: `DELETE WHERE user_id = TEST_USER_ID`

6. **검증**: `pnpm test`, `uv run pytest engine/tests/`, `pnpm check` 모두 통과 확인

## Exit Criteria

- [ ] **AC1**: `WVPLCard.test.ts` 케이스 ≥ 5 통과 (정상 / loading / error / empty / sparkline path)
- [ ] **AC2**: `+server.test.ts` 케이스 ≥ 4 통과 (auth pass / 401 / weeks clamp / x-user-id header)
- [ ] **AC3**: `test_wvpl_supabase.py` env-gated — 로컬 `uv run pytest` 무환경에서 깨짐 없이 skip
- [ ] **AC4**: 스테이징 env 설정 시 idempotent upsert (row count = 1 after 2x write)
- [ ] **AC5**: `pnpm check` 0 errors, `pnpm test` 통과
- [ ] **AC6**: 기존 23개 단위 테스트(test_wvpl 14 + test_metrics_user_route 4 + test_wvpl_aggregator 5) 회귀 없음
- [ ] **AC7**: 신규 코드 ≤ 250줄 (예산: vitest config 수정 ~10줄 + WVPLCard.test.ts ~80줄 + +server.test.ts ~70줄 + test_wvpl_supabase.py ~50줄 + init ~10줄 = ~220줄)
- [ ] **AC8**: aggregator < 5s 회귀 없음 (W-0305 Exit Criteria 유지)

## Facts (실측 grep)

### W-0305 산출물 (이미 머지)

```
engine/observability/wvpl.py             — KST 주 경계 + loop 계산
engine/observability/wvpl_aggregator.py  — APScheduler Sun 23:55 KST + _supabase_writer
engine/api/routes/metrics_user.py        — GET /metrics/user/{id}/wvpl
app/supabase/migrations/029_user_wvpl_weekly.sql
app/src/routes/api/dashboard/wvpl/+server.ts
app/src/lib/components/dashboard/WVPLCard.svelte
단위 테스트 23개: test_wvpl 14 + test_metrics_user_route 4 + test_wvpl_aggregator 5
```

### 기존 인프라

```
app/vitest.config.ts: environment: 'node' 단독
app/package.json: vitest 3.2.4 / svelte ^5.51.0 / @sveltejs/kit ^2.50.2
                  @testing-library/svelte 없음 / jsdom·happy-dom 없음 / Playwright 없음
app/.env.example: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY placeholder
.github/workflows/app-ci.yml: secret 사용 0개
.github/workflows/engine-ci.yml: secret 사용 0개
engine/tests/verification/ 존재 (1회성 스모크 용도)
engine/tests/integration/ 없음 (신설 대상)
_supabase_writer: from supabase import create_client, env unset 시 silent skip
```

### Charter 충돌 체크

- copy_trading / leaderboard / AI 차트 / 신규 메모리 stack — 충돌 없음
- 250줄 초과 신규 coordination 도구 — 회피 (AC7)

### 관련 커밋

```
977bbcb feat(W-0305): Phase 1 engine
9a6439f feat(W-0305): Phase 2 app surface
70fd354 chore: append walk-forward-eval log entries
```
