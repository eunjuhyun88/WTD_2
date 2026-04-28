---
name: W-0098 완료 + Binance 451 프로덕션 버그 수정
description: W-0098 500-user safety 완료. 프로덕션 버그(Vercel IAD1 Binance 451) 발견/수정. k6 실측 결과.
type: project
---

## W-0098 완료 (2026-04-19)

main 머지: 9f18f10 (rate limit + shared cache + score cache + 429 UX)
PR #96 + #97 머지: Binance 451 프로덕션 버그 수정

## 발견된 프로덕션 버그: Binance FAPI 451

**원인**: `vercel.json` + `svelte.config.js` 모두 `regions: ['iad1']` (Washington DC, US) 하드코딩
→ Binance FAPI가 US 서버 geo-block → 차트 데이터 100% 실패 (배포 이후 줄곧 broken 상태였음)

**수정**: PR #97 — region `iad1` → `sin1` (Singapore)
**확인**: `x-vercel-id: icn1::sin1` ✅, `/api/chart/klines` 200 ✅

## k6 500VU 실측 결과

| 지표 | 값 |
|------|-----|
| klines 성공 (단일 IP) | 30% |
| klines avg latency | 243ms |
| klines p95 (성공만) | 1.43s (cache miss 포함) |
| 에러 원인 | rate limiter 120/min per IP (의도적 차단) |

실제 500명 분산 접속 → 성공률 ~100%, p95 캐시 히트 기준 ~200ms 예상

## Cloud Run Engine 분석

UVICORN_WORKERS=4 불필요 — CPU 1 vCPU에 4 프로세스 역효과.
Cloud Run은 수평 인스턴스 스케일. `ENGINE_ENABLE_SCHEDULER=false` ✅ 이미 설정됨.

**Why:** Binance 451 버그는 오래된 문제였으나 k6 테스트 전까지 발견 못 함.
**How to apply:** 향후 Vercel 배포 시 region 설정 항상 확인. US region → Asia Binance 차단됨.
