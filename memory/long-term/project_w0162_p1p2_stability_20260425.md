---
name: W-0162 P1/P2 안정성 강화 완료 (2026-04-25)
description: RS256 서명 검증 + 토큰 블랙리스트 + 메트릭 + 장애 runbook — PR 오픈, 머지 대기
type: project
---

## 핵심 사실

브랜치 `claude/w-0162-stability` (커밋 39cdf7d9) — PR 오픈, main 머지 대기

**Why:** 이전 jwt_validator.py는 서명을 검증하지 않아 누구나 임의 user_id로 토큰 위조 가능했음.

**How to apply:** 이 PR 머지 전까지 프로덕션 JWT는 위조 위험 있음. 머지 + GCP 재배포 우선.

## 완성된 것

1. **RS256 서명 검증** — PyJWT + RSAAlgorithm.from_jwk()로 JWKS 공개키 서명 검증
2. **메트릭** — jwt.cache.hit/miss, jwt.circuit.*, jwt.validate.* (기존 observability/metrics.py 연동)
3. **JSON 구조화 로깅** — 모든 circuit transition, 에러가 structured JSON
4. **Redis 블랙리스트** — jwt:revoked:{jti}, TTL = 남은 유효시간, soft-fail
5. **POST /auth/logout** — 토큰 즉시 무효화
6. **k6 부하 테스트** — `engine/scripts/load_test_jwt.js` (1000 VU, SLO p99<500ms)
7. **장애 runbook** — `docs/runbooks/JWT_INCIDENT_RUNBOOK.md` (4 시나리오)

## 즉시 해야 할 것 (사람)

1. PR 머지: https://github.com/eunjuhyun88/WTD_2/pull/new/claude/w-0162-stability
2. GCP Cloud Run 재배포 (PyJWT 설치 적용)
3. k6로 1000 VU 부하 테스트 실행

## 다음 에이전트 P3 작업

1. `engine/tests/test_jwt_validator.py` — 단위 테스트
2. JWKS fetch에 httpx AsyncClient 풀 공유
3. Grafana 대시보드 (jwt.* 메트릭)
4. 사용자별 Rate limiting

## 환경변수 (변경 없음)

- `JWT_JWKS_URL=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json`
- `JWT_AUDIENCE=authenticated`
- `JWT_ISSUER=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1`
- `JWT_SKIP_SIG=true` — 긴급 시만, 절대 프로덕션 금지
