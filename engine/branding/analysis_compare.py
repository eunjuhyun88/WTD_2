"""트레이딩 분석 텍스트 → 신호 추출 비교.

Claude Haiku vs Gemma 4 (HuggingFace) 성능 비교.

사용법:
    uv run python -m branding.analysis_compare

환경변수:
    HF_TOKEN            HuggingFace API 토큰
    ANTHROPIC_API_KEY   Claude API 키 (없으면 skip)
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

# ─── 우리 building block 전체 목록 (block_evaluator.py와 동기화) ────────────
KNOWN_BLOCKS = [
    "bullish_engulfing", "bearish_engulfing", "long_lower_wick", "long_upper_wick",
    "rsi_threshold", "rsi_bullish_divergence", "rsi_bearish_divergence", "support_bounce",
    "recent_rally", "recent_decline", "gap_up", "gap_down",
    "breakout_above_high", "breakout_volume_confirm", "consolidation_then_breakout",
    "volume_spike", "volume_spike_down", "sweep_below_low",
    "golden_cross", "dead_cross", "ema_pullback", "bollinger_squeeze", "bollinger_expansion",
    "funding_extreme", "funding_flip", "positive_funding_bias",
    "higher_lows_sequence", "ls_ratio_recovery",
    "oi_change", "oi_expansion_confirm", "oi_hold_after_spike", "oi_spike_with_dump",
    "oi_price_lag_detect",
    "cvd_state_eq", "cvd_buying", "delta_flip_positive",
    "absorption_signal", "post_dump_compression", "reclaim_after_dump", "sideways_compression",
    "social_sentiment_spike", "kol_signal", "fear_greed_rising",
    "volume_below_average", "extreme_volatility", "coinbase_premium_weak",
]

_SYSTEM_PROMPT = f"""너는 암호화폐 트레이딩 신호 분석 AI야.

트레이딩 분석 텍스트를 읽고 아래 JSON 형식으로만 응답해:

{{
  "symbol": "심볼명USDT (모르면 null)",
  "bias": "bullish | bearish | neutral",
  "watch_blocks": ["블록명1", "블록명2"],
  "entry_condition": "진입 조건 한 줄 요약",
  "risk_note": "리스크 한 줄 요약"
}}

watch_blocks는 아래 목록에서만 선택해:
{json.dumps(KNOWN_BLOCKS, ensure_ascii=False)}

JSON만 출력. 설명 없이."""


@dataclass
class ParseResult:
    provider: str
    symbol: str | None
    bias: str
    watch_blocks: list[str]
    entry_condition: str
    risk_note: str
    latency_ms: int
    raw: str


def _parse_json(text: str) -> dict:
    """응답에서 JSON 추출."""
    text = text.strip()
    # 코드블록 제거
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except Exception:
        # 부분 파싱 시도
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        return {}


def _call_claude(analysis: str) -> ParseResult:
    import anthropic
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    t0 = time.time()
    client = anthropic.Anthropic(api_key=key)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": analysis}],
    )
    latency = int((time.time() - t0) * 1000)
    raw = msg.content[0].text.strip()
    d = _parse_json(raw)

    return ParseResult(
        provider="Claude Haiku 4.5",
        symbol=d.get("symbol"),
        bias=d.get("bias", "neutral"),
        watch_blocks=d.get("watch_blocks", []),
        entry_condition=d.get("entry_condition", ""),
        risk_note=d.get("risk_note", ""),
        latency_ms=latency,
        raw=raw,
    )


def _call_hf(analysis: str, model: str = "google/gemma-3-27b-it") -> ParseResult:
    """HuggingFace Inference API 호출.

    Gemma 4가 HF에 올라오면 model을 교체하면 됨.
    현재: gemma-3-27b-it (최신 공개 Gemma)
    """
    from huggingface_hub import InferenceClient

    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_KEY", "")
    if not token:
        raise RuntimeError("HF_TOKEN not set")

    t0 = time.time()
    client = InferenceClient(token=token)

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": analysis},
    ]

    resp = client.chat_completion(
        model=model,
        messages=messages,
        max_tokens=512,
        temperature=0.1,
    )
    latency = int((time.time() - t0) * 1000)
    raw = resp.choices[0].message.content.strip()
    d = _parse_json(raw)

    short_name = model.split("/")[-1]
    return ParseResult(
        provider=f"HF/{short_name}",
        symbol=d.get("symbol"),
        bias=d.get("bias", "neutral"),
        watch_blocks=d.get("watch_blocks", []),
        entry_condition=d.get("entry_condition", ""),
        risk_note=d.get("risk_note", ""),
        latency_ms=latency,
        raw=raw,
    )


def compare(analysis: str, hf_model: str = "google/gemma-3-27b-it") -> list[ParseResult]:
    """Claude vs HF 모델 비교 실행.

    Args:
        analysis:  트레이딩 분석 텍스트
        hf_model:  HuggingFace 모델 ID

    Returns:
        결과 목록 (성공한 것만)
    """
    results: list[ParseResult] = []

    print(f"\n{'='*60}")
    print("분석 텍스트:")
    print(analysis[:200] + "..." if len(analysis) > 200 else analysis)
    print("="*60)

    # Claude
    try:
        print("\n[1/2] Claude Haiku 호출 중...")
        r = _call_claude(analysis)
        results.append(r)
        _print_result(r)
    except Exception as e:
        print(f"  Claude 실패: {e}")

    # HF
    try:
        print(f"\n[2/2] {hf_model} 호출 중...")
        r = _call_hf(analysis, model=hf_model)
        results.append(r)
        _print_result(r)
    except Exception as e:
        print(f"  HF 실패: {e}")

    # 비교 요약
    if len(results) == 2:
        _print_comparison(results[0], results[1])

    return results


def _print_result(r: ParseResult) -> None:
    print(f"\n  ▶ {r.provider} ({r.latency_ms}ms)")
    print(f"    심볼:   {r.symbol}")
    print(f"    편향:   {r.bias}")
    print(f"    블록:   {r.watch_blocks}")
    print(f"    진입:   {r.entry_condition}")
    print(f"    리스크: {r.risk_note}")


def _print_comparison(a: ParseResult, b: ParseResult) -> None:
    print(f"\n{'─'*60}")
    print("비교 요약")
    print(f"{'─'*60}")

    common = set(a.watch_blocks) & set(b.watch_blocks)
    only_a = set(a.watch_blocks) - set(b.watch_blocks)
    only_b = set(b.watch_blocks) - set(a.watch_blocks)

    print(f"  속도:     {a.provider} {a.latency_ms}ms | {b.provider} {b.latency_ms}ms")
    print(f"  편향 일치: {'✅' if a.bias == b.bias else '❌'} ({a.bias} vs {b.bias})")
    print(f"  공통 블록: {sorted(common)}")
    print(f"  {a.provider}만:  {sorted(only_a)}")
    print(f"  {b.provider}만: {sorted(only_b)}")
    print(f"{'─'*60}")


# ─── 샘플 실행 ───────────────────────────────────────────────────────────────

SAMPLE_ANALYSIS = """
(온체인) - $IN (인피니트)

1/ CVD, NET LONG/SHORT
SPOT CVD 약간 회복하는 모양새이나 선물 CVD 완전 밀리고, SHORT를 세력이 매집하면서 밀어버린 상황으로 보임.
여기서 저점갱신을 하냐 마냐는 세력이 숏 매집했는지와 개미들이 롱을 탔는지에 따라 달려있음.

2/ LONG/SHORT ACCOUNTS RATIO
개미들은 일명 "하따"를 하면서 인피니트 롱을 갈기고 있는 모양새임. 저점 갱신할 확률이 늘을 수 밖에 없긴 함.

3/ FUNDING RATE GLOBAL
펀비 역시 음펀비 전환되면서 세력 숏 물량 축적 중으로 보임.

4/ OI
이번 하락에 OI 감소세 역시 두드러져서 아직 발사 준비는 이르다고 생각이 들기는 함.

결론/
인피니트의 경우 당장 진입은 너무 도박에 가까움. 전저점 로스를 잡는 식으로 롱을 들어간다 하더라도
상당히 신중히 들어가야 할 것 같음. 숏 물량 축소와 롱숏어카운트 비율이 점진적 감소하는 추세전환을 노릴 필요가 있어보임.
"""

if __name__ == "__main__":
    compare(SAMPLE_ANALYSIS)
