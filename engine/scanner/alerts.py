"""Alert dispatcher: send signals to Telegram (and future: Discord, FCM).

Design:
    - Stateless: each alert is fire-and-forget
    - Rate-limited: max 20 messages/min per chat (Telegram limit: 30/min)
    - Formatting: Markdown with emoji for direction + confidence
    - Inline keyboard: [✓ HIT] [✗ MISS] buttons for user feedback
    - Feedback webhook → trade_log → Hill Climbing retraining loop

Configuration via environment variables:
    TELEGRAM_BOT_TOKEN   — BotFather token
    TELEGRAM_CHAT_ID     — Default chat ID for alerts
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from cache.http_client import get_client

log = logging.getLogger("engine.alerts")

TELEGRAM_API = "https://api.telegram.org/bot{token}"


def _get_config() -> tuple[Optional[str], Optional[str]]:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    return token, chat_id


def _direction_emoji(direction: str) -> str:
    return {
        "strong_long": "\U0001f7e2\U0001f7e2",   # 🟢🟢
        "long": "\U0001f7e2",                       # 🟢
        "short": "\U0001f534",                       # 🔴
        "strong_short": "\U0001f534\U0001f534",     # 🔴🔴
    }.get(direction, "\u26aa")                       # ⚪


def _confidence_bar(confidence: str) -> str:
    return {"high": "\u2588\u2588\u2588", "medium": "\u2588\u2588\u2591", "low": "\u2588\u2591\u2591"}.get(confidence, "\u2591\u2591\u2591")


def format_signal_message(signal: dict) -> str:
    """Format a ScanSignal dict into a Telegram message."""
    emoji = _direction_emoji(signal["direction"])
    conf = _confidence_bar(signal["confidence"])
    blocks = ", ".join(signal.get("blocks_triggered", [])[:5])
    if len(signal.get("blocks_triggered", [])) > 5:
        blocks += f" +{len(signal['blocks_triggered']) - 5} more"

    p_win_str = f"{signal['p_win']:.0%}" if signal.get("p_win") is not None else "N/A"

    lines = [
        f"{emoji} *{signal['symbol']}* {signal['direction'].upper().replace('_', ' ')}",
        f"",
        f"Price: `${signal['price']:,.2f}`",
        f"Ensemble: `{signal['ensemble_score']:.0%}` {conf}",
        f"ML P(win): `{p_win_str}`",
        f"Regime: `{signal.get('regime', 'unknown')}`",
    ]

    if blocks:
        lines.append(f"Blocks: `{blocks}`")

    if signal.get("reason"):
        lines.append(f"_\\({signal['reason']}\\)_")

    return "\n".join(lines)


def format_pattern_engine_message(alert: dict) -> str:
    """Format a Pattern Engine scheduler alert for Telegram.

    Unlike realtime scanner alerts, the background scheduler does not produce
    an ensemble direction/confidence object. The message therefore sticks to
    concrete facts: symbol, timeframe, triggered blocks, regime, and p(win).
    """
    snapshot = alert.get("snapshot") or {}
    blocks = list(alert.get("blocks_triggered") or [])
    symbol = str(alert.get("symbol", "UNKNOWN"))
    timeframe = str(alert.get("timeframe", "4h"))
    price = snapshot.get("price")
    regime = snapshot.get("regime", "unknown")
    p_win = alert.get("p_win")

    block_preview = ", ".join(blocks[:6]) if blocks else "none"
    if len(blocks) > 6:
        block_preview += f" +{len(blocks) - 6} more"

    lines = [
        "\U0001f989 <b>Pattern Engine Alert</b>",
        f"<b>{symbol}</b> · <code>{timeframe}</code>",
    ]
    if price is not None:
        lines.append(f"Price: <code>${float(price):,.2f}</code>")
    if p_win is not None:
        lines.append(f"ML P(win): <code>{float(p_win):.0%}</code>")
    lines.append(f"Regime: <code>{regime}</code>")
    lines.append(f"Blocks: <code>{block_preview}</code>")
    return "\n".join(lines)


async def send_telegram_alert(
    signal: dict,
    *,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
    signal_id: Optional[str] = None,
) -> bool:
    """Send a signal alert to Telegram with inline feedback buttons.

    Returns True if sent successfully.
    """
    _token = token or _get_config()[0]
    _chat_id = chat_id or _get_config()[1]

    if not _token or not _chat_id:
        log.debug("Telegram not configured — skipping alert")
        return False

    text = format_signal_message(signal)
    url = f"{TELEGRAM_API.format(token=_token)}/sendMessage"

    # Inline keyboard for feedback
    keyboard = None
    if signal_id:
        keyboard = {
            "inline_keyboard": [[
                {"text": "\u2713 HIT", "callback_data": f"verdict:hit:{signal_id}"},
                {"text": "\u2717 MISS", "callback_data": f"verdict:miss:{signal_id}"},
                {"text": "\u23f8 VOID", "callback_data": f"verdict:void:{signal_id}"},
            ]]
        }

    payload: dict = {
        "chat_id": _chat_id,
        "text": text,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": True,
    }
    if keyboard:
        payload["reply_markup"] = keyboard

    try:
        client = get_client()
        resp = await client.post(url, json=payload, timeout=10.0)
        if resp.status_code == 200:
            log.info("Telegram alert sent: %s %s", signal["symbol"], signal["direction"])
            return True
        else:
            # Retry with plain text if markdown fails
            payload["parse_mode"] = "HTML"
            payload["text"] = text.replace("*", "<b>").replace("`", "<code>")
            resp2 = await client.post(url, json=payload, timeout=10.0)
            return resp2.status_code == 200
    except Exception as exc:
        log.warning("Telegram send failed: %s", exc)
        return False


async def send_scan_summary(
    scan_result: dict,
    *,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """Send a summary of the scan cycle to Telegram."""
    _token = token or _get_config()[0]
    _chat_id = chat_id or _get_config()[1]

    if not _token or not _chat_id:
        return False

    n_signals = scan_result.get("n_signals", 0)
    n_symbols = scan_result.get("n_symbols", 0)
    duration = scan_result.get("duration_sec", 0)

    if n_signals == 0:
        text = f"\U0001f50d Scan complete: {n_symbols} symbols, no signals ({duration:.1f}s)"
    else:
        text = f"\U0001f50d Scan: {n_signals} signals from {n_symbols} symbols ({duration:.1f}s)"

    url = f"{TELEGRAM_API.format(token=_token)}/sendMessage"

    try:
        client = get_client()
        resp = await client.post(url, json={
            "chat_id": _chat_id,
            "text": text,
            "disable_notification": n_signals == 0,
        }, timeout=10.0)
        return resp.status_code == 200
    except Exception:
        return False


async def send_pattern_engine_alert(
    alert: dict,
    *,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """Send one Pattern Engine scheduler hit to Telegram."""
    _token = token or _get_config()[0]
    _chat_id = chat_id or _get_config()[1]

    if not _token or not _chat_id:
        log.debug("Telegram not configured — skipping pattern alert")
        return False

    url = f"{TELEGRAM_API.format(token=_token)}/sendMessage"
    payload = {
        "chat_id": _chat_id,
        "text": format_pattern_engine_message(alert),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        client = get_client()
        resp = await client.post(url, json=payload, timeout=10.0)
        return resp.status_code == 200
    except Exception as exc:
        log.warning("Telegram pattern alert failed: %s", exc)
        return False


async def send_pattern_scan_summary(
    scan_result: dict,
    *,
    universe_name: str | None = None,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """Send a compact summary for state-machine entry candidates."""
    _token = token or _get_config()[0]
    _chat_id = chat_id or _get_config()[1]

    if not _token or not _chat_id:
        return False

    entry_candidates = scan_result.get("entry_candidates", {}) or {}
    total_candidates = sum(len(v) for v in entry_candidates.values())
    preview_lines: list[str] = []
    for slug, symbols in entry_candidates.items():
        preview = ", ".join(symbols[:5])
        suffix = f" +{len(symbols) - 5}" if len(symbols) > 5 else ""
        preview_lines.append(f"{slug}: {preview}{suffix}")

    lines = [
        "\U0001f989 Pattern scan summary",
        f"Universe: {universe_name or 'default'}",
        f"Symbols: {scan_result.get('n_symbols', 0)}",
        f"Evaluated: {scan_result.get('n_evaluated', 0)}",
        f"Entry candidates: {total_candidates}",
    ]
    if preview_lines:
        lines.extend(preview_lines[:4])

    url = f"{TELEGRAM_API.format(token=_token)}/sendMessage"
    try:
        client = get_client()
        resp = await client.post(
            url,
            json={
                "chat_id": _chat_id,
                "text": "\n".join(lines),
                "disable_web_page_preview": True,
            },
            timeout=10.0,
        )
        return resp.status_code == 200
    except Exception as exc:
        log.warning("Telegram pattern summary failed: %s", exc)
        return False
