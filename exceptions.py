"""Error taxonomy for cogochi-autoresearch.

All errors raised by cogochi modules should inherit from :class:`CogochiError`.
Callers distinguish recoverable (e.g. ``CacheMiss``) from fatal
(e.g. ``SchemaVersionMismatch``, ``ConfigValidationError``) via the class
hierarchy. Phase D12 introduces the taxonomy; older modules re-export the
pre-existing ``CacheMiss`` from here for backward compatibility.
"""
from __future__ import annotations


class CogochiError(Exception):
    """Base class for all cogochi-autoresearch errors."""


class CacheMiss(CogochiError):
    """Symbol not present in the local kline cache.

    Raised by ``data_cache.loader`` in offline mode. Callers that wish to
    continue should catch this explicitly and skip the symbol.
    """


class InsufficientDataError(CogochiError):
    """Not enough historical bars for a required computation.

    Raised e.g. when a feature that needs a 60-bar lookback is evaluated
    at row 10, or when a backtest window has fewer bars than the
    configured ``horizon_bars``.
    """


class InvalidFeatureValueError(CogochiError):
    """Feature computation produced a NaN/Inf where a finite value was expected.

    Fatal by default — a NaN feature silently propagated into a classifier
    is a leakage vector, so we prefer to crash early.
    """


class ModelLoadError(CogochiError):
    """Could not load a persisted model artifact.

    Wraps the underlying ``FileNotFoundError`` / ``RuntimeError`` / library
    error so callers can distinguish model-loading failures from genuine
    inference failures.
    """


class ConfigValidationError(CogochiError):
    """A user-supplied config (yaml or CLI override) failed validation.

    Raised by ``backtest.config.RiskConfig.validate`` and similar. The
    message should include the offending field name and the invalid value.
    """


class SchemaVersionMismatch(CogochiError):
    """Persisted data or model schema does not match the expected version.

    Fatal — bumping the schema version is a deliberate, traceable decision.
    """
