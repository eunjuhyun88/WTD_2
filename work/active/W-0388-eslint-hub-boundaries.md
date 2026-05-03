# W-0388 — ESLint hubs/ 경계 강제

> Wave: 5 | Priority: P2 | Effort: S (2-3h)
> Charter: In-Scope (architecture hygiene)
> Status: 🟡 Design Draft
> Issue: #956
> Created: 2026-05-02 | Revised: 2026-05-03

## Goal

`$lib/hubs/{dashboard,lab,patterns,settings,terminal}` 간 cross-hub direct import, 그리고 hub 외부 코드(`lib/`, `components/`, `routes/`)에서 hub 내부 모듈을 직접 찌르는 행위를 ESLint `no-restricted-imports`로 차단해 W-0382-D 경계 분리를 영구 보호한다.

진입점 규약: 외부는 오직 `$lib/hubs/<hub>` (barrel) 만 import. 내부 경로(`$lib/hubs/<hub>/foo/bar`) 직접 접근 금지.

## Context (실측 — 2026-05-03)

- ESLint 이미 설치됨 (`eslint`, `eslint-plugin-svelte`, `@typescript-eslint/*`) — 재설치 불필요
- `eslint.config.js` **없음** — 현재 lint는 설정 없이 default rule로 돈다
- 기존 lint 스크립트: `eslint 'src/**/*.ts'` — `.svelte` 미포함
- hubs: `dashboard, lab, patterns, settings, terminal`
- **실측 위반 9건 존재** (Draft가 0건이라 했던 부분 정정)

### 위반 9건 (외부 → terminal hub 내부 직접 import)

| # | 파일 | 대상 |
|---|---|---|
| 1 | `components/cogochi/AlphaMarketBar.svelte:3` | `$lib/hubs/terminal/marketPulse` |
| 2 | `components/layout/BottomBar.svelte:3` | `$lib/hubs/terminal/marketPulse` |
| 3 | `lib/chart/paneCurrentValues.ts:20` | `$lib/hubs/terminal/workspace/PaneInfoBar.svelte` (type only — allowTypeImports로 허용) |
| 4 | `lib/components/indicators/IndicatorPane.svelte:12` | `$lib/hubs/terminal/shell.store` |
| 5 | `lib/components/indicators/IndicatorRenderer.svelte:8` | `$lib/hubs/terminal/shell.store` |
| 6 | `lib/shared/panels/CommandPalette.svelte:3` | `$lib/hubs/terminal/shell.store` |
| 7 | `lib/shared/panels/mobile/MobileSymbolStrip.svelte:6` | `../hubs/terminal/workspace/SymbolPicker.svelte` |
| 8 | `routes/api/cogochi/workspace-bundle/+server.ts:19` | `$lib/hubs/terminal/workspaceDataPlane` |
| 9 | `routes/cogochi/+page.svelte:2` | `$lib/hubs/terminal` (barrel — 합법) |

## Scope

- `app/eslint.config.js` 신규 (ESLint v9 flat-config)
- `app/package.json` lint 스크립트 확장: `src/**/*.ts` → `src/**/*.{ts,svelte}`
- `eslint-plugin-svelte` flat-config 활성화 (이미 설치됨)
- 위반 7건 수정 (#3 type-only 허용, #9 barrel 합법 — 수정 불필요)
- `app/src/lib/hubs/terminal/index.ts` barrel에 누락 export 추가

## Non-Goals

- `eslint-plugin-boundaries` 도입 (no-restricted-imports로 충분)
- CI 단계 추가 (별도 PR)
- 전체 코드베이스 ESLint rule 강화 (boundary rule만 도입)
- 신규 lint rule (style/format 등) 추가

---

## CTO 관점

### 기존 위반 처리 전략

**Plan A 선택 (Fix-then-error)**: 9건 먼저 수정 후 rule을 `error`로 도입.

| Plan | 설명 | Pros | Cons |
|---|---|---|---|
| **A. Fix-then-error** | 위반 먼저 수정 후 error 룰 도입 | 깨끗한 baseline, 미래 위반 즉시 차단 | 위반 수정 ~1.5h 추가 |
| B. Warn-first | warn으로 도입, 위반 그대로 | 빠른 도입 | warning noise → 무시됨, broken-windows |
| C. Inline-disable | error 룰 + disable 코멘트 9개 | 빠른 도입 | 9개 부채, 의미적 정당성 없음 |

### no-restricted-imports 패턴

```js
// 외부 코드: hub 내부 경로 금지, barrel만 허용
{
  files: ['src/**/*.{ts,svelte}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/hubs/*/**', '$lib/hubs/*/**'],
        message: 'hub 내부 경로 직접 import 금지. barrel ($lib/hubs/<hub>) 사용',
        allowTypeImports: true
      }]
    }]
  }
},
// hub 자신: 자기 hub 내부 import 자유롭게
{
  files: ['src/lib/hubs/**/*.{ts,svelte}'],
  rules: { 'no-restricted-imports': 'off' }
},
// 각 route: 자신의 hub 내부만 허용 (terminal route → terminal hub internal OK)
{
  files: ['src/routes/terminal/**/*.{ts,svelte}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['$lib/hubs/{dashboard,lab,patterns,settings}/**'],
        message: 'cross-hub 내부 접근 금지'
      }]
    }]
  }
}
```

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| flat-config + svelte plugin 호환 이슈 | 낮 | 중 | eslint-plugin-svelte v2.46+ 공식 지원 |
| barrel 미export로 import 깨짐 | 중 | 중 | Plan A에서 barrel 보강이 선행 조건 |
| Svelte `<script lang="ts">` parser 설정 | 낮 | 중 | eslint-plugin-svelte가 자동 처리 |

### Dependencies / Rollback

- 의존: 없음 (standalone)
- Rollback: `git revert` 1 commit — runtime 영향 0

### Files Touched (실측)

- `app/eslint.config.js` (신규)
- `app/package.json` (lint script 수정)
- `app/src/lib/hubs/terminal/index.ts` (barrel export 추가)
- `app/src/components/cogochi/AlphaMarketBar.svelte` (import 수정)
- `app/src/components/layout/BottomBar.svelte` (import 수정)
- `app/src/lib/components/indicators/IndicatorPane.svelte` (import 수정)
- `app/src/lib/components/indicators/IndicatorRenderer.svelte` (import 수정)
- `app/src/lib/shared/panels/CommandPalette.svelte` (import 수정)
- `app/src/lib/shared/panels/mobile/MobileSymbolStrip.svelte` (import 수정)
- `app/src/routes/api/cogochi/workspace-bundle/+server.ts` (import 수정)

---

## AI Researcher 관점

### Data Impact

- 런타임 영향 0 (정적 분석만)
- 빌드 시간: lint 추가로 ~5-10초

### Failure Modes

- `import()` dynamic import는 no-restricted-imports 미커버 (static import만)
- `import type` (#3 case): `allowTypeImports: true`로 허용

---

## Decisions

- [D-3801] 기존 9건 처리 → **Plan A** (fix-then-error). 거절: B (broken-windows), C (부채)
- [D-3802] ESLint v9 flat-config. 거절: v8 .eslintrc (deprecated)
- [D-3803] `no-restricted-imports` + files override. 거절: eslint-plugin-boundaries (과도)
- [D-3804] lint 스크립트 `.svelte` 포함 확장. 거절: .ts만 유지 (boundary rule이 .svelte 미커버)
- [D-3805] `allowTypeImports: true`. 거절: type도 차단 (#3 케이스 깨짐)
- [D-3806] CI 단계 추가 별도 PR. 거절: 본 PR 포함 (scope 비대)

## Open Questions

- OQ-1: `routes/cogochi/+page.svelte`가 terminal hub를 쓰는 구조가 맞는가? (barrel import이므로 현재 rule 통과. 의미적 검토는 별도)
- OQ-2: `lib/components/indicators/`는 공용인가 terminal hub 소속인가? (본 PR에서는 barrel 경유로만 수정, 소속 이전은 별도)

---

## Implementation Plan

1. `app/src/lib/hubs/terminal/index.ts` barrel에 누락 export 추가:
   - `EMPTY_THERMO_DATA`, `ThermoData` from `./marketPulse`
   - `shellStore`, `ShellWorkMode`, `TabState`, `activeDrawingMode` from `./shell.store`
   - `buildCogochiWorkspaceEnvelope`, `buildStudyMap` from `./workspaceDataPlane`
   - `SymbolPicker` (default) from `./workspace/SymbolPicker.svelte`
2. 위반 7건 import 경로 수정 (barrel `$lib/hubs/terminal`으로 통일)
3. `app/eslint.config.js` 작성 (flat-config, hub boundary rules)
4. `app/package.json` lint/lint:fix script `.svelte` 포함으로 수정
5. `pnpm lint` exit 0 확인
6. 의도적 위반 1건 → `pnpm lint` error 확인 → revert (AC4)
7. PR 생성

## Exit Criteria

- [ ] **AC1**: `cd app && pnpm lint` exit 0, 0 errors
- [ ] **AC2**: `app/eslint.config.js` git-tracked, ESLint v9 flat-config
- [ ] **AC3**: 위반 7건 수정 완료 (`grep -rE "from ['\"].*hubs/terminal/[^'\"]+['\"]" app/src` → type import 및 within-hub 제외하고 0줄)
- [ ] **AC4**: 의도적 위반 1건 → `pnpm lint` exit ≠ 0 (PR description에 증거)
- [ ] **AC5**: `grep -E '"lint":.*svelte' app/package.json` 매치
- [ ] **AC6**: `pnpm check` (svelte-check) 0 errors — barrel 변경이 런타임 타입 안전성 유지

## Canonical Files

- `app/eslint.config.js` (신규)
- `app/package.json`
- `app/src/lib/hubs/terminal/index.ts`
- 위반 7개 파일

## Owner

app

## Facts

- ESLint 이미 설치: `eslint`, `eslint-plugin-svelte`, `@typescript-eslint/*` devDeps 확인
- terminal barrel 현재: `export { default as TerminalHub } from './TerminalHub.svelte'` 만 있음
- lint script 현재: `eslint 'src/**/*.ts'` (.svelte 미포함)
- cross-hub 위반 9건, 수정 대상 7건 (위 표 참조)

## Assumptions

- ESLint v9 flat-config 사용
- hub 내부 파일끼리의 import는 항상 허용
- terminal route (`routes/terminal/*`)는 terminal hub 내부 접근 허용

## Next Steps (구현 에이전트용)

1. `app/src/lib/hubs/terminal/index.ts` 읽고 barrel export 추가
2. 위반 7건 파일 각각 읽고 import 경로 수정
3. `app/eslint.config.js` 신규 생성
4. `app/package.json` lint script 수정
5. `pnpm lint` + `pnpm check` 실행 검증
6. PR 생성 (feat/W-0388-eslint-hub-boundaries)
