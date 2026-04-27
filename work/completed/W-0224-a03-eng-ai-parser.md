# W-0224 — A-03-eng AI Parser engine route

> **Source**: `docs/live/W-0220-product-prd-master.md` §8 P0 F-0b + `spec/PRIORITIES.md` P0
> **Owner candidate**: A-next (engine, M size, ~3-4일)
> **Base SHA**: ee2060f9 (origin/main)
> **Branch**: `feat/A03-ai-parser-engine` (PRIORITIES.md 명시)

---

## Goal

자유 텍스트(텔레그램 메모/내부 노트)를 PatternDraft JSON으로 외화하는 **온보딩 입구 #1** — `POST /patterns/parse`. 사용자가 손으로 PatternObject 정의 안 짜도 패턴 검색·검증 루프에 진입 가능.

## Owner

`engine` (LLM 호출 + Validator)

## Scope

### Engine
- `engine/api/routes/patterns.py` — `POST /patterns/parse` 신규 (기존 24 routes 옆)
- `engine/agents/context.py` — `ContextAssembler.for_parser()` LLM 호출 연결 (현재는 토큰 예산만)
- `engine/agents/parser_llm.py` (신규) — Claude Sonnet 4.5 function calling + JSON schema 강제
- `engine/agents/parser_prompt.py` (신규) — telegram refs 4채널 vocabulary 기반 system prompt + few-shot
- `engine/api/schemas_pattern_draft.py` — 이미 정의됨, 변경 없음 (이미 BUILT)
- `engine/tests/test_patterns_parse.py` (신규) — 텍스트 입력 → schema compliance ≥95%

### Config
- `.env.example` — `ANTHROPIC_API_KEY` 명시 (기존 secret store 사용)
- `engine/config.py` 또는 `settings.py` — `parser_model` 기본값 `claude-sonnet-4-5` + fallback `haiku-4-5`

## Non-Goals

- App UI (별도 W-XXXX A-03-app, P1)
- F-0a Chart Drag (별도 W-0225, 같은 PatternDraft 결과)
- 자동 PatternObject 등록 (Draft만 반환 → 사용자 confirm 후 PR-2/3에서 lifecycle)
- 멀티 LLM provider 추상화 (Claude 단일, AI Gateway는 Phase 2+)
- 실시간 streaming 응답 (단건 JSON, ≤5s)
- 한국어 외 다국어 (한국어 + 영어 의도)

## Exit Criteria

- [ ] `POST /patterns/parse {"text": "..."}` → 200 + 유효한 PatternDraftBody JSON
- [ ] schema compliance ≥ 95% (50 telegram-refs 텍스트 eval set)
- [ ] confidence 필드 ≥ 0.75 평균
- [ ] Claude 미설정 → 422 (not 500)
- [ ] 빈 텍스트 → 422
- [ ] 토큰 버짓 초과 → 부분 결과 + warning
- [ ] downstream 자동 연결 검증: parse → `/{slug}/benchmark-pack-draft` (line 515) 호출 가능
- [ ] Engine CI + Contract CI green
- [ ] OpenAPI spec에 신규 route 등록 + app `contract:check` pass

## Facts

1. **이미 BUILT** (PRD §0.1 검증):
   - `engine/api/schemas_pattern_draft.py` — `PatternDraftBody` 완전 정의 (pattern_family, pattern_label, phases, search_hints, signals_required/preferred/forbidden)
   - `engine/agents/context.py` — `ContextAssembler` 클래스 + 토큰 예산 (Parser 10K)
   - `engine/api/routes/patterns.py` — 24 routes 존재, `/parse`만 빠짐
   - `engine/api/routes/{slug}/benchmark-pack-draft` (line 515) + `benchmark-search-from-capture` (line 533) 이미 존재 → parse 결과 즉시 사용 가능
2. **남은 작업**: LLM 호출 + JSON schema validator + 재시도 로직.
3. **Q4 결정**: 자유 텍스트 (PRD 권고). telegram refs 4채널 형식 학습 가정.
4. **Q5 결정**: Sonnet 4.5 (function calling 안정성). Haiku는 KOL 캡션(M-02)에 이미 사용 중 → 분리.
5. **Vercel AI Gateway**: 향후 fallback model 사용 시 plain `"anthropic/claude-sonnet-4-5"` 문자열 (Phase 2+).

## Assumptions

1. **Q4 = 자유 텍스트, Q5 = Sonnet 4.5** lock-in (PRD §0.2 권고).
2. `ANTHROPIC_API_KEY`는 prod env에 이미 설정됨 (Cogochi LLM cogo route에서 확인).
3. ContextAssembler 토큰 예산 10K가 95% prompt에 충분 (telegram 메모 길이 평균 < 1K).
4. JSON schema validator는 pydantic의 `model_validate_json()` 사용.

## Canonical Files

- `engine/api/routes/patterns.py` (line 새 endpoint 추가)
- `engine/agents/context.py` (`for_parser()` LLM 호출)
- `engine/agents/parser_llm.py` (신규)
- `engine/agents/parser_prompt.py` (신규)
- `engine/api/schemas_pattern_draft.py` (변경 없음, 참조)
- `engine/tests/test_patterns_parse.py` (신규)
- `engine/tests/fixtures/parser_eval_set.json` (50 examples)
- `.env.example`
- `docs/live/feature-implementation-map.md` (A-03 BUILT 표시)
- `spec/PRIORITIES.md` (A-03-eng done)

## CTO 설계 원칙 적용

### 성능
- LLM 호출 1회/요청, 평균 latency 2-4s (Claude Sonnet) — 사용자 대기 OK (UI loading)
- 토큰 사용량 측정 + max_tokens 한도 (4K 응답)
- caching: 같은 텍스트 반복 호출 시 hash-based cache 검토 (P2, 우선 X)
- async: `asyncio.to_thread(client.messages.create)` 또는 anthropic async client

### 안정성
- 재시도: exponential backoff (1s, 2s, 4s) 최대 3회 — `tenacity` 또는 직접 구현
- 타임아웃: 30s hard timeout → 504 응답
- 부분 실패: schema validation 실패 시 1회 retry (with stricter prompt)
- 폴백: API 키 없으면 422 (graceful), 없는 환경에서 dev 가능
- 헬스체크: 기존 `/health` route에 `parser_available: bool` 필드 추가

### 보안
- API key: env var에서 읽음, 코드 리터럴 X
- Input validation: `text` 필드 max length 8KB pydantic 강제
- Rate limit: per-user (Phase 2+ — 우선 IP 기반 unit)
- Output sanitize: LLM 응답을 schema validation 강제 (free-form text 절대 통과 X)
- Prompt injection: telegram-refs 형식 외 입력은 prompt instructions에 노출 X (system prompt + user message 분리)

### 유지보수성
- 계층: route(API) → context.py(orchestrator) → parser_llm.py(LLM client) → schemas(validator)
- 계약: OpenAPI 자동 생성, app `contract:check:engine-types` pass
- 테스트: 통합 1개 (실제 API 호출, key 있을 때만) + unit 5개 (mock LLM 응답)
- prompt versioning: `parser_prompt.py`에 `PROMPT_VERSION = "v1.0"` 기록

### Charter 정합성
- ✅ In-Scope: PRD §1.1 "감각을 패턴 객체로 저장" — Parser는 핵심 입구
- ✅ Non-Goal 미저촉: 차트 분석 X (PatternDraft만), 자동매매 X, copy_trading X

## 다음 단계 (다음 에이전트 첫 30분)

1. `feat/A03-ai-parser-engine` 브랜치 from origin/main (ee2060f9)
2. `engine/agents/parser_prompt.py` 작성 — telegram-refs vocabulary 13 base signals + Wyckoff phase + few-shot 5예제
3. `engine/agents/parser_llm.py` — anthropic async client + retry
4. `engine/api/routes/patterns.py` POST /parse endpoint 추가
5. `engine/tests/test_patterns_parse.py` + fixtures 50개 (telegram refs에서 추출)
6. eval 실행 → schema compliance 측정
7. PR 생성 base=main

## Status

PENDING — Q4/Q5 결정 후 시작. ContextAssembler + schemas + downstream routes 모두 이미 있음.
