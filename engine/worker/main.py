"""Worker-control runtime for background scheduler jobs.

Runs APScheduler-driven background jobs outside the public engine-api process.
"""
from __future__ import annotations

import logging
import signal
import time

from scanner.scheduler import start_scheduler, stop_scheduler, is_running

log = logging.getLogger("engine.worker")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
    stop = {"flag": False}

    def _handle_sig(_signum, _frame):
        stop["flag"] = True

    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    start_scheduler()
    log.info("worker-control started (scheduler_running=%s)", is_running())
    try:
        while not stop["flag"]:
            time.sleep(1.0)
    finally:
        stop_scheduler()
        log.info("worker-control stopped")


if __name__ == "__main__":
    main()

