"""Operator-readable runtime reports for refinement methodology runs."""
from __future__ import annotations

from pathlib import Path

from .state_store import ResearchRun, ResearchStateStore

REPORTS_DIR = Path(__file__).resolve().parent / "state" / "reports"


def write_refinement_report(
    run: ResearchRun,
    *,
    objective: dict,
    store: ResearchStateStore | None = None,
    reports_dir: Path = REPORTS_DIR,
) -> Path:
    store = store or ResearchStateStore()
    decision = store.get_selection_decision(run.research_run_id)
    notes = store.list_memory_notes(research_run_id=run.research_run_id)

    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"{run.research_run_id}.md"
    lines = [
        f"# Refinement Report — {run.research_run_id}",
        "",
        "## Run",
        f"- Pattern: `{run.pattern_slug}`",
        f"- Status: `{run.status}`",
        f"- Disposition: `{run.completion_disposition}`",
        f"- Winner Variant: `{run.winner_variant_ref}`",
        f"- Baseline Ref: `{run.baseline_ref}`",
        "",
        "## Objective",
        f"- Kind: `{objective.get('objective_kind')}`",
        f"- ID: `{objective.get('objective_id')}`",
        f"- Rationale: {objective.get('rationale')}",
        f"- Baseline Hint: `{objective.get('baseline_ref_hint')}`",
        "",
        "## Evidence Summary",
        f"- Dataset Summary: `{objective.get('dataset_summary')}`",
        f"- History Summary: `{objective.get('history_summary')}`",
        f"- Supporting Signals: `{objective.get('supporting_signals')}`",
        "",
        "## Search Policy",
        f"- Recommended Search Policy: `{objective.get('recommended_search_policy')}`",
        f"- Recommended Evaluation Protocol: `{objective.get('recommended_evaluation_protocol')}`",
        "",
        "## Selection Decision",
    ]
    drift_mode = None
    supporting_signals = objective.get("supporting_signals")
    if isinstance(supporting_signals, dict):
        drift_mode = supporting_signals.get("scoring_drift_mode")
    if drift_mode is not None:
        lines.insert(-2, f"- Scoring Drift Mode: `{drift_mode}`")

    if decision is None:
        lines.append("- None recorded")
    else:
        lines.extend(
            [
                f"- Kind: `{decision.decision_kind}`",
                f"- Selected Variant: `{decision.selected_variant_ref}`",
                f"- Rationale: {decision.rationale}",
                f"- Metrics: `{decision.metrics}`",
            ]
        )

    lines.extend(["", "## Evaluation Result"])
    if decision is None:
        lines.append("- None recorded")
    else:
        eval_payload = _extract_eval_payload(decision.metrics)
        dataset_payload = (
            decision.metrics.get("dataset_summary") if isinstance(decision.metrics, dict) else None
        )
        lines.append(f"- Eval: `{eval_payload}`")
        lines.append(f"- Dataset Snapshot: `{dataset_payload}`")
        for line in _evaluation_delta_lines(
            eval_payload,
            objective.get("history_summary"),
            objective.get("recommended_evaluation_protocol"),
            run.baseline_ref,
        ):
            lines.append(line)

    lines.extend(["", "## Handoff"])
    baseline_family_ref = run.handoff_payload.get("baseline_family_ref")
    if baseline_family_ref is not None:
        lines.append(f"- Baseline Family Ref: `{baseline_family_ref}`")
    training_result = run.handoff_payload.get("training_result")
    if training_result is None:
        lines.append(f"- Payload: `{run.handoff_payload}`")
    else:
        lines.append(f"- Training Result: `{training_result}`")

    lines.extend(["", "## Memory Notes"])
    if not notes:
        lines.append("- None recorded")
    else:
        for note in notes:
            lines.append(f"- `{note.note_kind}`: {note.summary}")
            if note.detail:
                lines.append(f"  Detail: {note.detail}")
            if note.tags:
                lines.append(f"  Tags: `{note.tags}`")

    lines.extend(["", "## Operator Recommendation"])
    if objective.get("objective_kind") == "scoring_drift_review" and drift_mode == "structural":
        lines.append("- Confirm the structural drift signal before widening search or resetting the candidate lineage.")
    elif objective.get("objective_kind") == "scoring_drift_review" and drift_mode == "incremental":
        lines.append("- Review whether a bounded refresh probe should replace the incumbent scoring settings.")
    elif run.completion_disposition == "train_candidate":
        lines.append("- Review the report and approve or defer the train handoff.")
    elif run.completion_disposition == "dead_end":
        lines.append("- Treat as a failed path unless policy now prefers reset-search escalation.")
    else:
        lines.append("- Accumulate more evidence before attempting a new candidate.")

    path.write_text("\n".join(lines) + "\n")
    return path


def _extract_eval_payload(metrics: object) -> dict | None:
    if not isinstance(metrics, dict):
        return None
    nested = metrics.get("eval")
    if isinstance(nested, dict):
        return nested
    if "mean_auc" in metrics or "std_auc" in metrics:
        return metrics
    return None


def _evaluation_delta_lines(
    eval_payload: dict | None,
    history_summary: object,
    evaluation_protocol: object,
    baseline_ref: str,
) -> list[str]:
    if not isinstance(eval_payload, dict):
        return []
    history_summary = history_summary if isinstance(history_summary, dict) else {}
    evaluation_protocol = evaluation_protocol if isinstance(evaluation_protocol, dict) else {}
    mean_auc = _coerce_float(eval_payload.get("mean_auc"))
    std_auc = _coerce_float(eval_payload.get("std_auc"))
    min_mean_auc = _coerce_float(evaluation_protocol.get("min_mean_auc"))
    max_std_auc = _coerce_float(evaluation_protocol.get("max_std_auc"))
    recent_best_mean_auc = _coerce_float(history_summary.get("recent_best_mean_auc"))
    lines = [f"- Baseline Ref: `{baseline_ref}`"]
    if mean_auc is not None and recent_best_mean_auc is not None:
        lines.append(
            f"- Mean AUC vs Recent Best: `{mean_auc - recent_best_mean_auc:+.4f}` "
            f"(current `{mean_auc:.4f}` vs recent best `{recent_best_mean_auc:.4f}`)"
        )
    if mean_auc is not None and min_mean_auc is not None:
        lines.append(
            f"- Mean AUC vs Gate: `{mean_auc - min_mean_auc:+.4f}` "
            f"(gate `{min_mean_auc:.4f}`)"
        )
    if std_auc is not None and max_std_auc is not None:
        lines.append(
            f"- Std AUC vs Variance Ceiling: `{max_std_auc - std_auc:+.4f}` "
            f"(ceiling `{max_std_auc:.4f}`)"
        )
    if history_summary.get("plateau_detected"):
        lines.append("- Plateau Signal: recent evals are flat with no advancing candidate.")
    recent_high_variance_count = history_summary.get("recent_high_variance_count")
    if isinstance(recent_high_variance_count, int) and recent_high_variance_count > 0:
        lines.append(f"- Recent High-Variance Runs: `{recent_high_variance_count}`")
    return lines


def _coerce_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None
