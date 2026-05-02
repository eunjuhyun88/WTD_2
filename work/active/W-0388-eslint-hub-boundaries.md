# W-0388 — ESLint hubs/ 경계 강제

> Wave: 5 | Priority: P2 | Effort: S (1-2h)
> Charter: In-Scope (architecture hygiene)
> Status: 🟡 Design Draft
> Created: 2026-05-02

## Goal

`$lib/hubs/` 간 직접 교차 임포트를 ESLint `no-restricted-imports`으로 차단해 W-0382-D의 경계 분리를 코드 레벨에서 영구 보호한다.

## Context

- W-0382-D (#906): `lib/cogochi/` + `components/terminal/` 삭제 완료
- 현재 ESLint 미설정 (`app/` 에 eslint 없음 — svelte-check만 존재)
- 신규 코드에서 다시 경계를 무너뜨리는 임포트가 도입될 위험 존재

## Scope

- `app/eslint.config.js` — flat-config 신규 생성 (ESLint v9)
  - `no-restricted-imports` 규칙: `$lib/hubs/terminal/*` 를 `app/`, `hubs/bloomberg/` 등 다른 허브에서 직접 임포트 금지
  - `$lib/cogochi/*` 임포트 시 에러 + fixHint 추가
  - `$lib/components/terminal/*` (hud 제외) 임포트 시 경고
- `app/package.json` — `"lint"` 스크립트 추가: `eslint app/src --ext .ts,.svelte`
- `app/package.json` devDependencies: `eslint@^9`, `eslint-plugin-svelte@^2`

## Non-Goals

- eslint-plugin-boundaries (복잡한 zone 설정 불필요 — no-restricted-imports로 충분)
- CI 단계 추가 (기존 svelte-check CI와 분리)
- 전체 코드베이스 ESLint 수정 (신규 위반만 차단, 기존 OK)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| ESLint v9 flat-config와 svelte plugin 호환성 | 중 | 낮 | eslint-plugin-svelte v2+ flat-config 지원 확인됨 |
| 기존 hud/ self-import 오탐 | 낮 | 낮 | `$lib/components/terminal/hud/*` 는 허용 예외 |

### Decisions

- [D-3001] no-restricted-imports vs eslint-plugin-boundaries: `no-restricted-imports` 선택 — 설치 단순, 설정 파일 1개, 추가 plugin 불필요

## Open Questions

없음

## Implementation Plan

1. `app/package.json`에 `eslint@^9` + `eslint-plugin-svelte@^2` devDeps 추가
2. `app/eslint.config.js` flat-config 작성
   ```js
   import sveltePlugin from 'eslint-plugin-svelte';
   export default [
     ...sveltePlugin.configs['flat/recommended'],
     {
       rules: {
         'no-restricted-imports': ['error', {
           patterns: [
             { group: ['**/cogochi/**'], message: 'lib/cogochi/ 삭제됨 — $lib/hubs/terminal/ 사용' },
             { group: ['**/components/terminal/**'], message: 'components/terminal/ 삭제됨 — $lib/hubs/terminal/ 사용' },
           ]
         }]
       }
     }
   ];
   ```
3. `app/package.json` scripts에 `"lint": "eslint src --ext .ts,.svelte"` 추가
4. `pnpm lint` 0 errors 확인

## Exit Criteria

- [ ] AC1: `cd app && pnpm lint` exit 0 (0 errors)
- [ ] AC2: `grep -rn "from.*cogochi\|from.*components/terminal" app/src` = 0줄
- [ ] AC3: `app/eslint.config.js` git-tracked

## Decisions

- [D-3801] ESLint v9 flat-config 선택. 거절: v8 `.eslintrc.*` (deprecated)
- [D-3802] `eslint-plugin-svelte` v2 사용. 거절: 자체 Svelte rule 작성 (유지비)
- [D-3803] CI lint 단계 별도 PR로 분리. 거절: 본 PR 포함 (scope 과다)

## Facts

- 잔여 cogochi 임포트: 0개 (W-0382-D 완료)
- 잔여 components/terminal 임포트: 0개 (W-0382-D 완료)
- ESLint 현재 없음: `app/` 내 eslint 설정 파일 부재 확인

## Canonical Files

- `app/eslint.config.js` (신규)
- `app/package.json` (devDeps + scripts)

## Assumptions

- ESLint v9 flat-config 사용 (v8 `.eslintrc.*` 아님)
- CI에 lint 단계 추가는 별도 작업 (이번 scope 아님)

## Owner

app

## Next Steps

1. `app/package.json` devDeps: `eslint@^9`, `eslint-plugin-svelte@^2` 추가
2. `app/eslint.config.js` flat-config 작성
3. `pnpm lint` 0 errors 확인
4. PR 생성 + CI green 확인

## Handoff Checklist

- [ ] ESLint v9 flat-config + eslint-plugin-svelte v2 호환성 확인
- [ ] `pnpm lint` exit 0 확인
- [ ] `grep -rn "from.*cogochi\|from.*components/terminal" app/src` = 0 확인
- [ ] CURRENT.md 활성 항목에 W-0388 추가 (작업 착수 시)
