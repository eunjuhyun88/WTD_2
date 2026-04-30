# W-0342 — Discovery Agent Real LLM E2E (Opt-in)

> Wave: 5 | Priority: P2 | Effort: M
> Charter: In-Scope (Research OS pipeline)
> Status: 🟡 Design Draft
> Issue: #729
> Created: 2026-04-30

## Goal
discovery agent가 실제 LLM(Groq/Cerebras/NVIDIA NIM)을 호출해
end-to-end로 동작하는지 opt-in 통합 테스트로 보장한다.

## Scope
- 포함: e2e pytest, `/research/discover` 실 호출, cost_tracker 검증
- 파일:
  - `engine/tests/test_discovery_e2e.py` (신규)
  - `engine/api/routes/research.py` (검증 대상)
  - `engine/llm/router.py` (LLM_SCAN_MODEL)
- API: POST /research/discover

## Non-Goals
- hypothesis_registry DB 배포 (→ W-0341)
- CI 자동 실행 (opt-in만, API key 필요)
- mock 기반 테스트 (→ 기존 단위 테스트로 충분)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| API key 소진 | 중간 | 낮음 | pytest mark e2e, CI skip |
| NVIDIA NIM rate limit | 중간 | 낮음 | fallback chain 존재 |
| 비결정적 LLM 응답 | 높음 | 낮음 | 필드 존재 여부만 검증 (값 비교 아님) |

### Dependencies
- `GROQ_API_KEY` or `CEREBRAS_API_KEY` env
- `ENGINE_INTERNAL_SECRET` env (discover endpoint 보안)
- `DISCOVERY_AGENT_ENABLED=true` env
- W-0341 완료 (hypothesis_registry 테이블 존재)

### Canonical Files
- `engine/tests/test_discovery_e2e.py`
- `engine/api/routes/research.py`
- `engine/llm/router.py`
- `engine/llm/cost_tracker.py`

## AI Researcher 관점

### Data Impact
- 실 LLM 호출 결과가 hypothesis_registry에 저장됨 (W-0341 완료 후)
- confidence_score 분포 확인 가능

### Statistical Validation
- AC2: pattern_id, confidence_score 필드 존재 → 최소 schema 검증

### Failure Modes
- LLM timeout → 503 (not 5xx 무한 루프)
- key 없음 → 명확한 403/422 (not 500)

## Decisions
- [D-0342-1] pytest mark: `@pytest.mark.e2e` — CI에서 `-m "not e2e"` 로 skip
- [D-0342-2] 실 서버 아닌 TestClient 사용 (httpx AsyncClient)
- [D-0342-3] W-0341 미완료 시 AC1만 선행 가능 (DB 저장 검증 skip)

## Open Questions
- [ ] [Q-0342-1] discover endpoint의 입력 스키마 확정 필요 (현재 빈 body?)
- [ ] [Q-0342-2] cost_tracker DB 저장 vs 로컬 집계만?

## Implementation Plan
1. pytest.ini에 `e2e` mark 등록
2. `test_discovery_e2e.py` 작성:
   - 환경변수 없으면 pytest.skip
   - TestClient로 POST /research/discover 호출
   - 응답 200 + pattern_id + confidence_score 검증
   - cost_tracker에 기록 여부 검증
3. `pytest -m e2e -v engine/tests/test_discovery_e2e.py`

## Exit Criteria
- [ ] AC1: DISCOVERY_AGENT_ENABLED=true + 실 API key → /research/discover 성공 (5xx 아님)
- [ ] AC2: 응답에 pattern_id, confidence_score 필드 존재
- [ ] AC3: LLM_SCAN_MODEL=nvidia_nim/meta/llama-3.3-70b-instruct 실 호출 (mock 아님)
- [ ] AC4: test_discovery_e2e.py pytest mark e2e로 CI skip, 로컬 opt-in 실행 가능
- [ ] AC5: cost_tracker에 해당 호출 비용 기록
