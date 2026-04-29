# W-0317 — Terminal SplitPaneLayout Wire-up

> **Status**: DONE (hand-port complete). F-5 base 컴포넌트(W-0243)는 이미 완료. 본 W-item 은 **terminal page integration** 만 담당 — 새 컴포넌트 만들지 않음.
>
> **Issue**: TBD (create new — #441 은 component 자체 이슈로 close 권고)
> **Charter**: F-5 IDE-style split-pane (DESIGN_V3.1)
> **Depends on**: W-0243 (SplitPaneLayout component — DONE)
> **D-axis**: D-D (UX)
> **Note**: PRIORITIES.md 의 F-5 IDE split-pane 가 "이미 완료"인 것은 컴포넌트 제작이고, **terminal page 실제 사용** 은 미완료. 본 W-item 이 갭 닫음.

---

## 1. 문제 상황

실측 결과:
- `app/src/lib/components/terminal/SplitPaneLayout.svelte` ✅ 존재 (drag-resize, ratio 0.4~0.85, localStorage)
- `app/src/routes/terminal/+page.svelte` 에서 import 안 됨
- 현재 layout: `applyModePreset(terminalMode).showWorkspace/.showRightRail` boolean 으로 conditional show/hide
  - mode='observe': workspace + rail 숨김
  - mode='analyze': workspace 표시
  - mode='execute': workspace + rail + bottom 표시
- 사용자 drag 로 width 조정 불가

**즉, F-5 의 사용자 가치(드래그 리사이즈)가 실제 화면에 노출 안 됨.**

---

## 2. 설계

### 2.1 통합 전략 — **wrapper-based (preserve preset)**

기존 `applyModePreset` 로직은 **보존**하고, `center-col` 과 `RightRailPanel` 사이만 `SplitPaneLayout` 으로 wrap.

**왜 preset 보존인가**:
- `main` 은 W-0309 이후 `DecisionHUD` 가 `CenterPanel` 의 `analyze()` snippet 안에 있음
- `main` 의 execute mode 는 아직 bottom panel 이 아니라 작은 disclaimer 만 있음
- 구 W-0243 branch 구현은 `DecisionHUD` 가 빠지고 `applyModePreset` 를 걷어냄 → 그대로 merge 시 회귀

**채택**:
- `showLeftRail`, `showWorkspace`, `showRightRail` 의 의미는 기존 `applyModePreset` 유지
- `center-col` 이 계속 `CenterPanel + WorkspacePanel` 의 owner
- `SplitPaneLayout` 은 **right rail width drag-resize owner** 로만 사용

### 2.2 마운트 구조 변경

```svelte
<!-- BEFORE -->
<div class="terminal-layout">
  <TerminalLeftRail />
  <CenterPanel ... />
  {#if applyModePreset(terminalMode).showWorkspace}
    <WorkspacePanel ... />
  {/if}
  {#if applyModePreset(terminalMode).showRightRail}
    <RightRailPanel ... />
  {/if}
</div>

<!-- AFTER -->
<div class="terminal-layout">
  <TerminalLeftRail />
  <SplitPaneLayout mode={terminalMode}>
    {#snippet children()}
      <div class="center-col">
        <CenterPanel ... />
        <WorkspacePanel ... />
      </div>
    {/snippet}

    {#snippet rightPane()}
      <RightRailPanel ... />
    {/snippet}

    {#snippet bottomPane()}
      <!-- execute mode 전용 (예: order ladder) -->
      <ExecuteBottomPanel ... />
    {/snippet}
  </SplitPaneLayout>
</div>
```

→ `applyModePreset` 를 제거하지 않고, `SplitPaneLayout` 은 center/right 배치만 담당.

### 2.3 Mode mapping

| terminalMode | SplitPaneLayout 동작 | rightPane | bottomPane |
|---|---|---|---|
| `observe` | rightPane 숨김 | (hidden) | (hidden) |
| `analyze` | rightPane 표시 (drag-resizable) | RightRailPanel | (hidden) |
| `execute` | rightPane 표시 | RightRailPanel only | 기존 disclaimer 유지 |

### 2.4 RightRail vs Workspace 처리

현재 `WorkspacePanel` 과 `RightRailPanel` 은 별도 컴포넌트.

**최종 반영**:
- `WorkspacePanel` 은 기존처럼 `center-col` 내부 유지
- `RightRailPanel` 만 `SplitPaneLayout` 의 `rightPane` snippet 으로 이동

이유:
- `WorkspacePanel` 을 right pane 으로 옮기면 `analyze` mode 의 center-column 맥락이 깨짐
- 이번 복구 목표는 nested split 이 아니라 **right rail width drag-resize 복구** 자체

### 2.5 Execute bottom 영역

- 이번 복구에서는 `bottomPane` 를 도입하지 않음.
- 이유: `main` 의 execute mode 는 아직 별도 bottom tool surface 계약이 없음.
- 따라서 기존 `execute-disclaimer` 를 유지하고, bottom pane 은 후속 W-item 에서 도입.

### 2.6 localStorage 키

SplitPaneLayout 자체가 ratio persist 함. 추가 작업 없음. 키 이름은 컴포넌트 default 또는 prop 으로 `terminal-splitpane-ratio` 로 명시.

---

## 3. Exit Criteria

| # | 기준 | 측정 |
|---|---|---|
| E1 | `+page.svelte` 가 `SplitPaneLayout` import + 마운트 | grep |
| E2 | `applyModePreset` 유지 + `SplitPaneLayout mode` 와 공존 | grep + diff |
| E3 | mode='observe': drag handle 안 보임, 전체 width=CenterPanel | playwright |
| E4 | mode='analyze': drag handle 보이고, 0.4~0.85 범위에서 동작 | playwright |
| E5 | mode='execute': 기존 disclaimer 유지 + right rail 정상 | manual |
| E6 | reload 후 ratio 복원 (localStorage) | playwright |
| E7 | DecisionHUD, KimchiPremiumBadge 등 기존 마운트 정상 | manual |
| E8 | svelte-check 0 errors | CI |
| E9 | `applyModePreset` 호출처 유지 시 회귀 없는 이유가 문서화됨 | doc |
| E10 | screenshot 3종 (observe/analyze/execute) PR 첨부 | manual |

---

## 4. Implementation Order

| 단계 | 작업 | 예상 |
|---|---|---|
| 1 | `+page.svelte` 의 `applyModePreset` 호출 위치 마킹 + 영향 분석 | 30min |
| 2 | SplitPaneLayout wrap 으로 교체 (children/rightPane snippet 작성) | 1h |
| 3 | `DecisionHUD` 유지 확인 + execute disclaimer 회귀 방지 | 20min |
| 4 | manual 3 mode 검증 (E3~E5) | 45min |
| 5 | localStorage ratio 복원 검증 (E6) | 15min |
| 6 | screenshot + PR | 15min |

**총 예상: 3h 30min**

---

## 5. Open Questions

| # | 질문 | 후보 |
|---|---|---|
| Q1 | RightRail + Workspace nested split 가능? (사용자가 둘 사이도 drag) | **MVP: NO**. flex column. follow-up W-item. |
| Q2 | mode 전환 시 ratio reset? | **NO**. 현행 single key 유지 (`wtd_split_ratio`) |
| Q3 | mobile breakpoint 처리? | 본 W-item 외. 기존 동작 유지. |

---

## 6. 거절 옵션

| 거절 옵션 | 거절 이유 |
|---|---|
| `applyModePreset` 제거 | W-0309 이후 `DecisionHUD` 와 execute disclaimer 회귀 유발. |
| 1964줄 page 전체 재작성 | 본 W-item 범위 폭증. wrap 으로 충분. |
| ExecuteBottomPanel 풀 구현 | order ladder 자체가 별도 W-item 규모. placeholder 가 wire-up 검증에 충분. |

---

## 7. Issue Action

- **#441 Close**: "F-5 base component 는 W-0243 (PR #625) 으로 완료. terminal page wire-up 은 W-0312 신규 이슈로 분리."
- **새 이슈 생성**: `[Wave4/P1] W-0312: F-5 Terminal SplitPaneLayout Wire-up`
  - body: 본 설계문서 link + Exit Criteria + 의존성 (W-0243 DONE)
- **PR description**: `Closes #<new-issue>`, `Closes #441`

---

## 8. References

- `app/src/lib/components/terminal/SplitPaneLayout.svelte` (W-0243 산출물)
- `app/src/routes/terminal/+page.svelte` (1964줄 — wrap 대상)
- PR #625 (W-0243 merge)
- DESIGN_V3.1 F-5

---

## 9. Out-of-Scope (명시적 제외)

- Order ladder / execute bottom surface 실제 구현
- Mobile responsive 재설계
- 4-way nested split (workspace ↔ rightrail)
- SplitPaneLayout 컴포넌트 자체 변경
