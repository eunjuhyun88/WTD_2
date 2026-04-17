"""Synchronous /backtest implementation — runs under `asyncio.to_thread`."""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from fastapi import HTTPException

from api.schemas import (
    BacktestConfig,
    BacktestMetrics,
    BacktestRequest,
    BacktestResponse,
    BlockSet,
)
from backtest.config import RiskConfig
from backtest.simulator import BacktestResult, run_backtest
from backtest.types import EntrySignal
from building_blocks.context import Context
from data_cache.loader import CacheMiss, load_klines, load_perp
from scanner.feature_calc import compute_features_table
from universe.loader import load_universe
from scoring.block_evaluator import _BLOCKS as ALL_BLOCKS

log = logging.getLogger("engine.backtest.thread")

_STAGE1_GATES = {
    "min_trades": 30,
    "min_expectancy": 0.0,
    "max_drawdown": 0.20,
    "min_profit_factor": 1.2,
    "min_sortino": 0.5,
}

_BLOCK_REGISTRY: dict[str, callable] = {name: fn for name, fn in ALL_BLOCKS}


def _check_gates(m: Any, cfg: BacktestConfig) -> tuple[bool, list[str]]:
    failures: list[str] = []
    if m.n_executed < _STAGE1_GATES["min_trades"]:
        failures.append(f"n_trades={m.n_executed} < {_STAGE1_GATES['min_trades']}")
    if m.expectancy_pct <= _STAGE1_GATES["min_expectancy"]:
        failures.append(f"expectancy={m.expectancy_pct:.4f} ≤ 0")
    if abs(m.max_drawdown_pct) > _STAGE1_GATES["max_drawdown"]:
        failures.append(f"max_drawdown={m.max_drawdown_pct:.4f} > 20%")
    if m.profit_factor < _STAGE1_GATES["min_profit_factor"]:
        failures.append(f"profit_factor={m.profit_factor:.2f} < 1.2")
    if m.sortino < _STAGE1_GATES["min_sortino"]:
        failures.append(f"sortino={m.sortino:.2f} < 0.5")
    return len(failures) == 0, failures


def _signal_from_blocks(
    blocks: BlockSet,
    symbol: str,
    klines_df: pd.DataFrame,
    features_df: pd.DataFrame,
) -> list[EntrySignal]:
    triggers = [_BLOCK_REGISTRY[n] for n in blocks.triggers if n in _BLOCK_REGISTRY]
    confirmations = [_BLOCK_REGISTRY[n] for n in blocks.confirmations if n in _BLOCK_REGISTRY]
    entries = [_BLOCK_REGISTRY[n] for n in blocks.entries if n in _BLOCK_REGISTRY]
    disqualifiers = [_BLOCK_REGISTRY[n] for n in blocks.disqualifiers if n in _BLOCK_REGISTRY]

    signals: list[EntrySignal] = []

    for i in range(len(features_df)):
        bar_features = features_df.iloc[: i + 1]
        bar_klines = klines_df.loc[: features_df.index[i]]
        bar_ctx = Context(klines=bar_klines, features=bar_features, symbol=symbol)

        try:
            ok = (
                all(fn(bar_ctx) for fn in triggers)
                and all(fn(bar_ctx) for fn in confirmations)
                and all(fn(bar_ctx) for fn in entries)
                and not any(fn(bar_ctx) for fn in disqualifiers)
            )
        except Exception:
            ok = False

        if ok:
            signals.append(
                EntrySignal(
                    symbol=symbol,
                    entry_bar=features_df.index[i],
                    entry_price=float(features_df.iloc[i]["price"]),
                )
            )

    return signals


def _walk_forward_rate(result: BacktestResult) -> float:
    if not result.trades:
        return 0.0

    trade_df = pd.DataFrame(
        [{"ts": t.entry_bar, "pnl": t.realized_pnl_pct} for t in result.trades]
    ).set_index("ts")
    trade_df.index = pd.to_datetime(trade_df.index, utc=True)

    quarterly = trade_df.resample("QE")["pnl"].mean()
    if len(quarterly) < 4:
        return 0.0

    return float((quarterly > 0).sum() / len(quarterly))


def backtest_sync(req: BacktestRequest) -> BacktestResponse:
    universe = load_universe(req.config.universe)
    if not universe:
        raise HTTPException(status_code=400, detail=f"Unknown universe: {req.config.universe}")

    risk_cfg = RiskConfig(
        stop_loss_pct=req.config.stop_loss,
        take_profit_pct=req.config.take_profit,
        max_hold_bars=req.config.timeout_bars,
    )

    all_signals: list[EntrySignal] = []
    klines_by_symbol: dict[str, pd.DataFrame] = {}
    adv_by_symbol: dict[str, float] = {}

    for symbol in universe:
        try:
            klines_df = load_klines(symbol, offline=True)
            perp_df = load_perp(symbol, offline=True)
        except CacheMiss:
            log.warning("Cache miss for %s — skipping in backtest", symbol)
            continue

        try:
            features_df = compute_features_table(klines_df, symbol, perp=perp_df)
        except Exception as exc:
            log.warning("Feature calc failed for %s: %s", symbol, exc)
            continue

        klines_by_symbol[symbol] = klines_df
        adv_by_symbol[symbol] = float(klines_df["volume"].tail(24).mean())

        sigs = _signal_from_blocks(req.blocks, symbol, klines_df, features_df)
        all_signals.extend(sigs)
        log.debug("%s: %d entry signals", symbol, len(sigs))

    if not all_signals:
        return BacktestResponse(
            metrics=BacktestMetrics(
                n_trades=0,
                win_rate=0.0,
                expectancy=0.0,
                profit_factor=0.0,
                max_drawdown=0.0,
                sortino=0.0,
                walk_forward_pass_rate=0.0,
            ),
            passed=False,
            gate_failures=["No entry signals generated for any symbol in the universe"],
        )

    result: BacktestResult = run_backtest(
        entries=all_signals,
        klines_by_symbol=klines_by_symbol,
        adv_by_symbol=adv_by_symbol,
        risk_cfg=risk_cfg,
    )

    m = result.metrics
    passed, failures = _check_gates(m, req.config)
    wf_rate = _walk_forward_rate(result)

    return BacktestResponse(
        metrics=BacktestMetrics(
            n_trades=m.n_executed,
            win_rate=m.win_rate,
            expectancy=m.expectancy_pct,
            profit_factor=m.profit_factor,
            max_drawdown=abs(m.max_drawdown_pct),
            sortino=m.sortino,
            walk_forward_pass_rate=wf_rate,
        ),
        passed=passed,
        gate_failures=failures,
    )
