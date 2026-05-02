# W-0382-D — 레거시 디렉토리 삭제 + ESLint 허브 경계 강제

> Wave: 6 | Priority: P1 | Effort: M
> Charter: 5-Hub Architecture (In-Scope — Phase D)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Parent Issue: #879

## Goal

`lib/cogochi/`와 `components/terminal/` 레거시 디렉토리를 삭제하고, ESLint CI 규칙으로 허브 경계를 강제해 5-Hub 아키텍처를 되돌릴 수 없는 구조로 굳힌다.

## Scope

- **포함**:
  - `app/src/lib/cogochi/` 전체 삭제 (0 외부 임포터 — 즉시 삭제 가능)
  - `app/src/components/terminal/` 전체 삭제 (38 외부 임포터 마이그레이션 선행 필요)
  - ESLint flat config + `no-restricted-imports` 또는 `eslint-plugin-boundaries` 설치
  - CI에서 ESLint 경계 위반 = 빌드 실패 설정
  - svelte-check 0 errors 검증
- **파일**: `app/src/lib/cogochi/**`, `app/src/components/terminal/**`, `app/eslint.config.js`, `.github/workflows/app.yml`
- **마이그레이션 대상**: `app/src/` 내 `components/terminal/`를 임포트하는 38개 파일

## Non-Goals

- `app/src/lib/components/terminal/hud/` 삭제 (별도 경로, 범위 외)
- `/cogochi` URL 301 리다이렉트 (별도 PR로 분리 가능 — Q-3003)
- hub 내부 세부 리팩토링

## 4-Sub-Phase 구현 계획

### D-1: 38개 caller 마이그레이션
1. `rg "from.*components/terminal" app/src` 로 목록 확정
2. 각 임포트를 대응하는 `$lib/hubs/terminal/` 또는 `$lib/shared/` 경로로 교체
3. svelte-check 0 errors 확인

### D-2: ESLint 인프라 설치
1. `pnpm add -D eslint eslint-plugin-svelte @typescript-eslint/eslint-plugin`
2. **Q-3001 결정에 따라**: `eslint-plugin-boundaries` 또는 `no-restricted-imports` regex 규칙 작성
3. 경계 위반 fixture 테스트: `import X from '$lib/hubs/terminal/...'` in dashboard hub → CI red 확인

### D-3: 레거시 디렉토리 삭제
1. `app/src/lib/cogochi/` 삭제 (caller 0 — 즉시)
2. `app/src/components/terminal/` 삭제 (D-1 완료 후)
3. `git ls-files app/src/lib/cogochi app/src/components/terminal` = 0 확인

### D-4: CI 통합
1. `.github/workflows/app.yml`에 `pnpm eslint` 단계 추가
2. PR에서 경계 위반 시 실패하는지 검증

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| D-1 중 누락된 임포터 | 낮음 | 빌드 실패 | rg grep 전수 확인 + svelte-check |
| ESLint flat config vs legacy config 충돌 | 중간 | lint 무력화 | SvelteKit vite 기반이므로 flat config 사용 |
| components/terminal/hud/ 범위 혼동 | 낮음 | 잘못된 삭제 | 정확한 경로 지정: `app/src/components/terminal/` only |

### Dependencies

- Phase A/B/C 모두 merged (✅ 7f6927dc)
- D-1 완료 전 D-3 불가

### Files Touched (실측 기반)

- 38개 파일 (임포터) — `rg "from.*components/terminal" app/src --files-with-matches`
- `app/eslint.config.js` (신규 생성)
- `.github/workflows/app.yml` (ESLint step 추가)
- `app/package.json` (devDeps 추가)
- `app/pnpm-lock.yaml`

## AI Researcher 관점

### Data Impact
- 삭제 전후 svelte-check 에러 카운트 = 0 → 0 (회귀 없음 기준)
- ESLint 경계 규칙: 허브 간 직접 임포트 금지, shared/ 경유 강제

### Failure Modes
- D-1 마이그레이션 중 `hubs/` 내 circular import 발생 가능 → `shared/` 분리로 해결
- ESLint rule이 너무 좁으면 false negative (미탐), 너무 넓으면 false positive (과탐) → 규칙 fixture 테스트 필수

## Decisions

- **[D-4001]** 구현 순서: D-1 → D-2 → D-3 → D-4 (순차 의존, 병렬 불가)
- **[D-4002]** `lib/cogochi/` 즉시 삭제 (caller 0 확인됨)

## Open Questions

- [ ] [Q-3001] ESLint 플러그인 선택: `eslint-plugin-boundaries` (허브별 세분화) vs `no-restricted-imports` regex (단순, 추가 의존성 없음) — **사용자 결정 필요**
- [ ] [Q-3002] CI 통합: 기존 `app.yml` workflow에 추가 vs 별도 `lint.yml` 분리
- [ ] [Q-3003] `/cogochi` URL 301 리다이렉트 이 PR에 포함 vs 별도 PR

## Exit Criteria

- [ ] AC1: `rg "from.*components/terminal" app/src` = 0 hits
- [ ] AC2: `git ls-files app/src/lib/cogochi app/src/components/terminal` = 0 lines
- [ ] AC3: `pnpm -C app svelte-check` errors = 0
- [ ] AC4: 경계 위반 fixture import → ESLint CI red (허브 간 직접 임포트 거부 확인)
- [ ] AC5: `pnpm -C app build` clean (빌드 실패 없음)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
