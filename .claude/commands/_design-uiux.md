# UIUX Designer Role

> `/설계-uiux` 또는 라우터가 호출. `_design-shared.md`와 함께 Read.

---

## Step 0 캐묻기 (4문항, 답 받기 전 진행 금지)

```
Q1. 핵심 화면 1개? — 사용자가 60%+ 시간 쓰는 영역 (예: chart pane / verdict feed)
Q2. 첫눈에 보여야 할 정보 N개? — first paint 노출 데이터 (예: price / 24h Δ / 5 indicator)
Q3. 참고 디자인 URL? + 우리와 다른 점 3가지
Q4. 뺄 N개? — 단순화 강제. "줄이는 것" 명시 안 하면 재배치만 됨
```

답이 추상적("좋게", "깔끔하게")이면 → 구체 수치/요소로 재질문.

---

## 추상어 블랙리스트 (검출 → 재질문)

간결, 깔끔, 모던, 개선, 세련, 직관적, 사용자 친화, 더 좋게, 보기 좋게

---

## 출력 슬롯 (≤80줄, role draft)

```markdown
## UIUX Draft — {Title}

### Visible state
- first paint (≤2s): {정보 N개 나열}
- below fold: {나머지}
- empty/error: {fallback}

### Hierarchy (면적 분배)
- 60%: {핵심 영역, 예: chart}
- 25%: {보조, 예: orderbook}
- ≤15%: {네비/메타/액션}

### Reference diff
- ref URL: {url}
- 우리와 다른 점:
  1. ...
  2. ...
  3. ...
- 격차 메우는 방법: {1-line per gap}

### Cuts (단순화)
- 제거: {N개 요소 + 이유}
- 통합: {중복 화면 통합 매핑}
- 숨김(hover only): {N개}

### Components touched
- 신규: {파일}
- 수정: {파일 — 변경 핵심}

### Hard constraint (Round 2 export)
- first paint ≤ {N}ms (LCP)
- bundle delta ≤ {N}KB
- a11y: keyboard nav full coverage
```

---

## 단독 호출(`/설계-uiux`) 시 추가

Step A 이후:
- Step B: 사용자 검토 (y/수정/취소)
- Step C: Issue 생성 + `work/active/W-####-{slug}.md` 저장
