# W-0136 — C-only Layout Simplification

## Goal

Cogochi desktop/tablet surface 에서 A `STACK`, B `DRAWER` 레이아웃을 제거하고 C `SIDEBAR` 하나만 남긴다. 동시에 C sidebar 의 `02 ANALYZE` 섹션을 접기/펼치기 가능하게 만든다.

## Owner

app

## Scope

- `TradeMode.svelte` 의 A/B 레이아웃 분기와 선택 UI 제거
- desktop/tablet 에서 C 레이아웃만 렌더하도록 단순화
- C sidebar 의 `02 ANALYZE` 섹션 collapse 토글 추가
- persisted `layoutMode` 와 preset 값이 남아 있어도 모두 `C` 로 정규화

## Non-Goals

- 모바일 탭 구조 재설계
- indicator archetype 자체 변경
- capture / runtime API 수정

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0136-c-only-layout.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/shell.store.ts`
- `app/src/lib/cogochi/workspacePresets.ts`

## Facts

- `AppShell.svelte` 는 이미 non-mobile 에서 `layoutMode: 'C'` 를 강제한다.
- `TradeMode.svelte` 에는 여전히 A/B 선택 UI와 대형 레거시 분기가 남아 있다.
- `shell.store.ts` 와 `workspacePresets.ts` 는 아직 `A | B | C` 타입을 유지한다.
- C sidebar 안의 `VENUE · LIQ` 는 이미 `<details>` 기반 collapse 를 쓰고 있다.

## Assumptions

- 기존 사용자 저장값에 A/B 가 남아 있어도 강제 C 마이그레이션이 허용된다.

## Open Questions

- 없음. 사용자 요청은 C-only 로 명확하다.

## Decisions

- 이번 lane 은 product surface change 하나만 다룬다.
- 레이아웃 선택기는 제거하되 preset 접근은 유지한다.
- `02 ANALYZE` 는 C sidebar 에서만 접기/펼치기 제공하고, 모바일/peek drawer 는 이번 범위에서 유지한다.

## Next Steps

1. C-only 로 타입/저장값/프리셋을 정규화한다.
2. `TradeMode` 에서 A/B 분기와 layout strip 을 제거하고 preset 접근만 남긴다.
3. C sidebar `02 ANALYZE` collapse 와 검증을 마친다.

## Exit Criteria

- desktop/tablet 에서 A/B 버튼이 더 이상 보이지 않는다.
- 코드상 A/B 레이아웃 분기가 제거된다.
- 기존 localStorage/preset 에 A/B 가 있어도 화면은 C 로 정상 렌더된다.
- C sidebar `02 ANALYZE` 를 접고 펼칠 수 있다.

## Handoff Checklist

- active work item: `work/active/W-0136-c-only-layout.md`
- branch: `codex/w-0136-c-only-layout`
- verification: `npm run check` or equivalent app check
- blockers: 없음
