import asyncio

from worker import main as worker_main


class _ImmediateStopEvent:
    def set(self) -> None:
        return None

    async def wait(self) -> None:
        return None


def test_run_worker_starts_and_stops_scheduler(monkeypatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(worker_main.asyncio, "Event", _ImmediateStopEvent)
    monkeypatch.setattr(worker_main, "start_scheduler", lambda: calls.append("start"))
    monkeypatch.setattr(worker_main, "stop_scheduler", lambda: calls.append("stop"))
    monkeypatch.setattr(worker_main, "is_running", lambda: True)

    asyncio.run(worker_main._run_worker())

    assert calls == ["start", "stop"]
