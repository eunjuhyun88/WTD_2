"""
Cogochi AutoResearch Service
Hill Climbing 루프 + ORPO 파인튜닝 트리거 + 버전 승격
2026-03-31
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import random
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

ADAPTERS_DIR = Path.home() / ".cache" / "cogochi_autoresearch" / "adapters"
PAIRS_DIR    = Path.home() / ".cache" / "cogochi_autoresearch" / "pairs"
ADAPTERS_DIR.mkdir(parents=True, exist_ok=True)
PAIRS_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────
# ORPO Pair 생성
# ──────────────────────────────────────────────

def build_orpo_pair(battle_result: dict, assembled_context: str) -> dict | None:
    """
    배틀 결과 → ORPO (chosen, rejected) 쌍 생성.
    케이스별 규칙:
      A: APPROVE + WIN  → quality 0.9
      B: OVERRIDE + WIN → quality 0.95 (가장 중요)
      C: APPROVE + LOSS → 미생성 (noise)
      D: OVERRIDE + LOSS→ quality 0.4 (트레이너도 틀림, 낮은 가중치)
    """
    outcome        = battle_result.get("outcome")            # WIN | LOSS | DRAW
    agent_action   = battle_result.get("agent_action")       # LONG | SHORT | FLAT
    trainer_action = battle_result.get("trainer_action")     # APPROVE | OVERRIDE_*
    thesis         = battle_result.get("thesis", "")
    confidence     = battle_result.get("confidence", 0.5)

    if outcome == "DRAW":
        return None

    is_override = trainer_action and trainer_action.startswith("OVERRIDE_")
    final_action = (
        trainer_action.replace("OVERRIDE_", "") if is_override else agent_action
    )

    # 케이스 C: 둘 다 틀림 → 미생성
    if not is_override and outcome == "LOSS":
        return None

    # chosen / rejected 결정
    opposite = {"LONG": "SHORT", "SHORT": "LONG", "FLAT": "LONG"}.get(final_action, "FLAT")

    if outcome == "WIN":
        chosen_action   = final_action
        rejected_action = opposite
        quality = 0.95 if is_override else 0.9
    else:  # LOSS, override 있음 (케이스 D)
        chosen_action   = opposite   # 실제 맞는 방향
        rejected_action = final_action
        quality = 0.4

    chosen_resp = json.dumps({
        "action":     chosen_action,
        "confidence": round(confidence, 2),
        "thesis":     thesis[:100] if outcome == "WIN" else f"Should have gone {chosen_action}",
        "sl": battle_result.get("sl"),
        "tp": battle_result.get("tp"),
    })
    rejected_resp = json.dumps({
        "action":     rejected_action,
        "confidence": 0.4,
        "thesis":     f"Incorrect: {rejected_action} was wrong here",
        "sl": None,
        "tp": None,
    })

    return {
        "prompt":   assembled_context,
        "chosen":   chosen_resp,
        "rejected": rejected_resp,
        "quality":  quality,
        "source": {
            "battle_id":     battle_result.get("id"),
            "scenario_id":   battle_result.get("scenario_id"),
            "outcome":       outcome,
            "is_override":   is_override,
        }
    }


def append_pair_to_jsonl(agent_id: str, pair: dict) -> None:
    path = PAIRS_DIR / f"{agent_id}_pairs.jsonl"
    with open(path, "a") as f:
        f.write(json.dumps(pair, ensure_ascii=False) + "\n")


def count_pairs(agent_id: str) -> int:
    path = PAIRS_DIR / f"{agent_id}_pairs.jsonl"
    if not path.exists():
        return 0
    with open(path) as f:
        return sum(1 for _ in f)


# ──────────────────────────────────────────────
# 파인튜닝 트리거 조건
# ──────────────────────────────────────────────

def should_trigger_finetune(
    agent: dict,
    recent_battles: list[dict],
    pair_count: int,
) -> tuple[bool, str]:
    """
    파인튜닝 트리거 여부 + 이유 반환.
    Stage별 최소 pair 수 + 성능 조건 중 하나라도 충족 시 트리거.
    """
    stage = agent.get("stage", 0)
    min_pairs = {0: 20, 1: 30, 2: 50, 3: 80}.get(stage, 20)

    if pair_count < min_pairs:
        return False, f"insufficient_pairs ({pair_count}/{min_pairs})"

    if not recent_battles:
        return False, "no_battles"

    # 조건 1: 최근 20전 승률 45% 미만
    last_20 = recent_battles[-20:]
    wins    = sum(1 for b in last_20 if b["outcome"] == "WIN")
    win_rate = wins / len(last_20)
    if win_rate < 0.45:
        return True, f"win_rate_below_45 ({win_rate:.1%})"

    # 조건 2: 트레이너 OVERRIDE 연속 5건
    overrides = [b for b in recent_battles[-10:] if (b.get("trainer_action") or "").startswith("OVERRIDE")]
    if len(overrides) >= 5:
        return True, f"override_streak_{len(overrides)}"

    return False, "conditions_not_met"


# ──────────────────────────────────────────────
# LoRA 파인튜닝 실행 (mlx-lm)
# ──────────────────────────────────────────────

async def run_lora_finetune(
    agent_id: str,
    base_model: str = "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
) -> dict:
    """
    mlx_lm.lora subprocess 실행.
    PAIRS_DIR의 pairs.jsonl → adapter 저장.
    반환: {success, adapter_path, log}
    """
    pairs_path   = PAIRS_DIR   / f"{agent_id}_pairs.jsonl"
    adapter_path = ADAPTERS_DIR / agent_id

    if not pairs_path.exists():
        return {"success": False, "error": "pairs file not found"}

    # mlx-lm이 기대하는 데이터 포맷으로 변환
    sft_path = PAIRS_DIR / f"{agent_id}_sft.jsonl"
    _convert_to_mlx_format(pairs_path, sft_path)

    cmd = [
        "mlx_lm.lora",
        "--model",          base_model,
        "--train",
        "--data",           str(sft_path.parent),
        "--iters",          "100",
        "--batch-size",     "4",
        "--lora-layers",    "8",
        "--learning-rate",  "1e-5",
        "--adapter-path",   str(adapter_path),
        "--seed",           "42",
    ]

    logger.info(f"[finetune:{agent_id}] starting mlx_lm.lora")
    t0 = time.monotonic()

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3600)
        elapsed = time.monotonic() - t0

        if proc.returncode == 0:
            logger.info(f"[finetune:{agent_id}] done in {elapsed:.0f}s")
            return {
                "success":      True,
                "adapter_path": str(adapter_path),
                "elapsed_s":    round(elapsed),
                "log":          stdout.decode()[-500:],
            }
        else:
            logger.error(f"[finetune:{agent_id}] failed: {stderr.decode()[:300]}")
            return {
                "success": False,
                "error":   stderr.decode()[:300],
                "elapsed_s": round(elapsed),
            }
    except asyncio.TimeoutError:
        proc.kill()
        return {"success": False, "error": "timeout_3600s"}
    except FileNotFoundError:
        return {"success": False, "error": "mlx_lm not installed"}


def _convert_to_mlx_format(src: Path, dst: Path) -> None:
    """
    ORPO JSONL → mlx-lm chat 포맷 변환.
    mlx-lm SFT는 chosen만 사용 (ORPO loss는 향후 지원 확인 필요).
    """
    with open(src) as fin, open(dst, "w") as fout:
        for line in fin:
            pair = json.loads(line)
            # chat 포맷
            record = {
                "messages": [
                    {"role": "user",      "content": pair["prompt"]},
                    {"role": "assistant", "content": pair["chosen"]},
                ]
            }
            fout.write(json.dumps(record, ensure_ascii=False) + "\n")


# ──────────────────────────────────────────────
# 벤치마크 평가 (파인튜닝 전후 비교)
# ──────────────────────────────────────────────

async def benchmark_agent(
    agent: dict,
    scenarios: list[dict],
    adapter_path: str | None,
    battle_engine,
    skill_registry,
    memory_service,
    context_builder,
    ollama_client,
) -> dict:
    """
    FIXED_SCENARIOS 중 일부로 에이전트 성능 측정.
    반환: {win_rate, composite_metric, n_trades}
    """
    if adapter_path:
        # 어댑터 적용한 임시 에이전트 복사본
        test_agent = copy.deepcopy(agent)
        test_agent["modelVersion"] = adapter_path
    else:
        test_agent = agent

    results = []
    for scenario in scenarios[:10]:   # 최대 10개로 빠른 평가
        ctx = await _run_quick_battle(
            test_agent, scenario,
            skill_registry, memory_service, context_builder, ollama_client
        )
        if ctx:
            results.append(ctx)

    if not results:
        return {"win_rate": 0.0, "composite_metric": 0.0, "n_trades": 0}

    wins     = sum(1 for r in results if r["outcome"] == "WIN")
    n_trades = sum(1 for r in results if r.get("action") != "FLAT")
    avg_pnl  = sum(r.get("pnl", 0) for r in results) / len(results)

    pnl_per_tick    = avg_pnl / max(len(results), 1)
    activity_bonus  = min(n_trades / 20.0, 1.0) * 0.0001
    composite       = pnl_per_tick + activity_bonus

    return {
        "win_rate":          wins / len(results),
        "composite_metric":  composite,
        "n_trades":          n_trades,
        "avg_pnl":           avg_pnl,
    }


async def _run_quick_battle(agent, scenario, skill_registry, memory_service,
                             context_builder, ollama_client) -> dict | None:
    """배틀 엔진 없이 DECIDE까지만 실행 (빠른 평가용)"""
    from .battle_engine import BattleContext, guardian_veto, resolve_outcome
    from .skill_registry import call_all_parallel

    try:
        ctx = BattleContext(
            battle_id=str(uuid.uuid4()),
            agent_id=agent["id"],
            scenario_id=scenario["id"],
            snapshot=scenario["snapshot"],
            candles=scenario.get("candles", []),
        )
        ctx.memories      = await asyncio.wait_for(
            memory_service.query(agent["id"], ctx.snapshot, top_k=3), timeout=2.0
        ) if memory_service else []
        ctx.skill_results = await call_all_parallel(
            agent.get("skillLoadout", {}), ctx.snapshot, budget_ms=3000
        )

        context_str  = context_builder.build(ctx, agent, scenario)
        raw = await asyncio.wait_for(
            ollama_client.infer(
                model=agent.get("modelVersion") or "qwen2.5:1.5b",
                prompt=context_str,
            ),
            timeout=4.0
        )
        from .battle_engine import _parse_llm_output
        ctx.llm_output = _parse_llm_output(raw)

        veto, _ = guardian_veto(ctx)
        if veto:
            ctx.llm_output["action"] = "FLAT"

        outcome, pnl = resolve_outcome(ctx, scenario.get("future_candles", []))
        return {
            "outcome": outcome,
            "pnl":     pnl,
            "action":  ctx.llm_output.get("action"),
        }
    except Exception as e:
        logger.debug(f"quick battle failed: {e}")
        return None


# ──────────────────────────────────────────────
# 파인튜닝 후 버전 승격
# ──────────────────────────────────────────────

async def evaluate_and_promote(
    agent: dict,
    new_adapter_path: str,
    scenarios: list[dict],
    db,
    skill_registry, memory_service, context_builder, ollama_client,
) -> dict:
    """
    baseline vs candidate 비교 → 성능 향상 시 버전 승격.
    반환: {promoted, baseline, candidate, delta, reason}
    """
    baseline, candidate = await asyncio.gather(
        benchmark_agent(agent, scenarios, None,
                        None, skill_registry, memory_service, context_builder, ollama_client),
        benchmark_agent(agent, scenarios, new_adapter_path,
                        None, skill_registry, memory_service, context_builder, ollama_client),
    )

    improved  = candidate["composite_metric"] > baseline["composite_metric"]
    risk_ok   = candidate["win_rate"] >= baseline["win_rate"] - 0.05

    if improved and risk_ok:
        # 버전 번호 증가
        current_ver = agent.get("modelVersion") or "v0"
        try:
            n = int(current_ver.lstrip("v")) + 1
        except ValueError:
            n = 1
        new_version = f"v{n}"

        await db.update_agent_model(
            agent["id"],
            model_version=new_adapter_path,
        )
        logger.info(f"[promote:{agent['id']}] {current_ver} → {new_version} "
                    f"(Δmetric {candidate['composite_metric'] - baseline['composite_metric']:+.5f})")

        return {
            "promoted":   True,
            "version":    new_version,
            "baseline":   baseline,
            "candidate":  candidate,
            "delta":      candidate["composite_metric"] - baseline["composite_metric"],
        }
    else:
        reason = "no_improvement" if not improved else "win_rate_regression"
        logger.info(f"[promote:{agent['id']}] rejected ({reason})")
        return {
            "promoted":  False,
            "reason":    reason,
            "baseline":  baseline,
            "candidate": candidate,
        }


# ──────────────────────────────────────────────
# Hill Climbing AutoResearch 루프 (SSE Generator)
# ──────────────────────────────────────────────

@dataclass
class AutoRunState:
    job_id:       str
    agent_id:     str
    best_metric:  float = 0.0
    best_doctrine:dict  = field(default_factory=dict)
    current_round:int   = 0
    total_rounds: int   = 100
    stopped:      bool  = False


# 실행 중인 잡 저장 (stop 신호용)
_active_jobs: dict[str, AutoRunState] = {}


def stop_job(job_id: str) -> bool:
    state = _active_jobs.get(job_id)
    if state:
        state.stopped = True
        return True
    return False


async def run_autorun(
    job_id:       str,
    agent:        dict,
    total_rounds: int,
    scenarios:    list[dict],          # FIXED_SCENARIOS (train + val 분리)
    db,
    skill_registry, memory_service, context_builder, ollama_client,
) -> AsyncGenerator[str, None]:
    """
    Hill Climbing 루프 → SSE 스트림.
    TRAIN_SCENARIOS 80% / VAL_SCENARIOS 20% 분리.
    """
    import json

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    # Train / Val 분리
    random.seed(42)
    shuffled = scenarios[:]
    random.shuffle(shuffled)
    split     = int(len(shuffled) * 0.8)
    train_sc  = shuffled[:split]
    val_sc    = shuffled[split:]

    state = AutoRunState(
        job_id=job_id,
        agent_id=agent["id"],
        total_rounds=total_rounds,
        best_doctrine=copy.deepcopy(agent.get("doctrine", {})),
    )
    _active_jobs[job_id] = state

    # 기준선 측정
    baseline = await benchmark_agent(
        agent, train_sc, None,
        None, skill_registry, memory_service, context_builder, ollama_client
    )
    state.best_metric  = baseline["composite_metric"]
    state.best_doctrine = copy.deepcopy(agent.get("doctrine", {}))

    yield sse("baseline", {
        "composite_metric": state.best_metric,
        "win_rate":         baseline["win_rate"],
    })

    for i in range(total_rounds):
        if state.stopped:
            yield sse("stopped", {"round": i})
            break

        state.current_round = i + 1

        # Doctrine 변형
        candidate_doctrine = _mutate_doctrine(state.best_doctrine)
        candidate_agent    = copy.deepcopy(agent)
        candidate_agent["doctrine"] = candidate_doctrine

        # TRAIN 평가
        result = await benchmark_agent(
            candidate_agent, train_sc, None,
            None, skill_registry, memory_service, context_builder, ollama_client
        )
        new_metric = result["composite_metric"]
        improved   = new_metric > state.best_metric
        change     = "KEEP" if improved else "ROLLBACK"

        if improved:
            state.best_metric   = new_metric
            state.best_doctrine = candidate_doctrine

        yield sse("iteration", {
            "round":        state.current_round,
            "total":        total_rounds,
            "metric":       round(new_metric, 6),
            "best_so_far":  round(state.best_metric, 6),
            "change":       change,
            "win_rate":     round(result["win_rate"], 3),
        })

        await db.update_autorun_job(job_id, state.current_round, state.best_metric)
        await asyncio.sleep(0.05)   # SSE flush

    # VAL 과적합 검증
    if not state.stopped:
        best_agent = copy.deepcopy(agent)
        best_agent["doctrine"] = state.best_doctrine
        val_result = await benchmark_agent(
            best_agent, val_sc, None,
            None, skill_registry, memory_service, context_builder, ollama_client
        )
        yield sse("val_result", {
            "val_composite_metric": round(val_result["composite_metric"], 6),
            "val_win_rate":         round(val_result["win_rate"], 3),
            "overfit_risk":         state.best_metric - val_result["composite_metric"] > 0.001,
        })

    # 파인튜닝 트리거 체크
    recent_battles = await db.get_recent_battles(agent["id"], limit=30)
    pair_count     = count_pairs(agent["id"])
    should_ft, ft_reason = should_trigger_finetune(agent, recent_battles, pair_count)

    if should_ft:
        yield sse("finetune_triggered", {
            "reason":      ft_reason,
            "pairs_count": pair_count,
        })

        ft_result = await run_lora_finetune(agent["id"])

        if ft_result["success"]:
            promote_result = await evaluate_and_promote(
                agent, ft_result["adapter_path"],
                val_sc, db,
                skill_registry, memory_service, context_builder, ollama_client
            )
            yield sse("finetune_done", {
                "success":  True,
                "promoted": promote_result["promoted"],
                "version":  promote_result.get("version"),
                "delta":    promote_result.get("delta"),
                "elapsed_s":ft_result.get("elapsed_s"),
            })
        else:
            yield sse("finetune_done", {
                "success": False,
                "error":   ft_result.get("error"),
            })

    # 최종
    await db.finish_autorun_job(job_id, state.best_metric, state.best_doctrine)
    _active_jobs.pop(job_id, None)

    yield sse("done", {
        "best_metric":    round(state.best_metric, 6),
        "total_rounds":   state.current_round,
        "finetune_ran":   should_ft,
    })


# ──────────────────────────────────────────────
# Doctrine 변형 (Hill Climbing)
# ──────────────────────────────────────────────

def _mutate_doctrine(doctrine: dict) -> dict:
    """
    signal_weights 중 하나를 ±0.05~0.15 범위에서 무작위 변형.
    skill_config의 enabled_skills도 확률적 on/off.
    """
    d = copy.deepcopy(doctrine)
    weights = d.get("signal_weights", {})

    if not weights:
        return d

    key   = random.choice(list(weights.keys()))
    delta = random.uniform(-0.15, 0.15)
    weights[key] = max(0.0, min(1.0, weights[key] + delta))
    d["signal_weights"] = weights

    # 임계값도 가끔 변형
    if random.random() < 0.3:
        thresholds = d.get("thresholds", {})
        t_key = random.choice(list(thresholds.keys())) if thresholds else None
        if t_key:
            t_delta = random.uniform(-0.05, 0.05)
            thresholds[t_key] = max(0.1, thresholds[t_key] + t_delta)
            d["thresholds"] = thresholds

    return d
