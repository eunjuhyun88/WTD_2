"""Tests for W-0336: beta job gate defaults.

Verifies that outcome_resolver, refinement_trigger, fetch_okx_signals default to ON,
and that corpus/prefetch/observer gates remain OFF by default.
"""
from __future__ import annotations

import importlib
import os
import sys

import pytest


def _reload_scheduler(env_overrides: dict[str, str] | None = None, monkeypatch=None):
    """Reload scanner.scheduler with clean env to test default gate values."""
    if monkeypatch and env_overrides:
        for key, val in env_overrides.items():
            monkeypatch.setenv(key, val)
    # Remove the module from sys.modules to force re-evaluation of module-level globals
    for mod_name in list(sys.modules.keys()):
        if "scanner.scheduler" in mod_name or mod_name == "scanner.scheduler":
            del sys.modules[mod_name]
    import scanner.scheduler as m
    return m


class TestFlywheelGatesDefaultOn:
    def test_outcome_resolver_default_true(self, monkeypatch):
        monkeypatch.delenv("ENABLE_OUTCOME_RESOLVER_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("outcome_resolver") is True

    def test_refinement_trigger_default_true(self, monkeypatch):
        monkeypatch.delenv("ENABLE_REFINEMENT_TRIGGER_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("refinement_trigger") is True

    def test_fetch_okx_signals_default_true(self, monkeypatch):
        monkeypatch.delenv("ENABLE_FETCH_OKX_SIGNALS_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("fetch_okx_signals") is True


class TestInfraGatesRemainOff:
    def test_corpus_bridge_default_false(self, monkeypatch):
        monkeypatch.delenv("ENABLE_CORPUS_BRIDGE_SYNC_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("corpus_bridge_sync") is False

    def test_feature_windows_prefetch_default_false(self, monkeypatch):
        monkeypatch.delenv("ENABLE_FEATURE_WINDOWS_PREFETCH_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("feature_windows_prefetch") is False

    def test_alpha_observer_cold_default_false(self, monkeypatch):
        monkeypatch.delenv("ENABLE_ALPHA_OBSERVER_COLD_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("alpha_observer_cold") is False

    def test_alpha_observer_warm_default_false(self, monkeypatch):
        monkeypatch.delenv("ENABLE_ALPHA_OBSERVER_WARM_JOB", raising=False)
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("alpha_observer_warm") is False


class TestEnvOverrideWorks:
    def test_outcome_resolver_can_be_disabled_via_env(self, monkeypatch):
        monkeypatch.setenv("ENABLE_OUTCOME_RESOLVER_JOB", "false")
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("outcome_resolver") is False

    def test_corpus_bridge_can_be_enabled_via_env(self, monkeypatch):
        monkeypatch.setenv("ENABLE_CORPUS_BRIDGE_SYNC_JOB", "true")
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("corpus_bridge_sync") is True

    def test_unknown_job_defaults_true(self, monkeypatch):
        # _job_enabled fallback for unknown key is "true"
        m = _reload_scheduler(monkeypatch=monkeypatch)
        assert m._job_enabled("nonexistent_job_xyz") is True
