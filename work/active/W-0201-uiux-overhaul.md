# W-0201 — UI/UX 전면 개편

## Goal

엔진 산출물의 성격에 따라 정보를 분배한다.
차트=관측, 오른쪽=판단, 하단=검증, AI=해석.
지금 화면의 핵심 문제인 **정보 위계 붕괴 + 모드 혼재 + 중복 노출**을 해결한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

### Phase 1 — 정보 위계 정리

삭제:
- 오른쪽 DETAIL PANEL + AI DETAIL 동시 노출 → 슬라이드오버로
- raw metric 카드 5~6개 (OI/Fund/CVD 등) → 하단 Evidence Table로
- 오른쪽 Proposal/Entry/Stop/Target → Execute 모드로

합치기:
- Score + Confidence + Bias → Current State 카드 1개
- OI/Fund/CVD 각 요약 → Top Evidence 3 문장형

추가:
- Observe / Analyze / Execute 모드 토글
- 오른쪽 4카드 고정 구조 (Current State / Evidence / Risk / Actions)

### Phase 2 — 하단 Workspace 재구성

- 탭 → 섹션 토글 구조
- Phase Timeline (state machine 1:1 연결)
- Evidence Table (feature + threshold + pass/fail + why)
- Judgment 버튼 5개 (Valid / Invalid / Too Early / Too Late / Near Miss)
- workspaceEnvelope 기반 렌더 (W-0140 흡수)

### Phase 3 — Save + Find Similar

- Save Setup → 패턴 객체 생성 form (chart snapshot + feature snapshot + phase auto-attach)
- 저장 완료 → SIMILAR 섹션 자동 open
- benchmark_search 결과 10건 카드

### Phase 4 — AI Explain 슬라이드오버

- 슬라이드오버 패널 (탭 아님)
- phase + evidence + snapshot auto-inject
- AI 응답 렌더링

## Non-Goals

- 새 indicator 추가
- engine API 변경
- /lab, /dashboard 레이아웃 (별도 work item)
- mobile 전체 재설계 (Phase 1-4 이후)

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0201-uiux-overhaul.md`
- `docs/product/uiux-overhaul-design.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/workspaceDataPlane.ts`
- `engine/api/routes/captures.py`

## Facts

1. 현재 오른쪽에 DETAIL PANEL / AI DETAIL / raw metric 카드가 동시 노출된다.
2. 오른쪽과 하단에 같은 요약 정보가 중복된다.
3. Execute 콘텐츠(Entry/Stop/Target)가 Analyze 화면에 노출된다.
4. `workspaceDataPlane.ts`에 `summary-hud`, `detail-workspace`, `evidence-log`, `execution-board` section이 이미 존재한다.
5. `POST /captures/{id}/benchmark_search` route가 이미 존재한다.

## Assumptions

1. 모드 토글(O/A/E)은 localStorage per-tab으로 유지한다.
2. SIMILAR 섹션은 Save 직후 자동 open이 자연스러운 흐름이다.
3. 하단 섹션 토글 상태도 localStorage로 기억한다.

## Open Questions

- Execute 모드 진입은 오른쪽 HUD Actions에서 명시 버튼 vs 자동 감지?
- Compare 섹션에서 "current vs near-miss" 후보는 엔진이 자동 선정?

## Decisions

- 설계 진실: `docs/product/uiux-overhaul-design.md`
- Phase 1이 가장 즉시 효과 크다 (삭제/합치기가 추가보다 먼저).
- 각 Phase는 독립 PR. Phase 1 없이 Phase 2 시작 금지.
- 오른쪽 4카드 룰은 불변. 추가 시 기존 카드 제거 선행.
- 하단은 탭 아님. 섹션 토글 (여러 섹션 동시 보임 가능).

## Next Steps

1. 비결정 사항 2개 확인 후 Phase 1 브랜치 생성
2. TradeMode.svelte에서 삭제 목록 제거
3. 오른쪽 4카드 컴포넌트 분리 (`DecisionHUD.svelte`)
4. `npm --prefix app run check` 통과 → PR

## Exit Criteria

### Phase 1
- 오른쪽 카드 4개 이하
- raw metric 카드가 오른쪽에 없음
- Execute 콘텐츠(Entry/Stop/Target)가 기본 Analyze 화면에 없음
- Observe / Analyze / Execute 모드 전환 가능
- `npm --prefix app run check` 0 error

### Phase 2
- Phase Timeline이 state machine 출력과 1:1
- Evidence Table이 feature pass/fail + why 표시
- Judgment 버튼 5개 작동

### Phase 3
- range select → save → SIMILAR 10건 → outcome 루프 완주
- 빈 결과 처리 ("유사 케이스 없음")

### Phase 4
- AI Explain 슬라이드오버 작동
- context auto-inject 확인

## Handoff Checklist

- active work item: `work/active/W-0201-uiux-overhaul.md`
- design doc: `docs/product/uiux-overhaul-design.md`
- branch: 미생성 (Phase 1부터)
- verification: `npm --prefix app run check` per phase
- blockers: Open Questions 2개 결정 후 즉시 착수 가능
