# W-0143 — App-Web Cloud Run Deploy Lane

## Goal

`app-web`를 Vercel 전용 산출물에 묶어두지 않고,
Cloud Run용 Node runtime 산출물도 만들 수 있게 해서
GCP app deploy lane을 별도 surface로 추가한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `app/svelte.config.js` — deploy target별 adapter 선택
- `app/package.json` / lockfile — Cloud Run Node adapter 및 build/start 스크립트 정리
- `app/Dockerfile` — Cloud Run용 canonical app image path 정리
- `cloudbuild.app.yaml` — app-web Cloud Run build/deploy path 추가
- `docs/runbooks/*` / `work/active/*` — app-web GCP deploy/operator 문서

## Non-Goals

- Vercel production lane 즉시 삭제
- `engine-api` / `worker-control` deploy 정책 재설계
- auth/session storage 모델 교체
- legacy Cloud Run services 삭제 자동화

## Canonical Files

- `app/svelte.config.js`
- `app/package.json`
- `app/src/hooks.server.ts`
- `app/Dockerfile`
- `cloudbuild.app.yaml`
- `docs/runbooks/cloud-run-app-deploy.md`
- `docs/runbooks/env-vars.md`
- `docs/runbooks/cloud-run-engine-deploy.md`
- `docs/decisions/0003-infra-chart-architecture-2026-04-21.md`
- `work/active/CURRENT.md`

## Facts

1. 현재 `app-web`는 `APP_DEPLOY_TARGET` 기반 dual-adapter 구조로 바뀌었고, Cloud Run target은 `@sveltejs/adapter-node`를 사용한다.
2. 현재 `app/Dockerfile`은 `APP_DEPLOY_TARGET=cloudrun` 기준 build stage에서 dev dependency + Linux Rollup native package 를 포함해 install 한 뒤 `npm run build:cloudrun` 후 `node build`를 실행하도록 정리되었다.
3. 2026-04-23 기준 GCP Cloud Run 상태는 `cogotchi (us-east4)`만 Ready 이고, `wtd-2 (us-east4)` 및 `cogotchi (asia-southeast1)`는 unhealthy다.
4. `wtd-2`는 app-web이 아니라 legacy engine service이며, Cloud Run logs 에서는 `/score`, `/deep`, `/captures` 등에 대한 반복 `403`만 보인다.
5. app runtime security 는 production에서 `ENGINE_URL`, `ENGINE_INTERNAL_SECRET`, `SECURITY_ALLOWED_HOSTS` 정합성을 요구한다.
6. local verification 기준 `APP_DEPLOY_TARGET=vercel npm run build` 와 `APP_DEPLOY_TARGET=cloudrun npm run build` 둘 다 통과했고, Cloud Run-style `node build` 는 `/healthz=200`, `/readyz=200`까지 확인되었다.
7. 실제 `cloudbuild.app.yaml` 배포는 Secret Manager mapping, Docker build/push, comma-safe env escaping, runtime secret access 까지 통과했고 `app-web` Cloud Run service 는 `https://app-web-103912432221.us-east4.run.app` 에 정상 배포되었다.
8. runtime secret access 는 `103912432221-compute@developer.gserviceaccount.com` 에 `app-web-engine-internal-secret`, `app-web-database-url`, `app-web-secrets-encryption-key` 3개 secret 에만 `roles/secretmanager.secretAccessor` 를 부여해 풀었다.
9. Cloud Run canonical URL `https://app-web-3u7pi6ndna-uk.a.run.app` 기준 root `200`, `/readyz` `200` 까지 확인했다.
10. `SECURITY_ALLOWED_HOSTS` 와 `PUBLIC_SITE_URL` 은 first deploy 뒤 actual `status.url` host 를 포함하도록 한 번 더 reconcile 했다.
11. external `run.app` 호스트 기준 `/healthz` 는 여전히 Google 404 이고, Cloud Run logs 에도 해당 request 가 찍히지 않는다. 반면 `/readyz` 와 `/` 는 app logs 에 정상 도달한다.

## Assumptions

1. 단기적으로는 Vercel lane을 유지하면서 Cloud Run lane을 병행 지원하는 것이 safest path다.
2. Cloud Run app-web는 Node adapter 산출물(`build`)을 사용하고, Vercel은 기존 adapter path를 유지한다.

## Open Questions

- app-web를 장기적으로 Vercel에 둘지, Cloud Run으로 완전 이전할지는 운영 결정이 필요하다.
- Cloud Run app-web의 canonical region을 `us-east4`로 둘지 engine canonical region과 맞춰 재결정할지 정리 필요.

## Decisions

- app adapter는 deploy target env로 분기한다. 기본값은 기존 Vercel path를 유지한다.
- Cloud Run lane는 `adapter-node` 기반 Node server를 canonical runtime 으로 사용한다.
- app-web Cloud Run lane는 별도 `cloudbuild.app.yaml` 로 추가하고, engine build lane과 섞지 않는다.
- `/readyz` 는 external Cloud Run smoke endpoint 로 유지한다.
- Cloud Run app image 는 glibc 계열 Node base image 를 유지하되, build stage 에서는 dev dependency 를 포함해 install 하고 Rollup Linux native package 를 명시적으로 보강한다.
- Cloud Run deploy step 의 env 전달은 comma-safe delimiter 형태로 바꿔 `SECURITY_ALLOWED_HOSTS` 같은 list-like env 도 안전하게 전달한다.
- deploy unblock 은 broad project grant 대신 `app-web-database-url`, `app-web-engine-internal-secret`, `app-web-secrets-encryption-key` 3개 secret 에만 accessor 를 부여하는 최소 권한 경로를 우선 쓴다.
- first deploy 뒤에는 Cloud Run `status.url` host 를 `SECURITY_ALLOWED_HOSTS` 와 `PUBLIC_SITE_URL` 에 한 번 더 reconcile 해야 한다.
- external shallow probe 는 현재 `/healthz` 대신 별도 non-reserved path (`/livez` 등) 검토가 필요하다.

## Next Steps

1. external shallow probe 가 꼭 필요하면 `/healthz` 대신 다른 non-reserved path (`/livez` 등) 로 분리해 검증한다.
2. `DATABASE_URL` 를 privileged role 에서 least-privilege app role 로 바꾸고, `TURNSTILE_SECRET_KEY` 를 설정해 production hardening 을 마무리한다.
3. app-web를 장기적으로 Vercel 병행 유지할지, Cloud Run canonical 로 전환할지 운영 결정을 문서화한다.

## Exit Criteria

- [x] `app-web`가 Vercel / Cloud Run 두 target을 모두 명시적으로 build 할 수 있다
- [x] Cloud Run용 app image build path가 repo에 canonical file로 존재한다
- [x] app Cloud Run deploy에 필요한 env contract / operator steps 가 문서화된다
- [x] local build/check로 Cloud Run target 산출물이 검증된다
- [x] Cloud Run `app-web` service 가 실제 GCP에 배포되고 external root/ready smoke 가 통과한다

## Handoff Checklist

- branch: `codex/w-0143-app-cloud-run`
- verification:
  - `APP_DEPLOY_TARGET=vercel npm run build` ✅
  - `APP_DEPLOY_TARGET=cloudrun npm run build` ✅
  - `APP_DEPLOY_TARGET=cloudrun ... node build` on `127.0.0.1:3100` ✅
  - `curl http://127.0.0.1:3100/healthz` → `200` ✅
  - `curl http://127.0.0.1:3100/readyz` → `200` with local engine ✅
  - `cloudbuild.app.yaml` → build `82c613b1-8752-4292-a903-64c1acf3cb70` `SUCCESS` ✅
  - `gcloud run services update app-web` → revision `app-web-00004-fkf` serving `100%` ✅
  - `curl https://app-web-3u7pi6ndna-uk.a.run.app/readyz` → `200` ✅
  - `curl -I https://app-web-3u7pi6ndna-uk.a.run.app` → `200` ✅
- remaining blockers: external shallow health path follow-up (`/healthz` vs `/livez`), least-privilege DB role, `TURNSTILE_SECRET_KEY`, custom domain decision
