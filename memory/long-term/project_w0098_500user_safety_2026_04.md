---
name: project_w0098_500user_safety_2026_04
description: W-0098 500-user safety 완전 완료 — main 머지(9f18f10), Vercel env 등록
type: project
---

W-0098 Phase 2 전체 main 머지 완료 (2026-04-19, commit 9f18f10).

**구현 완료 (main에 반영):**
- Slice A: chartKlinesLimiter(120/min) + engineProxyLimiter(60/min)
- Slice B: sharedCache(Upstash REST) → chartSeriesService.ts (인스턴스 간 공유, graceful fallback)
- Slice C: engine/api/score_cache.py — TTL=30s, key=(symbol, last_bar_ts_ms), 9 tests pass
- Slice D: UVICORN_WORKERS env var (Dockerfile) — 멀티워커 지원
- Slice E: 429 UX — ChartBoard 10s amber countdown + ChartMode 5s auto-retry
- k6 scripts: load_test_500.js (500VU), load_test_score.js (score fixture)

**Vercel 환경변수 등록 완료 (cogochi-2 production):**
- UPSTASH_REDIS_REST_URL = https://normal-stag-81227.upstash.io
- UPSTASH_REDIS_REST_TOKEN = encrypted
- (`.env.local`에 이미 있었음, Vercel production에만 미등록 상태였음)

**남은 액션 (다음 세션):**
- k6 실측: `k6 run --env BASE=https://www.cogotchi.dev scripts/load_test_500.js`
- Engine prod: UVICORN_WORKERS=4 + ENGINE_ENABLE_SCHEDULER=false (엔진 서버 직접)
- k6 score 실측 후 결과 분석 → 추가 조치 여부 결정

**Why:** 500명 안정화 목표 — 코드 + 환경변수 모두 완료, 실측만 남음
**How to apply:** 다음 세션은 k6 실측 → 결과 분석 → 필요시 추가 조치
