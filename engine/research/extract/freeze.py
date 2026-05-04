"""
engine.research.extract.freeze
================================
Run all 4 parsers on the latest raw_dump and write spec files to calibration/.

Usage:
    python -m engine.research.extract.freeze
    python -m engine.research.extract.freeze --dump-dir engine/research/calibration/raw_dump/2026-05-05
"""

from __future__ import annotations

import argparse
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

CALIBRATION_DIR = Path(__file__).parent.parent.parent / "research" / "calibration"
RAW_DUMP_PARENT = CALIBRATION_DIR / "raw_dump"


def find_latest_dump_dir(raw_dump_parent: Path) -> Path | None:
    """Find the most recent date-named directory in raw_dump/."""
    if not raw_dump_parent.exists():
        return None
    candidates = sorted(
        [d for d in raw_dump_parent.iterdir() if d.is_dir()],
        reverse=True,
    )
    return candidates[0] if candidates else None


def write_yaml(path: Path, data: dict) -> None:
    """Write data to path as YAML."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    logger.info("Wrote %s (%d bytes)", path, path.stat().st_size)


def freeze_all(dump_dir: Path, calibration_dir: Path | None = None) -> dict[str, Path]:
    """
    Run all 4 parsers and write spec files.

    Parameters
    ----------
    dump_dir : Path
        Raw dump directory (output of crawler.py).
    calibration_dir : Path, optional
        Where to write spec files. Defaults to engine/research/calibration/.

    Returns
    -------
    dict[str, Path]
        Mapping from spec name → output path.
    """
    if calibration_dir is None:
        calibration_dir = CALIBRATION_DIR

    calibration_dir.mkdir(parents=True, exist_ok=True)

    # Import parsers here to allow CLI use without circular imports
    from research.extract.parsers.signals import build_signal_specs_yaml_dict
    from research.extract.parsers.gates import build_gate_specs_yaml_dict
    from research.extract.parsers.exits import extract_exit_rules
    from research.extract.parsers.buckets import extract_bucket_priors

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    outputs: dict[str, Path] = {}
    changelog_entries: list[str] = []

    # 1. signal_specs.yaml
    logger.info("Parsing signal specs...")
    try:
        signal_data = build_signal_specs_yaml_dict(dump_dir, captured_at=captured_at)
        signal_path = calibration_dir / "signal_specs.yaml"
        write_yaml(signal_path, signal_data)
        outputs["signal_specs"] = signal_path
        n_signals = len(signal_data.get("signals", []))
        changelog_entries.append(f"signal_specs.yaml: {n_signals} signals")
    except Exception as exc:
        logger.error("signal_specs failed: %s", exc)
        changelog_entries.append(f"signal_specs.yaml: FAILED — {exc}")

    # 2. gate_specs.yaml
    logger.info("Parsing gate specs...")
    try:
        gate_data = build_gate_specs_yaml_dict(dump_dir)
        gate_path = calibration_dir / "gate_specs.yaml"
        write_yaml(gate_path, gate_data)
        outputs["gate_specs"] = gate_path

        # Check G1 bin observation counts
        g1_bins = gate_data.get("gates", {}).get("G1_tier2_score", {}).get("bins", {})
        g1_notes = []
        for bin_name, bin_data in g1_bins.items():
            n = bin_data.get("observed_n", 0)
            g1_notes.append(f"{bin_name}: n={n}")
            if n < 30:
                g1_notes[-1] += " (sparse)"
        changelog_entries.append(f"gate_specs.yaml: G1 bins: {'; '.join(g1_notes)}")

        # G3 slot_util
        g3_bins = gate_data.get("gates", {}).get("G3_portfolio_capacity", {}).get("slot_util_bins", {})
        g3_notes = [f"{k}: accept_rate={v.get('accept_rate', 'N/A')}" for k, v in g3_bins.items()]
        changelog_entries.append(f"gate_specs.yaml: G3 slot_util bins: {'; '.join(g3_notes)}")
    except Exception as exc:
        logger.error("gate_specs failed: %s", exc)
        changelog_entries.append(f"gate_specs.yaml: FAILED — {exc}")

    # 3. exit_rules.yaml
    logger.info("Parsing exit rules...")
    try:
        exit_data = extract_exit_rules(dump_dir)
        exit_path = calibration_dir / "exit_rules.yaml"
        write_yaml(exit_path, exit_data)
        outputs["exit_rules"] = exit_path
        meta = exit_data.get("_regression_meta", {})
        r2 = meta.get("r2_stop")
        changelog_entries.append(f"exit_rules.yaml: ATR regression R²={r2}; {meta.get('note', '')}")
    except Exception as exc:
        logger.error("exit_rules failed: %s", exc)
        changelog_entries.append(f"exit_rules.yaml: FAILED — {exc}")

    # 4. bucket_priors.parquet
    logger.info("Parsing bucket priors...")
    try:
        import pyarrow  # ensure available
        df = extract_bucket_priors(dump_dir)
        parquet_path = calibration_dir / "bucket_priors.parquet"
        df.to_parquet(str(parquet_path), index=False)
        n_total = len(df)
        n_min3 = int((df["n"] >= 3).sum()) if not df.empty else 0
        outputs["bucket_priors"] = parquet_path
        changelog_entries.append(
            f"bucket_priors.parquet: {n_total} cells total, {n_min3} with n>=3"
        )
        if n_min3 < 200:
            changelog_entries.append(
                f"  WARNING: only {n_min3} cells with n>=3 (AC requires 200; data is sparse)"
            )
        logger.info("bucket_priors: %d cells, %d with n>=3", n_total, n_min3)
    except Exception as exc:
        logger.error("bucket_priors failed: %s", exc)
        changelog_entries.append(f"bucket_priors.parquet: FAILED — {exc}")

    # Write changelog
    _write_changelog(calibration_dir, captured_at, changelog_entries, dump_dir)

    # Attempt git tag
    tag = f"calibration-v1-{captured_at[:10]}"
    _try_git_tag(tag, calibration_dir)

    return outputs


def _write_changelog(
    calibration_dir: Path,
    captured_at: str,
    entries: list[str],
    dump_dir: Path,
) -> None:
    """Append to changelog.md."""
    changelog_path = calibration_dir / "changelog.md"
    header = f"\n## {captured_at} — freeze from {dump_dir.name}\n\n"
    body = "\n".join(f"- {e}" for e in entries) + "\n"

    existing = changelog_path.read_text(encoding="utf-8") if changelog_path.exists() else ""
    changelog_path.write_text(existing + header + body, encoding="utf-8")
    logger.info("Updated %s", changelog_path)


def _try_git_tag(tag: str, cwd: Path) -> None:
    """Attempt to create a git tag (non-fatal)."""
    try:
        result = subprocess.run(
            ["git", "tag", tag],
            cwd=cwd,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            logger.info("Created git tag: %s", tag)
        else:
            logger.debug("git tag skipped: %s", result.stderr.strip())
    except Exception as exc:
        logger.debug("git tag failed: %s", exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Freeze kieran spec files from raw_dump")
    parser.add_argument(
        "--dump-dir",
        type=Path,
        default=None,
        help="Raw dump directory (auto-detects latest if not specified)",
    )
    parser.add_argument(
        "--calibration-dir",
        type=Path,
        default=None,
        help="Output calibration directory",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(message)s",
    )

    calibration_dir = args.calibration_dir or CALIBRATION_DIR
    dump_dir = args.dump_dir

    if dump_dir is None:
        raw_dump_parent = calibration_dir / "raw_dump"
        dump_dir = find_latest_dump_dir(raw_dump_parent)
        if dump_dir is None:
            print(f"ERROR: No dump_dir found in {raw_dump_parent}. Run crawler.py first.")
            raise SystemExit(1)
        logger.info("Auto-detected dump_dir: %s", dump_dir)

    if not dump_dir.exists():
        print(f"ERROR: dump_dir does not exist: {dump_dir}")
        raise SystemExit(1)

    outputs = freeze_all(dump_dir=dump_dir, calibration_dir=calibration_dir)
    print(f"\nFrozen {len(outputs)} spec files:")
    for name, path in outputs.items():
        print(f"  {name}: {path}")


if __name__ == "__main__":
    main()
