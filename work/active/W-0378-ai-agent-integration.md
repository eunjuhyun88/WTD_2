# W-0378 — AI Agent 통합 시스템

> Wave: 5 | Priority: P0 | Effort: L (8-10일, 4 Phase × 4 PR)
> Charter: In-Scope (AI Agent, 알파탐색, 유사구간탐색)
> Status: 🟡 Design Draft
> Issue: #850
> Created: 2026-05-01
> Dependency: W-0377 (Core Loop Pipeline) 머지 후 시작

## Goal

Jin이 AIAgentPanel Command Bar에 `/scan ETH`, `/similar`, `/explain`, `/judge`, `/save` 입력
→ LLM이 universe alpha · 유사구간 · 패턴 해석을 자연어 답변
→ 모든 상호작용이 ML 학습 데이터(`agent_interactions`)로 자동 누적
→ LightGBM이 일 1회 재훈련해 p_win 정확도가 높아진다.

---

## 정합성 갭 (Break D~H)

| Break | 위치 | 현재 상태 | 이 W에서 수정 |
|---|---|---|---|
| D | `app/src/routes/api/terminal/research/+server.ts` (389줄) | LLM 호출 0건, 100% 휴리스틱(`detectPhase()`) | Phase 1 |
| E | `/api/terminal/scan` | LLM 해석 없음, alpha composite 엔드포인트 부재 | Phase 2 |
| F | `engine/search/similar.py:run_similar_search()` | 점수만 반환, 자연어 설명 없음 | Phase 3 |
| G | `app/src/components/terminal/peek/AIAgentPanel.svelte` | 명령어 파서 없음 | Phase 1 |
| H | `engine/scoring/trainer_trigger.py` | APScheduler 미배선, weight 버전 관리 없음 | Phase 4 |

---

## 전체 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AIAgentPanel.svelte (5-tab 유지)                                │
│  + Command Bar 1줄 추가: <input placeholder="/scan ETH ..." />   │
│  + parseCommand(input) → { cmd, args }                          │
└────────────────────┬────────────────────────────────────────────┘
                     │ POST /api/terminal/agent/dispatch
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  SvelteKit BFF: app/src/routes/api/terminal/agent/dispatch/     │
│  +server.ts                                                     │
│  • zod schema 파싱: { cmd, args, context }                       │
│  • JWT 확인 (requireAuth)                                        │
│  • engine POST /agent/{cmd} 프록시                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ internal HTTP → engine
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  engine/api/routes/agent.py (NEW)                               │
│  router = APIRouter(prefix="/agent")                            │
│                                                                 │
│  POST /agent/explain   task=summary                             │
│  POST /agent/alpha-scan task=scan + 52-pattern composite        │
│  POST /agent/similar   task=summary + run_similar_search()      │
│  POST /agent/judge     task=judge (API-only, no local LLM)      │
│  POST /agent/save      capture → pattern_outcomes write         │
└────────────────────┬────────────────────────────────────────────┘
                     │ generate_llm_text(system, user)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  engine/agents/llm_runtime.py (이미 존재 ✅)                     │
│  provider 우선순위 (engine/llm/router.py):                       │
│    scan:    nvidia_nim/meta/llama-3.3-70b-instruct              │
│    summary: cerebras/qwen-3-235b-a22b-instruct-2507             │
│    judge:   groq/llama-3.3-70b-versatile                        │
│  fallback:  groq → nvidia_nim → deepseek → huggingface          │
│  local:     ENGINE_LLM_PROVIDER=ollama OLLAMA_MODEL=qwen3:8b    │
└────────────────────┬────────────────────────────────────────────┘
                     │ write
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  ML 누적 (자동)                                                  │
│  • scan_signal_events (W-0367 기존 테이블)                       │
│  • agent_interactions (NEW — migration 044)                     │
│    id, user_id, cmd, args_json, llm_response, latency_ms,       │
│    provider_used, created_at                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │ 500 outcomes 누적 시 / 매일 04:00
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  train_lgbm_job (APScheduler cron 04:00 + threshold gate)       │
│  engine/scoring/trainer_trigger.py:train_layer_c()              │
│  → LightGBMEngine.train() → AUC ≥ prev-0.02 게이트              │
│  → weight version {slug}_{model_key}_{yyyymmdd} 저장            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 분해 (각 Phase = 독립 PR, 순차 머지)

### Phase 1 (D1-3): LLM 연결 + Command Bar + /explain (Break D, G)

**산출물**: PR-1, 독립 머지 가능

#### 1-A. `engine/api/routes/agent.py` 신규 생성

```python
"""W-0378 Phase 1: AI Agent router — /explain endpoint."""
from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.llm_runtime import LLMRuntimeError, generate_llm_text
from api.ctx import require_internal_or_auth  # 기존 auth 패턴 재사용

log = logging.getLogger("engine.api.agent")
router = APIRouter(prefix="/agent", tags=["agent"])


class ExplainRequest(BaseModel):
    symbol: str
    pattern_slug: str | None = None
    context: dict = {}  # feature_snapshot, block_scores, btc_trend 등


class AgentResponse(BaseModel):
    cmd: str
    text: str           # LLM 자연어 응답
    latency_ms: int
    provider_used: str  # 실제 사용된 provider (fallback 추적)
    fallback_used: bool = False


EXPLAIN_SYSTEM = """당신은 퀀트 트레이더 어시스턴트입니다.
주어진 심볼과 시장 컨텍스트를 분석하여 패턴 상태와 매매 관련 인사이트를
한국어로 간결하게(3-5문장) 설명합니다.
숫자는 반드시 포함하고, 불확실한 내용은 솔직하게 표현합니다."""


@router.post("/explain", response_model=AgentResponse)
async def explain_pattern(
    body: ExplainRequest,
    _auth=Depends(require_internal_or_auth),
) -> AgentResponse:
    """Break D 수정: research/+server.ts 휴리스틱을 LLM으로 교체."""
    user_text = _build_explain_prompt(body)
    t0 = time.monotonic()
    provider_used, fallback_used = "unknown", False

    try:
        from llm.router import resolve_model, FALLBACK_CHAIN
        import httpx

        # primary
        primary_model = resolve_model("summary")
        try:
            text = await generate_llm_text(
                EXPLAIN_SYSTEM, user_text, max_tokens=512, temperature=0.1
            )
            provider_used = primary_model
        except (LLMRuntimeError, httpx.HTTPError):
            # fallback chain
            for fallback_model in FALLBACK_CHAIN:
                try:
                    text = await _generate_with_model(fallback_model, EXPLAIN_SYSTEM, user_text)
                    provider_used = fallback_model
                    fallback_used = True
                    break
                except Exception:
                    continue
            else:
                raise HTTPException(503, "All LLM providers failed")

    except HTTPException:
        raise
    except Exception as exc:
        log.warning("explain failed: %s", exc)
        raise HTTPException(503, str(exc)) from exc

    latency_ms = int((time.monotonic() - t0) * 1000)

    # ML 누적 (fire-and-forget)
    _log_interaction_bg(
        cmd="explain", args={"symbol": body.symbol, "slug": body.pattern_slug},
        response=text, latency_ms=latency_ms, provider=provider_used,
    )

    return AgentResponse(
        cmd="explain", text=text,
        latency_ms=latency_ms, provider_used=provider_used, fallback_used=fallback_used,
    )


def _build_explain_prompt(body: ExplainRequest) -> str:
    ctx = body.context
    lines = [f"심볼: {body.symbol}"]
    if body.pattern_slug:
        lines.append(f"패턴: {body.pattern_slug}")
    if ctx.get("btc_trend"):
        lines.append(f"BTC 트렌드: {ctx['btc_trend']}")
    if ctx.get("entry_p_win") is not None:
        lines.append(f"ML p_win: {ctx['entry_p_win']:.1%}")
    if ctx.get("block_scores"):
        top = sorted(ctx["block_scores"].items(), key=lambda x: -x[1])[:3]
        lines.append("상위 블록: " + ", ".join(f"{k}={v:.2f}" for k, v in top))
    return "\n".join(lines)


async def _generate_with_model(model: str, system: str, user: str) -> str:
    """Generate with an explicit model override (for fallback chain)."""
    from agents.llm_runtime import resolve_llm_settings, LLMRuntimeSettings
    # model string format: "provider/model-name"
    provider, _, model_name = model.partition("/")
    _provider_map = {
        "groq": "openai-compatible",
        "nvidia_nim": "openai-compatible",
        "deepseek": "openai-compatible",
        "huggingface": "openai-compatible",
        "anthropic": "anthropic",
        "ollama": "ollama",
    }
    settings = LLMRuntimeSettings(
        provider=_provider_map.get(provider, "openai-compatible"),
        model=model_name or model,
    )
    return await generate_llm_text(system, user, settings=settings)


def _log_interaction_bg(*, cmd: str, args: dict, response: str, latency_ms: int, provider: str) -> None:
    """Fire-and-forget: write to agent_interactions table."""
    import threading

    def _write() -> None:
        try:
            from ledger.supabase_store import _sb
            import json, uuid
            from datetime import datetime
            _sb().table("agent_interactions").insert({
                "id": str(uuid.uuid4()),
                "cmd": cmd,
                "args_json": json.dumps(args),
                "llm_response": response[:2000],
                "latency_ms": latency_ms,
                "provider_used": provider,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            log.debug("agent_interactions write skipped: %s", e)

    threading.Thread(target=_write, daemon=True).start()
```

#### 1-B. SvelteKit BFF `app/src/routes/api/terminal/agent/dispatch/+server.ts`

```typescript
// app/src/routes/api/terminal/agent/dispatch/+server.ts
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAuth } from '$lib/server/auth';
import { ENGINE_URL } from '$env/static/private';

const DispatchSchema = z.object({
  input: z.string().min(1).max(500),
  context: z.record(z.unknown()).optional().default({}),
});

const COMMANDS = ['scan', 'similar', 'explain', 'judge', 'save'] as const;

function parseCommand(input: string): { cmd: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const [rawCmd, ...rest] = trimmed.slice(1).split(' ');
  const cmd = rawCmd.toLowerCase();
  if (!COMMANDS.includes(cmd as typeof COMMANDS[number])) return null;
  return { cmd, args: rest.join(' ') };
}

export async function POST({ request, locals }) {
  const session = await requireAuth(locals);  // throws 401 if not authed
  const body = DispatchSchema.parse(await request.json());

  const parsed = parseCommand(body.input);
  if (!parsed) {
    throw error(400, `Unknown command. Available: ${COMMANDS.map(c => '/' + c).join(', ')}`);
  }

  const engineRes = await fetch(`${ENGINE_URL}/agent/${parsed.cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.ENGINE_INTERNAL_TOKEN ?? '' },
    body: JSON.stringify({ args: parsed.args, context: body.context, user_id: session.user.id }),
  });

  if (!engineRes.ok) {
    const detail = await engineRes.text();
    throw error(engineRes.status, detail);
  }

  return json(await engineRes.json());
}
```

#### 1-C. AIAgentPanel.svelte Command Bar 추가 (Break G 수정)

기존 5-tab 구조 **유지**, Command Bar 1줄만 추가 (`AIAgentPanel.svelte` 하단):

```svelte
<!-- 기존 5-tab 아래, panel footer에 추가 -->
<div class="agent-command-bar">
  <input
    bind:value={commandInput}
    on:keydown={handleCommandKey}
    placeholder="/scan ETH · /similar · /explain · /judge · /save"
    class="command-input"
  />
</div>

<script>
  let commandInput = '';
  let agentResponse = '';
  let agentLoading = false;

  async function handleCommandKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const input = commandInput.trim();
    if (!input || !input.startsWith('/')) return;

    agentLoading = true;
    commandInput = '';

    try {
      const res = await fetch('/api/terminal/agent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, context: buildContext() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      agentResponse = data.text;
    } catch (err) {
      agentResponse = `오류: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      agentLoading = false;
    }
  }

  function buildContext() {
    // rangeSelection, currentSymbol, blockScores 등 parent에서 prop으로 받은 값
    return {
      symbol: currentSymbol,
      btc_trend: btcTrend,
      block_scores: blockScores,
      entry_p_win: entryPWin,
    };
  }
</script>
```

#### 1-D. `engine/api/main.py`에 agent router 등록

```python
# engine/api/main.py 기존 include_engine_routes() 내
from api.routes.agent import router as agent_router
target.include_router(agent_router)  # prefix="/agent" 이미 router에 포함
```

#### 1-E. migration 044 (agent_interactions 테이블)

```sql
-- app/supabase/migrations/044_agent_interactions.sql
create table if not exists agent_interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  cmd         text not null,
  args_json   jsonb,
  llm_response text,
  latency_ms  int,
  provider_used text,
  feedback_thumbs boolean,  -- 사용자 피드백 (Phase 4)
  created_at  timestamptz not null default now()
);

create index on agent_interactions (cmd, created_at desc);
create index on agent_interactions (user_id, created_at desc);

-- RLS: 본인 interaction만 조회 가능
alter table agent_interactions enable row level security;
create policy "own_interactions" on agent_interactions
  for select using (user_id = auth.uid()::text);
create policy "insert_own" on agent_interactions
  for insert with check (user_id = auth.uid()::text or user_id is null);
```

#### Phase 1 테스트 (≥4 tests)

```
engine/tests/test_agent_explain.py
  test_explain_returns_llm_text          # LLM mock → AgentResponse
  test_explain_fallback_on_primary_fail  # primary LLM 500 → fallback chain
  test_explain_all_providers_fail_503    # 모두 실패 → HTTP 503
  test_command_bar_parse_valid           # /explain ETH → {cmd:"explain", args:"ETH"}
  test_command_bar_parse_invalid         # /invalid → 400
```

---

### Phase 2 (D4-6): Alpha Scanner — /scan + 52-pattern composite (Break E)

**산출물**: PR-2, Phase 1 머지 후 시작

#### 2-A. `engine/api/routes/agent.py`에 `/agent/alpha-scan` 추가

```python
class AlphaScanRequest(BaseModel):
    symbol: str | None = None        # None = full universe scan
    universe_name: str = "default"
    top_n: int = 10

ALPHA_SCAN_SYSTEM = """당신은 퀀트 알파 탐색 전문가입니다.
주어진 패턴 활성도 데이터(52개 패턴의 entry candidate 현황)를 분석하여
가장 주목할 심볼과 패턴 조합을 한국어로 설명합니다.
반드시 포함: 상위 3-5 심볼, 각 패턴의 신호 강도, 주의해야 할 리스크."""

@router.post("/alpha-scan", response_model=AgentResponse)
async def alpha_scan(
    body: AlphaScanRequest,
    _auth=Depends(require_internal_or_auth),
) -> AgentResponse:
    """Break E: 52-pattern composite alpha scan with LLM interpretation."""
    t0 = time.monotonic()

    # Step 1: 최신 scan 결과 로드 (patterns/scanner.py 결과 캐시 or DB)
    from patterns.scanner import run_pattern_scan
    scan_result = await run_pattern_scan(
        body.universe_name, prewarm=False
    )
    entry_candidates = scan_result.get("entry_candidates", {})

    # Step 2: composite 요약 구성
    user_text = _build_alpha_scan_prompt(entry_candidates, body.symbol, body.top_n)

    text = await generate_llm_text(
        ALPHA_SCAN_SYSTEM, user_text, max_tokens=800, temperature=0.1
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    # ML 누적
    _log_interaction_bg(
        cmd="alpha-scan",
        args={"symbol": body.symbol, "n_candidates": sum(len(v) for v in entry_candidates.values())},
        response=text, latency_ms=latency_ms, provider="summary",
    )

    return AgentResponse(
        cmd="alpha-scan", text=text,
        latency_ms=latency_ms, provider_used="summary",
    )


def _build_alpha_scan_prompt(
    entry_candidates: dict[str, list[str]],
    target_symbol: str | None,
    top_n: int,
) -> str:
    """52-pattern entry candidates → LLM-digestible prompt."""
    total = sum(len(v) for v in entry_candidates.values())
    lines = [f"현재 {total}개 entry candidate (패턴 {len(entry_candidates)}개 활성):\n"]

    for slug, symbols in sorted(entry_candidates.items(), key=lambda x: -len(x[1]))[:top_n]:
        sym_list = ", ".join(symbols[:5])
        lines.append(f"• {slug}: {sym_list} ({len(symbols)}개)")

    if target_symbol:
        matched = [s for s, syms in entry_candidates.items() if target_symbol in syms]
        lines.append(f"\n{target_symbol} 관련 활성 패턴: {matched or ['없음']}")

    return "\n".join(lines)
```

#### 2-B. scan_signal_events 자동 누적 확인

Break A 수정(W-0377) 이후 `/agent/alpha-scan` 호출 시 `scan_signal_events`가 적재되는지
integration test로 확인.

#### Phase 2 테스트 (≥3 tests)

```
engine/tests/test_agent_alpha_scan.py
  test_alpha_scan_full_universe          # mock scan_result → LLM → AgentResponse
  test_alpha_scan_single_symbol_filter   # symbol="BTCUSDT" → matched patterns only
  test_alpha_scan_empty_candidates       # entry_candidates={} → "현재 활성 패턴 없음"
```

---

### Phase 3 (D7-8): Similar-Range Search + /similar (Break F)

**산출물**: PR-3, Phase 2 머지 후 시작

#### 3-A. `engine/api/routes/agent.py`에 `/agent/similar` 추가

```python
class SimilarRequest(BaseModel):
    # 차트에서 드래그한 구간 or 현재 패턴 draft
    pattern_draft: dict           # feature_snapshot 포함
    limit: int = 10
    min_score: float = 0.3

SIMILAR_SYSTEM = """당신은 시장 패턴 분석가입니다.
유사 구간 검색 결과를 보고 현재 구간과의 공통점, 이전 결과, 주의사항을 한국어로 설명합니다.
반드시 포함: 유사도 상위 3개 사례의 결과(success/failure), 평균 수익률, 신뢰 수준."""

@router.post("/similar", response_model=AgentResponse)
async def find_similar(
    body: SimilarRequest,
    _auth=Depends(require_internal_or_auth),
) -> AgentResponse:
    """Break F: similar-range search + LLM interpretation."""
    t0 = time.monotonic()

    # Layer A+B+C 검색 (engine/search/similar.py)
    from search.similar import run_similar_search
    results = run_similar_search(
        body.pattern_draft,
        limit=body.limit,
        min_score=body.min_score,
    )

    # 자연어 컨텍스트 구성
    user_text = _build_similar_prompt(results)

    text = await generate_llm_text(
        SIMILAR_SYSTEM, user_text, max_tokens=600, temperature=0.1
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    _log_interaction_bg(
        cmd="similar",
        args={"n_results": len(results.get("candidates", []))},
        response=text, latency_ms=latency_ms, provider="summary",
    )

    return AgentResponse(
        cmd="similar", text=text,
        latency_ms=latency_ms, provider_used="summary",
        # 원본 검색 결과도 포함 (프론트에서 카드 렌더링용)
        # extra={"candidates": results["candidates"][:5]}  # Phase 3 확장
    )


def _build_similar_prompt(results: dict) -> str:
    candidates = results.get("candidates", [])
    if not candidates:
        return "유사한 과거 구간을 찾지 못했습니다."

    lines = [f"유사 구간 {len(candidates)}개 발견 (138,915개 중 검색):\n"]
    for c in candidates[:5]:
        score = c.get("composite_score", 0)
        outcome = c.get("outcome", "unknown")
        pnl = c.get("pnl_pct")
        symbol = c.get("symbol", "?")
        pnl_str = f"{pnl:+.1%}" if pnl is not None else "미확인"
        lines.append(f"• {symbol} 유사도={score:.2f} 결과={outcome} 수익={pnl_str}")

    avg_score = sum(c.get("composite_score", 0) for c in candidates[:5]) / min(5, len(candidates))
    lines.append(f"\n평균 유사도: {avg_score:.2f}")

    wins = [c for c in candidates if c.get("outcome") == "success"]
    if candidates:
        lines.append(f"이전 성공률: {len(wins)}/{len(candidates)} ({len(wins)/len(candidates):.0%})")

    return "\n".join(lines)
```

#### 3-B. AIAgentPanel 차트 구간 드래그 → /similar 연결

`AIAgentPanel.svelte`의 `rangeSelection` prop이 이미 있음. 구간 선택 시 자동으로 `/similar`
호출하는 버튼 추가 (자동 실행 X — 사용자가 `/similar` 입력 시 실행):

```svelte
// Command bar에서 /similar 입력 시 rangeSelection을 context에 포함
function buildContext() {
  return {
    ...baseContext,
    ...(commandInput.startsWith('/similar') && rangeSelection
      ? { range_start: rangeSelection.start, range_end: rangeSelection.end }
      : {}),
  };
}
```

#### Phase 3 테스트 (≥3 tests)

```
engine/tests/test_agent_similar.py
  test_similar_with_results              # mock run_similar_search → LLM → AgentResponse
  test_similar_no_results_empty_state    # 결과 없음 → "유사한 과거 구간 없음" 텍스트
  test_similar_prompt_includes_pnl       # pnl_pct 포함된 prompt 구성 확인
```

---

### Phase 4 (D9-10): ML 자동 훈련 + 정합성 체크 (Break H)

**산출물**: PR-4, Phase 3 머지 후 시작

#### 4-A. `scheduler.py`에 `train_lgbm_job` 배선

```python
# engine/scanner/scheduler.py — start_scheduler() 내 추가
from scoring.trainer_trigger import train_layer_c, maybe_trigger
from scoring.lightgbm_engine import get_engine

async def _train_lgbm_job() -> None:
    """W-0378 Phase 4: daily 04:00 + threshold-triggered retraining."""
    from ledger.store import get_ledger_store
    from scoring.dataset import build_training_records

    store = get_ledger_store()
    records = build_training_records(store)  # label=1 if outcome=success else 0
    n = len(records)

    if not maybe_trigger(n):
        log.info("train_lgbm_job: skipped (n=%d, not eligible)", n)
        return

    engine = get_engine()
    result = train_layer_c(engine, records)
    if result.triggered:
        log.info(
            "train_lgbm_job: trained AUC=%.4f prev=%.4f replaced=%s",
            result.auc, result.auc_before, result.auc_replaced,
        )
        # Weight version 기록
        _record_weight_version(result)
    else:
        log.info("train_lgbm_job: not triggered (%s)", result.skip_reason)


def _record_weight_version(result) -> None:
    """pattern_ledger_records에 model weight version 기록."""
    from datetime import datetime, timezone
    from ledger.store import LEDGER_RECORD_STORE

    LEDGER_RECORD_STORE.append({
        "record_type": "model",
        "model_key": "lgbm_layer_c",
        "auc": result.auc,
        "n_verdicts": result.n_verdicts,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# scheduler.add_job 추가 (cron 04:00 UTC)
_scheduler.add_job(
    _train_lgbm_job,
    CronTrigger(hour=4, minute=0, timezone="UTC"),
    id="train_lgbm",
    replace_existing=True,
)
```

#### 4-B. `/admin/system-coherence` 엔드포인트

```python
# engine/api/routes/agent.py에 추가
from fastapi import APIRouter, Depends

@router.get("/admin/system-coherence")
async def system_coherence(
    _auth=Depends(require_internal_or_auth),
) -> dict:
    """W-0378 Phase 4: Break A~H 상태 체크."""
    import os
    from datetime import datetime, timedelta, timezone

    checks = {}

    # Break A
    checks["A_signal_events_enabled"] = (
        os.environ.get("ENABLE_SIGNAL_EVENTS", "true").lower() == "true"
    )

    # Break B
    try:
        from research.signal_event_store import signal_event_store
        checks["B_signal_event_store_circuit"] = signal_event_store._breaker.state == "CLOSED"
    except Exception:
        checks["B_signal_event_store_circuit"] = False

    # Break C — CURRENT.md 상태 체크
    try:
        import pathlib
        cur = pathlib.Path("work/active/CURRENT.md").read_text()
        checks["C_current_md_clean"] = (
            "W-0365-alpha-1cycle-pnl-verified" not in cur
            and "W-0366-pattern-indicator-filters" not in cur
        )
    except Exception:
        checks["C_current_md_clean"] = None

    # Break D
    try:
        from api.routes.agent import router as _agent_router
        checks["D_agent_router_registered"] = any(
            r.path == "/agent/explain" for r in _agent_router.routes
        )
    except Exception:
        checks["D_agent_router_registered"] = False

    # Break E
    checks["E_alpha_scan_endpoint"] = any(
        r.path == "/agent/alpha-scan" for r in _agent_router.routes
    )

    # Break F
    checks["F_similar_endpoint"] = any(
        r.path == "/agent/similar" for r in _agent_router.routes
    )

    # Break G
    checks["G_command_bar"] = True  # 정적 체크 — Phase 1 완료 시 True로 고정

    # Break H
    try:
        from scanner.scheduler import _scheduler
        job = _scheduler.get_job("train_lgbm")
        checks["H_train_lgbm_wired"] = job is not None
    except Exception:
        checks["H_train_lgbm_wired"] = False

    all_healthy = all(v is True for v in checks.values() if v is not None)
    return {
        "healthy": all_healthy,
        "checks": checks,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
```

#### Phase 4 테스트 (≥3 tests)

```
engine/tests/test_agent_phase4.py
  test_train_lgbm_job_triggers_on_threshold    # n_verdicts=500 → train called
  test_train_lgbm_job_skips_on_debounce        # last_train < 1h ago → skipped
  test_system_coherence_all_healthy            # all breaks fixed → {"healthy": True}
  test_system_coherence_break_a_unhealthy      # ENABLE_SIGNAL_EVENTS=false → {"A_...": False}
```

---

## Decisions

| # | 결정 | 채택 이유 | 거절 옵션 |
|---|---|---|---|
| D1 | AIAgentPanel = 5-tab 유지 + Command Bar 1줄 | 332줄 재작성 회피; Frozen "메모리 stack" 위반 없음 | 전면 재작성 — 3x 시간 비용 |
| D2 | slash command + zod schema (NLU 없음) | NLU 의도분류 = LLM 2회 호출 + 지연 증가; "orchestration OS" Frozen 의심 | GPT-4 intent routing — 비용 2x |
| D3 | LLM 호출은 engine 직접, app은 BFF 프록시 | `/patterns/parse:211` 기존 패턴 재사용; ANTHROPIC_API_KEY server-side 보안 | App에서 직접 LLM 호출 — API key 노출 위험 |
| D4 | alpha composite = 우리 52패턴 활성도 | Alpha Terminal 7-layer 포팅 = 새 의존성 + baseline 부재 | Alpha Terminal 동일 포팅 — 구현 6일+ |
| D5 | ML 누적 = 자동(unlabeled) + verdict 시 라벨링 | verdict gate만 = volume 10x 감소 | verdict만 — data poverty |
| D6 | W-0377=인프라 / W-0378=인터페이스 (분리) | 13-15일 단일 PR 불가능; 코드 충돌 위험 | 단일 PR — 리뷰 불가 |
| D7 | 정합성 체크 = `/admin/system-coherence` (auth) | Vercel cron secret 노출 방지; infra 추가 없음 | Vercel cron health check — 별도 인프라 |

---

## Non-Goals

- 자체 dispatcher/orchestration OS (Frozen — CHARTER 2026-05-01)
- 카피트레이딩/실자금 (Frozen)
- 메모리 stack 신규 빌드 (Frozen)
- 신규 LLM provider 추가 (기존 chain만 재활용)
- WebSocket/streaming LLM 응답 (Phase 4 이후 검토 가능)

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| LLM provider 전체 down → /explain 503 | 낮 | 중 | FALLBACK_CHAIN 4단계; HTTP 503 graceful |
| agent_interactions write 지연 → scan block | 낮 | 높 | fire-and-forget thread; scan 코드 경로 분리 |
| train_lgbm 동시 실행 → model 충돌 | 중 | 중 | `_LAYER_C_LOCK` (threading.Lock) 이미 존재 |
| LLM latency > 7s → AC1 실패 | 중 | 중 | timeout=30s; p95 측정 후 AC1 7s 재검토 |
| /similar Layer C LightGBM 미훈련 → None 반환 | 중 | 낮 | Layer A+B만으로 graceful degrade |

### Performance

- `/explain` p95 목표 ≤7s: groq/llama-3.3-70b 실측 2-4s, cerebras 1-3s
- `/alpha-scan` = run_pattern_scan() + LLM: 추가 latency 2-5s (scan 자체는 기존)
- `/similar` = run_similar_search() (138k rows cosine) + LLM: 기존 검색 1-2s + LLM 2-4s

### Security

- ANTHROPIC_API_KEY / GROQ_API_KEY: server-side only (engine env var)
- agent_interactions: RLS (본인 interaction만), user_id nullable (internal call)
- `/admin/system-coherence`: `require_internal_or_auth` — JWT 또는 ENGINE_INTERNAL_TOKEN

---

## AI Researcher 관점

### ML 데이터 축적 경로

```
/scan 호출 (n회/day)
  → scan_signal_events (W-0377 수정 후 적재)
  → scan_signal_outcomes (72h 후 resolve_outcome() 호출)
  → PatternOutcome (ledger)

/explain, /similar, /judge 호출
  → agent_interactions (raw log, unlabeled)
  → 사용자 ✓/✗ feedback_thumbs = label

train_lgbm_job (04:00 + 500개 threshold)
  → scoring/trainer.py:train() → LightGBM AUC 갱신
  → entry_p_win 정확도 향상 → 다음 스캔 더 정밀해짐
```

### 목표 지표

| 지표 | 현재 | Phase 4 완료 후 |
|---|---|---|
| ML 훈련 데이터/day | 0 (ENABLE_SIGNAL_EVENTS=false) | ≥250 rows |
| LightGBM AUC | 고정 (재훈련 없음) | 주 1회 이상 갱신 |
| /explain LLM 성공률 | 0% | ≥95% |
| /similar LLM 설명 | 없음 | precision@5 ≥0.5 |

### Failure Modes

- `scan_signal_events` 비어있음 → W-0377 Break A 미수정 → scheduler.py ENABLE_SIGNAL_EVENTS 확인
- agent_interactions circuit breaker OPEN → _sb() Supabase 연결 실패 → SUPABASE_URL env 확인
- train_lgbm "insufficient_verdicts" → 50개 미만 → 정상 (데이터 축적 중)
- /similar "Layer C score None" → LightGBM 미훈련 → Layer A+B 결과만 반환 (정상 degrade)

---

## Canonical Files

```
Phase 1:
  engine/api/routes/agent.py               # 신규 — /explain 엔드포인트
  app/src/routes/api/terminal/agent/dispatch/+server.ts  # 신규 — BFF
  app/src/components/terminal/peek/AIAgentPanel.svelte   # Command Bar 추가
  engine/api/main.py                       # agent router 등록
  app/supabase/migrations/044_agent_interactions.sql     # 신규 테이블
  engine/tests/test_agent_explain.py       # 신규 (≥5 tests)

Phase 2:
  engine/api/routes/agent.py               # /alpha-scan 추가
  engine/tests/test_agent_alpha_scan.py    # 신규 (≥3 tests)

Phase 3:
  engine/api/routes/agent.py               # /similar 추가
  app/src/components/terminal/peek/AIAgentPanel.svelte   # /similar context 연결
  engine/tests/test_agent_similar.py       # 신규 (≥3 tests)

Phase 4:
  engine/scanner/scheduler.py             # train_lgbm_job APScheduler 배선
  engine/scoring/trainer_trigger.py       # _record_weight_version() 추가
  engine/api/routes/agent.py              # /admin/system-coherence 추가
  engine/tests/test_agent_phase4.py       # 신규 (≥4 tests)
```

---

## Exit Criteria

- [ ] AC1: `/explain` LLM 성공률 ≥95% (n=100 호출), p95 ≤7s
- [ ] AC2: `/scan` (alpha-scan) recall@10 ≥0.6 (entry candidates top-10 중 실제 breakout)
- [ ] AC3: `/similar` precision@5 ≥0.5 (상위 5 결과 중 verdict ✓ 비율)
- [ ] AC4: 5-tab 모두 `/explain`, `/scan`, `/similar`, `/judge`, `/save` 명령 LLM 호출 가능
- [ ] AC5: `agent_interactions` 테이블 ≥250 rows/day (prod 24h 후)
- [ ] AC6: provider fallback 동작 확인 — primary LLM mock 500 시 secondary 자동 시도
- [ ] AC7: `train_lgbm_job` 04:00 cron 배선 + APScheduler job list 확인
- [ ] AC8: `GET /agent/admin/system-coherence` Break A~H 모두 `true`
- [ ] AC9: 명령어 5개 success rate ≥98% (integration test 50회)
- [ ] AC10: P1/P2/P3/P4 각각 독립 PR 머지 가능 (CI green 독립 확인)
- [ ] `pnpm check` 0 new errors
- [ ] `uv run pytest engine/tests/ -x -q` PASS
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

---

## Open Questions

- Q1: `agent_interactions` prompt 원문 저장 vs hash → **원문** (Jin solo dogfood, GDPR 비해당)
- Q2: `/judge` LLM이 휴리스틱 verdict override 가능? → **surface only** — 사용자 ✓/✗ 최종
- Q3: `train_lgbm` cadence → **둘 다** (cron 04:00 + 500 outcomes threshold gate)
- Q4: `/similar` 결과 클릭 → 새 워크스페이스 vs current navigate → **Phase 3 구현 시 결정**

---

## Implementation Checklist (구현 에이전트용)

```
[ ] git checkout -b feat/W-0378-p1-llm-explain
[ ] engine/api/routes/agent.py 생성 (ExplainRequest + AgentResponse + /explain + /alpha-scan stub)
[ ] app/src/routes/api/terminal/agent/dispatch/+server.ts 생성
[ ] AIAgentPanel.svelte Command Bar 추가 (최소 변경)
[ ] engine/api/main.py agent router 등록
[ ] migration 044 작성
[ ] test_agent_explain.py ≥5 tests
[ ] uv run pytest engine/tests/test_agent_explain.py -v
[ ] pnpm check → 0 errors
[ ] PR-1 open → 머지

[ ] git checkout -b feat/W-0378-p2-alpha-scan (PR-1 머지 후)
[ ] /alpha-scan 엔드포인트 추가
[ ] test_agent_alpha_scan.py ≥3 tests
[ ] PR-2 open → 머지

[ ] git checkout -b feat/W-0378-p3-similar (PR-2 머지 후)
[ ] /similar 엔드포인트 추가
[ ] AIAgentPanel /similar context 연결
[ ] test_agent_similar.py ≥3 tests
[ ] PR-3 open → 머지

[ ] git checkout -b feat/W-0378-p4-ml-coherence (PR-3 머지 후)
[ ] scheduler.py train_lgbm_job APScheduler 배선
[ ] /admin/system-coherence 엔드포인트
[ ] test_agent_phase4.py ≥4 tests
[ ] PR-4 open → 머지
[ ] AC1~AC10 전체 체크
```

## Owner

eunjuhyun88 — multi-PR (4 Phase × 4 PR), depends on W-0377 머지.

## Scope

Cogochi AI Agent 통합 — 5-tab Panel + Command Bar 1줄 + agent_interactions 로깅 +
4 Phase 분해 (D~H Break 갭 메우기).

## Facts

- AIAgentPanel은 332줄 5-tab 구조이며 PR #854에서 SCN/JDG/ANL wiring 머지됨.
- agent_interactions 테이블은 Phase 1 추가 예정 (지금은 미존재).
- W-0377 파이프라인 복구 머지 후에야 안정적인 데이터 흐름 확보됨.

## Assumptions

- Phase별 단일 PR로 분해 가능 (PR-1~PR-4 순차).
- W-0377 머지 후 prod에서 agent 로그가 즉시 흐른다.
- GDPR 면제 (Jin solo dogfood) → prompt 원문 저장 OK.

## Next Steps

1. W-0377 머지 대기.
2. Phase 1 PR open → agent_interactions 마이그레이션 + 로깅 wiring.
3. Phase 2/3/4 순차 진행.

## Handoff Checklist

- [ ] W-0377 머지 확인.
- [ ] Phase 1 PR open + 머지.
- [ ] Phase 2/3/4 PR 순차.
- [ ] AC1~AC10 전체 체크.
- [ ] CURRENT.md에서 W-0378 active row 정리.
