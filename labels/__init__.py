"""Adapters that turn Track B output (patterns + matching snapshots) into
natural-language training data for the Track A LoRA pipeline.

Layers:
  - verbalizer.py — SignalSnapshot or features-table row → human text
  - label_generator.py — Pattern + features_df + forward_returns
                         → list of {"input": ..., "output": ...} examples,
                           with both positives (pattern matched) and
                           negatives (random non-matches labelled NEUTRAL)
"""
from labels.label_generator import format_label, generate_examples
from labels.verbalizer import verbalize_snapshot

__all__ = ["verbalize_snapshot", "format_label", "generate_examples"]
