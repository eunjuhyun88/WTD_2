---
name: W-0162 JWT Environment Setup (2026-04-25)
description: JWT 환경변수 자동 설정 + Supabase JWKS 통합 완료. PR #253 merge conflict 해결 필요.
type: project
---

## Current State (2026-04-25)

### Completed
✅ JWT 환경변수 설정 자동화
- Supabase 프로젝트 ID 추출: `hbcgipcqpuintokoooyg`
- `.env.local` JWT 변수 추가 (JWKS URL 기반)
- `.env.example` 템플릿 업데이트

✅ 문서화
- `docs/runbooks/JWT_ENVIRONMENT_SETUP.md` 작성
- 3곳 배포 경로 명시 (로컬/Vercel/GCP)

### In Progress
🔄 PR #253 Merge
- Status: OPEN, merge conflict 발생
- Branch: claude/gifted-shannon
- Issue: origin/main과 diverged
- Resolution: rebase 또는 manual merge 필요

### Pending
- [ ] PR #253 merge 완료
- [ ] Vercel 프로덕션 환경변수 설정
- [ ] GCP Cloud Run 배포 및 환경변수
- [ ] 로컬 테스트 (Engine + JWT 검증)

---

## JWT Configuration

**Supabase 프로젝트:**
```
URL: https://hbcgipcqpuintokoooyg.supabase.co
JWKS: https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json
```

**Environment Variables (3곳):**

1. **로컬** (.env.local)
```bash
JWT_JWKS_URL=https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json
JWT_AUDIENCE=https://hbcgipcqpuintokoooyg.supabase.co
JWT_ISSUER=https://hbcgipcqpuintokoooyg.supabase.co
```

2. **Vercel** (production)
```bash
vercel env add JWT_JWKS_URL production
vercel env add JWT_AUDIENCE production
vercel env add JWT_ISSUER production
```

3. **GCP Cloud Run** (asia-southeast1)
```bash
gcloud run services update cogotchi \
  --set-env-vars=JWT_JWKS_URL='https://hbcgipcqpuintokoooyg.supabase.co/auth/v1/.well-known/jwks.json' \
  --set-env-vars=JWT_AUDIENCE='https://hbcgipcqpuintokoooyg.supabase.co' \
  --set-env-vars=JWT_ISSUER='https://hbcgipcqpuintokoooyg.supabase.co' \
  --region asia-southeast1
```

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `.env.local` | JWT vars added | ✅ |
| `.env.example` | JWT section | ✅ |
| `docs/runbooks/JWT_ENVIRONMENT_SETUP.md` | Created | ✅ |
| `engine/api/auth/jwt_validator.py` | In PR #253 | 🔄 |
| `engine/api/routes/*.py` | 15 routes migrated | 🔄 |
| `engine/api/main.py` | JWT middleware | 🔄 |

---

## Next Steps

1. **Resolve PR #253 merge conflict**
   - Rebase or manual merge with origin/main
   - git push -f if rebase

2. **Deploy to Vercel**
   - Set JWT env vars via vercel CLI
   - Test with Authorization header

3. **Deploy to GCP Cloud Run**
   - Update service with gcloud
   - Test authenticated requests

4. **Verify End-to-End**
   - Frontend (Vercel) gets JWT from Supabase
   - Backend (Cloud Run) validates JWT
   - Protected routes return 200 (auth OK) or 401 (missing token)

---

## Architecture

```
Frontend (Vercel)
  └─ Supabase Auth (발급)
      └─ JWT Token (Authorization header)
          └─ Backend (GCP Cloud Run)
              └─ JWKS URL 검증
                  └─ user_id extraction (request.state)
                      └─ Route handler
```

---

## PR Details

- **PR**: #253
- **Title**: feat(auth): JWT security implementation for 1000+ user scale (W-0162)
- **Branch**: claude/gifted-shannon
- **Status**: OPEN (merge conflict)
- **Date Created**: 2026-04-24T14:53:57Z

## Reference Docs

- Previous: `project_w0162_jwt_complete_2026_04_24.md`
- Setup Guide: `docs/runbooks/JWT_ENVIRONMENT_SETUP.md`
- Checkpoint: `work/active/W-0162-jwt-checkpoint-20260425.md`
- JWT Validator: `engine/api/auth/jwt_validator.py`
