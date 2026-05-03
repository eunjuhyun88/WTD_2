"""TTLCache and Singleflight — no external cache libraries required."""
from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Any, Callable, Coroutine


class TTLCache:
    """Simple LRU cache with TTL eviction.

    Items are evicted:
    - When their TTL has expired (checked on access)
    - When max_size is exceeded (LRU eviction)
    """

    def __init__(self, max_size: int = 256, ttl: float = 60.0) -> None:
        self._max_size = max_size
        self._ttl = ttl
        # OrderedDict preserves insertion order for LRU tracking
        # value: (data, expire_at)
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        """Return cached value or None if missing/expired."""
        if key not in self._store:
            return None
        value, expire_at = self._store[key]
        if time.monotonic() > expire_at:
            del self._store[key]
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        """Store a value with the configured TTL."""
        expire_at = time.monotonic() + self._ttl
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = (value, expire_at)
        # Evict oldest if over capacity
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

    def delete(self, key: str) -> None:
        """Remove a key explicitly."""
        self._store.pop(key, None)

    def __len__(self) -> int:
        return len(self._store)


class Singleflight:
    """Ensure only one coroutine executes per key at a time.

    If multiple concurrent callers request the same key simultaneously,
    only the first coroutine runs; the rest await its result.
    """

    def __init__(self) -> None:
        # Maps key → asyncio.Future that will hold the in-flight result
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        # Mutex to protect _inflight dict
        self._mu = asyncio.Lock()

    async def call(
        self, key: str, coro_fn: Callable[[], Coroutine[Any, Any, Any]]
    ) -> Any:
        """Call coro_fn() for key, de-duplicating concurrent callers.

        The first caller creates a Future and runs coro_fn().
        Subsequent callers with the same key await that Future.
        """
        async with self._mu:
            if key in self._inflight:
                # Join existing in-flight request
                fut = self._inflight[key]
                is_leader = False
            else:
                # Become the leader for this key
                loop = asyncio.get_event_loop()
                fut = loop.create_future()
                self._inflight[key] = fut
                is_leader = True

        if not is_leader:
            return await asyncio.shield(fut)

        # Leader: execute the coroutine and settle the future
        try:
            result = await coro_fn()
            fut.set_result(result)
            return result
        except Exception as exc:
            fut.set_exception(exc)
            raise
        finally:
            async with self._mu:
                self._inflight.pop(key, None)
