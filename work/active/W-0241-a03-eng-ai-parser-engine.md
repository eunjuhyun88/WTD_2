# W-0241 — A-03-eng: AI Parser Engine `POST /patterns/parse`

> Wave 4 P0 | Owner: engine | Branch: `feat/A03-ai-parser-engine`
> **독립 실행 가능 — A-03-app(UI)은 이미 Wave 2에서 완료됨. engine만 남음**

---

## Goal

자유 텍스트(텔레그램 메모, 한국어 분석) → Claude Sonnet function calling → `PatternDraftBody` JSON 반환. Core Loop 입구 #1.

## Owner

engine

---

## CTO 설계

### 현재 상태 (코드 실측)

- `engine/api/schemas_pattern_draft.py` — `PatternDraftBody` 스키마 **완전 정의됨**
- `engine/agents/context.py` — `ContextAssembler.for_parser()` **존재**, LLM 호출 미연결
- `engine/api/routes/patterns.py:24개 routes` — `/parse` route만 빠짐
- A-03-app UI — Wave 2 완료 (PR #390)

### 구현 설계

```python
# engine/api/routes/patterns.py 에 추가
@router.post("/parse")
async def parse_pattern_draft(
    body: PatternParseRequest,   # { text, symbol_hint?, timeframe_hint? }
    user=Depends(require_auth),
) -> PatternDraftBody:
    assembler = ContextAssembler.for_parser(
        text=body.text,
        symbol_hint=body.symbol_hint,
        timeframe_hint=body.timeframe_hint,
    )
    draft = await call_claude_function(
        assembler=assembler,
        schema=PatternDraftBody,
        model="claude-sonnet-4-6",   # Q5 lock-in
        max_tokens=1024,
        retries=2,
    )
    return draft
```

### 보안/안정성

- `require_auth()` 필수
- Claude API 키 없음 → 422 `{ "error": "llm_not_configured" }` (500 아님)
- 빈 텍스트 → 422
- 토큰 예산 초과 → partial 결과 + `{ "partial": true }` flag
- pydantic validation으로 schema compliance ≥ 95% 보장

### API 계약

```
POST /patterns/parse
  → require_auth()
  → body: { text: str, symbol_hint?: str, timeframe_hint?: str }
  ← PatternDraftBody (pattern_family, phases[], building_blocks[])
  ← 422 if: empty text / LLM not configured / schema fail after 2 retries
```

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/api/routes/patterns.py` | 변경 — `POST /patterns/parse` route 추가 |
| `engine/agents/context.py` | 변경 — `for_parser()` Claude 호출 연결 |
| `engine/agents/llm_caller.py` | 신규 — function calling wrapper + retry |
| `app/src/routes/api/patterns/parse/+server.ts` | 신규 — app proxy route (UI 이미 있음) |
| `engine/tests/test_ai_parser.py` | 신규 — integration test |

## Non-Goals

- 스크린샷/이미지 파싱 (텍스트만)
- 파서 모델 튜닝 (Sonnet 4.6 function calling 고정)
- streaming response

## Exit Criteria

- [ ] `POST /patterns/parse { "text": "BTC 1h 매집 후 분배" }` → 200, PatternDraftBody
- [ ] Claude API 키 없음 → 422 `{ "error": "llm_not_configured" }`
- [ ] 빈 텍스트 → 422
- [ ] 응답에 `pattern_family`, 최소 1개 `phase` 포함
- [ ] schema compliance ≥ 95% (10개 테스트 케이스)
- [ ] Engine CI ✅

## Facts

1. `engine/api/schemas_pattern_draft.py` — `PatternDraftBody(pattern_family, pattern_label, phases[], search_hints, signals_required/preferred/forbidden)` 이미 정의.
2. `engine/agents/context.py` — `ContextAssembler` 클래스, `for_parser()` 메서드 존재. 토큰 예산 ~10K.
3. `engine/api/routes/patterns.py` — line 515: `benchmark-pack-draft`, line 533: `benchmark-search-from-capture` 이미 있음. `/parse`만 없음.
4. Q5 lock-in: **claude-sonnet-4-6** (function calling 안정성).
5. Q4 lock-in: **자유 텍스트** 입력 (구조화 템플릿 X).

## Assumptions

1. `ANTHROPIC_API_KEY` env var 설정됨 (GCP Secret Manager).
2. `engine/agents/context.py:for_parser()` signature 유지 — 수정 최소화.
3. app proxy route는 기존 `app/src/routes/api/patterns/` 디렉토리에 추가.

## Canonical Files

- `engine/api/routes/patterns.py` (변경)
- `engine/agents/context.py` (변경)
- `engine/agents/llm_caller.py` (신규)
- `app/src/routes/api/patterns/parse/+server.ts` (신규)
- `engine/tests/test_ai_parser.py` (신규)

## Decisions

- **모델**: claude-sonnet-4-6 (Q5 lock-in)
- **입력**: 자유 텍스트 (Q4 lock-in) — 텔레그램 붙여넣기 그대로
- **재시도**: 2회 (schema validation fail 시)
- **실패 응답**: 422 (not 500) — 클라이언트가 graceful 처리 가능

## Next Steps

1. `engine/agents/context.py:for_parser()` 실제 signature 확인
2. `engine/agents/llm_caller.py` function calling wrapper 작성
3. `POST /patterns/parse` route 추가
4. app proxy route 추가
5. integration test 작성

## Handoff Checklist

- [ ] `engine/agents/context.py` for_parser() 현재 signature 파악
- [ ] `ANTHROPIC_API_KEY` GCP 환경 설정 여부 확인
- [ ] `engine/api/routes/patterns.py` 마지막 route 위치 확인 (append 위치)
