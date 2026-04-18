"""Shared rate-limiter instance — imported by main.py and route modules."""
from slowapi import Limiter  # type: ignore[import]
from slowapi.util import get_remote_address  # type: ignore[import]

limiter = Limiter(key_func=get_remote_address)
