"""Quota helpers — daily message counting via Postgres.

Primary quota enforcement is in the SvelteKit BFF (app/).
This module provides engine-side helpers for internal use.
"""
from __future__ import annotations

import logging
import os
from datetime import date

log = logging.getLogger("engine.agents.quota")

QUOTA_LIMITS = {
    "free": 20,
    "pro": 500,
    "team": 2000,
}


def get_daily_limit(tier: str) -> int:
    return QUOTA_LIMITS.get(tier, QUOTA_LIMITS["free"])
