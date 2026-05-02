"""Event Tracker — W-0099 Pattern Discovery Agent infrastructure.

Detects extreme market events (funding extremes, OI spikes, compression),
tracks 24/48/72h outcomes, and classifies events as predictive or not.
Feed predictive events into BenchmarkPackBuilder to auto-generate benchmark
packs for pattern-benchmark-search.
"""
from research.discovery.event_tracker.detector import ExtremeEventDetector
from research.discovery.event_tracker.models import ExtremeEvent
from research.discovery.event_tracker.tracker import OutcomeTracker

__all__ = ["ExtremeEventDetector", "ExtremeEvent", "OutcomeTracker"]
