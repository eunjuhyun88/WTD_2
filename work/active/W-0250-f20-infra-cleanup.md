# W-0250 — F-20~22: Infra Cleanup (Vercel + GCP + Env)

> Wave 4 P1 | Owner: app+engine | Branch: `feat/F20-infra-cleanup`

---

## Goal

Vercel production 배포 가드레일 + GCP Cloud Build trigger + 프로덕션 env var 정리.

## Owner

app+engine

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/vercel.json` | 변경 — `release` 브랜치만 production 배포 |
| `.github/workflows/deploy.yml` | 신규 — release 브랜치 push → vercel deploy --prod |
| GCP Cloud Build trigger | 설정 — engine push → Cloud Run 자동 배포 |

## Exit Criteria

- [ ] `main` / `claude/*` 브랜치 → Vercel production 자동 배포 안 됨
- [ ] `release` 브랜치 → Vercel production 자동 배포
- [ ] GCP Cloud Run — engine push → 자동 deploy
- [ ] `EXCHANGE_ENCRYPTION_KEY` Vercel production env 설정
- [ ] App CI ✅

## Facts

1. CLAUDE.md: "Vercel production은 `release` 브랜치 전용" 명시.
2. GCP cogotchi-00013-c7n — Cloud Run 존재.
3. `EXCHANGE_ENCRYPTION_KEY` — Vercel preview에는 있지만 production 설정 미확인.

## Canonical Files

- `app/vercel.json`
- `.github/workflows/deploy.yml`
