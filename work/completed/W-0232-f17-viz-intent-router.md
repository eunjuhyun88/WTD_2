# W-0232 — F-17: Viz Intent Router 6×6

> Wave 3 P2 | Owner: engine + app | Branch: `feat/F17-viz-intent-router`
> **선행 조건: 없음. H-08/F-30과 병렬 가능.**

---

## Goal

사용자의 질문 의도(Intent)를 분류하고, 6개 인텐트 × 6개 템플릿으로 라우팅.
AI Parser(A-03) 출력을 소비하는 첫 번째 다운스트림 — 자연어 입력 → 시각화 출력의 완성.

---

## CTO 설계 결정

### Intent 분류 (03_SEARCH_ENGINE.md §2 기반)

| Intent | 의미 | 검색 필요? | 데이터 소스 |
|--------|------|-----------|------------|
| `WHY` | "이 패턴 왜 valid?" | ❌ | 현재 capture feature snapshot |
| `STATE` | "지금 이 심볼 상태?" | ❌ | 현재 phase_machine state |
| `COMPARE` | "X랑 비교해줘" | ✅ | search pipeline + 특정 capture |
| `SEARCH` | "비슷한 거 찾아줘" | ✅ | search pipeline |
| `FLOW` | "OI 흐름 비슷한 거" | ✅ | search pipeline (flow 특화) |
| `EXECUTION` | "언제 들어가?" | ❌ | 현재 capture + pattern policy |

WHY / STATE / EXECUTION → 검색 없이 현재 capture 컨텍스트만 사용.
COMPARE / SEARCH / FLOW → A-03 parse → SearchQuerySpec → search pipeline.

### 6개 템플릿 (AI Researcher 설계)

| Template ID | Intent | 구성 요소 |
|-------------|--------|-----------|
| `T-WHY` | WHY | Feature importance bar + 패턴 근거 텍스트 + 관련 outcome 히스토리 |
| `T-STATE` | STATE | Phase badge + 타임라인 + 다음 trigger 조건 |
| `T-COMPARE` | COMPARE | 2-panel 비교 (현재 vs 참조) + delta 테이블 |
| `T-SEARCH` | SEARCH | 검색 결과 카드 리스트 (score + phase path badge) |
| `T-FLOW` | FLOW | OI/Funding/Liq 3-channel 시계열 오버레이 |
| `T-EXECUTION` | EXECUTION | 진입 레벨 + TP/SL + R:R + 현재 phase 상태 |

### 라우터 아키텍처

```
사용자 입력 (자연어 or 버튼)
    │
    ▼
IntentClassifier (LLM or rule-based)
    │  → IntentClassification { intent, confidence, target_symbol, ... }
    ▼
VizIntentRouter.route(intent_cls, capture_id) → VizResponse
    │
    ├── WHY/STATE/EXECUTION → ContextFetcher → Template(T-WHY/T-STATE/T-EXEC)
    └── SEARCH/COMPARE/FLOW → SearchQuerySpec → search_pipeline → Template
```

### 구현 접근 (단계적)

**Phase 1 (이번 W-0232 범위):**
- `engine/viz/intent_router.py` — 라우터 코어 + IntentClassification 소비
- `engine/viz/templates.py` — 6개 VizResponse 타입 정의
- `engine/api/routes/viz.py` — `POST /viz/route` 엔드포인트
- App: `VizIntentPanel.svelte` — intent 선택 + 결과 렌더링 (기본형)

**Phase 2 (이후 wave):**
- LLM 기반 IntentClassifier (현재는 rule-based fallback)
- T-COMPARE 2-panel 상세 구현
- T-FLOW 인터랙티브 차트

---

## API 스펙

```
POST /viz/route
Authorization: Bearer <JWT>
```

**Request:**
```json
{
  "capture_id": "abc123",
  "intent": "WHY",
  "text_input": "이 패턴 왜 valid야?"
}
```

**Response 200:**
```json
{
  "intent": "WHY",
  "confidence": 0.91,
  "template": "T-WHY",
  "data": {
    "feature_importance": [...],
    "rationale": "...",
    "outcome_history": [...]
  }
}
```

text_input 없이 intent 직접 지정 가능. text_input 있으면 A-03 parse 경유.

---

## Scope

| 파일 | 변경 |
|------|------|
| `engine/viz/__init__.py` | 신규 모듈 |
| `engine/viz/intent_router.py` | VizIntentRouter, route() |
| `engine/viz/templates.py` | VizResponse 타입 6종 |
| `engine/viz/context_fetcher.py` | WHY/STATE/EXEC 데이터 fetch |
| `engine/api/routes/viz.py` | POST /viz/route |
| `app/src/lib/cogochi/VizIntentPanel.svelte` | intent 탭 + 결과 영역 |

---

## Facts

1. `IntentClassification` 타입이 `03_SEARCH_ENGINE.md`에 이미 설계됨 (미구현)
2. A-03-eng (AI Parser) 이미 머지 — `POST /patterns/parse` 사용 가능
3. Search pipeline (`/search/similar`) 이미 작동 — COMPARE/SEARCH/FLOW가 소비

## Assumptions

1. IntentClassifier Phase 1 = rule-based (keyword matching) — LLM 없이 동작
2. T-FLOW는 기존 OI/Funding 차트 컴포넌트 재사용 가능
3. `capture_id`로 feature_snapshot 및 phase state 조회 가능

## Open Questions

1. App에서 intent 선택 UX — 탭 방식 vs 자유 입력 vs 버튼 세트?
2. WHY 데이터: feature importance는 어디서? (entry_block_scores 활용 가능)
3. T-COMPARE: 두 번째 capture_id는 사용자가 선택? 아니면 search 자동 선정?

---

## Exit Criteria

- [ ] `POST /viz/route` — 6개 intent 모두 200 응답
- [ ] WHY/STATE/EXECUTION: 검색 없이 데이터 반환
- [ ] SEARCH: search pipeline 연결 확인
- [ ] App VizIntentPanel에서 intent 전환 시 결과 변경
- [ ] Engine CI + App CI ✅

---

## Non-Goals

- LLM 기반 IntentClassifier (Phase 2)
- T-COMPARE / T-FLOW 인터랙티브 상세 구현
- intent 학습 (사용자 피드백 기반 개선)
