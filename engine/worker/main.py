"""Worker-control runtime for background scheduler jobs.

Runs APScheduler-driven background jobs outside the public engine-api process.
"""
from __future__ import annotations

import asyncio
import logging
import signal

from scanner.scheduler import start_scheduler, stop_scheduler, is_running

log = logging.getLogger("engine.worker")


async def _run_worker() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _handle_sig() -> None:
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_sig)
        except NotImplementedError:
            signal.signal(sig, lambda _signum, _frame: stop.set())

    start_scheduler()
    log.info("worker-control started (scheduler_running=%s)", is_running())
    try:
        await stop.wait()
    finally:
        stop_scheduler()
        log.info("worker-control stopped")


def main() -> None:
    asyncio.run(_run_worker())


if __name__ == "__main__":
    main()
