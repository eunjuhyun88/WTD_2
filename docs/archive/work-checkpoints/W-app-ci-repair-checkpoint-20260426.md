# App CI 수리 체크포인트 — 2026-04-26

## 상태: PR #293 오픈 (추가 테스트 수리 진행)

## 이번 세션에서 한 것

### 1단계: Engine CI + Contract CI 수리 (PR #291에 포함, 머지 완료)

- `engine/research/market_retrieval.py`: `_load_symbol_frames`에 `max_bars` 파라미터 추가, `MIN_HISTORY_BARS = 240` 상수, `candidate_max_bars` 계산
- `engine/research/live_monitor.py`: 중복 `resolve_live_variant_slug` 2개 제거, `list_cached_symbols` import 추가
- `engine/api/routes/captures.py`: `Request` import 추가 (ForwardRef 422 버그 수정)
- `engine/scoring/block_evaluator.py`: `absorption_signal`, `alt_btc_accel_ratio` 블록 등록
- `engine/tests/test_ctx_fact_route.py`: stale `fact_id` assertion 제거
- `engine/tests/test_live_monitor.py`: `TestResolveLiveVariantSlug._make_klines` 메서드 추가
- `engine/tests/test_market_retrieval.py`: mock lambda에 `max_bars=None` 파라미터 추가

결과: **1448 passed, 0 failed**

### 2단계: App CI 수리 (PR #293, 오픈)

브랜치: `fix/app-ci-ts-errors`, 커밋: `0575515d`

수정 파일 19개, 127 → 0 TS 에러.

핵심 수정:
- `intel-policy/+server.ts`: `fetchJsonSafe`/`loadMacroOverview` 헬퍼 추가 + destructure 변수명 통일
- `planeClients.test.ts`: 중복 `perp` → `referenceStack`, import 보완
- `CenterPanel.svelte`: PeekDrawer에 없는 props 전부 제거
- `TerminalLeftRail.svelte`: `coin.preview?.change24h/price` 접근
- `TradeMode.svelte`, `terminalBackend.test.ts`: `as any` 캐스트

### 3단계: App test 회귀 수리 (이번 W-0163 세션)

`npm run check`는 통과했지만 `npm test`에서 6개 실패가 남아 있어 App CI가 여전히 빨간 상태였다.

수정 범위:
- legacy `/api/engine/[...path]` proxy allowlist 복구 (`healthz`/memory 등만 허용, captures/patterns states 차단)
- runtime capture 전환에 맞춰 stale capture test 갱신
- fact market-cap proxy 구현 및 plane client test 순서 정렬
- intel-policy route 내부 `/api/market/*` loopback 제거, direct loader + fact market-cap 사용
- pattern-seed match가 `/search/similar`까지 호출하고 runId/candidate를 반환하도록 복구

## 브랜치 상태

| 브랜치 | SHA | 상태 |
|--------|-----|------|
| `origin/main` | `4c02cd0f` | PR #291 머지됨 |
| `fix/app-ci-ts-errors` | `0575515d` | PR #293 오픈 (머지 대기) |

## 다음 실행자가 해야 할 것

1. **PR #293 머지** → main이 앱 CI 완전 초록
2. **W-0163** CI governance hardening 재개
3. **W-0162 P1/P2** (RS256 + 토큰 블랙리스트) — PR 오픈 상태, GCP 재배포 필요
4. **인프라** (사람이 직접): GCP Cloud Build trigger, Vercel EXCHANGE_ENCRYPTION_KEY, Cloud Scheduler
