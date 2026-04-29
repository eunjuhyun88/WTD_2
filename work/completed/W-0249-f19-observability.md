# W-0249 — F-19: Observability (Sentry + p95 대시보드)

> Wave 4 P1 | Owner: engine+app | Branch: `feat/F19-observability`
> **독립 스트림 — 다른 Wave 4 작업과 병렬 가능**

---

## Goal

Jin(트레이더)이 시스템 이상을 운영팀보다 먼저 경험하지 않도록 한다.
Sentry 에러 추적 + p95/error_rate/cost-per-WAA 대시보드를 추가해 PRD guardrail(`p95 < 2s`, `error < 0.5%`, `cost/WAA < $8`)을 실시간 가시화한다.

---

## Owner

engine + app

---

## Facts (코드 실측 2026-04-27)

### 이미 있는 것

```
engine/observability/
  metrics.py    — increment(), observe_ms(), snapshot() 구현
                  snapshot() → { counters, timings: { count, avg_ms, p95_ms } }
  timing.py     — 타이밍 데코레이터 (observe_ms 래핑)
  health.py     — 기본 헬스체크
  logging.py    — JSON structured logging

engine/api/routes/observability.py:152
  GET /observability/flywheel/health  ← H-04 BUILT
  → 6 KPI: capture_rate, verdict_rate, search_recall, refine_count, gate_pass, waa

app/src/routes/api/observability/metrics/+server.ts  ← H-05 BUILT (존재 여부 확인됨)
```

### 없는 것

```
❌ Sentry init — engine/main.py에 sentry_sdk.init() 없음
❌ Sentry browser — app/src/app.html에 @sentry/sveltekit 없음
❌ GET /observability/dashboard — p95 + error_rate + cost_per_waa 통합 endpoint 없음
❌ cost_per_waa 계산 로직 — cloud billing API 연동 또는 수동 입력 방식 필요
❌ engine/tests/test_observability.py — 테스트 없음
```

### PRD 수치 목표

```
spec/PRIORITIES.md:331
  Infra cost/WAA < $8 / p95 < 2s / error < 0.5%
```

---

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/main.py` | 변경 | `sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1)` 추가 |
| `engine/api/routes/observability.py` | 변경 | `GET /observability/dashboard` 추가 — metrics.snapshot() + flywheel KPI + cost_per_waa |
| `engine/observability/metrics.py` | 변경 | `error_count`, `request_count` 카운터 자동 증분 미들웨어 연결 |
| `app/src/app.html` | 변경 | `@sentry/sveltekit` browser init (`SENTRY_DSN` 환경변수) |
| `app/src/routes/api/observability/dashboard/+server.ts` | 신규 | engine dashboard proxy + `requireAuth()` |
| `engine/tests/test_observability_dashboard.py` | 신규 | dashboard endpoint 경계값 테스트 |

---

## Non-Goals

- ❌ DataDog / New Relic 연동 (Sentry 단독)
- ❌ 실시간 스트리밍 알림 (Slack/PagerDuty webhook — Phase 2)
- ❌ cost_per_waa 자동 계산 (GCP billing API 연동) — Phase 1은 수동 입력 env var
- ❌ 유저-facing 에러 페이지 커스터마이징

---

## Exit Criteria

1. `engine 500 에러 → Sentry 이벤트 캡처` — Sentry 대시보드에서 확인
2. `app JS 에러 → Sentry 이벤트 캡처` — Sentry issues 탭에서 확인
3. `GET /observability/dashboard` 응답 스키마:
   ```json
   {
     "p95_ms": <float>,          // < 2000 = GREEN
     "error_rate": <float>,      // < 0.005 = GREEN
     "cost_per_waa_usd": <float>, // < 8.0 = GREEN (수동 입력)
     "request_count_1h": <int>,
     "flywheel": { ...6 KPI... },
     "guardrail_status": "green" | "yellow" | "red"
   }
   ```
4. `p95_ms < 2000` 조건 — 로컬 부하 50 req/s 기준 검증
5. `SENTRY_DSN` 미설정 시 → Sentry init 스킵, 서버 정상 기동 (graceful degradation)
6. App CI ✅, Engine Tests ✅ (test_observability_dashboard.py PASS)

---

## AI Researcher 리스크

**훈련 데이터 영향**: 없음 — 순수 observability layer, LightGBM 훈련 데이터 무관.

**통계적 유효성**
- `p95_ms`: `metrics.py`의 `_TIMINGS_MS` 리스트는 process 재시작 시 리셋됨. 단기 스파이크는 포착하지만 장기 트렌드는 손실 → `observe_ms()` 호출 횟수가 충분해야 p95가 의미 있음 (n ≥ 20 권장).
- `error_rate` = `error_count / request_count`. 요청 수 < 10이면 1건 에러 = 10% — 분모가 작을 때 경보 억제 필요.

**실데이터 시나리오**
- 138,915 feature_window rows 기준 `/search/similar` p95가 가장 높을 것 (벡터 계산 + Supabase 조회). 이 경로를 `@observe_timing` 대상으로 우선 지정.
- 53 패턴 × 15분 pattern_scan: APScheduler job은 HTTP request가 아니므로 `metrics.observe_ms()` 직접 호출 필요.

---

## CTO 설계 결정

**성능**
- `metrics.snapshot()` 호출은 O(n) — `_TIMINGS_MS` 리스트 길이 제한 필요 (`maxlen=1000` deque로 교체)
- `/observability/dashboard` 는 hot path 아님 → 캐시 불필요. `asyncio.to_thread()` 래핑.

**안정성**
- `SENTRY_DSN` 없으면 `sentry_sdk.init()` 호출 자체를 스킵 → `if os.getenv("SENTRY_DSN")` guard
- `_TIMINGS_MS` in-memory: GCP 재시작 시 손실. 허용 (short-term SLO 모니터링 목적)

**보안**
- `/observability/dashboard` → admin-only 접근 (Pro tier or internal). `requireAuth()` 필수.
- `SENTRY_DSN` = env var, 절대 코드 리터럴 금지
- Sentry `traces_sample_rate=0.1` (10%) — 전량 수집은 비용 과다

**유지보수성**
- `guardrail_status` 계산 로직은 `engine/observability/guardrails.py` 신규 모듈로 분리
- 임계값(2000ms, 0.005, 8.0)은 `spec/PRIORITIES.md:331`에서 추출, 하드코딩 금지 → config 상수

---

## Assumptions

1. `SENTRY_DSN` env var GCP + Vercel 양쪽에 설정됨
2. `COST_PER_WAA_USD` env var 수동 입력 (Phase 1) — 기본값 `0.0`
3. `@sentry/sveltekit` npm 패키지 설치 필요
4. `sentry-sdk[fastapi]` pip 패키지 설치 필요

---

## Canonical Files

```
engine/main.py                                                (+5줄)
engine/api/routes/observability.py                            (+30줄)
engine/observability/metrics.py                               (deque 교체 +5줄)
engine/observability/guardrails.py                            (신규)
engine/tests/test_observability_dashboard.py                  (신규)
app/src/app.html                                              (+5줄)
app/src/routes/api/observability/dashboard/+server.ts         (신규)
```
