"""
Paradigm Autoresearch Framework

Systematic methodology for pattern discovery and optimization.
Applies 5-level evaluation checklist to every pattern experiment.

Reference: Ryan Li's Paradigm Autoresearch
https://www.paradigm.xyz/2024/12/markets/autoresearch
"""

from dataclasses import dataclass
from typing import Dict, Optional, List
from datetime import datetime
import json
from pathlib import Path


@dataclass
class BaselineMetrics:
    """Phase 0: Establish baseline before optimization"""
    signal_count: int
    hit_rate_28d: float  # % of signals with forward return > 0
    avg_return_72h: float  # Average forward 72h return
    win_rate_72h: float  # % signals with +5% or better
    timeframe: str  # "1h", "4h", etc.
    threshold: float  # Sensitivity level
    min_bars: int
    measured_at: str = ""

    def __post_init__(self):
        if not self.measured_at:
            self.measured_at = datetime.now().isoformat()

    def is_noise_regime(self) -> bool:
        """Detect if we're in noise regime (too many signals)"""
        # Heuristic: >5000 daily-avg signals = noise
        # Typical trading day: ~1440 bars (if minute bars) or ~24 bars (if hourly)
        # If >5K signals per day, likely false positives
        return self.signal_count > 5000

    def dict(self) -> dict:
        return {
            "signal_count": self.signal_count,
            "hit_rate_28d": self.hit_rate_28d,
            "avg_return_72h": self.avg_return_72h,
            "win_rate_72h": self.win_rate_72h,
            "timeframe": self.timeframe,
            "threshold": self.threshold,
            "min_bars": self.min_bars,
            "measured_at": self.measured_at,
            "is_noise": self.is_noise_regime(),
        }


@dataclass
class ParallelSweepResult:
    """Methodology 1: Parallel parameter sweep results"""
    pattern_name: str
    total_combinations: int
    winner_config: dict
    winner_metrics: Dict[str, float]
    rationale: str  # Why is this config optimal?
    candidates: List[dict] = None  # Top 5 alternatives

    def dict(self) -> dict:
        return {
            "pattern": self.pattern_name,
            "total_combinations": self.total_combinations,
            "winner": self.winner_config,
            "winner_metrics": self.winner_metrics,
            "rationale": self.rationale,
            "top_alternatives": self.candidates or [],
        }


@dataclass
class MultiPeriodResult:
    """Methodology 2: Multi-period validation"""
    pattern_name: str
    periods: Dict[str, Dict[str, float]]  # period_name -> metrics
    is_robust: bool
    variance_acceptable: bool
    notes: str

    def dict(self) -> dict:
        return {
            "pattern": self.pattern_name,
            "periods": self.periods,
            "is_robust": self.is_robust,
            "variance_acceptable": self.variance_acceptable,
            "notes": self.notes,
        }


@dataclass
class ParadigmFrameworkResult:
    """Complete framework evaluation result"""
    pattern_name: str
    baseline: Optional[BaselineMetrics]
    parallel_sweep: Optional[ParallelSweepResult]
    multi_period: Optional[MultiPeriodResult]
    failure_catalog_size: int
    architecture_exploration: Optional[str]
    overall_score: float  # 0-100, based on methodology coverage
    methodologies_applied: List[str]
    gaps: List[str]  # Methodologies not applied
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

    def to_markdown(self) -> str:
        """Generate markdown report"""
        lines = [
            f"# Paradigm Framework Report: {self.pattern_name}",
            f"**Generated:** {self.timestamp}",
            "",
            f"## Overall Score: {self.overall_score:.1f}/100",
            "",
            "### Methodologies Applied",
        ]

        if self.baseline:
            lines.extend([
                "- ✅ Phase 0: Baseline Measurement",
                f"  - Signal count: {self.baseline.signal_count:,}",
                f"  - Hit rate (28d): {self.baseline.hit_rate_28d:.1%}",
                f"  - Avg return (72h): {self.baseline.avg_return_72h:.2%}",
                f"  - Win rate (72h): {self.baseline.win_rate_72h:.1%}",
                f"  - Timeframe: {self.baseline.timeframe}",
                f"  - Noise regime: {'⚠️ YES' if self.baseline.is_noise_regime() else '✅ NO'}",
                "",
            ])
        else:
            lines.append("- ❌ Phase 0: Baseline Measurement")

        if self.parallel_sweep:
            lines.extend([
                "- ✅ Methodology 1: Parallel Parameter Sweep",
                f"  - Combinations tested: {self.parallel_sweep.total_combinations}",
                f"  - Winner config: {self.parallel_sweep.winner_config}",
                f"  - Winner metrics: {self.parallel_sweep.winner_metrics}",
                f"  - Rationale: {self.parallel_sweep.rationale}",
                "",
            ])
        else:
            lines.append("- ❌ Methodology 1: Parallel Parameter Sweep")

        if self.multi_period:
            lines.extend([
                "- ✅ Methodology 2: Multi-Period Validation",
                f"  - Robust: {'✅ YES' if self.multi_period.is_robust else '❌ NO'}",
                f"  - Periods tested: {len(self.multi_period.periods)}",
                "",
            ])
        else:
            lines.append("- ❌ Methodology 2: Multi-Period Validation")

        if self.failure_catalog_size > 0:
            lines.extend([
                "- ✅ Methodology 4: Negative Result Logging",
                f"  - Failures documented: {self.failure_catalog_size}",
                "",
            ])
        else:
            lines.append("- ❌ Methodology 4: Negative Result Logging")

        if self.architecture_exploration:
            lines.extend([
                "- ✅ Methodology 5: Architecture Exploration",
                f"  - Notes: {self.architecture_exploration}",
                "",
            ])
        else:
            lines.append("- ❌ Methodology 5: Architecture Exploration")

        if self.gaps:
            lines.extend([
                "### Gaps",
                "",
            ])
            for gap in self.gaps:
                lines.append(f"- {gap}")
            lines.append("")

        lines.extend([
            "### Checklist for Next Session",
            "",
        ])
        for gap in self.gaps:
            lines.append(f"- [ ] {gap}")

        return "\n".join(lines)

    def dict(self) -> dict:
        return {
            "pattern": self.pattern_name,
            "baseline": self.baseline.dict() if self.baseline else None,
            "parallel_sweep": self.parallel_sweep.dict() if self.parallel_sweep else None,
            "multi_period": self.multi_period.dict() if self.multi_period else None,
            "failure_catalog_size": self.failure_catalog_size,
            "architecture_exploration": self.architecture_exploration,
            "overall_score": self.overall_score,
            "methodologies_applied": self.methodologies_applied,
            "gaps": self.gaps,
            "timestamp": self.timestamp,
        }


class ParadigmFramework:
    """Orchestrator for paradigm methodology application"""

    def __init__(self, pattern_name: str):
        self.pattern_name = pattern_name
        self.baseline: Optional[BaselineMetrics] = None
        self.parallel_sweep: Optional[ParallelSweepResult] = None
        self.multi_period: Optional[MultiPeriodResult] = None
        self.failure_catalog_size = 0
        self.architecture_exploration: Optional[str] = None

    def set_baseline(self, metrics: BaselineMetrics) -> None:
        """Phase 0: Set baseline metrics"""
        self.baseline = metrics

    def set_parallel_sweep(self, result: ParallelSweepResult) -> None:
        """Methodology 1: Set sweep results"""
        self.parallel_sweep = result

    def set_multi_period(self, result: MultiPeriodResult) -> None:
        """Methodology 2: Set period validation results"""
        self.multi_period = result

    def set_failure_catalog_size(self, count: int) -> None:
        """Methodology 4: Set failure documentation count"""
        self.failure_catalog_size = count

    def set_architecture_exploration(self, notes: str) -> None:
        """Methodology 5: Set architecture exploration notes"""
        self.architecture_exploration = notes

    def compute_score(self) -> float:
        """Compute overall methodology coverage score (0-100)"""
        score = 0.0
        max_score = 100.0

        # Phase 0: Baseline (mandatory, 20 points)
        if self.baseline:
            score += 20
        else:
            return 0.0  # Can't proceed without baseline

        # Methodology 1: Parallel Sweep (30 points)
        if self.parallel_sweep:
            score += 30
        else:
            score += 0  # High-value but not required

        # Methodology 2: Multi-Period (25 points)
        if self.multi_period and self.multi_period.is_robust:
            score += 25
        elif self.multi_period:
            score += 12.5  # Partial credit if done but not robust

        # Methodology 4: Neg. Results (15 points, requires 10+ failures)
        if self.failure_catalog_size >= 10:
            score += 15
        elif self.failure_catalog_size >= 5:
            score += 7.5

        # Methodology 5: Architecture (10 points)
        if self.architecture_exploration:
            score += 10

        return min(score, max_score)

    def generate_report(self) -> ParadigmFrameworkResult:
        """Generate comprehensive report"""
        methodologies_applied = []
        gaps = []

        if self.baseline:
            methodologies_applied.append("Phase 0: Baseline")
        else:
            gaps.append("Phase 0: Baseline Measurement (required)")

        if self.parallel_sweep:
            methodologies_applied.append("Methodology 1: Parallel Sweep")
        else:
            gaps.append("Methodology 1: Parallel Parameter Sweep (HIGH priority)")

        if self.multi_period:
            methodologies_applied.append("Methodology 2: Multi-Period")
            if not self.multi_period.is_robust:
                gaps.append("⚠️ Multi-period validation shows variance > threshold")
        else:
            gaps.append("Methodology 2: Multi-Period Validation (ESSENTIAL)")

        if self.failure_catalog_size > 0:
            methodologies_applied.append("Methodology 4: Neg. Results")
            if self.failure_catalog_size < 5:
                gaps.append("⚠️ Expand failure catalog to 10+ documented cases")
        else:
            gaps.append("Methodology 4: Negative Result Logging (RECOMMENDED)")

        if self.architecture_exploration:
            methodologies_applied.append("Methodology 5: Architecture")
        else:
            gaps.append("Methodology 5: Multi-Model Architecture Exploration (OPTIONAL)")

        score = self.compute_score()

        return ParadigmFrameworkResult(
            pattern_name=self.pattern_name,
            baseline=self.baseline,
            parallel_sweep=self.parallel_sweep,
            multi_period=self.multi_period,
            failure_catalog_size=self.failure_catalog_size,
            architecture_exploration=self.architecture_exploration,
            overall_score=score,
            methodologies_applied=methodologies_applied,
            gaps=gaps,
        )

    def save_report(self, output_dir: Path) -> Path:
        """Save report as JSON + Markdown"""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        report = self.generate_report()

        # JSON
        json_path = output_dir / f"{self.pattern_name}_paradigm_report.json"
        with open(json_path, "w") as f:
            json.dump(report.dict(), f, indent=2)

        # Markdown
        md_path = output_dir / f"{self.pattern_name}_paradigm_report.md"
        with open(md_path, "w") as f:
            f.write(report.to_markdown())

        return md_path

    @classmethod
    def load_from_json(cls, json_path: Path) -> "ParadigmFramework":
        """Load framework from JSON (for CLI tools)"""
        with open(json_path) as f:
            data = json.load(f)

        fw = cls(data["pattern"])

        if data.get("baseline"):
            fw.set_baseline(BaselineMetrics(**data["baseline"]))

        if data.get("parallel_sweep"):
            fw.set_parallel_sweep(ParallelSweepResult(**data["parallel_sweep"]))

        if data.get("multi_period"):
            fw.set_multi_period(MultiPeriodResult(**data["multi_period"]))

        fw.set_failure_catalog_size(data.get("failure_catalog_size", 0))

        if data.get("architecture_exploration"):
            fw.set_architecture_exploration(data["architecture_exploration"])

        return fw
