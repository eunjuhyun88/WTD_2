# 설계문서 감사 + 업데이트 + 신규 작업 아이템 생성

## Context

이번 대화에서 논의된 항목:
1. PRs #123/#125/#126 완료 (W-0116 nav + COGOTCHI 리브랜드)
2. COGOTCHI 내부 Layout A/B/C 미완 + JudgePanel 3열 미구현
3. W-0115 Slice 1 완료 (ChartBoard 연결, PR #124), Slice 2/3 미완
4. 차트 드래그 구간 선택 → 지표 자동 수집 → Save Setup (신규 기능 요청)

설계문서가 실제 구현/논의와 sync되지 않은 상태. 감사 + 업데이트 + 신규 작업 아이템 생성 필요.

---

## 감사 결과 — 갭 목록

### `docs/product/pages/02-terminal.md`
- [갭] Save Setup 상호작용이 "marks the exact chart segment"로만 기술 — 드래그 vs 클릭 미지정
- [갭] SaveStrip 지표 미리보기 요구사항 없음
- [갭] 구현 스냅샷이 PRs #123-#126 이전 상태
- [갭] `indicators: {}` 하드코딩 버그가 "Not yet aligned" 항목에 간접 언급만 됨

### `docs/product/core-loop-surface-wireframes.md`
- [갭] 터미널 와이어프레임에 "range handles" 언급되나 드래그 인터랙션 명시 없음
- [갭] SaveStrip 지표 수집 미리보기 와이어프레임 없음

### `work/active/W-0115-cogochi-live-chart.md`
- [갭] Slice 1 완료됨 (PR #124) 인데 상태가 IN PROGRESS로 남아있음
- [갭] Slice 2/3 명확히 "다음" 상태로 업데이트 필요

### 없음 (신규 필요)
- W-0117: 드래그 구간 선택 + 지표 자동 수집 작업 아이템
- W-0118: COGOTCHI Layout A/B/C 완성 + JudgePanel 3열 작업 아이템

---

## 실행 계획

### 1. `docs/product/pages/02-terminal.md` 업데이트
**Save Setup Flow 섹션** 추가/수정:
```
드래그 인터랙션 스펙:
- 범위 선택 모드 진입: "SELECT RANGE" 버튼 클릭 → 커서 변경
- mousedown on chart → anchorA 설정
- mousemove (dragging) → anchorB 실시간 업데이트, RangePrimitive 라이브 렌더
- mouseup → anchorB 확정, SaveStrip 표시
- Escape → 모드 취소
- chart.timeScale().coordinateToTime(x) 로 픽셀→시간 변환
```

**SaveStrip 요구사항** 추가:
```
SaveStrip must show:
- 구간 레이블 (시작 → 끝 · TF · N봉)
- 수집된 지표 목록 (EMA · BB · CVD · MACD · OI...)
- 구간 내 고가/저가/변동률
- 메모 입력 (인라인, 모달 아님)
- 저장 / 취소 / Save & Lab 버튼
```

**구현 스냅샷 업데이트**:
- PRs #123/#124/#125/#126 완료 반영
- indicators: {} 버그를 명시적 TODO로 기술

### 2. `docs/product/core-loop-surface-wireframes.md` 업데이트
터미널 와이어프레임에 SaveStrip 상세 추가:
```text
| Main chart board                                           |
| - hero chart                                              |
| [==== DRAG RANGE SELECTION (mousedown→drag→mouseup) ====] |
| SaveStrip (appears after range confirmed):                |
|   [Apr21 14:00→16:00 · 4H · 8봉] [EMA·BB·CVD] [note...] |
|   [취소] [저장] [Save & Lab →]                            |
```

드래그 인터랙션 Micro-Interaction Rules 추가.

### 3. `work/active/W-0115-cogochi-live-chart.md` 업데이트
- Status: IN PROGRESS → Slice 1 DONE, Slice 2/3 NEXT
- Slice 1 완료 체크 + PR #124 참조
- Slice 2/3 Next Steps로 명시

### 4. 신규: `work/active/W-0117-drag-range-indicator-capture.md`
3슬라이스 작업 아이템:
- **Slice A**: CanvasHost 드래그 인터랙션 (subscribeClick → mousedown/move/up)
- **Slice B**: chartSaveMode.save()에 ChartSeriesPayload 추가, slicePayloadToViewport() 호출, indicators 포함
- **Slice C**: SaveStrip 지표 미리보기 (수집된 지표명 + 고가/저가/변동률)

변경 파일: CanvasHost.svelte, chartSaveMode.ts, SaveStrip.svelte, ChartBoard.svelte (4파일)
엔진 변경 없음.

### 5. 신규: `work/active/W-0118-cogotchi-layout-completion.md`
COGOTCHI 내부 완성 작업 아이템:
- Layout A (Chart only fullscreen)
- Layout B (Chart + AI 2분할)
- Layout C (chart + AI info sidebar 완성)
- JudgePanel 3열 수평 (Plan | Judge | AfterResult flex row)
- PeekDrawer 슬라이드 애니메이션
- W-0115 Slice 2/3 연계 (evidence/proposal/α 바인딩)

---

## 변경 파일 목록

| 파일 | 액션 |
|---|---|
| `docs/product/pages/02-terminal.md` | 업데이트 |
| `docs/product/core-loop-surface-wireframes.md` | 업데이트 |
| `work/active/W-0115-cogochi-live-chart.md` | 업데이트 |
| `work/active/W-0117-drag-range-indicator-capture.md` | 신규 생성 |
| `work/active/W-0118-cogotchi-layout-completion.md` | 신규 생성 |

코드 변경 없음. 문서 전용 커밋.
