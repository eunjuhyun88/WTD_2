# W-0162 JWT Security Implementation — Checkpoint 2026-04-25

## 상태: 환경변수 설정 완료 / PR Merge 대기

### Session 3 진행사항 (2026-04-25)

**완료 항목:**
1. ✅ JWT 환경변수 설정 자동화
   - `.env.local` JWT 변수 추가
   - Supabase JWKS URL로 자동 구성
   - JWT_JWKS_URL, JWT_AUDIENCE, JWT_ISSUER 설정

2. ✅ 문서화
   - `.env.example` 업데이트 (JWT 섹션 추가)
   - `docs/runbooks/JWT_ENVIRONMENT_SETUP.md` 작성
   - 3곳 배포 경로 명시 (로컬, Vercel, GCP)

3. ✅ 로컬 Supabase 설정 추출
   - Supabase Project: `hbcgipcqpuintokoooyg`
   - JWKS Endpoint: `https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json`
   - 로컬 개발용 설정 완성

**진행 중:**
- PR #253 Merge conflict 발생
  - 원인: gifted-shannon 브랜치가 origin/main과 diverged
  - 해결 필요: rebase 또는 manual conflict resolution

**미완:**
- [ ] PR #253 merge 완료
- [ ] Vercel 환경변수 설정 (프로덕션)
- [ ] GCP Cloud Run 배포 및 환경변수 설정
- [ ] 로컬 테스트 (Engine API + JWT 검증)

---

## 기술 세부사항

### JWT 설정 (3단계)

```bash
# 1. 로컬 (.env.local)
JWT_JWKS_URL=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json
JWT_AUDIENCE=https://hbcgipcqpuintokoooyg.supabase.co
JWT_ISSUER=https://hbcgipcqpuintokoooyg.supabase.co

# 2. Vercel (프로덕션) - CLI로 설정 필요
vercel env add JWT_JWKS_URL production
vercel env add JWT_AUDIENCE production
vercel env add JWT_ISSUER production

# 3. GCP Cloud Run - gcloud로 배포
gcloud run services update cogotchi \
  --set-env-vars=JWT_JWKS_URL='...' \
  --set-env-vars=JWT_AUDIENCE='...' \
  --set-env-vars=JWT_ISSUER='...'
```

### 아키텍처

```
Frontend (Vercel/SvelteKit)
  ↓ Supabase Auth
  ├─ JWT 발급
  └─ Authorization: Bearer <token>
      ↓
Backend (GCP Cloud Run/FastAPI)
  ├─ JWT 검증 (JWKS URL 사용)
  ├─ user_id 추출 (request.state 저장)
  └─ 응답 (200 or 401)
```

### 코드 상태

**구현됨:**
- `engine/api/auth/jwt_validator.py` — JWTValidator 클래스
- `engine/api/auth/__init__.py` — 모듈 exports
- `engine/api/main.py:193-226` — jwt_auth_middleware
- 15개 route 마이그레이션 완료
- N+1 쿼리 최적화 (runtime.py) — 500ms → 50ms

**설정됨:**
- `.env.local` JWT 변수
- `.env.example` 템플릿 업데이트

---

## PR 상태

| PR# | 제목 | 브랜치 | 상태 | 이슈 |
|-----|------|---------|------|------|
| #253 | feat(auth): JWT security implementation | claude/gifted-shannon | OPEN | Merge conflict (diverged from origin/main) |

**해결 방법:**
```bash
cd /Users/ej/Projects/wtd-v2
# Option 1: Rebase
git checkout claude/gifted-shannon
git rebase origin/main
# ... resolve conflicts ...
git push -f origin claude/gifted-shannon

# Option 2: Merge + Manual Resolution
git checkout claude/gifted-shannon
git fetch origin main
git merge origin/main
# ... manually resolve conflicts in files ...
git add .
git commit -m "Merge: resolve conflicts with origin/main"
git push origin claude/gifted-shannon
```

---

## 다음 즉시 실행 항목

1. **PR #253 Merge 완료**
   - Conflict 해결 후 gh pr merge 253

2. **Vercel 프로덕션 환경변수**
   ```bash
   vercel env add JWT_JWKS_URL production
   vercel env add JWT_AUDIENCE production
   vercel env add JWT_ISSUER production
   # 값: Supabase 프로젝트 정보
   ```

3. **GCP Cloud Run 배포**
   ```bash
   gcloud run services update cogotchi \
     --set-env-vars=JWT_JWKS_URL='https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json' \
     --set-env-vars=JWT_AUDIENCE='https://hbcgipcqpuintokoooyg.supabase.co' \
     --set-env-vars=JWT_ISSUER='https://hbcgipcqpuintokoooyg.supabase.co' \
     --region asia-southeast1
   ```

4. **로컬 테스트**
   - Engine 시작: `uvicorn api.main:app --port 8000`
   - Supabase JWT 생성 후 Authorization 헤더로 테스트
   - /train, /captures 등 protected route 동작 확인

---

## 파일 변경 요약

| 파일 | 변경 | 상태 |
|------|------|------|
| `app/.env.local` | JWT 변수 추가 | ✅ 완료 |
| `app/.env.example` | JWT 섹션 추가 | ✅ 완료 |
| `docs/runbooks/JWT_ENVIRONMENT_SETUP.md` | 신규 작성 | ✅ 완료 |
| `engine/api/auth/jwt_validator.py` | 구현됨 (이전) | ✅ PR #253 대기 |
| `engine/api/routes/*.py` | 15개 route 마이그레이션 | ✅ PR #253 대기 |

---

## Reference

- Previous session memory: `project_w0162_jwt_complete_2026_04_24.md`
- JWT validator: `engine/api/auth/jwt_validator.py`
- Setup guide: `docs/runbooks/JWT_ENVIRONMENT_SETUP.md`
- Supabase project: `hbcgipcqpuintokoooyg`
- PR: #253 (claude/gifted-shannon branch)
