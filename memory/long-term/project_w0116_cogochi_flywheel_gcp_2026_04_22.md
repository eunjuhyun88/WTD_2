---
name: project_w0116_cogochi_flywheel_gcp_2026_04_22
description: W-0116 완료 (2026-04-22): Svelte 5 state_unsafe_mutation 루프 수정 + JUDGE flywheel 저장 + SCAN 라이브 데이터 + GCP ENGINE_URL 설정. main=9db3ac29.
type: project
---

W-0116 완료 (2026-04-22), main 머지 HEAD=9db3ac29.

**3개 feat + 1 fix + 인프라 업데이트:**

1. **fix**: TradeMode.svelte `klineWs` `$state` → plain `let` 로 변경 — Svelte 5 state_unsafe_mutation 무한루프 해소. 규칙: WS나 DOM 레퍼런스처럼 템플릿에서 읽지 않는 변수는 $state 금지.
2. **feat**: JUDGE 탭 → `/api/cogochi/outcome` 자동 POST (flywheel 저장).
3. **feat**: SCAN 탭 → `/api/cogochi/alpha/world-model` 라이브 폴링 (마운트 + 5분 간격).
4. **infra**: ENGINE_URL=`https://wtd-2-3u7pi6ndna-uk.a.run.app` (GCP Cloud Run, asia-southeast1). `.env.local` + Vercel production env 설정.
5. **infra**: `cloudbuild.yaml` — region us-east4→asia-southeast1, `_APP_ORIGIN`=`https://app.cogotchi.dev`, ENGINE_ALLOWED_HOSTS 추가.

**Why:** Engine is on GCP Cloud Run, NOT localhost. Always use ENGINE_URL env var.
**How to apply:** 엔진 연결 이슈 시 `app/.env.local` ENGINE_URL 확인. 로컬 Python 재시작 불필요.
