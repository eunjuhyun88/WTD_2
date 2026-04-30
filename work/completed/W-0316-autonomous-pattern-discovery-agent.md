# W-0316 — 자율 패턴 탐색 에이전트 + LLM 파이프라인

> Wave: 4 | Priority: P1 | Effort: M
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Replaces: W-0315 (LLM-Ready AI 패턴 파서, Issue #650 → 폐기)

## Goal

매일 밤 에이전트가 자율적으로 시장을 스캔해 통계적으로 유의미한 패턴 ≤5건을 발견·검증하고 사용자 inbox에 제안한다. 동시에 `engine/llm/` 파이프라인을 구축해 Anthropic·OpenAI·로컬 LLM을 `.env` 1줄 전환으로 비용 최적화할 수 있게 한다.

```
Cron 03:00 KST (또는 POST /research/discover)
  → DiscoveryAgent (Claude/GPT/Ollama 선택 가능)
  → AutoResearchLoop.run_cycle() [순수 Python]
  → inbox/findings/{date}/{id}.md ≤5건
```

## Scope

### engine/llm/ — LLM 파이프라인 (신규)

```
engine/llm/
  __init__.py
  provider.py      # litellm 통합 래퍼, 단일 호출 인터페이스
  router.py        # task → model 매핑 (judge / summary / scan)
  cost_tracker.py  # per-cycle 집계, $0.50 hard cap
```

**provider.py 핵심 인터페이스**:
```python
def call_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_choice: dict,
    task: str = "judge",        # router가 model 결정
    model: str | None = None,   # override
) -> litellm.ModelResponse: ...

def call_text(
    messages: list[dict],
    task: str = "summary",
    model: str | None = None,
) -> str: ...
```

**router.py task → model 매핑** (`.env` override 가능):
```python
TASK_MODEL = {
    "judge":   env("LLM_JUDGE_MODEL",   "anthropic/claude-haiku-4-5-20251001"),
    "summary": env("LLM_SUMMARY_MODEL", "anthropic/claude-haiku-4-5-20251001"),
    "scan":    env("LLM_SCAN_MODEL",    "anthropic/claude-haiku-4-5-20251001"),
}
# 로컬 예시: LLM_SUMMARY_MODEL=ollama/qwen2.5:14b
# 저렴: LLM_JUDGE_MODEL=groq/llama-3.1-70b-versatile
```

**cost_tracker.py**:
- `record_call(task, input_tokens, output_tokens, model)` → DB 적재
- `get_cycle_cost(cycle_id) -> float`
- hard cap: `$0.50/cycle` 초과 시 `stop_research` tool 강제 호출

### engine/research/ — 탐색 에이전트 (신규 3개)

```
engine/research/
  discovery_agent.py   # ≤350 LOC — tool loop, max 10 turns, max 5 proposals
  discovery_tools.py   # ≤300 LOC — 6개 tool 정의
  finding_store.py     # ≤150 LOC — inbox MD 저장
```

**6개 Tool**:

| Tool | 역할 | 구현 |
|---|---|---|
| `scan_universe` | symbol×TF 우선순위 선정 | AutoResearchLoop 메타 조회 |
| `validate_pattern` | 통계 유의성 검증 | `run_cycle()` 호출 |
| `search_similar_history` | 과거 유사 국면 N건 조회 | `search_similar_patterns()` |
| `judge_finding` | 발견 가치 평가 → keep/discard | LLM judge task |
| `propose_to_user` | inbox MD 생성 | `FindingStore.save()` |
| `stop_research` | 사이클 종료 | 루프 break |

**finding_store.py 출력 형식** (`inbox/findings/2026-04-30/{id}.md`):
```markdown
# [BTCUSDT 4h] ACCUMULATION→BREAKOUT 전환 패턴

**발견**: 2026-04-30 03:14 KST
**통계**: win_rate=0.61, Sharpe=1.3, n=23, CI=[0.52, 0.70]
**국면**: high_vol_trending
**유사 선례**: 3건 (모두 +2% 이상)

LLM 요약: [에이전트 생성 텍스트]

---
*agent_model: claude-haiku-4-5-20251001 | cost: $0.008 | cycle_id: abc123*
```

### engine/api/routes/ — API (수정)

```python
POST /research/discover          # 수동 트리거 (rate limit 5/day)
GET  /research/findings          # inbox 목록
GET  /research/findings/{id}     # 단건 조회
```

### 파일 목록

**신규**:
- `engine/llm/__init__.py`
- `engine/llm/provider.py`
- `engine/llm/router.py`
- `engine/llm/cost_tracker.py`
- `engine/research/discovery_agent.py`
- `engine/research/discovery_tools.py`
- `engine/research/finding_store.py`
- `engine/tests/test_discovery_agent.py`
- `engine/tests/test_llm_provider.py`

**수정**:
- `engine/api/routes/research.py` (또는 신규) — 3개 엔드포인트
- `pyproject.toml` — `litellm>=1.40.0` 추가
- `.env.example` — `LLM_JUDGE_MODEL`, `LLM_SUMMARY_MODEL`, `LLM_SCAN_MODEL` 추가

**폐기**:
- `work/active/W-0315-llm-pattern-parser.md` → `work/completed/`

## Non-Goals

- ChatGPT/OpenAI 전용 기능 (litellm이 추상화, provider lock-in 없음)
- 로컬 LLM tool calling 품질 보장 (summary task만 권장, judge는 API 필수)
- 사용자 자연어 입력 파싱 (W-0315 폐기 → 이 에이전트는 자율 탐색 전용)
- 신규 dispatcher/orchestration OS (Charter Frozen)
- LLM fine-tune (추론만 사용)
- 실거래 자동 트리거 (advisory only, 사용자 승인 경유)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| litellm provider 불일치 (tool schema) | Med | Med | `judge` task는 Anthropic/OpenAI만 허용, 로컬은 summary only |
| 비용 폭주 | Med | Med | $0.50/cycle hard cap + cost_tracker 적재 |
| AutoResearchLoop 레이턴시 (>5min) | Low | Med | `top_k=30`, async, timeout 300s |
| 로컬 LLM hallucination in judge | High | High | task routing: judge=API only, env 검증 로직 |
| Lookahead bias (W-0313 동일) | Med | CRIT | `as_of=now` strict, 기존 방어 재사용 |
| Finding 품질 저하 (노이즈) | Med | Med | Sharpe≥0.8 + n≥15 하드 게이트, LLM 판단 이후 |

### Dependencies

- 의존 (read-only): `engine/research/autoresearch_loop.py` `AutoResearchLoop.run_cycle()`
- 의존 (read-only): `engine/research/candidate_search.search_similar_patterns()`
- 의존 (read-only): `engine/agents/context.py` `ContextAssembler`
- 신규: `litellm>=1.40.0`

### Rollback

- `DISCOVERY_AGENT_ENABLED=false` → `/research/discover` 503, cron skip
- `LLM_*_MODEL` env → 코드 배포 없이 provider 전환
- inbox MD는 read-only artifact, DB 스키마 변경 없음

## AI Researcher 관점

### LLM 역할 분리

| Task | LLM 필요 이유 | 로컬 허용? |
|---|---|---|
| `scan` | symbol 우선순위 컨텍스트 해석 | △ (품질 주의) |
| `judge` | 다축 통계 + 시장 맥락 종합 판단 | ✗ (tool calling 정확도 필요) |
| `summary` | 트레이더용 자연어 요약 생성 | ✓ (qwen2.5:14b 이상 권장) |

### 비용 시나리오 (1 cycle 기준)

| 구성 | 비용/cycle | 특징 |
|---|---|---|
| 전체 Haiku | ~$0.008 | 기본값, 안정적 |
| judge=Haiku, summary=Ollama | ~$0.003 | GPU 있을 때 |
| judge=Groq Llama-70B, summary=Ollama | ~$0.001 | 최저비용 |
| 전체 Sonnet | ~$0.05 | 최고 품질 필요 시 |

### Failure Modes

| Mode | 감지 | 대응 |
|---|---|---|
| tool 미호출 / JSON 파싱 실패 | schema validation | retry 1회 → cycle skip |
| n<15 (통계 불충분) | gate check | discard, log |
| Sharpe<0.8 | gate check | discard, log |
| LLM timeout (>30s) | asyncio.timeout | `stop_research` 강제 |
| cost cap 초과 | cost_tracker | `stop_research` 강제 |
| 로컬 LLM tool call 실패 | exception | API fallback (JUDGE_FALLBACK_MODEL) |

## Decisions

- **[D-0316-1]** LLM 추상화: **litellm** (100+ provider 지원, tool use 정규화, OpenAI 호환 인터페이스)
- **[D-0316-2]** task routing: **judge=API only** (로컬 금지), **summary=로컬 허용** — tool calling 품질 비대칭
- **[D-0316-3]** 에이전트 루프: **Anthropic native tool use 방식** (litellm이 OpenAI format으로 변환), max 10 turns
- **[D-0316-4]** 출력: **inbox MD 파일** (ephemeral, DB 없음) — 향후 DB 저장은 별도 W
- **[D-0316-5]** 하드 게이트: **Sharpe≥0.8 + n≥15** — LLM 판단 이전 Python 레벨 필터링
- **[D-0316-6]** W-0315 폐기: 사용자 자연어 파싱은 현재 불필요. 에이전트 자율 탐색으로 대체.

## Open Questions

- [ ] [Q-0316-1] cron 주기: 매일 03:00 KST 고정 vs 주중만?
- [ ] [Q-0316-2] 발견 알림: inbox 파일만 vs Slack/Telegram 알림 연동?
- [ ] [Q-0316-3] shadow mode (7일간 저장만, 사용자 노출 없음) 기간?
- [ ] [Q-0316-4] `JUDGE_FALLBACK_MODEL` 기본값: Haiku vs Groq?
- [ ] [Q-0316-5] finding confidence 최소 임계값: 0.60 vs 0.65?

## Implementation Plan

1. **(0.5d)** `engine/llm/provider.py` + `router.py` — litellm 래퍼, task routing, provider validation
2. **(0.5d)** `engine/llm/cost_tracker.py` — per-cycle 집계, hard cap
3. **(0.5d)** `engine/research/discovery_tools.py` — 6개 tool schema + handler stub
4. **(1.0d)** `engine/research/discovery_agent.py` — tool loop, max 10 turns, 5 proposals cap
5. **(0.5d)** `engine/research/finding_store.py` — inbox MD 저장, cycle metadata
6. **(0.5d)** `engine/api/routes/research.py` — 3 endpoints + rate limit
7. **(0.5d)** `engine/tests/test_llm_provider.py` — mock litellm, 5 provider scenarios
8. **(1.0d)** `engine/tests/test_discovery_agent.py` — tool loop, cost cap, gate, finding format
9. **(0.5d)** `.env.example` + `pyproject.toml` + W-0315 폐기

**총 ~5.5d (Effort M)**

## Exit Criteria

- [ ] AC1: `LLM_JUDGE_MODEL=anthropic/claude-haiku-4-5-20251001` → 1 cycle 완주, finding ≤5건 생성 (E2E)
- [ ] AC2: `LLM_JUDGE_MODEL=groq/llama-3.1-70b-versatile` → 동일 tool schema로 정상 동작 (provider 전환 테스트)
- [ ] AC3: `LLM_SUMMARY_MODEL=ollama/qwen2.5:14b` → summary task만 로컬 라우팅, judge는 API 사용 확인
- [ ] AC4: 비용 $0.50 초과 시 `stop_research` 강제 호출, cycle 정상 종료
- [ ] AC5: Sharpe<0.8 또는 n<15 패턴 → LLM 판단 도달 전 Python 레벨 discard
- [ ] AC6: finding MD 형식 검증 — symbol/stat/CI/model/cost 필드 전부 존재
- [ ] AC7: `DISCOVERY_AGENT_ENABLED=false` → POST /research/discover 503, cron skip
- [ ] AC8: pytest 15+ assertions PASS, litellm mock 사용 (실제 API 호출 없음)
- [ ] AC9: `pyproject.toml` `litellm>=1.40.0` 추가, 기존 테스트 GREEN
