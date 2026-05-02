"""
CLI interface for Paradigm Framework

Usage:
  python -m engine.research.cli_paradigm \
    --pattern wyckoff-spring-reversal-v1 \
    --baseline-metrics \
    --output /tmp/paradigm_report.md
"""

import sys
import argparse
from pathlib import Path
from research.discovery.paradigm_framework import (
    ParadigmFramework,
    BaselineMetrics,
)


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Paradigm Autoresearch Framework CLI"
    )

    parser.add_argument(
        "--pattern",
        required=True,
        help="Pattern name (e.g., wyckoff-spring-reversal-v1)"
    )

    parser.add_argument(
        "--baseline-metrics",
        action="store_true",
        help="Compute baseline metrics (Phase 0)"
    )

    parser.add_argument(
        "--parallel-sweep",
        action="store_true",
        help="Run parallel parameter sweep (Methodology 1)"
    )

    parser.add_argument(
        "--multi-period",
        type=str,
        help="Run multi-period validation (Methodology 2). Format: '2022-06,2023-06 2024-01,2024-12 2025-01,2026-04'"
    )

    parser.add_argument(
        "--failure-log",
        type=str,
        help="Path to failure catalog JSON"
    )

    parser.add_argument(
        "--architecture-exploration",
        type=str,
        help="Architecture exploration notes"
    )

    parser.add_argument(
        "--output",
        type=str,
        default="./paradigm_reports/",
        help="Output directory for reports"
    )

    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only output JSON (no markdown)"
    )

    return parser


def main():
    parser = create_parser()
    args = parser.parse_args()

    # Initialize framework
    fw = ParadigmFramework(pattern_name=args.pattern)

    # Phase 0: Baseline metrics
    if args.baseline_metrics:
        # TODO: Implement actual baseline measurement
        # For now, placeholder showing structure
        print(f"[Phase 0] Computing baseline metrics for {args.pattern}...")
        # Example:
        # baseline = BaselineMetrics(
        #     signal_count=10947,
        #     hit_rate_28d=0.45,
        #     avg_return_72h=0.023,
        #     win_rate_72h=0.42,
        #     timeframe="1h",
        #     threshold=0.70,
        #     min_bars=5,
        # )
        # fw.set_baseline(baseline)

    # Methodology 1: Parallel sweep
    if args.parallel_sweep:
        print(f"[Methodology 1] Running parallel parameter sweep for {args.pattern}...")
        # TODO: Implement actual sweep

    # Methodology 2: Multi-period validation
    if args.multi_period:
        print(f"[Methodology 2] Validating across multiple periods...")
        # TODO: Parse period strings and run validation

    # Methodology 4: Failure catalog
    if args.failure_log:
        print(f"[Methodology 4] Loading failure catalog from {args.failure_log}...")
        # TODO: Load and count failures

    # Methodology 5: Architecture exploration
    if args.architecture_exploration:
        fw.set_architecture_exploration(args.architecture_exploration)

    # Generate and save report
    output_dir = Path(args.output)
    report_path = fw.save_report(output_dir)
    print(f"\n✅ Report saved to {report_path}")

    # Print summary
    report = fw.generate_report()
    print(f"\n📊 Score: {report.overall_score:.1f}/100")
    print(f"✅ Methodologies applied: {len(report.methodologies_applied)}")
    print(f"⚠️  Gaps: {len(report.gaps)}")

    if report.gaps:
        print("\nNext steps:")
        for gap in report.gaps:
            print(f"  - {gap}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
