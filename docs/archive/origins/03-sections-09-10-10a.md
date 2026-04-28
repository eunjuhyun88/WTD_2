## § 9. DOUNI × Archetype — **DEFERRED (not in Day-1)**

> **2026-04-11 patch:** the entire character layer (DOUNI name, avatar, growth Stage, Archetype personality filter) is removed from Day-1 scope. Day-1 is a clinical pattern-composer + challenge workbench without character framing. The rationale: users judged the character layer as noise on top of what they actually wanted — compose a pattern, evaluate it, iterate. The character design below is preserved for reference and will return in Phase 2+/3 if marketplace or battle surfaces revive.

### Archived design (for Phase 2+/3 revival)

The original design had two orthogonal axes:

**Stage (growth):** `EGG → CHICK → FLEDGLING → DOUNI → ELDER`, unlocked by feedback count + LoRA pass count + marketplace eligibility. Purpose was to gate advanced features (lab method selection, LoRA rank control, market listing).

**Archetype (personality / runtime filter):** `Oracle | Crusher | Guardian | Rider`. Runtime rule was a scan-alert filter (e.g. Guardian blocks LONG alerts during funding overheat). Mapped to `cogochi/battle_engine.py::guardian_veto()` for the Phase 3 battle system.

### What replaces it in Day-1

| Role character layer was filling | Day-1 replacement |
|---|---|
| Per-user identity / ownership | Per-user filesystem namespace under `WTD/challenges/pattern-hunting/<slug>/`. No character object. |
| Stage-gated feature unlock | No gates. All Day-1 features available from the start. |
| Archetype alert filter | User writes filters directly via `disqualifiers` blocks in their challenge composition (e.g. `extreme_volatility`, `volume_below_average`, `extended_from_ma`). |
| `/agent/[id]` character HQ | Folded into `/lab` challenge list + detail. |
| `/create` step 2 archetype pick | Removed — there is no `/create` in Day-1. |

**Returns when:** marketplace (`/market`) or battle (`/battle`) surfaces are revived. Until then, treat every reference to "DOUNI", "archetype", or "Stage" elsewhere in this doc as archival.

---

## § 10. AutoResearch Pipeline (Python layer)

위치: `cogochi/` 모노레포 내부.

### 현재 repo에 있는 파일

```
cogochi/
├── __init__.py
├── autoresearch_service.py   ← ORPO pair builder + hill climb
├── battle_engine.py          ← BattleContext state machine (Phase 3 scaffold)
├── context_builder.py        ← LLM context assembler
└── skill_registry.py         ← DOUNI personality / skill routing
```

### User-provided local files (outside git)

```
prepare.py            ← dataset prep from Supabase feedback
finetune.py           ← KTO trainer (trl) entry
autoresearch_loop.py  ← hill climb search loop
battle_collector.py   ← Phase 3 battle data collector
```

### Key existing functions (reuse, don't duplicate)

- `build_orpo_pair(battle_result, assembled_context)` → cases A/B/C/D in `autoresearch_service.py`. Takes generic "decision_result" shape; Day-1 scanner feedback can feed this directly (no rename needed).
- `BattleContext` dataclass in `battle_engine.py` → has all fields for both Scanner feedback and Phase 3 Battle: `scenario_id`, `snapshot`, `candles`, `memories`, `outcome`, `trainer_action`, `reflection`, `pnl`
- `guardian_veto(ctx)` → archetype filter primitive. Day-1 uses it for Scanner alert filtering.

### Missing (to be built in next PRs, NOT the home landing PR)

1. **Scanner 15-layer implementation** — `cogochi/scanner/layers/*.py` (l1 wyckoff, l2 funding, ..., l15 atr)
2. **APScheduler job** — `cogochi/scanner/scheduler.py`
3. **Telegram bot** — `cogochi/alerts/telegram_bot.py`
4. **KTO trainer script** (user-provided) — `finetune.py`
5. **FIXED_SCENARIOS dataset** — `cogochi/eval/fixed_scenarios.json` (200 cases)
6. **val gate + adapter swap** — `cogochi/deploy/adapter_swap.py`

### Build order (Step 0-5)

```
Step 0: Infrastructure           — Supabase schema · env setup
Step 1: Data Collection          — patterns.json · scanner stub · Telegram alerts · FIXED_SCENARIOS
Step 2: Data Formatting          — KTO JSONL · ORPO JSONL builders
Step 3: Training Search Loop     — hill climb · LoRA config · KTO training
Step 4: Evaluation               — FIXED_SCENARIOS val · stratified hit-rate
Step 5: Deploy                   — adapter swap · version manager · rollback
```

---

## § 10A. Cogochi Agent Architecture — Chatbot → Agent 전환

> **현재 상태:** `/api/cogochi/analyze`는 PERCEIVE + ACT만 한다. THINK · PLAN · OBSERVE · REFLECT가 없다. 이게 chatbot과 agent의 차이다.

### 핵심 패러다임 전환

```
현재 (Chatbot):          목표 (Agent):
User asks               Agent perceives
    ↓                       ↓
Claude responds         Agent plans
    ↓                       ↓
Done                    Agent acts (multi-tool)
                            ↓
                        Agent observes outcome
                            ↓
                        Agent reflects → loops
```

**Chatbot**: Reactive · stateless · single-shot
**Agent**: Proactive · stateful · multi-step · goal-directed

---

### 1. Agent Core Loop — ReAct + Perception

```
PERCEIVE ──→ THINK ──→ PLAN ──→ ACT ──→ OBSERVE ──→ REFLECT
    ↑                                                   │
    └───────────────────────────────────────────────────┘

Trigger: Market event | User goal | Time-based | Alert
```

---

### 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                  ORCHESTRATOR AGENT                       │
│  Goal decomposition → Sub-agent delegation → Synthesis    │
└──────────────────────┬───────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ MARKET      │  │  RISK       │  │ MACRO       │
│ AGENT       │  │  AGENT      │  │ AGENT       │
│             │  │             │  │             │
│ feature     │  │ correlation │  │ on-chain    │
│ calc (92)   │  │ liquidation │  │ dominance   │
│ MTF synth   │  │ drawdown    │  │ regime      │
│ pattern     │  │ sizing      │  │ sentiment   │
│ detect      │  │ stop calc   │  │ news        │
└─────────────┘  └─────────────┘  └─────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│            MONITOR AGENT (autonomous)                │
│  every 30s: watchlist scan → anomaly detect → alert  │
└─────────────────────────────────────────────────────┘
```

---

### 3. Tool Library — Atomic Tools (현재 1개 → 10개)

```python
# 현재 (monolithic):
analyze(symbol, tf) → {snapshot, ensemble, verdict}

# Agent 도구 체계:
tools = [
    scan_market(criteria, limit),         # "OI 급증 + RSI 60~70인 심볼"
    compute_features(symbol, tf),          # raw 92개 feature
    fetch_orderbook(symbol),               # L2 depth, imbalance
    fetch_liquidations(symbol, window),    # 청산 히트맵
    fetch_news(symbol, limit),             # 뉴스 + 감성
    check_correlation(sym_a, sym_b, tf),  # 상관관계 분석
    check_regime(macro_window),            # 거시 레짐
    compare_assets(symbols[]),             # 멀티 에셋
    synthesize_verdict(evidences[]),       # 증거 → 판단
    set_alert(symbol, condition, fn),      # 모니터링 등록
]
```

Agent는 이 도구들을 **계획하고 순서대로 실행하며 중간 결과를 보고 다음 단계를 결정**한다.

---

### 4. Planning Layer

```
User Goal: "BTC 지금 들어가도 돼?"

현재 (single-shot):
→ analyze(BTCUSDT, 4h) → verdict

Agent (multi-step plan):
Step 1: compute_features(BTC, [15m, 1h, 4h, 1d])   # MTF 컨텍스트
Step 2: check_regime()                               # 거시 환경
Step 3: fetch_liquidations(BTC, 4h)                 # 청산 레벨
Step 4: fetch_orderbook(BTC)                        # 즉각적 유동성
Step 5: check_correlation(BTC, ETH, 4h)             # 알트 동조화
Step 6: fetch_news(BTC, 10)                         # 카탈리스트
Step 7: synthesize_verdict([1..6의 결과])            # 종합 판단
→ entry: $X±Y, stop: $Z, target: $A/$B, confidence: H/M/L
```

Planning layer는 Claude `tool_use` + 중간 결과 보고 기반으로 구현.

---

### 5. Memory System

| 레이어 | 저장소 | 내용 |
|--------|--------|------|
| **Working Memory** | in-context | 현재 세션 심볼 · 레짐 · 사용자 질문 이력 |
| **Episodic** | Supabase | 과거 verdict + 실제 가격 결과 → accuracy tracking |
| **Semantic** | vector store | 사용자 risk tolerance · 선호 TF · 선호 setup 타입 |
| **Procedural** | learned rules | "OI spike + RSI 80+ → 먼저 liquidation 체크" |

Episodic memory 예시:
- `2026-04-05 BTC bullish 판단 → +3.2%` ✓
- `2026-04-03 ETH short 판단 → -1.1%` ✗
→ Agent 자체 accuracy tracking · 자기 교정 루프

---

### 6. Proactive Monitor Agent

```
현재: User asks → Agent responds
Agent: Agent perceives → Agent proactively notifies

every 30s:
  for symbol in watchlist:
    features = compute_features(symbol)
    if anomaly_detected(features):
      alert = generate_alert(symbol, features)
      push_to_terminal(alert)   ← 사용자가 묻기 전에

Anomaly types:
  OI 5분 안에 +15% 이상
  Funding rate 극단치 (>0.05% or <-0.03%)
  Volume spike (3x 평균 대비)
  Liquidation cascade 시작
  레짐 전환 감지
  사용자 설정 price alert
```

---

### 7. 구현 로드맵

| Phase | 기간 | 내용 |
|-------|------|------|
| **Phase 1** | 1–2주 | monolithic `analyze()` → 10개 atomic tool 분리. Planning layer (tool_use). Reasoning chain UI. |
| **Phase 2** | 2–3주 | Supabase episodic memory. Monitor agent 백그라운드 루프. Alert push (SSE). |
| **Phase 3** | 3–4주 | Orchestrator + Specialist sub-agents. Market/Risk/Macro 병렬. |
| **Phase 4** | 장기 | Verdict vs actual price tracking. Procedural memory 업데이트. 자기 교정. |

**Phase 1이 가장 임팩트 크고 현재 엔진과 바로 연결 가능.**

> 지금은 92개 feature를 가진 **고급 계산기**다. Agent는 그 계산기를 **스스로 사용법을 결정하는 시스템**이다.

---

