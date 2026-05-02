"""LLM judge runtime — /agent/judge (W-0387).

Builds the judge prompt from symbol/timeframe/snapshot/alpha context,
calls the shared LLM runtime, and parses the structured JSON verdict.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any


_JUDGE_SYSTEM = """당신은 퀀트 트레이더 보조 AI입니다.
제공된 차트 스냅샷과 알파 점수를 분석해 진입 판단을 JSON으로만 반환하세요.

출력 형식 (JSON only, 코드펜스 제거):
{
  "verdict": "bullish" | "bearish" | "neutral",
  "entry": <숫자 또는 null>,
  "stop": <숫자 또는 null>,
  "target": <숫자 또는 null>,
  "p_win": <0.0~1.0 또는 null>,
  "rationale": "<한국어 1문장 이내>"
}

판단 기준:
- RSI > 70: 과매수 → bearish 또는 neutral 권장
- RSI < 30: 과매도 → bullish 검토
- alpha_score.verdict STRONG_ALPHA/ALPHA: 방향 신호 강화
- alpha_score.verdict AVOID: neutral 강제
- funding_rate 강한 양수(> 0.01%): 롱 쏠림 → bearish 바이어스
- avg_volume_ratio > 2.0: 유효 브레이크아웃 확인
- 비용 가정: 수수료+슬리피지 10bps. 순익 기대값 10bps 미만이면 neutral.
- entry/stop/target이 불확실하면 null.
- p_win은 0.40~0.75 범위; 추정 불가능이면 null."""


def build_judge_prompt(
    symbol: str,
    timeframe: str,
    snapshot: dict[str, float],
    alpha_score: dict[str, Any] | None,
    last_price: float | None,
) -> str:
    snap_lines = "\n".join(f"  {k}: {v:.4f}" for k, v in snapshot.items())

    alpha_text = ""
    if alpha_score:
        alpha_text = f"\nAlpha Score: {alpha_score.get('score', 'N/A')} [{alpha_score.get('verdict', '')}]"
        for sig in alpha_score.get("signals", [])[:4]:
            alpha_text += f"\n  {sig.get('label', '')}: {sig.get('raw_value', '')}"

    price_text = f"\nLast Price: {last_price}" if last_price is not None else ""

    return (
        f"심볼: {symbol} ({timeframe})\n"
        f"지표 스냅샷:\n{snap_lines}"
        f"{alpha_text}"
        f"{price_text}"
    )


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _clamp_p_win(v: float | None) -> float | None:
    if v is None:
        return None
    if not math.isfinite(v):
        return None
    return max(0.0, min(1.0, v))


def parse_verdict(raw: str) -> dict[str, Any]:
    """Parse LLM JSON output into a verdict dict. Falls back to neutral on any error."""
    try:
        text = _strip_code_fence(raw)
        # Extract first JSON object if surrounded by extra text
        m = re.search(r"\{[^{}]*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
        data = json.loads(text)
    except Exception:
        return _neutral_fallback()

    verdict = data.get("verdict", "neutral")
    if verdict not in ("bullish", "bearish", "neutral"):
        verdict = "neutral"

    def _safe_float(v: Any) -> float | None:
        if v is None:
            return None
        try:
            f = float(v)
            return f if math.isfinite(f) else None
        except (TypeError, ValueError):
            return None

    return {
        "verdict": verdict,
        "entry": _safe_float(data.get("entry")),
        "stop": _safe_float(data.get("stop")),
        "target": _safe_float(data.get("target")),
        "p_win": _clamp_p_win(_safe_float(data.get("p_win"))),
        "rationale": str(data.get("rationale", ""))[:300],
    }


def _neutral_fallback() -> dict[str, Any]:
    return {
        "verdict": "neutral",
        "entry": None,
        "stop": None,
        "target": None,
        "p_win": None,
        "rationale": "판정 실패 — 관망 권장",
    }


def compute_rr(
    entry: float | None,
    stop: float | None,
    target: float | None,
) -> float | None:
    if entry is None or stop is None or target is None:
        return None
    risk = abs(entry - stop)
    if risk == 0:
        return None
    reward = abs(target - entry)
    return reward / risk
