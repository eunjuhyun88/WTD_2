"""Canonical search-plane package."""

from .corpus import CorpusWindow, SearchCorpusStore, build_corpus_windows
from .runtime import get_scan, get_seed_search, run_scan, run_seed_search

__all__ = [
    "CorpusWindow",
    "SearchCorpusStore",
    "build_corpus_windows",
    "get_scan",
    "get_seed_search",
    "run_scan",
    "run_seed_search",
]
