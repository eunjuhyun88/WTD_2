# JWT Auth 장애 대응 Runbook

**대상:** 온콜 엔지니어
**시스템:** Engine (GCP Cloud Run `cogotchi`) + Supabase JWT
**최종 업데이트:** 2026-04-25

---

## 빠른 진단 체크리스트

```bash
# 1. 엔진 헬스 확인
curl https://engine.cogotchi.app/healthz

# 2. JWT 메트릭 확인
curl https://engine.cogotchi.app/metrics | jq '.counters | with_entries(select(.key | startswith("jwt")))'

# 3. 주요 지표 해석
# jwt.validate.ok         → 성공한 검증
# jwt.cache.hit           → JWKS 캐시 히트 (정상: >99%)
# jwt.cache.miss          → JWKS fetch 발생 (정상: <1%)
# jwt.cache.stale_hit     → 구식 캐시 사용 (비정상: >0 → Supabase 점검)
# jwt.circuit.opened      → 회로 열림 (긴급: >0)
# jwt.validate.expired    → 만료 토큰
# jwt.validate.revoked    → 로그아웃된 토큰
# jwt.error.no_jwks_url   → JWT_JWKS_URL 미설정 (설정 오류)
```

---

## 시나리오별 대응

### 🔴 시나리오 1: 모든 요청 401 Unauthorized

**증상:** 로그인 후에도 모든 API 401

**원인 A — JWT_JWKS_URL 미설정**
```bash
# 확인
gcloud run services describe cogotchi --region asia-northeast3 \
  --format='value(spec.template.spec.containers[0].env)' | grep JWT

# 해결: GCP
gcloud run services update cogotchi --region asia-northeast3 \
  --set-env-vars="JWT_JWKS_URL=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json,JWT_AUDIENCE=authenticated,JWT_ISSUER=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1"

# 해결: Vercel (app 서버에 필요한 경우)
vercel env add JWT_JWKS_URL production
```

**원인 B — Circuit breaker OPEN (Supabase 장애)**
```bash
# 메트릭 확인
curl .../metrics | jq '.counters["jwt.circuit.opened"]'

# 60초 후 자동 회복 시도 (HALF_OPEN)
# 즉시 복구: 엔진 재시작
gcloud run services update cogotchi --region asia-northeast3 --no-traffic
gcloud run services update cogotchi --region asia-northeast3 --traffic=100
```

**원인 C — RS256 키 불일치 (Supabase 키 회전 후)**
```bash
# 메트릭 확인
curl .../metrics | jq '.counters["jwt.validate.decode_error"]'

# 해결: JWKS 캐시 강제 만료 → 재시작
# (향후 /auth/flush-jwks-cache 엔드포인트 추가 예정)
gcloud run services update cogotchi --region asia-northeast3 \
  --set-env-vars="JWKS_CACHE_BUST=$(date +%s)"
```

---

### 🟡 시나리오 2: 간헐적 503 (Auth Service Unavailable)

**증상:** 요청의 일부가 503, 나머지는 정상

**원인:** Supabase JWKS 엔드포인트 불안정 + 캐시 만료 동시 발생

```bash
# 현재 회로 상태 확인
curl .../metrics | jq '{
  opened: .counters["jwt.circuit.opened"],
  stale_hits: .counters["jwt.cache.stale_hit"],
  open_rejects: .counters["jwt.circuit.open_reject"]
}'

# Supabase 상태 확인: https://status.supabase.com

# 임시 조치: JWT_SKIP_SIG=true (서명 검증 비활성화 — 보안 위험, 긴급 시만)
# 반드시 슬랙 #incidents에 공지 후 진행
gcloud run services update cogotchi --region asia-northeast3 \
  --set-env-vars="JWT_SKIP_SIG=true"

# Supabase 복구 확인 후 즉시 원복
gcloud run services update cogotchi --region asia-northeast3 \
  --remove-env-vars="JWT_SKIP_SIG"
```

---

### 🟡 시나리오 3: 로그아웃 후에도 토큰 사용 가능

**증상:** 로그아웃 API 호출 후에도 동일 토큰으로 접근 가능

**원인:** Redis 블랙리스트 미작동 (Redis 장애 또는 연결 실패)

```bash
# Redis 연결 확인
redis-cli -u $REDIS_URL ping

# 엔진 로그에서 blacklist 관련 항목 확인
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"blacklist.redis_unavailable"' \
  --project=<project> --limit=20

# Redis 복구 후 엔진 재시작 (연결 재수립)
```

**임시 조치:** Redis 미복구 시 → Supabase에서 직접 사용자 세션 무효화
```
Supabase Dashboard → Authentication → Users → [유저 선택] → Invalidate Sessions
```

---

### 🔴 시나리오 4: 보안 침해 — 토큰 위조 의심

**증상:** 존재하지 않는 user_id로 요청, 비정상 패턴

**즉각 조치:**
1. Supabase에서 JWT 시크릿 회전 (JWKS 자동 갱신됨)
2. 영향 받은 사용자 세션 전체 무효화
3. 엔진 재시작 (JWKS 캐시 강제 만료)

```bash
# Supabase Dashboard → Settings → API → JWT Secret → Rotate

# 사용자 세션 전체 무효화
# supabase admin → auth.users where id = '<user_id>'
# → auth.sessions DELETE

# 엔진 캐시 강제 만료
gcloud run services update cogotchi --region asia-northeast3 \
  --set-env-vars="JWKS_CACHE_BUST=$(date +%s)"
```

**감사 로그 조회:**
```sql
SELECT * FROM audit_log
WHERE user_id = '<suspect_user_id>'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## 메트릭 기준 (SLO)

| 메트릭 | 정상 | 경고 | 긴급 |
|--------|------|------|------|
| `jwt.cache.hit / validate.ok` | >99.9% | <99% | <95% |
| `jwt.circuit.opened` | 0 | 1 | >1 |
| `jwt.cache.stale_hit` | 0 | >0 | 지속 증가 |
| `jwt.validate_ms` p99 | <5ms | <100ms | >500ms |
| `jwt.error.no_jwks_url` | 0 | — | >0 (즉시 설정) |

---

## 환경변수 레퍼런스

| 변수 | 값 | 비고 |
|------|----|------|
| `JWT_JWKS_URL` | `https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json` | 필수 |
| `JWT_AUDIENCE` | `authenticated` | Supabase 기본값 |
| `JWT_ISSUER` | `https://hbcgipcqpuintokoooyg.supabase.co/auth/v1` | 필수 |
| `JWT_SKIP_SIG` | `"true"` | 긴급 시만, 보안 위험 |

---

## 복구 검증

```bash
# 복구 후 반드시 확인
curl -H "Authorization: Bearer <valid-token>" https://engine.cogotchi.app/runtime/state
# → 200 OK 확인

curl -H "Authorization: Bearer <expired-token>" https://engine.cogotchi.app/runtime/state
# → 403 Token expired 확인

curl https://engine.cogotchi.app/runtime/state
# → 401 Missing authorization token 확인
```

---

## 연락처

- **Supabase 상태:** https://status.supabase.com
- **GCP Console:** Cloud Run `cogotchi` 서비스
- **Redis:** `REDIS_URL` 환경변수 참조
