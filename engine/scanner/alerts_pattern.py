"""Per-symbol pattern entry alert formatter and sender.

Sends a detailed, actionable Telegram message when a symbol enters a
pattern's entry_phase:

    🟢 FARTCOINUSDT — VAR Entry Signal
    Pattern: Volume Absorption Reversal
    Phase: BASE_FORMATION (2h 경과)

    Price: $0.1234
    Entry zone: $0.1180 – $0.1260
    Target:     $0.1482 (+20%)
    Stop:       $0.1048 (-15%)

    ML P(win): 68%  |  BTC: neutral
    Phase score: 0.72  |  Blocks: delta_flip_positive, higher_lows_sequence

    [✓ 진입] [✗ 패스] [👀 워치]

Design decisions:
  - p_win gate: only send when entry_p_win >= P_WIN_GATE (default 0.55).
    If ML is not trained, send anyway (p_win = None → no gate).
  - Entry zone: current price ± ENTRY_BAND_PCT (default ±2%).
  - Target / stop: per-pattern hardcoded defaults, derived from benchmark
    avg gains and Wyckoff/quant risk management practice.
  - BTC regime: from feature_snapshot["regime"] field.
  - Dedup: caller (pattern_scan_job) already filters to NEW candidates only.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable, Optional

from cache.http_client import get_client
from capture.store import CaptureStore
from patterns.model_registry import resolve_threshold as _resolve_threshold
from scanner._verdict_link import build_verdict_url

log = logging.getLogger("engine.scanner.alerts_pattern")

TELEGRAM_API = "https://api.telegram.org/bot{token}"

# p_win gate: skip alert if ML model is trained AND p_win < this value.
# Default derived from policy version 1 (0.55) so the constant stays in sync
# with resolve_threshold's policy table (W-0358).
_DEFAULT_P_WIN_GATE = _resolve_threshold(1)  # policy_version=1 → 0.55
P_WIN_GATE: float = float(os.environ.get("PATTERN_ALERT_P_WIN_GATE", str(_DEFAULT_P_WIN_GATE)))

# Per-pattern entry zone / target / stop defaults (as fractions of current price).
# Source: benchmark avg gains from W-0086/W-0091/W-0100 + quant risk management.
_PATTERN_LEVELS: dict[str, dict[str, float]] = {
    "tradoor-oi-reversal-v1": {
        "entry_band":  0.03,   # ±3% entry zone
        "target_pct":  0.35,   # +35% target (benchmark avg: +36% / +60% / +111%)
        "stop_pct":    0.12,   # -12% stop
    },
    "funding-flip-reversal-v1": {
        "entry_band":  0.02,
        "target_pct":  0.25,   # +25% (short squeeze avg)
        "stop_pct":    0.10,
    },
    "wyckoff-spring-reversal-v1": {
        "entry_band":  0.02,
        "target_pct":  0.18,   # +18% (benchmark avg: ENA +20.3%, FARTCOIN +14.2%)
        "stop_pct":    0.08,
    },
    "whale-accumulation-reversal-v1": {
        "entry_band":  0.03,
        "target_pct":  0.30,
        "stop_pct":    0.12,
    },
    "volume-absorption-reversal-v1": {
        "entry_band":  0.02,
        "target_pct":  0.20,   # TBD — benchmark pending Slice 2
        "stop_pct":    0.10,
    },
}
_DEFAULT_LEVELS = {"entry_band": 0.025, "target_pct": 0.20, "stop_pct": 0.10}

# Friendly pattern names
_PATTERN_NAMES: dict[str, str] = {
    "tradoor-oi-reversal-v1":          "OI 반전 (TRADOOR)",
    "funding-flip-reversal-v1":        "펀딩 플립 반전 (FFR)",
    "wyckoff-spring-reversal-v1":      "Wyckoff 스프링 반전",
    "whale-accumulation-reversal-v1":  "세력 매집 반전",
    "volume-absorption-reversal-v1":   "볼륨 흡수 반전 (VAR)",
}

_REGIME_KO: dict[str, str] = {
    "bullish": "상승",
    "bearish": "하락",
    "neutral": "중립",
    "sideways": "횡보",
}


def _get_config() -> tuple[Optional[str], Optional[str]]:
    return os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")


def compute_entry_levels(price: float, pattern_slug: str) -> dict[str, float]:
    """Return entry_low, entry_high, target, stop for a given price and pattern."""
    lvl = _PATTERN_LEVELS.get(pattern_slug, _DEFAULT_LEVELS)
    band   = lvl["entry_band"]
    target = lvl["target_pct"]
    stop   = lvl["stop_pct"]
    return {
        "entry_low":  price * (1 - band),
        "entry_high": price * (1 + band),
        "target":     price * (1 + target),
        "stop":       price * (1 - stop),
        "target_pct": target,
        "stop_pct":   stop,
    }


def _fmt_price(p: float) -> str:
    """Format price: use 4 decimal places for small prices, 2 for large."""
    if p >= 1000:
        return f"${p:,.1f}"
    if p >= 1:
        return f"${p:,.3f}"
    return f"${p:.5f}"


def _pwin_passes_gate(p_win: float | None) -> bool:
    """Return True if alert should be sent given the p_win value.

    - None (model not trained): always send — we have no ML signal yet.
    - float: send only if >= P_WIN_GATE.
    """
    if p_win is None:
        return True
    return p_win >= P_WIN_GATE


def format_entry_alert(record: dict[str, Any]) -> str:
    """Format a candidate record into an actionable Telegram HTML message."""
    symbol      = record.get("symbol", "UNKNOWN")
    slug        = record.get("slug", "")
    phase_label = record.get("phase_label", record.get("phase", ""))
    bars        = record.get("bars_in_phase", 0)
    p_win       = record.get("entry_p_win")
    phase_score = record.get("confidence")
    blocks      = record.get("blocks_triggered") or []

    snap: dict = record.get("feature_snapshot") or {}
    price  = snap.get("price") or snap.get("close")
    regime = snap.get("regime", "unknown")

    pattern_name = _PATTERN_NAMES.get(slug, slug)
    regime_ko    = _REGIME_KO.get(str(regime).lower(), str(regime))

    # Entry levels
    levels: dict[str, float] | None = None
    if price and price > 0:
        levels = compute_entry_levels(float(price), slug)

    # Header
    signal_emoji = "🟢"
    lines = [
        f"{signal_emoji} <b>{symbol}</b> — 패턴 진입 신호",
        f"패턴: {pattern_name}",
        f"페이즈: <code>{phase_label}</code> ({bars}봉 경과)",
        "",
    ]

    # Price / levels
    if price:
        lines.append(f"현재가: <code>{_fmt_price(float(price))}</code>")
    if levels:
        lines.append(
            f"진입 존: <code>{_fmt_price(levels['entry_low'])} – "
            f"{_fmt_price(levels['entry_high'])}</code>"
        )
        lines.append(
            f"목표가:  <code>{_fmt_price(levels['target'])}</code> "
            f"(+{levels['target_pct']:.0%})"
        )
        lines.append(
            f"손절가:  <code>{_fmt_price(levels['stop'])}</code> "
            f"(-{levels['stop_pct']:.0%})"
        )
    lines.append("")

    # ML / regime row
    meta_parts: list[str] = []
    if p_win is not None:
        meta_parts.append(f"ML P(win): <code>{p_win:.0%}</code>")
    meta_parts.append(f"BTC: <code>{regime_ko}</code>")
    if phase_score is not None:
        meta_parts.append(f"스코어: <code>{float(phase_score):.2f}</code>")
    lines.append("  |  ".join(meta_parts))

    # Triggered blocks (max 5)
    if blocks:
        preview = ", ".join(str(b) for b in blocks[:5])
        if len(blocks) > 5:
            preview += f" +{len(blocks) - 5}"
        lines.append(f"블록: <code>{preview}</code>")

    return "\n".join(lines)




def _make_feedback_keyboard(transition_id: str | None) -> dict | None:
    """Build inline keyboard for HIT/MISS/WATCH feedback."""
    if not transition_id:
        return None
    return {
        "inline_keyboard": [[
            {"text": "✓ 진입", "callback_data": f"verdict:hit:{transition_id}"},
            {"text": "✗ 패스", "callback_data": f"verdict:miss:{transition_id}"},
            {"text": "👀 워치", "callback_data": f"verdict:watch:{transition_id}"},
        ]]
    }


async def send_pattern_entry_alert(
    record: dict[str, Any],
    *,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """Send a per-symbol detailed entry alert to Telegram.

    Applies p_win gate: skips if ML is trained and p_win < P_WIN_GATE.

    Returns True if sent successfully, False if skipped or failed.
    """
    _token  = token  or _get_config()[0]
    _chat_id = chat_id or _get_config()[1]

    if not _token or not _chat_id:
        log.debug("Telegram not configured — skipping entry alert for %s", record.get("symbol"))
        return False

    p_win = record.get("entry_p_win")
    if not _pwin_passes_gate(p_win):
        log.info(
            "p_win gate: skipping %s %s (p_win=%.2f < %.2f)",
            record.get("symbol"), record.get("slug"), p_win, P_WIN_GATE,
        )
        return False

    # W-0284 gate_v2 filter: skip alert if V-track validation explicitly failed
    if os.environ.get("GATE_V2_ALERT_FILTER", "1") == "1":
        try:
            from patterns.active_variant_registry import ActivePatternVariantStore
            from research.validation.actuator import GateV2DecisionStore
            slug = record.get("slug") or record.get("pattern_slug")
            if slug is not None:
                variant_entry = ActivePatternVariantStore().get(slug)
                research_run_id = variant_entry.research_run_id if variant_entry else None
                if research_run_id is not None:
                    gate_validated = GateV2DecisionStore().load(research_run_id)
                    if gate_validated is False:  # explicit False only; None = no data = pass through
                        log.info(
                            "alert suppressed by gate_v2: slug=%s research_run_id=%s",
                            slug, research_run_id,
                        )
                        return False
                else:
                    log.debug("gate_v2 check: no research_run_id for slug=%s — passing through", slug)
        except Exception as _g2_exc:
            log.debug("gate_v2 check failed (non-fatal): %s", _g2_exc)

    text     = format_entry_alert(record)

    # F-3: append verdict deep-link URL (graceful degrade if unavailable)
    verdict_url = build_verdict_url(
        symbol=record.get("symbol"),
        pattern_slug=record.get("slug") or record.get("pattern_slug"),
        transition_id=record.get("transition_id"),
        candidate_transition_id=record.get("candidate_transition_id"),
    )
    if verdict_url:
        text = text + f"\n\n📊 <a href=\"{verdict_url}\">Verdict 제출 (72h 만료)</a>"

    keyboard = _make_feedback_keyboard(record.get("transition_id"))
    url      = f"{TELEGRAM_API.format(token=_token)}/sendMessage"

    payload: dict[str, Any] = {
        "chat_id": _chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if keyboard:
        payload["reply_markup"] = keyboard

    try:
        client = get_client()
        resp = await client.post(url, json=payload, timeout=10.0)
        if resp.status_code == 200:
            log.info("Entry alert sent: %s %s", record.get("symbol"), record.get("slug"))
            return True
        log.warning(
            "Entry alert HTTP %d for %s: %s",
            resp.status_code, record.get("symbol"), resp.text[:200],
        )
        return False
    except Exception as exc:
        log.warning("Entry alert failed for %s: %s", record.get("symbol"), exc)
        return False


async def send_pattern_entry_alerts(
    new_candidate_keys: set[str],
    scan_result: dict[str, Any],
    *,
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> int:
    """Send per-symbol entry alerts for all new entry candidates.

    Args:
        new_candidate_keys: Set of "slug:symbol" keys for newly entered candidates.
        scan_result: Result dict from run_pattern_scan (contains entry_candidates).
        token: Telegram bot token (falls back to env var).
        chat_id: Telegram chat ID (falls back to env var).

    Returns:
        Number of alerts successfully sent.
    """
    from patterns.scanner import get_candidate_records

    if not new_candidate_keys:
        return 0

    # Get full candidate records (includes price, phase_score, p_win, blocks)
    try:
        all_records = get_candidate_records()
    except Exception as exc:
        log.warning("Could not fetch candidate records for alerts: %s", exc)
        return 0

    sent = 0
    for slug, records in all_records.items():
        for record in records:
            key = f"{slug}:{record.get('symbol', '')}"
            if key not in new_candidate_keys:
                continue
            ok = await send_pattern_entry_alert(record, token=token, chat_id=chat_id)
            if ok:
                sent += 1

    return sent
