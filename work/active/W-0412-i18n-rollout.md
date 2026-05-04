# W-0412 — i18n Rollout (W-0411 K9 분리)

## Status
- Owner: TBD
- Phase: 설계 stub (W-0411 §K9 에서 분리)
- Priority: P2 (5페이지 IA 확정 후 진행)
- Created: 2026-05-05
- Depends on: W-0408 / W-0409 / W-0411 IA 확정 (Wave D 머지 완료 후 PR4 발급 가능)
- Tracked by: W-0413 §A (5번째 work item)

## Why

W-0411 §K9 결정: "Settings 섹션 i18n 키만 W-0411 PR7 에서 추가, 나머지 페이지는 별도 W item 분리".

현 i18n 코드베이스 실측 (W-0413 §J 검증):
- 라이브러리: 자체 구현 store `app/src/lib/i18n/index.ts` (svelte-i18n / paraglide / sveltekit-i18n 미사용)
- 로케일 파일: `app/src/lib/i18n/locales/en.json`, `ko.json` — 각 74줄, ~36 키
- 현 키 네임스페이스: `nav.*`, `patterns.*`, `stats.*`, `auth.*`, `home.*`, `status.*`, `common.*`
- **누락 네임스페이스**: `settings.*`, `dashboard.*`, `terminal.*`, `lab.*` (lab 은 W-0409 흡수 후 `patterns.workshop.*` 으로), `propfirm.*`, `verdict.*`, `wallet.*`
- 하드코딩된 한국어: 약 424개 라인 매치 (`.svelte` 파일 grep)

## Goals

1. 5페이지 (Dashboard / Terminal / Patterns(+Lab) / Settings 추가분 / PropFirm / Mobile) 의 모든 사용자 노출 한국어 문자열을 i18n 키로 추출
2. ko/en 페어 100% 커버 (en 누락 시 ko fallback 명시)
3. Language toggle (W-0411 PR7 D8) 가 5페이지 모두에서 즉시 적용
4. extractor 자동화 — 신규 PR 머지 시 미추출 한국어 strings CI 차단

## Non-Goals

- 일본어/중국어 등 추가 언어 지원 (별도 W item)
- 동적 컨텐츠 (DB 사용자 입력) 번역
- 서버 응답 i18n (engine 측 메시지)
- RTL 지원

## A. Scope (페이지별)

| 페이지 | 파일 수 (대략) | 핵심 키 네임스페이스 | 의존 W |
|--------|---------------|---------------------|--------|
| Dashboard | 12 | `dashboard.{hero,kpi,today,system,verdictQueue}.*` | W-0408 PR1~PR6 머지 |
| Terminal | 30+ | `terminal.{tabs,chartToolbar,drawing,aiPanel,scan,verdict,mobile}.*` | W-0407 W-T1~W-T13 머지 |
| Patterns (+Lab 흡수) | 25+ | `patterns.{library,search,workshop,live,lifecycle,compare,research}.*` | W-0409 PR1~PR8 머지 |
| Settings (W-0411 외 갱신) | 5 (Settings 자체는 W-0411 PR7) | `settings.*` (W-0411 작업 후 추출 검증) | W-0411 PR7 머지 |
| PropFirm | 4 | `propfirm.{landing,evaluation,result}.*` | 변경 없음 (현재 안정) |
| 공용 layout | 8 | `nav.*`, `common.*`, `wallet.*`, `verdict.*` | W-0411 PR1 (AppTopBar) 머지 |

## B. PR 분할 (4 PR 잠정)

| PR | 범위 | 의존 |
|----|------|------|
| W-0412 PR1 | i18n 인프라 강화 — extractor 스크립트 + CI gate (`pnpm i18n:check`) + 누락 키 리포트 | — |
| W-0412 PR2 | 공용 layout + Mobile (`nav.*`, `common.*`, `wallet.*`, `verdict.*`) — AppTopBar/AppNavRail/MobileFooter 추출 | W-0411 PR1, W-0407 W-T9 머지 |
| W-0412 PR3 | Dashboard + Terminal — `dashboard.*`, `terminal.*` 키 추출 + 번역 | W-0408 모든 PR + W-0407 W-T13 머지 |
| W-0412 PR4 | Patterns + 잔여 — `patterns.*` (Lab 흡수 포함) + PropFirm | W-0409 모든 PR 머지 |

## C. Decisions (8개 잠정)

| # | 항목 | 옵션 | 권장 | 상태 |
|---|------|------|------|------|
| D1 | i18n 라이브러리 마이그레이션 | (a) 현 자체 구현 유지 (b) svelte-i18n (c) paraglide-js (Inlang, type-safe + tree-shakable) | **(c)** | PR1 spike 후 결정 |
| D2 | Locale 파일 형식 | (a) JSON 단일 (b) 네임스페이스별 분할 (`locales/ko/dashboard.json` 등) | **(b)** | 키 200+ 시 단일 파일 무거움 |
| D3 | Pluralization | (a) `{count}개 verdict` (b) ICU MessageFormat | **(b)** | paraglide 가 ICU 지원 |
| D4 | 날짜/숫자 포맷 | (a) `Intl.NumberFormat` 직접 (b) i18n util 래퍼 | **(b)** | 일관성 |
| D5 | Fallback 정책 | (a) en 누락 시 ko (b) 키 자체 노출 (c) 빌드 실패 | **(c)** | CI gate 로 누락 차단 |
| D6 | 동적 키 (e.g. `verdict.${status}`) | (a) 허용 (b) 정적 키만 + switch | **(b)** | extractor 가 동적 키 추출 못 함 |
| D7 | 사용자 입력 메시지 (e.g. AI 응답 한국어) | scope 외 — 번역 안 함 | — | clarification only |
| D8 | Locale 자동 감지 | (a) navigator.language (b) URL prefix `/en/...` (c) 사용자 설정만 | **(c)** | W-0411 D8 (Language) 와 정합 |

## D. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | `pnpm i18n:check` CI gate 통과 — 한국어 하드코딩 0 (whitelist 외) |
| AC2 | en/ko 키 페어 100% (누락 0) |
| AC3 | Language toggle (`/settings?section=display`) 1초 내 5페이지 모두 갱신 |
| AC4 | Bundle size 회귀 < 50KB (paraglide tree-shake 효과 확인) |
| AC5 | Lighthouse score 회귀 없음 (LCP < 2.5s 유지) |
| AC6 | Storybook (있을 시) 또는 visual regression — 한국어/영어 양쪽 layout overflow 0 |
| AC7 | URL deep link 보존 — `?section=`, `?tab=` 등 쿼리 파라미터 i18n 전후 동일 |
| AC8 | extractor 가 신규 한국어 추가 시 CI 실패 (PR2~PR4 검증 시점) |

## E. 위험

| Risk | 완화 |
|------|------|
| 5페이지 IA 미확정 시 키 추출 → 재작업 | Wave D 머지 완료 후에만 PR3/PR4 발급 |
| paraglide 마이그레이션 비용 | PR1 spike 1주 timebox, 실패 시 자체 store 유지 + 네임스페이스 분할만 |
| 번역 품질 (en 자동 번역) | DeepL/GPT 초안 → 사람 검수 단계 명시 |
| 키 충돌 (`patterns.workshop.*` ↔ Lab 흡수 시 기존 `lab.*`) | W-0409 흡수 PR 내 키 마이그레이션 (`lab.title` → `patterns.workshop.title`) |

## F. References

- W-0411 §K9 — 분리 결정
- W-0413 §A / §J — 5 work item 통합 검토
- 현 i18n: `app/src/lib/i18n/index.ts`, `app/src/lib/i18n/locales/{en,ko}.json`
- paraglide-js: https://inlang.com/m/gerre34r/library-inlang-paraglideJs

## G. 다음 단계

1. Wave D 머지 완료 시점에 owner 지정 + PR1 spike (1주)
2. paraglide 마이그레이션 결정 후 PR2 (공용 layout) 발급
3. Dashboard/Terminal/Patterns 머지 진행에 맞춰 PR3/PR4 순차 발급
4. W-0411 PR7 (Settings 섹션 키 + Language toggle) 가 먼저 머지되어 있어야 함 (D8 의존)
