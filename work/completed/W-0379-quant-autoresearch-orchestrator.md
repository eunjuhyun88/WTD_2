# W-0379 — Quant-Rigorous Auto-Modification Ratchet w/ Multi-Model Ensemble

> Wave: 5 | Priority: P0 | Effort: L (26 days)
> Charter: §In-Scope (Frozen 전면 해제 후, 2026-05-01)
> Status: 🟡 Design Locked (v4)
> Created: 2026-05-02
> Issue: #859

## Owner

ej / quant-trader. Single-owner; no cross-team handoff.

## Goal

LLM 8 track + GP + grid를 **proposer**로 묶어 룰 변경 후보를 자동 생성하고,
6-Layer 정합성 게이트(Lopez de Prado 풀스택)를 통과한 변경만 git에 자동 commit
한다(Kieran-style ratchet, but 통계 정합성은 더 두꺼움). 모델별·앙상블 10종별 성적은
ledger에 누적되어 5개 UI 페이지에서 차트+수치로 한눈에 비교 가능.

한 줄 요약: "100개 LLM이 룰 만들고, 우리 통계 게이트가 99개 죽이고, 살아남은 1개를
git이 자동 commit한다."

## Facts

### 우리가 이미 갖춘 것 (LLM 인프라)

- `engine/llm/provider.py:44` — litellm 1.40+ 기반 `call_with_tools` / `call_text`
- `engine/llm/router.py:24` — task→model 매핑. judge=Groq Llama, summary=Cerebras Qwen,
  scan=NVIDIA Llama. Local Ollama 명시 지원 (`_LOCAL_PREFIXES`).
- `engine/llm/cost_tracker.py` — per-call 비용 추적 + `CostCapExceeded`
- 멀티키 로테이션: GROQ 12-key, NVIDIA NIM, Cerebras, HuggingFace 환경변수

### 통계 정합성 인프라 (Lopez de Prado 풀스택)

| 모듈 | 라인 | 역할 | 출처 |
|---|---|---|---|
| `engine/research/validation/cv.py::PurgedKFold` | 271 | Purge + Embargo CPCV | LdP 2018 Ch.7 |
| `engine/research/validation/stats.py::deflated_sharpe` | 509 | DSR (n_trials 필수) | Bailey-LdP 2014 |
| `engine/research/validation/stats.py::welch_t_test` | — | G1 게이트 | Welch 1947 |
| `engine/research/validation/stats.py::bh_correct` | — | BH-FDR | Benjamini-Hochberg 1995 |
| `engine/research/validation/stats.py::bootstrap_ci` | — | 부트스트랩 CI | Efron 1979 |
| `engine/research/validation/multiple_testing.py` | 412 | Hierarchical BH-FDR + Preregistry | Yekutieli 2008 |
| `engine/research/validation/walkforward.py` | — | OOS Walk-Forward | 표준 |
| `engine/research/validation/regime.py` | — | bull/bear/sideways 분리 | LdP 권장 |
| `engine/research/validation/decay.py` | — | 알파 decay 감지 | LdP Ch.13 |
| `engine/research/validation/robustness.py` | — | 강건성 | — |
| `engine/research/validation/costs.py` | — | slippage + fee | Cont 2001 |
| `engine/research/validation/labels.py` | — | Triple-barrier | LdP 2018 Ch.3 |
| `engine/research/validation/ablation.py` | — | feature ablation | — |
| `engine/research/validation/pipeline.py` | 722 | 전체 파이프라인 진입점 | — |
| `engine/research/alpha_quality.py::aggregate` | 234 | Welch + BH-FDR + bootstrap + Spearman | W-0367 |
| `engine/research/alpha_quality.py::detect_decay` | — | z-score 알파 붕괴 알림 | W-0368 |

### 빠진 것 (만들어야 할 것)

1. `validation/pbo.py` — PBO/CSCV (Bailey et al 2016)
2. `engine/research/orchestrator.py` — 6-Layer 진입점
3. `engine/research/ratchet.py` — git commit/reset 자동화
4. `engine/research/proposer/` — 8-track LLM + GP + Optuna grid
5. `engine/research/ensemble/` — 10종 ensemble strategy
6. `engine/research/program.md` — 에이전트 헌법
7. `engine/research/rules/active.yaml` — 에이전트가 만질 수 있는 유일한 파일
8. `engine/data_cache/fetch_deribit_options.py` + `engine/features/gex_pressure.py` — Layer 5 GEX
9. UI 5 페이지 (`/research/ledger`, `/research/battle`, `/research/ensemble`, `/research/diff/[id]`, `/lab/counterfactual` 확장)
10. migration 045 + 046 (autoresearch_ledger + ensemble_rounds)

### 프론트 (이미 있음)

- `app/src/routes/lab/counterfactual/+page.svelte` (W-0383)
- `app/src/routes/patterns/formula/+page.svelte`
- `app/src/routes/patterns/filter-drag/+page.svelte`

## Canonical Files

```
NEW:
  engine/research/program.md
  engine/research/orchestrator.py
  engine/research/ratchet.py
  engine/research/rules/active.yaml
  engine/research/proposer/__init__.py
  engine/research/proposer/llm_proposer.py        (8-track asyncio.gather)
  engine/research/proposer/gp_proposer.py         (DEAP)
  engine/research/proposer/grid_proposer.py       (Optuna TPE)
  engine/research/ensemble/single.py
  engine/research/ensemble/parallel_vote.py
  engine/research/ensemble/rank_fusion.py
  engine/research/ensemble/moe_regime.py
  engine/research/ensemble/judge_arbitrate.py
  engine/research/ensemble/role_pipeline.py
  engine/research/ensemble/tournament.py
  engine/research/ensemble/self_refine.py
  engine/research/ensemble/debate.py              (사용자 명시 의도)
  engine/research/ensemble/moa.py                 (Wang 2024 SOTA)
  engine/research/validation/pbo.py
  engine/data_cache/fetch_deribit_options.py
  engine/features/gex_pressure.py
  engine/research/regime/gamma_regime.py
  app/supabase/migrations/045_autoresearch_ledger.sql
  app/supabase/migrations/046_ensemble_rounds.sql
  app/src/routes/research/ledger/+page.svelte
  app/src/routes/research/battle/+page.svelte
  app/src/routes/research/ensemble/+page.svelte
  app/src/routes/research/diff/[cycle_id]/+page.svelte

REFACTOR:
  engine/research/autoresearch_loop.py            (orchestrator로 흡수)
  engine/llm/router.py                            (propose task + Gemma track 등록)
  app/src/routes/lab/counterfactual/+page.svelte  (배너 + cycle vertical lines)
```

## Assumptions

- DEAP 라이브러리 추가 가능 (GP용)
- Optuna 라이브러리 추가 가능 (TPE)
- Deribit API 무료 티어 OI/Greeks 접근 가능
- Ollama가 dev 환경에 설치 가능 (Gemma 3-27b 디스크 공간 ~16GB)
- Groq 12-key가 cycle당 24+ debate calls 흡수 가능
- 기존 1955+ 테스트가 깨지지 않도록 새 모듈은 augment-only

## Scope

### 포함 사항
- Orchestrator + Ratchet 자동화 (git commit/reset)
- Proposer 8-track LLM + GP + Optuna (L1)
- 6-Layer 정합성 게이트 (L2~L6)
- Ensemble 10종 전부 (single, parallel-vote, judge-arbitrate, debate, MoA, etc)
- Ledger 누적 및 UI 5페이지 (ledger, battle, ensemble, diff, counterfactual)
- Supabase migration 2개 (autoresearch_ledger, ensemble_rounds)

### 파일 기준
- 신규: engine/research/orchestrator.py, ratchet.py, proposer/, ensemble/, validation/pbo.py, rules/active.yaml, program.md, gex_pressure.py, fetch_deribit_options.py, migrations/045~046
- Refactor: engine/llm/router.py (propose task + Gemma track), app/src/routes/lab/counterfactual/+page.svelte (배너 + cycle lines)

### API 변화
- 신규 POST /api/research/run-cycle (body: {strategy, sandbox})
- 신규 GET /api/research/ledger (결과 조회)
- 신규 GET /api/research/ensemble/strategies (활성 전략 목록)

## Non-Goals

- Real-time live monitoring dashboard (background job만 지원)
- GPU 병렬화 (순차 L1~L6 OK, cycle당 6분)
- Automated deployment to production (main 진입은 사람 PR만)
- Copy trading (W-0380)
- Live strategy backtesting WebSocket (async polling OK)
- Multi-exchange orderbook orchestration (Spot+Perp 기본만)

## Decisions

### [D-001] 개별 CI vs 동시 다중 LLM
**선택**: 동시 (asyncio.gather) L1에서, 각각 독립적으로 fast-eval (L2)에 진입.
**사유**: 6분 budget 내 multi-model diversity 확보, cost control 가능 (비용 초과시 즉시 abort).
**거절 옵션**: 순차 실행 (latency 늘어남, 실시간 성 저하).

### [D-002] Ensemble strategy 선택 (운영)
**선택**: 기본=judge-arbitrate (cost 9×, quality 우수), 실험=multi-agent-debate (R=2), 벤치=MoA (주 1회).
**사유**: judge-arbitrate는 cost vs quality 최적화, debate는 diversity 최대, MoA는 SOTA 성능.
**거절 옵션**: 단일 strategy 고정 (다양성 부족).

### [D-003] Gamma 해석 (Layer 5)
**선택**: 3-겹침 (Gemma LLM track + Options GEX + Optuna gamma hyperparameter).
**사유**: 모두 통계적으로 독립적 신호, 성능 분리 추적 가능.

### [D-004] Ratchet git 격리
**선택**: autoresearch/cycle-{N} 브랜치 (main 진입 금지), 사람이 별도 PR로만 main 반영.
**사유**: 자동 commit 실패 or rollback 안전, 인간 작업과 충돌 회피.

### [D-005] PBO vs Walk-Forward only
**선택**: 둘 다 (L3 + L6 counterfactual).
**사유**: PBO는 backtest overfitting 탐지, Walk-Forward는 OOS drift 감지. 상호 보완.

## Open Questions

- [ ] [Q-001] Debate R-round termination: Jaccard ≥ 0.8 OR max R=2 중 어디서 cut? (비용 vs 수렴)
- [ ] [Q-002] Proposer 후보 상한: L1 max 100 vs soft cap? (메모리, 비용)
- [ ] [Q-003] Ledger 장기 보관: 1년 이상 데이터 쿼리 성능 영향? (partition by cycle_date?)
- [ ] [Q-004] Deribit options Greeks freshness: intraday resync 몇 시간마다? (API rate limit 고려)
- [ ] [Q-005] Manual override: 사람이 rejected cycle 재제출 가능? (audit trail)

## Next Steps

1. Phase 0 (PR-1): engine/research/rules/active.yaml + program.md 템플릿, PurgedKFold leakage test
2. Phase 1 (PR-2): orchestrator.py + ratchet.py (no proposer yet)
3. Phase 2 (PR-3): proposer 4종 (llm_proposer asyncio.gather, gp, grid)
4. Phase 3 (PR-4): ensemble 10종 (single부터 MoA까지)
5. Phase 4 (PR-5): pbo.py + gex_pressure.py + fetch_deribit_options.py
6. Phase 5 (PR-6): Supabase migrations 045~046 + schema changes
7. Phase 6 (PR-7): UI 5페이지 (ledger, battle, ensemble, diff, counterfactual 확장)
8. Sandbox mode (PR-8): AUTORESEARCH_SANDBOX_MODE env toggle, smoke test pass

## Exit Criteria

- [ ] AC1: pytest autoresearch tests 전부 PASS (50+ new tests)
- [ ] AC2: pnpm test:unit research/* 0 errors
- [ ] AC3: orchestrator 6분 budget 내 cycle 완료 (avg 4.2분)
- [ ] AC4: ensemble 10종 ledger에 누적, UI 5페이지 조회 가능
- [ ] AC5: git ratchet atomic (6 layer 모두 통과 or all 파기)
- [ ] AC6: Sandbox smoke test pass (AUTORESEARCH_SANDBOX_MODE=true)
- [ ] AC7: Contract CI green (CURRENT.md main SHA 업데이트)

## Handoff Checklist

- [ ] W-0379 파일 완성 + Issue #859 링크 확인
- [ ] 8 LLM track 모두 라우터에 등록 (engine/llm/router.py)
- [ ] rules/active.yaml + program.md 템플릿 frozen (에이전트 읽기 전용)
- [ ] Ledger schema (autoresearch_round + ensemble_round) migration 044-046 준비
- [ ] Phase 0~8 모두 PR 작성, CI green 확인
- [ ] Sandbox mode toggle working (env var + test 병렬)
- [ ] Team handoff 문서 (agent.md 또는 이 W-0379 자체)

---

## 1. CTO 관점 — 6-Layer 격벽 구조

```
L1 ENSEMBLE PROPOSER (8 LLM track + GP + Optuna grid, 60s budget)
  Tracks:
    A. deepseek/deepseek-chat               OSS, 코드 최강
    B. groq/llama-3.3-70b-versatile         300 tok/s
    C. cerebras/qwen-3-235b-a22b-instruct   2000 tok/s
    D. nvidia_nim/meta/llama-3.3-70b        무료 크레딧
    E. ollama/qwen2.5:32b                   로컬 $0
    F. huggingface/Qwen/Qwen2.5-72B         fallback
    G. anthropic/claude-haiku-4-5           reference (옵션 ON)
    H. ollama/gemma2:27b                    Google OSS, 다른 inductive bias 🆕
    + GP track (DEAP)
    + grid track (Optuna TPE — Gamma hyperparameter 흡수)

L2 FAST-EVAL (60s)
  • holdout 30일 mini-backtest
  • n_signals ≥ 30 / hit_rate / raw t-stat ≥ 1.96
  • 70-80% 후보 즉시 reject

L3 STATISTICAL GATE (90s) — 기존 인프라 재활용
  • PurgedKFold 5-fold (validation/cv.py ✅)
  • Walk-forward (validation/walkforward.py ✅)
  • Hierarchical BH-FDR (multiple_testing.py ✅)
  • Welch t-test (stats.py::welch_t_test ✅)
  • Deflated Sharpe (stats.py::deflated_sharpe ✅)
  • PBO < 0.5 (pbo.py 🆕)

L4 ROBUSTNESS (60s) — 기존 모듈
  • regime split bull/bear/side (regime.py ✅)
  • decay test (decay.py ✅)
  • costs slippage+fees (costs.py ✅)
  • triple-barrier labels (labels.py ✅)
  • ablation per-feature (ablation.py ✅)

L5 GAMMA / OPTIONS REGIME (45s) — NEW (Gamma 해석 c2)
  • GEX (Gamma Exposure) 부호별 성적 분리
  • Deribit/OKX 옵션 OI 가중치
  • 만기일 ±2일 윈도우 isolation test

L6 COUNTERFACTUAL (45s) — W-0382/0383 활용
  • blocked_candidate_store ✅
  • filtered_winners 손실 ≤ 0.5 × executed gain
  • /lab/counterfactual UI 시각화 ✅

총 budget = 60+60+90+60+45+45 = 360s = 6분
                ↓
        RATCHET (atomic, all-or-nothing)
   ✅ 6 layer 모두 통과 + DSR_after > DSR_before + 0.05
       → git commit on autoresearch/cycle-{N}
       → ledger row INSERT
   ❌ 한 축이라도 실패
       → git reset --hard
       → ledger row INSERT with reject_reason
```

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 6분 budget 초과 → ratchet 미실행 | 중 | 중 | L1에서 max 100 candidates, L2에서 70% 컷 |
| LLM proposer 편향 (설명 가능 패턴만) | 고 | 중 | GP + grid 병행, ledger에서 track별 hit rate 추적 |
| Multiple testing m 정의 모호 | 중 | 고 | m = 누적 lifetime trial 수 (Bailey-LdP 정확) |
| Purged CPCV embargo 부족 | 중 | 고 | embargo = max(label_horizon, 0.005×N) 강제 |
| Git ratchet 인간 작업과 충돌 | 중 | 중 | 별도 브랜치 `autoresearch/cycle-*`, main 진입은 사람 PR만 |
| 자동 commit이 cost 폭발 | 저 | 중 | per-cycle cap $0.50, 초과시 즉시 abort |
| OSS 모델 JSON schema 위반 | 중 | 고 | LiteLLM `response_format` 강제 + Pydantic validate, 1회 재시도 후 폐기 |
| Debate R-round latency | 중 | 중 | Jaccard ≥ 0.8 시 조기 종료, max R=2 |

### Dependencies

- 선행: 없음 (모든 기반 모듈 존재)
- 선택: W-0361 cloud pipeline (CLOSED) — 클라우드 실행 옵션
- 차단: 없음

### Rollback

`ratchet.py`가 모든 commit을 별도 브랜치 `autoresearch/cycle-{N}`에 한정.
main 진입은 사람이 별도 PR로만. 자동 루프 자체를 sandbox toggle로 끄고/켜기만 하면 됨.

---

## 2. AI Researcher 관점 — Statistical Validation

### 임계치 표 (논문 기반)

| Test | 임계치 | 레퍼런스 | 우리 구현 |
|---|---|---|---|
| Min sample size | n ≥ 30 (CLT) | 표준 | `GATE_MIN_SIGNALS=5` ⚠️ → 30으로 상향 |
| Raw t-stat (one-sided) | t ≥ 1.96 | 표준 | `GATE_MIN_T_STAT=1.0` ⚠️ → 1.96 |
| Multiple-test adjusted | t ≥ 3.0 OR BH-FDR q < 0.05 | Harvey-Liu-Zhu 2014 | ✅ alpha_quality.py |
| Deflated Sharpe Ratio | DSR > 0 + ε(0.05) | Bailey-LdP 2014 | ✅ validation/stats.py |
| PBO | PBO < 0.5 | Bailey et al 2016 | ❌ 신규 pbo.py |
| Purged CPCV | embargo ≥ label horizon | LdP 2018 Ch.7 | ✅ cv.py |
| Triple-barrier label | TP/SL/timeout 동시 | LdP 2018 Ch.3 | ✅ labels.py |
| Regime stability | K-1/K folds 양수 across regimes | 표준 | ✅ regime.py |
| Strategy decay half-life | t½ > 6개월 | LdP 2018 Ch.13 | ✅ decay.py |
| 거래비용 포함 | slippage + fees | Cont 2001 | ✅ costs.py |

### Failure Modes

1. **P-hacking via L1 다양성** — GP가 100k 후보 생성 → BH-FDR로도 못 거를 수 있음.
   완화: m을 누적 lifetime trial 수로 잡음 (Bailey-LdP 2014 정확 정의).
2. **Look-ahead in proposer** — LLM이 미래 캔들 보고 룰 제안.
   완화: proposer 입력 데이터 hard-cap (cycle 시작 시점 frozen snapshot).
3. **Survivorship bias** — 상장 폐지 코인 미포함.
   완화: data_hygiene.py 검증, 누락시 PBO 패널티.
4. **Regime overfit** — bull market 데이터로만 핏.
   완화: regime.py 강제 — 모든 3 regime에서 통과 요구.
5. **Cost cap evasion** — debate가 R rounds 길어지며 cap 초과.
   완화: pre-flight cost estimation, 초과 예측 시 R 자동 축소.

### Numerical Convention (전 모듈 통일)

- 수익률 단위: log return (LdP 권장 — additivity)
- annualization: 365일 (crypto 24/7), NOT 252
- t-stat: two-sided report, one-sided gate
- DSR n_trials: ledger lifetime cumulative (frozen at cycle start)

---

## 3. Multi-Model Ensemble — 10 Strategy 카탈로그

### Group A — Parallel (cost 1×, latency 1×)

| # | Strategy | 메커니즘 | 출처 |
|---|---|---|---|
| 1 | **single** | 1 모델 (baseline) | — |
| 2 | **parallel-vote** | N 모델 병렬 → weighted majority vote | Bagging Breiman 1996 |
| 3 | **rank-fusion** | N 모델 top-K → Reciprocal Rank Fusion | Cormack 2009 |
| 4 | **MoE-regime** | regime별 다른 모델 (bull→A, bear→B) | Mixture of Experts |

### Group B — Hierarchical (cost 2-3×, latency 2-3×)

| # | Strategy | 메커니즘 | 출처 |
|---|---|---|---|
| 5 | **judge-arbitrate** | N propose + 1 judge selects | Zheng et al 2023 (LLM-as-Judge) |
| 6 | **role-pipeline** | Ideator → Critic → Polisher (3-stage) | CAMEL Li 2023 |
| 7 | **tournament** | pairwise bracket 8→4→2→1 | swiss/단판 |

### Group C — Iterative (cost 변동, latency 큼)

| # | Strategy | 메커니즘 | 출처 |
|---|---|---|---|
| 8 | **sequential-refine** | A propose → A self-critique → A revise | Madaan et al 2023 (Self-Refine) |
| 9 | **multi-agent-debate** | N agents R rounds 토론 → 합의 (사용자 명시 의도) | Du et al 2023 |
| 10 | **MoA** | Layer 1 N agents → Aggregator → Layer 2 (Wang 2024 SOTA) | Wang et al 2024 |

### 비교 매트릭스

| # | Strategy | Cost | Latency | Diversity | "토론" | "순차" | "우수선택" |
|---|---|---|---|---|---|---|---|
| 1 | single | 1× | 1× | 0 | × | × | × |
| 2 | parallel-vote | 8× | 1× | ★★★ | × | × | × |
| 3 | rank-fusion | 8× | 1× | ★★★ | × | × | × |
| 4 | MoE-regime | 1-3× | 1× | ★★ | × | × | × |
| 5 | judge-arbitrate | 8+1× | 2× | ★★★ | × | × | ✓ |
| 6 | role-pipeline | 3× | 3× | ★★ | × | ✓ | ✓ |
| 7 | tournament | 15× | 4× | ★★★ | × | × | ✓ |
| 8 | sequential-refine | 3× | 3× | ★ | × | ✓ | × |
| 9 | **multi-agent-debate** | 24× | 4× | ★★★★★ | ✓ | ✓ | ✓ |
| 10 | MoA | 16-24× | 3× | ★★★★★ | × | ✓ | × |

### 운영 결정

- Production default: **judge-arbitrate** (cost 대비 quality 최적)
- Sandbox 실험: **multi-agent-debate** (R=2)
- Weekend benchmark: **MoA** (CRON, 주 1회)

---

## 4. UI/UX — 5 페이지 설계

### Page 1 — `/research/ledger` (NEW)

DSR step-function trajectory + 최근 cycle 리스트 + run cycle 버튼.

### Page 2 — `/research/battle` (NEW) — 단일 8-track 비교

5종 시각화:
1. 시계열 라인차트 (track별 누적 commit)
2. 8축 막대그래프 (commit_rate / pass_rate / Δ DSR / cost / latency / json_fail / diversity)
3. Cost vs ΔDSR 산점도 (점=track, 크기=commit 수, Pareto frontier 표시)
4. 정렬 가능 수치 테이블
5. track × Layer 통과율 히트맵

### Page 3 — `/research/ensemble` (NEW) — 10 strategy 비교 (분리)

```
[Group A Parallel] [Group B Hierarchical] [Group C Iterative]

① 시계열 라인차트 (10 라인, 그룹별 색상)
② 매트릭스 테이블 (10 row, 정렬 가능)
③ Cost vs ΔDSR 산점도 (10 점, Pareto frontier)
④ Strategy 상세 expandable (debate Round-by-round 합의 추이 등)
⑤ 10×10 pairwise Welch t-test 매트릭스
⑥ Cycle budget 잔여 표시
```

### Page 4 — `/research/diff/[cycle_id]` (NEW)

1 cycle drill-down: 후보 yaml diff + 6 layer pass/fail + cost/latency + Promote 버튼.

### Page 5 — `/lab/counterfactual` 확장

기존 W-0383에 배너(현재 active rule = cycle #N) + cycle commit vertical lines 추가.

---

## 5. DB 스키마

### Migration 045 — `autoresearch_ledger`

```sql
CREATE TABLE autoresearch_ledger (
  cycle_id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('committed','rejected','error')),
  reject_reason TEXT,
  commit_sha TEXT,
  branch TEXT,
  proposer_track TEXT NOT NULL,
  proposer_model TEXT,
  ensemble_strategy TEXT NOT NULL CHECK (ensemble_strategy IN (
    'single','parallel-vote','rank-fusion','moe-regime',
    'judge-arbitrate','role-pipeline','tournament',
    'self-refine','debate','moa'
  )),
  rules_before_yaml TEXT,
  rules_after_yaml TEXT,
  diff_summary TEXT,
  dsr_before NUMERIC,
  dsr_after NUMERIC,
  dsr_delta NUMERIC,
  pbo NUMERIC,
  sharpe_before NUMERIC,
  sharpe_after NUMERIC,
  l2_passed BOOLEAN,
  l3_passed BOOLEAN,
  l4_passed BOOLEAN,
  l5_passed BOOLEAN,
  l6_passed BOOLEAN,
  cost_usd NUMERIC,
  latency_sec NUMERIC,
  budget_overrun BOOLEAN DEFAULT false,
  n_trials_used INTEGER,
  candidates_proposed INTEGER,
  candidates_after_l2 INTEGER,
  notes JSONB
);

CREATE INDEX idx_ledger_track ON autoresearch_ledger(proposer_track, ts);
CREATE INDEX idx_ledger_status ON autoresearch_ledger(status, ts);
CREATE INDEX idx_ledger_strategy ON autoresearch_ledger(ensemble_strategy, ts);
```

### Migration 046 — `autoresearch_ensemble_rounds` (debate/MoA 추적)

```sql
CREATE TABLE autoresearch_ensemble_rounds (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT REFERENCES autoresearch_ledger(cycle_id),
  strategy TEXT NOT NULL,
  round_idx INT NOT NULL,
  agent_track TEXT,
  proposal_yaml TEXT,
  convergence_score NUMERIC,
  cost_usd NUMERIC,
  latency_ms INT
);
```

---

## 6. Decisions (확정 16개)

- **[D-W0379-01]** OpenClaw 미채택, 자체 Python orchestrator. (validation 스택 우월, lock-in 회피)
- **[D-W0379-02]** Proposer = LLM 8-track + GP + Optuna grid 병렬. 단일 LLM 아님.
- **[D-W0379-03]** 수정 대상 = `engine/research/rules/active.yaml` 한정. 코드 직접 수정 금지.
- **[D-W0379-04]** 6-Layer 격벽, 한 축 실패 = 전체 reject. weighted score 미채택.
- **[D-W0379-05]** DSR n_trials = ledger lifetime cumulative.
- **[D-W0379-06]** Annualization=365 (crypto 24/7), 수익률 단위=log return.
- **[D-W0379-07]** Default proposer track = DeepSeek-V3. **Gemma 3-27b 8번째 track 항상 ON**.
- **[D-W0379-08]** Cycle budget 6분, cost cap $0.50.
- **[D-W0379-09]** main 자동 진입 금지 — `autoresearch/cycle-*` 브랜치 후 사람 PR만.
- **[D-W0379-10]** Gamma 해석 = 셋 다 (Gemma track + Options GEX Layer5 + Optuna TPE).
- **[D-W0379-11]** UI 5 페이지 — Battle와 Ensemble 분리. 차트 ⊕ 수치 테이블 동시.
- **[D-W0379-12]** Ensemble = 10 strategy (Group A 4 + B 3 + C 3). 직교성 우선.
- **[D-W0379-13]** Production default ensemble = `judge-arbitrate`.
- **[D-W0379-14]** Sandbox 실험 = `multi-agent-debate` (R=2).
- **[D-W0379-15]** MoA는 weekend benchmark CRON only.
- **[D-W0379-16]** Tournament·debate cycle budget 8분 별도 toggle.

### v4 확정 (사용자 답변 기반)

- **Q-Gemma default**: `ollama/gemma2:27b` (로컬 $0)
- **Q-debate rounds**: R=2 (cost $0.20, Jaccard ≥0.8 조기종료)
- **Q-judge model**: `groq/llama-3.3-70b-versatile`

---

## 7. Open Questions

- [ ] [Q-W0379-01] Anthropic Claude를 reference track으로 ledger에 항상 포함시킬지? (cost 부담 vs benchmark)
- [ ] [Q-W0379-02] Sandbox 모드 default = ON. Production CRON 진입은 별도 toggle?
- [ ] [Q-W0379-03] GP 변이 연산자: tree crossover only vs subtree mutation 추가?
- [ ] [Q-W0379-04] rules/active.yaml 외 LLM이 만질 수 있는 파일 추가 후보? (pattern_object_combos.py 등)
- [ ] [Q-W0379-05] Battle/Ensemble 페이지 차트 라이브러리? `app/src/lib/charts/` 확인 필요
- [ ] [Q-W0379-06] MoE switching cost 페널티 어떻게 계산? (regime 전환 빈도 × proposer 비용)
- [ ] [Q-W0379-07] Role-pipeline stage별 모델 매핑 고정 vs 학습?
- [ ] [Q-W0379-08] Tournament single elim vs swiss?

---

## 8. Implementation Plan (26 days, 7 phases)

### Phase 0 — 인프라 검증 (1d)
- [ ] `validation/cv.py::PurgedKFold` leakage 0건 단위 테스트 추가
- [ ] `validation/stats.py::deflated_sharpe` Bailey-LdP 2014 Table 1 재현
- [ ] `engine/research/rules/active.yaml` 신규 — 현행 게이트 임계값 추출
- [ ] `engine/research/program.md` 헌법 작성

### Phase 1 — 통계 갭 (PBO) (2d)
- [ ] `validation/pbo.py` 신규 (Bailey et al 2016 + Table 2 재현 테스트)
- [ ] CSCV split helper
- [ ] DSR n_trials 정의 통일 (lifetime cumulative)

### Phase 2 — Orchestrator + Ratchet (3d)
- [ ] `engine/research/orchestrator.py` 6-Layer 진입점
- [ ] `engine/research/ratchet.py` git 자동화
- [ ] migration 045/046
- [ ] `autoresearch_loop.py` → orchestrator 흡수 (deprecate)

### Phase 3 — Proposers 8-track + GP + Optuna (6d)
- [ ] `proposer/grid_proposer.py` Optuna TPE
- [ ] `proposer/llm_proposer.py` 8-track asyncio.gather (Gemma 포함)
- [ ] `proposer/gp_proposer.py` DEAP
- [ ] `engine/llm/router.py` propose task 추가 + Gemma 라우팅
- [ ] JSON schema + Pydantic 강제 + 1-retry-then-discard

### Phase 4 — Layer 5 Gamma/Options (3d)
- [ ] `engine/data_cache/fetch_deribit_options.py`
- [ ] `engine/features/gex_pressure.py`
- [ ] `engine/research/regime/gamma_regime.py`
- [ ] 만기일 ±2일 isolation test

### Phase 5 — UI 5 페이지 (6d)
- [ ] `/research/ledger` Sharpe trajectory + cycle 리스트
- [ ] `/research/battle` 8-track 5종 시각화 (시계열·막대·산점·테이블·히트맵)
- [ ] `/research/ensemble` 10 strategy 6종 시각화 (시계열·테이블·산점·detail·t-test 매트릭스·budget)
- [ ] `/research/diff/[cycle_id]` drill-down + Promote 버튼
- [ ] `/lab/counterfactual` 확장 (배너 + cycle vertical lines)

### Phase 6 — Ensemble Group A (Parallel) (2d)
- [ ] single, parallel-vote, rank-fusion, MoE-regime

### Phase 6.5 — Ensemble Group B (Hierarchical) (2d)
- [ ] judge-arbitrate (judge=groq-llama 확정), role-pipeline, tournament

### Phase 6.6 — Ensemble Group C (Iterative) (3d)
- [ ] self-refine, multi-agent-debate (R=2), MoA

**총 26일 = 약 5주 (1 dev). 병렬 작업 가능 시 3-4주.**

---

## 9. Exit Criteria

- [ ] **AC1** 1 cycle wall-clock ≤ 6분 (workers=8, 8 LLM tracks 병렬, 100 candidates)
- [ ] **AC2** 모든 임계치 일치 (n≥30, t≥1.96, BH-FDR q<0.05, DSR>0+ε, PBO<0.5, regime 3/3 양수)
- [ ] **AC3** PBO 단위 테스트 — Bailey et al 2016 Table 2 재현, 오차 ≤5%
- [ ] **AC4** PurgedKFold leakage 0건 — embargo = max(label_horizon, 0.005×N)
- [ ] **AC5** 8 LLM track 모두 ledger에 분리 기록, JSON 위반 시 폐기 후 cost 미과금
- [ ] **AC6** ratchet은 main 직접 commit 금지 — `autoresearch/cycle-*` 브랜치만
- [ ] **AC7** cost cap $0.50/cycle 강제, 초과 시 즉시 abort
- [ ] **AC8** GEX± 양 regime 모두 통과해야 commit
- [ ] **AC9** 5 UI 페이지 모두 ≤2초 first paint
- [ ] **AC10** Battle page에서 8 track + Ensemble page에서 10 strategy 시각화
- [ ] **AC11** 30일 sandbox 운영 후 commit율이 grid baseline보다 통계적으로 유의 (Welch t)
- [ ] **AC12** 회귀 — 기존 1955+ 테스트 PASS
- [ ] **AC13** CI green + CURRENT.md SHA 갱신
- [ ] **AC14** Ensemble page에서 10 strategy 시계열·테이블·t-test 매트릭스 동시
- [ ] **AC15** Gemma track default ON, ledger의 `proposer_track` enum 포함, diversity entropy +10% 향상
- [ ] **AC16** Debate Jaccard ≥ 0.8 시 조기 종료, max R=2 강제
- [ ] **AC17** Role-pipeline stage별 cost/latency 분리 기록 (Critic bottleneck 확인 가능)
- [ ] **AC18** Tournament bracket UI — 8→4→2→1 시각화
- [ ] **AC19** MoA layer-by-layer aggregator 답안 ledger 저장 (재현 가능)
- [ ] **AC20** 10 strategy pairwise Welch t-test 매트릭스 페이지 노출

---

## 10. Next Steps

1. Phase 0 시작 — `validation/cv.py` PurgedKFold leakage 단위 테스트 추가
2. `engine/research/rules/active.yaml` 추출 후 사용자 검토
3. `engine/research/program.md` 초안 작성

## 11. Handoff Checklist

- [ ] Issue 생성 및 work_issue_map 등록
- [ ] CURRENT.md 활성 work item 테이블에 W-0379 추가
- [ ] PRIORITIES 갭 점검
- [ ] 의존 라이브러리 (DEAP, Optuna) 추가 검토 PR 별도

---

## 참고 (논문)

- Harvey, Liu, Zhu (2014) — *…and the Cross-Section of Expected Returns*
- López de Prado (2018) — *Advances in Financial Machine Learning* (purged CPCV, triple-barrier, meta-labeling)
- Bailey & López de Prado (2014) — *The Deflated Sharpe Ratio*
- Bailey, Borwein, López de Prado, Zhu (2016) — *The Probability of Backtest Overfitting*
- Chordia, Goyal, Saretto (2020) — *Anomalies and False Rejections*
- Cont (2001) — *Empirical Properties of Asset Returns*
- Welch (1947) — *The Generalization of "Student's" Problem when Several Different Population Variances Are Involved*
- Benjamini & Hochberg (1995) — *Controlling the False Discovery Rate*
- Yekutieli (2008) — *Hierarchical False Discovery Rate Controlling Procedure*
- Cormack et al (2009) — *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods*
- Zheng et al (2023) — *Judging LLM-as-a-Judge*
- Du et al (2023) — *Improving Factuality and Reasoning in Language Models through Multiagent Debate*
- Madaan et al (2023) — *Self-Refine: Iterative Refinement with Self-Feedback*
- Li et al (2023) — *CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society*
- Wang et al (2024) — *Mixture-of-Agents Enhances Large Language Model Capabilities*
- Karpathy (2026) — *autoresearch* GitHub
- Breiman (1996) — *Bagging Predictors*

---

## Appendix A — 설계 진화 이력 (v1 → v4)

- **v1 (제목 "5-Layer Quant Autoresearch")**: 5 layer 구조, single proposer track. OpenClaw 비교만.
- **v2 (전체 풀-디테일)**: 7 LLM track + GP + grid, Layer 추가, Gamma=Options GEX 해석. UI 4 페이지.
- **v3 (Gemma 추가)**: 8번째 track Gemma 추가. UI 5 페이지 (Battle/Ensemble 분리). Gamma 셋 다 채택 (Gemma+GEX+Optuna).
- **v4 (Ensemble 10종)**: Group A/B/C 분류로 ensemble 5→10 확장. multi-agent-debate, MoA, judge-arbitrate, role-pipeline, tournament, self-refine 추가.

---

# 📦 PART II — 다른 에이전트가 그대로 구현 가능한 풀-디테일 SPEC

## 12. Module-by-Module Specification

### 12.1 `engine/research/rules/active.yaml` (NEW)

에이전트가 만질 수 있는 **유일한** 파일. 모든 변경은 여기서만.

```yaml
# engine/research/rules/active.yaml
schema_version: 1
last_modified_at: "2026-05-02T00:00:00Z"
last_modified_by: "human"          # 'human' | 'autoresearch:cycle-{N}'
last_commit_sha: "initial"

filters:
  - name: vol_zscore_filter
    expr: "vol_zscore > 1.5"
    enabled: true
    rationale: "exclude low-volatility periods"
  - name: oi_change_24h_filter
    expr: "abs(oi_change_24h_zscore) > 1.0"
    enabled: true
    rationale: "require OI movement"
  - name: cvd_change_zscore
    expr: "abs(cvd_change_zscore) > 0.8"
    enabled: false
    rationale: "experimental"

thresholds:
  GATE_MIN_SIGNALS: 30          # was 5 in W-0303
  GATE_MIN_HIT_RATE: 0.50
  GATE_MIN_T_STAT: 1.96         # was 1.0
  GATE_MIN_SHARPE: 0.5          # was 0.3
  GATE_MAX_DRAWDOWN: 0.30
  PROMOTE_SHARPE: 0.7
  PROMOTE_DSR: 0.0              # +epsilon
  PROMOTE_DSR_DELTA: 0.05       # autoresearch only commits if Δ>0.05

regime_weights:
  bull: 1.0
  bear: 1.0
  sideways: 1.0
```

### 12.2 `engine/research/program.md` (NEW)

LLM proposer에게 매 cycle 주입되는 헌법.

```markdown
# AutoResearch Program — Constitution v1

## Identity
You are a quantitative researcher proposing changes to a trading rule set.
Your output will be statistically validated by a 6-layer gate before any
git commit. Failures roll back automatically — no human in the loop.

## You may modify
- File: `engine/research/rules/active.yaml`
- Sections allowed: `filters`, `thresholds`, `regime_weights`

## You MUST NOT modify
- engine/research/validation/**     (statistical primitives)
- engine/research/backtest.py
- engine/research/orchestrator.py
- ANY file outside engine/research/rules/

## Single Metric
delta = DSR_after - DSR_before
SUCCESS iff delta > 0.05 AND all 6 layers pass

## Budget per cycle
- Wall-clock: 360 seconds
- Cost: $0.50 USD
- Max candidates: 100

## Output Format (STRICT JSON)
{
  "proposals": [
    {
      "rationale": "one-sentence reason",
      "rules_after": { ... full active.yaml structure ... },
      "expected_dsr_delta": 0.07
    }
  ]
}

## Forbidden actions
- Do not ask for human help
- Do not write to any file other than rules/active.yaml
- Do not commit to main; only to autoresearch/cycle-{N} branch
- Do not look at future bars (look-ahead bias check enforced)

## Hint context (provided each cycle)
- last 30 days alpha_quality.aggregate() output
- top 5 worst-performing filters (Variable Evidence)
- cycle_id, lifetime n_trials count
```

### 12.3 `engine/research/orchestrator.py` (NEW, ~300 LOC)

```python
"""W-0379 — 6-Layer autoresearch orchestrator.

Single entry point. All ensemble strategies funnel through here.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from research.proposer.llm_proposer import LLMProposer
from research.proposer.gp_proposer import GPProposer
from research.proposer.grid_proposer import GridProposer
from research.ensemble import (
    SingleStrategy, ParallelVoteStrategy, RankFusionStrategy,
    MoERegimeStrategy, JudgeArbitrateStrategy, RolePipelineStrategy,
    TournamentStrategy, SelfRefineStrategy, DebateStrategy, MoAStrategy,
)
from research.ratchet import Ratchet
from research.validation.facade import run_layer2_through_layer6


EnsembleStrategy = Literal[
    "single", "parallel-vote", "rank-fusion", "moe-regime",
    "judge-arbitrate", "role-pipeline", "tournament",
    "self-refine", "debate", "moa",
]


@dataclass(frozen=True)
class CycleConfig:
    cycle_id: int
    strategy: EnsembleStrategy
    budget_seconds: int = 360
    cost_cap_usd: float = 0.50
    max_candidates: int = 100
    sandbox: bool = True
    debate_max_rounds: int = 2
    moa_n_layers: int = 2


@dataclass(frozen=True)
class CycleResult:
    cycle_id: int
    status: Literal["committed", "rejected", "error"]
    reject_reason: str | None
    commit_sha: str | None
    branch: str | None
    proposer_track: str | None
    ensemble_strategy: str
    dsr_before: float
    dsr_after: float | None
    dsr_delta: float | None
    pbo: float | None
    layer_results: dict[str, bool]
    cost_usd: float
    latency_sec: float
    candidates_proposed: int
    candidates_after_l2: int
    notes: dict


_STRATEGY_REGISTRY = {
    "single": SingleStrategy,
    "parallel-vote": ParallelVoteStrategy,
    "rank-fusion": RankFusionStrategy,
    "moe-regime": MoERegimeStrategy,
    "judge-arbitrate": JudgeArbitrateStrategy,
    "role-pipeline": RolePipelineStrategy,
    "tournament": TournamentStrategy,
    "self-refine": SelfRefineStrategy,
    "debate": DebateStrategy,
    "moa": MoAStrategy,
}


async def run_cycle(config: CycleConfig) -> CycleResult:
    """Run one full autoresearch cycle. Atomic — git or rollback."""
    t0 = datetime.now(timezone.utc)
    ratchet = Ratchet(cycle_id=config.cycle_id, sandbox=config.sandbox)

    try:
        ratchet.checkout_cycle_branch()
        rules_before = ratchet.read_rules()
        dsr_before = ratchet.measure_dsr_baseline()

        # L1: ensemble proposer
        strategy_cls = _STRATEGY_REGISTRY[config.strategy]
        strategy = strategy_cls(config=config)
        proposals = await asyncio.wait_for(
            strategy.propose(rules_before),
            timeout=120,
        )

        if not proposals:
            return ratchet.reject(reason="no-proposals", t0=t0)

        # L2-L6: validation gates (synchronous, ~240s budget)
        survived = run_layer2_through_layer6(
            proposals=proposals,
            rules_before=rules_before,
            cycle_id=config.cycle_id,
        )

        if not survived:
            return ratchet.reject(reason="all-gates-rejected", t0=t0)

        best = max(survived, key=lambda p: p.dsr_delta)
        if best.dsr_delta < 0.05:
            return ratchet.reject(reason="dsr-delta-too-small", t0=t0)

        # Atomic commit
        ratchet.write_rules(best.rules_after)
        commit_sha = ratchet.commit(diff_summary=best.diff_summary)
        return ratchet.success(best=best, commit_sha=commit_sha, t0=t0)

    except asyncio.TimeoutError:
        return ratchet.reject(reason="timeout", t0=t0)
    except Exception as exc:
        return ratchet.error(exception=exc, t0=t0)
```

### 12.4 `engine/research/ratchet.py` (NEW, ~250 LOC)

```python
"""Git ratchet — autoresearch only commits forward."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
import yaml

_RULES_PATH = Path("engine/research/rules/active.yaml")
_AUTORESEARCH_BRANCH_PREFIX = "autoresearch/cycle-"


class Ratchet:
    def __init__(self, cycle_id: int, sandbox: bool = True) -> None:
        self.cycle_id = cycle_id
        self.sandbox = sandbox
        self.branch = f"{_AUTORESEARCH_BRANCH_PREFIX}{cycle_id}"

    def checkout_cycle_branch(self) -> None:
        """Create autoresearch/cycle-N from current main."""
        subprocess.run(["git", "checkout", "-b", self.branch], check=True)

    def read_rules(self) -> dict:
        with _RULES_PATH.open() as f:
            return yaml.safe_load(f)

    def write_rules(self, new_rules: dict) -> None:
        with _RULES_PATH.open("w") as f:
            yaml.safe_dump(new_rules, f, sort_keys=False)

    def measure_dsr_baseline(self) -> float:
        """Run holdout backtest with current rules → DSR."""
        from research.validation.facade import compute_dsr_holdout
        return compute_dsr_holdout(self.read_rules())

    def commit(self, diff_summary: str) -> str:
        msg = f"autoresearch cycle {self.cycle_id}: {diff_summary}"
        subprocess.run(["git", "add", str(_RULES_PATH)], check=True)
        subprocess.run(["git", "commit", "-m", msg], check=True)
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return sha

    def reset(self) -> None:
        subprocess.run(["git", "reset", "--hard", "HEAD~0"], check=True)
        # Switch back to main
        subprocess.run(["git", "checkout", "main"], check=True)
        subprocess.run(["git", "branch", "-D", self.branch], check=True)

    def success(self, best, commit_sha: str, t0) -> "CycleResult":
        ...  # ledger.insert + return CycleResult(status="committed", ...)

    def reject(self, reason: str, t0) -> "CycleResult":
        self.reset()
        ...  # ledger.insert + return CycleResult(status="rejected", reject_reason=reason)

    def error(self, exception: Exception, t0) -> "CycleResult":
        self.reset()
        ...  # ledger.insert + return CycleResult(status="error", reject_reason=str(exception))
```

### 12.5 `engine/research/proposer/llm_proposer.py` (NEW, ~400 LOC)

```python
"""LLM 8-track parallel proposer."""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

from llm.provider import call_text
from llm.cost_tracker import CostTracker
from research.proposer.schemas import ChangeProposal, ProposalBatch


PROPOSER_TRACKS: list[str] = [
    "deepseek/deepseek-chat",
    "groq/llama-3.3-70b-versatile",
    "cerebras/qwen-3-235b-a22b-instruct-2507",
    "nvidia_nim/meta/llama-3.3-70b-instruct",
    "ollama/qwen2.5:32b",
    "huggingface/Qwen/Qwen2.5-72B-Instruct",
    "ollama/gemma2:27b",                          # Gemma default (decided)
    "anthropic/claude-haiku-4-5-20251001",        # optional reference
]

_PROMPT_PATH = Path("engine/research/program.md")


@dataclass(frozen=True)
class LLMProposerConfig:
    tracks: list[str] = None
    k_per_track: int = 5                # candidates per track
    timeout_per_track: float = 60.0
    max_total_cost_usd: float = 0.30


class LLMProposer:
    def __init__(self, config: LLMProposerConfig | None = None) -> None:
        self.config = config or LLMProposerConfig(tracks=PROPOSER_TRACKS)
        self.tracker = CostTracker()

    async def propose_all_tracks(
        self, rules_before: dict, hint_context: str,
    ) -> list[ChangeProposal]:
        """Run all tracks in parallel, return merged candidates."""
        program = _PROMPT_PATH.read_text()
        system_prompt = self._build_system_prompt(program, rules_before)
        user_prompt = self._build_user_prompt(hint_context)

        tasks = [
            self._propose_one_track(track, system_prompt, user_prompt)
            for track in self.config.tracks
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_proposals: list[ChangeProposal] = []
        for track, result in zip(self.config.tracks, results):
            if isinstance(result, Exception):
                continue
            for prop in result:
                prop.proposer_track = track
                all_proposals.append(prop)

        return all_proposals

    async def _propose_one_track(
        self, track: str, system_prompt: str, user_prompt: str,
    ) -> list[ChangeProposal]:
        try:
            text = await asyncio.wait_for(
                call_text(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    tracker=self.tracker,
                    task="propose",
                    model=track,
                    timeout=self.config.timeout_per_track,
                ),
                timeout=self.config.timeout_per_track,
            )
            batch = ProposalBatch.parse_raw(self._extract_json(text))
            return batch.proposals
        except Exception:
            return []  # JSON 위반 → 폐기

    def _extract_json(self, text: str) -> str:
        """Strip code fences, find JSON block."""
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return text.strip()

    def _build_system_prompt(self, program: str, rules_before: dict) -> str:
        return f"""{program}

## Current rules (active.yaml)
```yaml
{yaml.safe_dump(rules_before, sort_keys=False)}
```
"""

    def _build_user_prompt(self, hint_context: str) -> str:
        return f"""Propose {self.config.k_per_track} variations of the rules
that you think will increase DSR. Output strict JSON per program.md.

## Hint context (last 30 days)
{hint_context}
"""
```

### 12.6 `engine/research/proposer/gp_proposer.py` (NEW, ~300 LOC)

DEAP 기반 genetic programming. formula tree representation.

```python
"""Genetic programming proposer using DEAP."""
from __future__ import annotations

from dataclasses import dataclass

from deap import base, creator, gp, tools


@dataclass(frozen=True)
class GPProposerConfig:
    population_size: int = 50
    n_generations: int = 5
    crossover_prob: float = 0.5
    mutation_prob: float = 0.2
    tournament_k: int = 3


class GPProposer:
    """Each individual = a filter rule expression tree.
    Fitness = DSR delta on holdout (computed by L2 fast-eval).
    """

    def __init__(self, config: GPProposerConfig | None = None) -> None:
        self.config = config or GPProposerConfig()
        self._setup_deap()

    def _setup_deap(self) -> None:
        # Primitives: arithmetic + comparisons + indicator names
        pset = gp.PrimitiveSet("MAIN", arity=0)
        for op in ["+", "-", "*", "/", ">", "<", "abs"]:
            pset.addPrimitive(...)
        for indicator in ["vol_zscore", "oi_change_24h_zscore",
                          "cvd_change_zscore", "bb_squeeze"]:
            pset.addTerminal(indicator)
        for const in [0.5, 1.0, 1.5, 2.0]:
            pset.addTerminal(const)

        creator.create("FitnessMax", base.Fitness, weights=(1.0,))
        creator.create("Individual", gp.PrimitiveTree,
                       fitness=creator.FitnessMax, pset=pset)

        self.toolbox = base.Toolbox()
        self.toolbox.register("expr", gp.genHalfAndHalf, pset=pset, min_=1, max_=3)
        self.toolbox.register("individual", tools.initIterate,
                              creator.Individual, self.toolbox.expr)
        self.toolbox.register("population", tools.initRepeat, list,
                              self.toolbox.individual)
        self.toolbox.register("mate", gp.cxOnePoint)
        self.toolbox.register("mutate", gp.mutUniform,
                              expr=self.toolbox.expr, pset=pset)
        self.toolbox.register("select", tools.selTournament,
                              tournsize=self.config.tournament_k)

    def propose(self, rules_before: dict, eval_fn) -> list:
        """Run GP and return top-k individuals as ChangeProposals."""
        ...
```

### 12.7 `engine/research/proposer/grid_proposer.py` (NEW, ~150 LOC)

Optuna TPE — Gamma hyperparameter 해석 흡수.

```python
"""Optuna TPE grid proposer (Gamma hyperparameter interpretation)."""
from __future__ import annotations

import optuna


class GridProposer:
    def __init__(self, n_trials: int = 30) -> None:
        self.n_trials = n_trials
        self.study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(
                gamma=lambda n: int(0.25 * n),  # ← Gamma = exploration param
                n_startup_trials=10,
            ),
        )

    def propose(self, rules_before: dict, eval_fn) -> list:
        """Optuna TPE sweep on threshold space → top-k proposals."""
        def objective(trial):
            new_rules = self._sample_thresholds(trial, rules_before)
            return eval_fn(new_rules)  # returns DSR

        self.study.optimize(objective, n_trials=self.n_trials)
        return self._top_k_to_proposals(rules_before, k=5)

    def _sample_thresholds(self, trial, rules_before):
        new_rules = copy.deepcopy(rules_before)
        for k in ["GATE_MIN_SHARPE", "GATE_MAX_DRAWDOWN", "PROMOTE_SHARPE"]:
            base_val = rules_before["thresholds"][k]
            new_rules["thresholds"][k] = trial.suggest_float(
                k, base_val * 0.5, base_val * 1.5
            )
        return new_rules
```

### 12.8 `engine/research/validation/pbo.py` (NEW, ~200 LOC)

Bailey et al 2016 PBO 정확 구현.

```python
"""Probability of Backtest Overfitting (Bailey, Borwein, López de Prado, Zhu 2016)."""
from __future__ import annotations

import numpy as np
from itertools import combinations


def compute_pbo(
    returns_matrix: np.ndarray,  # shape (T, N) — T bars × N strategies
    n_subsamples: int = 16,
) -> dict:
    """Combinatorially Symmetric Cross-Validation (CSCV) → PBO.

    Algorithm (Bailey et al 2016):
      1. Split T bars into n_subsamples equal blocks.
      2. For each binary partition (in_sample, out_of_sample) of size n/2:
         a. Find best strategy on IS by Sharpe.
         b. Compute IS-rank vs OOS-rank correlation.
      3. PBO = P(λ < 0) where λ = logit(IS-rank-of-best in OOS).

    Returns:
      {
        "pbo": float,                # 0-1, < 0.5 = good
        "lambda_mean": float,
        "lambda_std": float,
        "n_partitions": int,
      }
    """
    T, N = returns_matrix.shape
    block_size = T // n_subsamples
    blocks = [
        returns_matrix[i*block_size:(i+1)*block_size]
        for i in range(n_subsamples)
    ]

    half = n_subsamples // 2
    partitions = list(combinations(range(n_subsamples), half))

    lambdas = []
    for is_idx in partitions:
        oos_idx = [i for i in range(n_subsamples) if i not in is_idx]
        is_returns = np.concatenate([blocks[i] for i in is_idx])
        oos_returns = np.concatenate([blocks[i] for i in oos_idx])

        is_sharpes = _sharpe_per_strategy(is_returns)
        oos_sharpes = _sharpe_per_strategy(oos_returns)

        best_is = int(np.argmax(is_sharpes))
        oos_rank_of_best = (
            (oos_sharpes < oos_sharpes[best_is]).sum() / N
        )
        eps = 1e-9
        oos_rank_clipped = np.clip(oos_rank_of_best, eps, 1 - eps)
        lambda_val = np.log(oos_rank_clipped / (1 - oos_rank_clipped))
        lambdas.append(lambda_val)

    lambdas = np.array(lambdas)
    pbo = float((lambdas < 0).mean())

    return {
        "pbo": pbo,
        "lambda_mean": float(lambdas.mean()),
        "lambda_std": float(lambdas.std()),
        "n_partitions": len(partitions),
    }


def _sharpe_per_strategy(returns: np.ndarray) -> np.ndarray:
    mean = returns.mean(axis=0)
    std = returns.std(axis=0) + 1e-9
    return mean / std * np.sqrt(365)  # crypto annualization
```

---

## 13. Ensemble Strategy Pseudocode (10개 전부)

각 파일은 `engine/research/ensemble/` 하위. 공통 base class:

```python
# engine/research/ensemble/base.py
from abc import ABC, abstractmethod

class EnsembleStrategy(ABC):
    def __init__(self, config: CycleConfig) -> None:
        self.config = config

    @abstractmethod
    async def propose(self, rules_before: dict) -> list[ChangeProposal]:
        ...
```

### 13.1 `single.py` — Group A

```python
class SingleStrategy(EnsembleStrategy):
    DEFAULT_TRACK = "deepseek/deepseek-chat"

    async def propose(self, rules_before):
        prop = LLMProposer(LLMProposerConfig(
            tracks=[self.DEFAULT_TRACK], k_per_track=5,
        ))
        return await prop.propose_all_tracks(
            rules_before, hint_context=_hint(),
        )
```

### 13.2 `parallel_vote.py` — Group A

```python
class ParallelVoteStrategy(EnsembleStrategy):
    async def propose(self, rules_before):
        prop = LLMProposer()  # all 8 tracks
        candidates = await prop.propose_all_tracks(rules_before, _hint())

        # Group by canonical rule signature (sha256 of rules_after)
        from collections import Counter
        votes = Counter(c.signature() for c in candidates)

        # Weight: count × commit_rate_30d(track) × dsr_avg_30d(track)
        scored = []
        for c in candidates:
            weight = votes[c.signature()] * \
                     _track_commit_rate(c.proposer_track) * \
                     max(_track_dsr_avg(c.proposer_track), 0.01)
            c.score = weight
            scored.append(c)

        # Top-K unique
        seen = set()
        top = []
        for c in sorted(scored, key=lambda x: -x.score):
            if c.signature() not in seen:
                top.append(c)
                seen.add(c.signature())
            if len(top) >= 10:
                break
        return top
```

### 13.3 `rank_fusion.py` — Group A

```python
class RankFusionStrategy(EnsembleStrategy):
    """Reciprocal Rank Fusion (Cormack 2009)."""
    K = 60  # RRF constant

    async def propose(self, rules_before):
        prop = LLMProposer()
        candidates = await prop.propose_all_tracks(rules_before, _hint())

        # Each track ranks its own candidates by expected_dsr_delta
        per_track = {}
        for c in candidates:
            per_track.setdefault(c.proposer_track, []).append(c)
        for track in per_track:
            per_track[track].sort(key=lambda x: -x.expected_dsr_delta)

        # RRF score
        rrf = {}
        for track, ranked in per_track.items():
            for rank, c in enumerate(ranked, start=1):
                sig = c.signature()
                rrf[sig] = rrf.get(sig, 0.0) + 1.0 / (self.K + rank)
                rrf[sig + "_obj"] = c

        sorted_sigs = sorted(rrf, key=lambda s: -rrf[s])[:10]
        return [rrf[s + "_obj"] for s in sorted_sigs if not s.endswith("_obj")]
```

### 13.4 `moe_regime.py` — Group A

```python
class MoERegimeStrategy(EnsembleStrategy):
    """Regime-adaptive: route to different track per regime."""

    REGIME_TO_TRACK = {
        "bull": "deepseek/deepseek-chat",
        "bear": "ollama/gemma2:27b",
        "sideways": "groq/llama-3.3-70b-versatile",
    }

    async def propose(self, rules_before):
        from research.regime.detector import detect_current_regime
        current = detect_current_regime()  # 'bull' | 'bear' | 'sideways'
        track = self.REGIME_TO_TRACK[current]

        prop = LLMProposer(LLMProposerConfig(
            tracks=[track], k_per_track=10,
        ))
        return await prop.propose_all_tracks(rules_before, _hint())
```

### 13.5 `judge_arbitrate.py` — Group B (Production default)

```python
class JudgeArbitrateStrategy(EnsembleStrategy):
    """N propose + 1 judge selects (Zheng et al 2023)."""

    JUDGE_MODEL = "groq/llama-3.3-70b-versatile"  # decided

    async def propose(self, rules_before):
        prop = LLMProposer()
        candidates = await prop.propose_all_tracks(rules_before, _hint())
        if not candidates:
            return []

        judge_prompt = self._build_judge_prompt(candidates, rules_before)
        judge_response = await call_text(
            messages=[
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": judge_prompt},
            ],
            tracker=CostTracker(), task="judge", model=self.JUDGE_MODEL,
        )
        selected_idx = self._parse_judge_response(judge_response)
        return [candidates[selected_idx]] if selected_idx is not None else []

    def _build_judge_prompt(self, candidates, rules_before):
        rubric = """
Score each candidate 1-10 across:
  1. Theoretical soundness (no look-ahead)
  2. Simplicity (Occam's razor)
  3. Robustness across regimes
  4. Expected DSR improvement
Output JSON: {"selected_index": int, "reasoning": str, "scores": [...]}
"""
        candidates_text = "\n\n".join(
            f"### Candidate {i}\n{c.rationale}\n```yaml\n{yaml.safe_dump(c.rules_after)}\n```"
            for i, c in enumerate(candidates)
        )
        return f"{rubric}\n\nCurrent rules:\n```yaml\n{yaml.safe_dump(rules_before)}\n```\n\n{candidates_text}"
```

### 13.6 `role_pipeline.py` — Group B

```python
class RolePipelineStrategy(EnsembleStrategy):
    """Ideator → Critic → Polisher (3-stage)."""

    IDEATOR_MODEL = "deepseek/deepseek-chat"        # creative, code-strong
    CRITIC_MODEL = "anthropic/claude-haiku-4-5"     # analytical
    POLISHER_MODEL = "groq/llama-3.3-70b-versatile" # fast finish

    async def propose(self, rules_before):
        # Stage 1 — Ideator generates 5 raw candidates
        ideas = await self._stage_ideator(rules_before)
        if not ideas:
            return []

        # Stage 2 — Critic scores + identifies weaknesses
        scored = await self._stage_critic(ideas, rules_before)

        # Stage 3 — Polisher refines top-1 based on critic feedback
        best_idea, critic_feedback = scored[0]
        polished = await self._stage_polisher(best_idea, critic_feedback, rules_before)
        return [polished]
```

### 13.7 `tournament.py` — Group B

```python
class TournamentStrategy(EnsembleStrategy):
    """Single-elimination bracket: 8 → 4 → 2 → 1."""

    JUDGE_MODEL = "groq/llama-3.3-70b-versatile"

    async def propose(self, rules_before):
        prop = LLMProposer()
        candidates = await prop.propose_all_tracks(rules_before, _hint())
        if len(candidates) < 8:
            return candidates[:1]

        bracket = candidates[:8]
        round_results = []
        while len(bracket) > 1:
            next_round = []
            pairs = [(bracket[2*i], bracket[2*i+1]) for i in range(len(bracket)//2)]
            judgments = await asyncio.gather(*[
                self._judge_pair(a, b, rules_before) for a, b in pairs
            ])
            for (a, b), winner_idx in zip(pairs, judgments):
                next_round.append(a if winner_idx == 0 else b)
            round_results.append(next_round)
            bracket = next_round

        return bracket  # 1 winner

    async def _judge_pair(self, a, b, rules_before):
        prompt = f"""Compare two candidates. Output: {{"winner": 0 or 1}}
A: {a.rationale}
B: {b.rationale}
"""
        ...
```

### 13.8 `self_refine.py` — Group C

```python
class SelfRefineStrategy(EnsembleStrategy):
    """A propose → A critique self → A revise (Madaan 2023)."""

    MODEL = "deepseek/deepseek-chat"

    async def propose(self, rules_before):
        # Pass 1
        prop = LLMProposer(LLMProposerConfig(tracks=[self.MODEL], k_per_track=1))
        initial = (await prop.propose_all_tracks(rules_before, _hint()))[0]

        # Pass 2 — same model critiques own output
        critique = await self._self_critique(initial, rules_before)

        # Pass 3 — same model revises based on critique
        revised = await self._self_revise(initial, critique, rules_before)
        return [revised]
```

### 13.9 `debate.py` — Group C ★ (사용자 명시 의도)

```python
class DebateStrategy(EnsembleStrategy):
    """Multi-Agent Debate (Du et al 2023). N agents, R rounds."""

    MAX_ROUNDS = 2  # decided
    CONVERGENCE_JACCARD = 0.8

    async def propose(self, rules_before):
        prop = LLMProposer()
        # Round 0
        round_outputs = [await prop.propose_all_tracks(rules_before, _hint())]

        for r in range(1, self.MAX_ROUNDS):
            convergence = self._jaccard_similarity(round_outputs[-1])
            if convergence >= self.CONVERGENCE_JACCARD:
                break  # Early stop

            # Each agent sees ALL previous round outputs and revises
            new_outputs = await asyncio.gather(*[
                self._agent_revise(track, round_outputs[-1], rules_before)
                for track in PROPOSER_TRACKS
            ])
            round_outputs.append(new_outputs)
            self._log_round(r, new_outputs, convergence)

        # Final — majority vote
        final = round_outputs[-1]
        return self._majority_vote(final)

    async def _agent_revise(self, track, prev_round_outputs, rules_before):
        peer_text = self._format_peer_outputs(prev_round_outputs, exclude=track)
        prompt = f"""You proposed earlier. Other agents proposed:
{peer_text}

Considering peer arguments, REVISE your proposal. Output strict JSON.
"""
        ...

    def _jaccard_similarity(self, candidates):
        sigs = [c.signature() for c in candidates]
        from collections import Counter
        most_common, count = Counter(sigs).most_common(1)[0]
        return count / len(sigs)
```

### 13.10 `moa.py` — Group C (Wang 2024 SOTA)

```python
class MoAStrategy(EnsembleStrategy):
    """Mixture-of-Agents — layered proposers + aggregator (Wang 2024)."""

    AGGREGATOR_MODEL = "anthropic/claude-haiku-4-5-20251001"
    N_LAYERS = 2  # decided

    async def propose(self, rules_before):
        prop = LLMProposer()
        layer_input = rules_before
        aggregated_history = []

        for layer in range(self.N_LAYERS):
            # Layer N: all proposers run, see aggregator output from N-1
            if layer == 0:
                layer_outputs = await prop.propose_all_tracks(layer_input, _hint())
            else:
                # Inject aggregator output as part of hint
                layer_outputs = await self._layer_with_context(
                    rules_before, aggregated_history,
                )

            # Aggregate
            aggregated = await self._aggregator_synthesize(
                layer_outputs, rules_before,
            )
            aggregated_history.append(aggregated)

        return [aggregated_history[-1]]

    async def _aggregator_synthesize(self, layer_outputs, rules_before):
        prompt = f"""You are an aggregator. {len(layer_outputs)} proposers
suggested rule changes. Synthesize a SINGLE NEW proposal that combines
their best ideas — this is NOT a summary, it's a creative re-synthesis.

Proposals:
{self._format_proposals(layer_outputs)}

Current rules:
{yaml.safe_dump(rules_before)}

Output strict JSON per program.md.
"""
        ...
```

---

## 14. Pydantic Schemas

### 14.1 `engine/research/proposer/schemas.py`

```python
from pydantic import BaseModel, Field, validator
from typing import Optional


class FilterRule(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    expr: str = Field(..., min_length=1, max_length=256)
    enabled: bool = True
    rationale: Optional[str] = None


class Thresholds(BaseModel):
    GATE_MIN_SIGNALS: int = Field(ge=5, le=1000)
    GATE_MIN_HIT_RATE: float = Field(ge=0, le=1)
    GATE_MIN_T_STAT: float = Field(ge=0)
    GATE_MIN_SHARPE: float = Field(ge=-2, le=5)
    GATE_MAX_DRAWDOWN: float = Field(ge=0, le=1)
    PROMOTE_SHARPE: float
    PROMOTE_DSR: float
    PROMOTE_DSR_DELTA: float = Field(ge=0)


class RegimeWeights(BaseModel):
    bull: float = Field(ge=0, le=2)
    bear: float = Field(ge=0, le=2)
    sideways: float = Field(ge=0, le=2)


class ActiveRules(BaseModel):
    schema_version: int = 1
    last_modified_at: str
    last_modified_by: str
    last_commit_sha: str
    filters: list[FilterRule]
    thresholds: Thresholds
    regime_weights: RegimeWeights


class ChangeProposal(BaseModel):
    rationale: str = Field(..., min_length=10, max_length=500)
    rules_after: ActiveRules
    expected_dsr_delta: float = Field(ge=-1, le=1)

    proposer_track: Optional[str] = None
    score: Optional[float] = None
    dsr_delta: Optional[float] = None
    diff_summary: Optional[str] = None

    def signature(self) -> str:
        """Canonical hash of rules_after for deduplication."""
        import hashlib, json
        canonical = json.dumps(
            self.rules_after.dict(), sort_keys=True,
        )
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]


class ProposalBatch(BaseModel):
    proposals: list[ChangeProposal] = Field(..., min_items=1, max_items=20)
```

---

## 15. LLM Prompts (verbatim — 다른 에이전트가 그대로 복사 가능)

### 15.1 Proposer System Prompt

```
You are a quantitative researcher proposing changes to a trading rule set.
Your output is statistically validated by a 6-layer gate before any git commit.

## Identity
- Domain: cryptocurrency perpetual futures (BTC, ETH, SOL, etc.)
- Timeframes: 1h, 4h, 24h, 72h forward returns
- Indicators available: vol_zscore, oi_change_1h, oi_change_24h_zscore,
  cvd_change_zscore, bb_squeeze, fear_greed, sector_momentum, gex_pressure

## What you may modify (engine/research/rules/active.yaml)
- filters: list of {name, expr, enabled, rationale}
- thresholds: 8 numeric gates
- regime_weights: 3 regime weights

## Single Metric
delta = DSR_after - DSR_before
SUCCESS iff delta > 0.05 AND all 6 layers pass

## Constraints
- No look-ahead bias (do not reference future bars)
- No survivorship bias (universe includes delisted symbols)
- Each filter must be a deterministic Python expression on indicators
- Total filter count ≤ 10

## Output Format (STRICT — invalid JSON will be discarded)
{
  "proposals": [
    {
      "rationale": "<one sentence>",
      "rules_after": { /* full active.yaml */ },
      "expected_dsr_delta": 0.07
    }
  ]
}
```

### 15.2 Proposer User Prompt Template

```
Current rules:
```yaml
{rules_before_yaml}
```

## Hint context (last 30 days alpha_quality.aggregate)
{hint_context_json}

## Top 5 worst-performing filters (Variable Evidence)
{worst_filters_table}

Propose {k} variations of the rules that you think will increase DSR by
at least 0.05. Output strict JSON per system prompt.
```

### 15.3 Judge System Prompt

```
You are a senior quant judging trading rule proposals.

## Rubric (score each 1-10)
1. Theoretical soundness — no look-ahead, no survivorship bias
2. Simplicity — Occam's razor, fewer filters preferred
3. Robustness — should work across bull/bear/sideways regimes
4. Expected DSR improvement — realistic, not over-promised

## Output Format (STRICT JSON)
{
  "selected_index": <int — 0-indexed>,
  "scores": [
    {"index": 0, "soundness": 8, "simplicity": 7, "robustness": 6, "dsr": 8, "total": 29},
    ...
  ],
  "reasoning": "<2-3 sentences why selected>"
}
```

### 15.4 Critic System Prompt (Role-Pipeline Stage 2)

```
You are a critical reviewer. For each proposal, identify weaknesses:
- Look-ahead risk
- Overfitting risk (too many parameters)
- Regime brittleness
- Implementation complexity

## Output Format
{
  "proposals": [
    {
      "index": 0,
      "weaknesses": ["...", "..."],
      "score": 7,
      "fix_suggestion": "<one line>"
    }
  ]
}
```

### 15.5 Debate Round-N Prompt

```
You proposed in the previous round:
{your_previous_proposal}

Other agents proposed:
{peer_proposals}

Reflect on the peer arguments. You may:
- Maintain your proposal (if you still believe it's best)
- Revise toward a peer proposal
- Synthesize a new proposal combining strengths

Output strict JSON per system prompt — proposal + delta-from-previous explanation.
```

### 15.6 MoA Aggregator Prompt

```
You are an aggregator of {N} proposers. Synthesize a SINGLE NEW proposal
that combines their best ideas. This is NOT a summary — it should be a
new proposal that no individual agent suggested.

Proposers' outputs:
{numbered_proposals}

Current rules baseline:
{rules_before}

Output strict JSON: a single proposal, plus 1 sentence on what you took from each input.
```

---

## 16. UI Component Specification (Svelte)

### 16.1 `/research/ledger/+page.svelte` 컴포넌트 트리

```
+page.svelte
├── <LedgerHeader>          → 통계 (cycles, commits, reject, cost)
├── <DSRTrajectoryChart>    → 시계열 step function
└── <RecentCyclesTable>
    └── <CycleRow>          → cycle_id, status, ΔDSR, track, summary
```

### 16.2 `/research/battle/+page.svelte`

```
+page.svelte
├── <BattleHeader>             → period selector [7d|30d|90d|all]
├── <TimeSeriesLineChart>      → 8 라인, track별 cumulative commit
├── <EightAxisBarChart>        → commit_rate / pass_rate / ΔDSR / cost / latency / json_fail / diversity / lifetime
├── <CostQualityScatter>       → 산점도 + Pareto frontier
├── <TrackSortableTable>       → 정렬 가능 8 row
└── <LayerHeatmap>             → 8 × 5 히트맵 (track × Layer 통과율)
```

### 16.3 `/research/ensemble/+page.svelte`

```
+page.svelte
├── <GroupTabs>                 → [Group A] [Group B] [Group C] [All]
├── <EnsembleTimeSeriesChart>   → 10 라인, 그룹별 색
├── <EnsembleMatrixTable>       → 10 row 정렬가능
├── <CostQualityScatter>        → 10 점 + Pareto + Welch t-test
├── <StrategyDetailExpand>      → 펼침 시 debate convergence chart, MoA layer trace
├── <PairwiseTTestMatrix>       → 10×10 히트맵 p-value
└── <CycleBudgetGauge>          → 잔여 budget 표시
```

### 16.4 `/research/diff/[cycle_id]/+page.svelte`

```
+page.svelte
├── <CycleHeader>           → cycle_id, ts, proposer_track, cost
├── <YamlDiffViewer>        → before/after rules diff
├── <SixLayerResults>       → L2-L6 PASS/FAIL with sub-metrics
├── <CounterfactualEmbed>   → /lab/counterfactual subset
└── <ActionBar>             → [Promote to main] [Revert] [Open in Lab]
```

### 16.5 데이터 fetcher 예시

```typescript
// app/src/lib/api/autoresearch.ts
export async function fetchLedger(opts: {since: string, status?: string}) {
  const res = await fetch(`/api/research/ledger?since=${opts.since}&status=${opts.status ?? ''}`);
  return res.json() as Promise<LedgerRow[]>;
}

export async function fetchTrackBattle(period: '7d'|'30d'|'90d'|'all') {
  return (await fetch(`/api/research/battle?period=${period}`)).json();
}

export async function fetchEnsembleStrategies(period: string) {
  return (await fetch(`/api/research/ensemble?period=${period}`)).json();
}

export async function fetchCycleDiff(cycle_id: number) {
  return (await fetch(`/api/research/cycle/${cycle_id}`)).json();
}
```

---

## 17. API Endpoints (FastAPI)

### 17.1 Backend routes (`engine/api/routes/research.py` NEW)

```python
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/research", tags=["research"])


@router.get("/ledger")
async def get_ledger(
    since: str = Query("30d"),
    status: str | None = None,
    limit: int = 100,
):
    """Recent cycles with full metadata."""
    ...

@router.get("/battle")
async def get_battle(period: str = "30d"):
    """Per-track 8-axis metrics + time series."""
    ...

@router.get("/ensemble")
async def get_ensemble(period: str = "30d"):
    """Per-strategy metrics + pairwise t-test matrix."""
    ...

@router.get("/cycle/{cycle_id}")
async def get_cycle_detail(cycle_id: int):
    """Full drill-down: candidates, layer results, diff yaml."""
    ...

@router.post("/cycle/{cycle_id}/promote")
async def promote_cycle(cycle_id: int):
    """Promote autoresearch/cycle-N to main via PR creation."""
    ...

@router.post("/cycle/{cycle_id}/revert")
async def revert_cycle(cycle_id: int):
    """Revert a previously committed cycle."""
    ...
```

### 17.2 Request/Response models

```python
class LedgerRow(BaseModel):
    cycle_id: int
    ts: datetime
    status: Literal["committed", "rejected", "error"]
    proposer_track: str
    ensemble_strategy: str
    dsr_before: float | None
    dsr_after: float | None
    dsr_delta: float | None
    pbo: float | None
    cost_usd: float
    diff_summary: str | None
    layer_results: dict[str, bool]


class BattleResponse(BaseModel):
    period: str
    tracks: list[TrackMetrics]
    time_series: dict[str, list[TimeSeriesPoint]]


class TrackMetrics(BaseModel):
    track: str
    n_cycles: int
    commit_rate: float
    pass_rate: float
    avg_dsr_delta: float
    cost_per_cycle: float
    latency_p50_ms: float
    latency_p99_ms: float
    json_failure_rate: float
    proposal_diversity_entropy: float


class EnsembleResponse(BaseModel):
    period: str
    strategies: list[StrategyMetrics]
    time_series: dict[str, list[TimeSeriesPoint]]
    pairwise_ttest: list[list[float]]   # 10×10 p-values
```

---

## 18. Test Specification (AC → pytest 파일 매핑)

| AC | Test file | Test function | Mechanism |
|---|---|---|---|
| AC1 | `engine/tests/test_orchestrator_budget.py` | `test_cycle_under_360s` | 8-track 모킹 → asyncio time-mock |
| AC2 | `engine/tests/test_orchestrator_thresholds.py` | `test_thresholds_match_yaml` | active.yaml 로드 + assert |
| AC3 | `engine/research/validation/test_pbo.py` | `test_bailey_2016_table_2_reproduction` | Bailey paper Table 2 데이터로 재현 |
| AC4 | `engine/research/validation/test_cv.py` | `test_purged_kfold_zero_leakage` | label_horizon overlap 0건 |
| AC5 | `engine/tests/test_proposer_8track.py` | `test_invalid_json_discarded_no_cost` | mock 1 track → JSON 깨진 응답 |
| AC6 | `engine/tests/test_ratchet_branch_isolation.py` | `test_main_never_committed` | git log main → autoresearch 커밋 0건 |
| AC7 | `engine/tests/test_orchestrator_cost_cap.py` | `test_cost_cap_aborts_cycle` | mock cost 누적 |
| AC8 | `engine/tests/test_layer5_gex.py` | `test_gex_both_regimes_required` | GEX+/- 한 쪽만 통과시 reject |
| AC9 | `app/src/routes/research/*/+page.svelte.test.ts` | `test_first_paint_under_2s` | Playwright performance |
| AC10 | `app/src/routes/research/battle/+page.svelte.test.ts` | `test_8_tracks_rendered` | DOM assert |
| AC11 | `engine/tests/test_30day_sandbox_smoke.py` | `test_grid_baseline_welch_t` | 시뮬 30일 합성 데이터 |
| AC12 | `engine/tests/` 전체 | (회귀) | pytest -v |
| AC13 | CI workflow | `.github/workflows/contract.yml` | green check |
| AC14 | `app/src/routes/research/ensemble/+page.svelte.test.ts` | `test_10_strategies_with_ttest_matrix` | DOM + matrix |
| AC15 | `engine/tests/test_proposer_diversity.py` | `test_gemma_default_on_entropy_increase` | Shannon entropy diff |
| AC16 | `engine/tests/test_debate_jaccard_early_stop.py` | `test_jaccard_geq_0_8_terminates` | mock convergence |
| AC17 | `engine/tests/test_role_pipeline_stage_logging.py` | `test_each_stage_cost_latency_recorded` | ledger row inspect |
| AC18 | `app/src/routes/research/ensemble/+page.svelte.test.ts` | `test_tournament_bracket_8_4_2_1` | bracket DOM |
| AC19 | `engine/tests/test_moa_layer_persistence.py` | `test_aggregator_outputs_in_db` | ensemble_rounds row |
| AC20 | `engine/tests/test_pairwise_ttest_matrix.py` | `test_10x10_pvalues_computed` | numerical check |

### 18.1 테스트 데이터 fixtures

```python
# engine/tests/fixtures/autoresearch.py

@pytest.fixture
def mock_rules_before():
    return load_yaml("engine/research/rules/active.yaml.example")

@pytest.fixture
def mock_returns_matrix():
    """T=1000 bars × N=20 strategies, fixed random seed."""
    np.random.seed(42)
    return np.random.randn(1000, 20) * 0.01

@pytest.fixture
def mock_proposer_responses():
    """Pre-recorded LLM responses per track for deterministic tests."""
    return load_json("engine/tests/fixtures/proposer_responses_8track.json")
```

---

## 19. Phase-by-Phase PR Plan (26d → 8 PRs)

| PR # | Phase | Title | LOC est | Reviewer focus |
|---|---|---|---|---|
| **PR-1** | Phase 0 | rules/active.yaml + program.md + cv.py leakage tests | ~300 | infra, no behavior change |
| **PR-2** | Phase 1 | validation/pbo.py + Bailey 2016 reproduction tests | ~600 | numerical correctness |
| **PR-3** | Phase 2 | orchestrator.py + ratchet.py + migrations 045/046 | ~1200 | git safety, atomicity |
| **PR-4** | Phase 3 | proposer/{llm, gp, grid}_proposer.py + router.py propose task | ~1500 | async, JSON schema |
| **PR-5** | Phase 4 | data_cache/fetch_deribit_options + features/gex_pressure + L5 | ~1000 | data correctness |
| **PR-6** | Phase 5 | UI 5 pages + API routes/research.py | ~2500 | UX, charts |
| **PR-7** | Phase 6+6.5+6.6 | ensemble/* 10 strategies + tests | ~2500 | algorithm correctness |
| **PR-8** | Final | E2E sandbox dry-run + CURRENT.md update | ~200 | integration |

각 PR은 독립적으로 회귀 테스트 통과해야 함. Feature flag로 layer/strategy 점진 활성화.

---

## 20. Environment Variables / Configuration

### 20.1 신규 환경변수 (.env.example)

```bash
# === Autoresearch core ===
AUTORESEARCH_SANDBOX_MODE=true          # main commit 차단
AUTORESEARCH_CYCLE_BUDGET_SEC=360
AUTORESEARCH_COST_CAP_USD=0.50
AUTORESEARCH_MAX_CANDIDATES=100
AUTORESEARCH_DEFAULT_STRATEGY=judge-arbitrate

# === LLM proposer routing (W-0316 confirmed) ===
LLM_PROPOSE_MODEL=deepseek/deepseek-chat
LLM_JUDGE_MODEL=groq/llama-3.3-70b-versatile
LLM_PROPOSE_TRACKS=deepseek/deepseek-chat,groq/llama-3.3-70b-versatile,cerebras/qwen-3-235b-a22b-instruct-2507,nvidia_nim/meta/llama-3.3-70b-instruct,ollama/qwen2.5:32b,huggingface/Qwen/Qwen2.5-72B-Instruct,ollama/gemma2:27b,anthropic/claude-haiku-4-5-20251001

# === Ensemble strategy params ===
ENSEMBLE_DEBATE_MAX_ROUNDS=2
ENSEMBLE_DEBATE_CONVERGENCE_JACCARD=0.8
ENSEMBLE_MOA_N_LAYERS=2
ENSEMBLE_MOA_AGGREGATOR_MODEL=anthropic/claude-haiku-4-5-20251001
ENSEMBLE_TOURNAMENT_MAX_BRACKET=8
ENSEMBLE_ROLE_IDEATOR=deepseek/deepseek-chat
ENSEMBLE_ROLE_CRITIC=anthropic/claude-haiku-4-5-20251001
ENSEMBLE_ROLE_POLISHER=groq/llama-3.3-70b-versatile

# === Layer 5 GEX ===
DERIBIT_API_BASE=https://www.deribit.com/api/v2
DERIBIT_API_KEY=                         # public OI is free, optional
GEX_EXPIRY_WINDOW_DAYS=2

# === Multi-key rotations (existing) ===
GROQ_API_KEYS=key1,key2,...,key12
NVIDIA_API_KEY=...
HF_TOKEN=...
CEREBRAS_API_KEY=...
OLLAMA_HOST=http://localhost:11434
```

### 20.2 신규 의존성 (`engine/pyproject.toml`)

```toml
[project]
dependencies = [
    # existing
    "anthropic>=0.25",
    "litellm>=1.40.0",
    # new
    "deap>=1.4.0",          # Genetic Programming
    "optuna>=3.5.0",        # TPE hyperparameter sweep
    "PyYAML>=6.0.1",        # rules/active.yaml
    "pydantic>=2.5",        # schemas
]
```

### 20.3 신규 supabase 함수 (server-side aggregations)

```sql
-- pairwise t-test for ensemble strategies
CREATE OR REPLACE FUNCTION research_pairwise_ttest(
    period_days int DEFAULT 30
) RETURNS TABLE(
    strategy_a TEXT, strategy_b TEXT, p_value NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    -- For each pair, fetch dsr_delta arrays, compute Welch t-test in plpython
    ...
END $$;
```

---

## 21. Acceptance Smoke Test (final hand-off)

다른 에이전트가 이 spec으로 구현 완료 후 **이 한 줄로 검증**:

```bash
# Phase 0~6 전부 끝난 후 단일 커맨드
pytest engine/tests/ -v -k "autoresearch" \
  && cd app && pnpm test:unit -- research \
  && cd .. && AUTORESEARCH_SANDBOX_MODE=true \
     python -c "
import asyncio
from engine.research.orchestrator import run_cycle, CycleConfig
result = asyncio.run(run_cycle(CycleConfig(
    cycle_id=999, strategy='judge-arbitrate', sandbox=True,
)))
print(result)
assert result.status in ('committed', 'rejected', 'error')
"
```

이게 통과하면 spec 충족.
