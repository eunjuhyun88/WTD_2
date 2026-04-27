# W-0244 — SaveSetupModal × DraftFromRangePanel Integration

> Wave 2.5 | Owner: app | Branch: `feat/W-0244-savesetup-draft-integration`
> **선행: A-04-app (DraftFromRangePanel) ✅ 머지 (PR #386)**

## Goal

`DraftFromRangePanel`을 `SaveSetupModal` 안에 embed해서, draft 응답이 form (selectedPhase / note / pattern_family)에 자동 prefill되도록 통합.

A-04-app PR #386에서 standalone panel 만들었지만 SaveSetupModal full integration은 follow-up으로 미뤘던 항목.

## Owner

app

## Primary Change Type

Product surface change (component composition)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `app/src/components/terminal/workspace/SaveSetupModal.svelte` | DraftFromRangePanel embed + draft 응답 → form prefill 로직 |
| `app/src/components/terminal/workspace/SaveStrip.svelte` (desktop) | 동일 통합 |
| `app/src/components/terminal/workspace/__tests__/SaveSetupModal.test.ts` | NEW or 기존 — Draft 응답 → prefill 검증 |

## Non-Goals

- DraftFromRangePanel 자체 변경 (A-04-app PR #386에서 완료)
- API 메서드 변경 (`draftPatternFromRange` 그대로 사용)
- 새 phase 추가 (PHASE_LABELS 6개 그대로)
- ChartBoard / chartSaveMode store 변경 (기존 작동)

## Canonical Files

- `work/active/W-0244-savesetupmodal-draft-integration.md` (this)
- `work/active/W-0230-tradingview-grade-viz-design.md` (선행 설계)
- `app/src/components/terminal/workspace/SaveSetupModal.svelte`
- `app/src/components/terminal/workspace/SaveStrip.svelte`
- `app/src/components/terminal/workspace/DraftFromRangePanel.svelte` (재사용)
- `app/src/lib/api/terminalApi.ts` (`draftPatternFromRange` 메서드 — 변경 X)

## Facts

1. main = `c43a22ed`
2. A-04-app (PR #386) 머지 완료 — DraftFromRangePanel.svelte 230L 존재
3. SaveSetupModal.svelte 5 phase + similar matches + viewport snapshot 작동
4. PHASE_LABELS = ['FAKE_DUMP', 'ARCH_ZONE', 'REAL_DUMP', 'ACCUMULATION', 'BREAKOUT', 'GENERAL']
5. chartSaveMode store에 anchorA/B + payload 작동
6. SaveStrip은 desktop, SaveSetupModal은 mobile path

## Assumptions

1. DraftFromRangePanel API (props: symbol/startTs/endTs/timeframe/onDraftReceived) 안정
2. Draft 응답의 pattern_family를 PHASE_LABELS에 매핑 가능 (또는 GENERAL fallback)
3. Draft 응답의 signals/phases는 form note 필드에 textual로 prefill (구조화 별도)

## Open Questions

1. Draft `pattern_family` → `selectedPhase` 자동 매핑 룰?
   - 권고: `oi_reversal` → REAL_DUMP, `accumulation` → ACCUMULATION, etc — 또는 사용자 수동 선택 (안전)
2. Draft `phases` 배열 → form에 어떻게 표시?
   - 권고: 첫 phase의 phase_id를 selectedPhase에 prefill
3. Draft `signals_required` → note 필드?
   - 권고: ", "로 join → note에 prefill

## Decisions

- D-W-0244-1: Draft `phases[0].phase_id` → `selectedPhase` (없으면 GENERAL)
- D-W-0244-2: Draft `signals_required` + `signals_preferred` join → `note` 필드 prefill (사용자 편집 가능)
- D-W-0244-3: DraftFromRangePanel은 SaveSetupModal 상단에 배치 (capture context 위)
- D-W-0244-4: Draft 받기 전에 사용자가 수동 입력 시작 → 충돌 시 Draft 받으면 confirm prompt
- D-W-0244-5: 12 features 칩은 SaveSetupModal에 그대로 표시 (Draft 응답 후)

## Next Steps

1. SaveSetupModal에 DraftFromRangePanel import + embed
2. `onDraftReceived` callback 구현 → form prefill
3. PHASE_LABELS 매핑 헬퍼 함수
4. user 수동 입력 보존 로직 (충돌 시 confirm)
5. SaveStrip (desktop) 동일 통합
6. Vitest test (Draft → prefill 검증)
7. App CI pass

## Exit Criteria

- [ ] SaveSetupModal 열림 + chartSaveMode anchorA/B set 시 → DraftFromRangePanel 표시
- [ ] "Draft from Range" 클릭 → 응답 → selectedPhase / note 자동 prefill
- [ ] 사용자 수동 입력 후 Draft 받음 → confirm prompt
- [ ] 12 features 칩 SaveSetupModal에 표시 (p50 무색 룰 유지)
- [ ] SaveStrip (desktop) 동일 작동
- [ ] 기존 Save 흐름 회귀 없음
- [ ] App CI pass

## Form Prefill 매핑 (D-W-0244-1, D-W-0244-2)

```typescript
function applyDraft(draft: PatternDraftBodyShape) {
  // Phase 매핑
  const firstPhase = draft.phases?.[0]?.phase_id;
  const validPhases = PHASE_LABELS.map(p => p.id);
  if (firstPhase && validPhases.includes(firstPhase)) {
    selectedPhase = firstPhase;
  } else {
    selectedPhase = 'GENERAL';
  }

  // Signals → note
  const required = draft.signals_required ?? [];
  const preferred = draft.signals_preferred ?? [];
  const signalsText = [
    required.length > 0 ? `Required: ${required.join(', ')}` : null,
    preferred.length > 0 ? `Preferred: ${preferred.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  // 사용자 입력 보존
  if (note.trim().length > 0 && note !== signalsText) {
    if (!confirm('현재 작성한 메모를 Draft로 덮어쓰시겠어요?')) return;
  }
  note = signalsText;
}
```

## CTO 설계 원칙 적용

### 성능
- DraftFromRangePanel은 lazy (anchorA/B set 시에만 활성)
- `onDraftReceived` callback 동기 prefill (추가 fetch 없음)
- features 칩은 한 번 render

### 안정성
- 사용자 수동 입력 보존 (confirm prompt)
- Draft 실패 시 form 영향 없음 (try/catch)
- PHASE_LABELS 매핑 fallback (GENERAL)

### 보안
- DraftFromRangePanel API 호출만, secret 없음
- engine proxy auth 그대로 (W-0241 같은 패턴)

### 유지보수성
- 계층: app/ 단독
- 계약: A-04-app PatternDraftBodyShape 그대로
- 테스트: Draft → prefill 매핑 검증
- 롤백: SaveSetupModal에서 import만 제거 → DraftFromRangePanel은 standalone 사용 가능

## Handoff Checklist

- 본 PR 머지 후 SaveStrip (desktop) 작동 확인
- 12 features 칩 시각 검증 (preview server 또는 deploy)

## Risks

| 위험 | 완화 |
|---|---|
| Draft pattern_family와 PHASE_LABELS 불일치 | GENERAL fallback + 사용자 수동 변경 |
| 사용자 메모 손실 | confirm prompt 필수 |
| SaveSetupModal 너무 길어짐 (panel 추가) | scrollable + 모바일 sheet 전환 |
| desktop SaveStrip 통합 누락 | Exit Criteria에 명시 + vitest 분리 |
