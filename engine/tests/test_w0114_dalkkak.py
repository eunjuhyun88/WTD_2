"""W-0114 딸깍 전략 테스트.

Covers:
  - oi_price_lag_detect building block
  - OI_PRESURGE_LONG pattern registration
  - FixedStopPolicy risk calculations
  - pnl_renderer card generation
  - WTDTwitterClient graceful fallback (no token)
"""
from __future__ import annotations

import pandas as pd
import numpy as np
import pytest

from building_blocks.context import Context
from building_blocks.confirmations.oi_price_lag_detect import oi_price_lag_detect
from patterns.library import PATTERN_LIBRARY, OI_PRESURGE_LONG
from patterns.risk_policy import FixedStopPolicy, DEFAULT_POLICY


# ── Helpers ───────────────────────────────────────────────────────────────

def _make_ctx(
    n: int = 20,
    oi_change_1h: float = 0.12,
    price_change_1h: float = 0.01,
    symbol: str = "TESTUSDT",
) -> Context:
    idx = pd.date_range("2024-01-01", periods=n, freq="1h")
    base_price = 100.0
    closes = [base_price * (1 + price_change_1h) ** i for i in range(n)]

    klines = pd.DataFrame({
        "open":   closes,
        "high":   [c * 1.005 for c in closes],
        "low":    [c * 0.995 for c in closes],
        "close":  closes,
        "volume": [1000.0] * n,
        "taker_buy_base_volume": [500.0] * n,
    }, index=idx)

    features = pd.DataFrame({
        "close":              closes,
        "total_oi_change_1h": [oi_change_1h] * n,
    }, index=idx)

    return Context(klines=klines, features=features, symbol=symbol)


# ── oi_price_lag_detect ───────────────────────────────────────────────────

class TestOiPriceLagDetect:
    def test_fires_when_oi_up_price_flat(self):
        ctx = _make_ctx(oi_change_1h=0.12, price_change_1h=0.005)
        result = oi_price_lag_detect(ctx)
        assert isinstance(result, pd.Series)
        # 후반부 (pct_change 계산 이후) 에서 True가 있어야 함
        assert result.iloc[2:].any(), "should fire when OI↑ + price flat"

    def test_no_fire_when_price_moved(self):
        ctx = _make_ctx(oi_change_1h=0.12, price_change_1h=0.05)
        result = oi_price_lag_detect(ctx)
        # index 0: pct_change=NaN→0.0 (첫 바는 항상 flat으로 처리됨)
        # index 1 이후에서 price_change 5% 이상이면 발화 없어야 함
        assert not result.iloc[1:].any(), "should not fire from bar 1+ when price already moved >2%"

    def test_no_fire_when_oi_low(self):
        ctx = _make_ctx(oi_change_1h=0.03, price_change_1h=0.005)
        result = oi_price_lag_detect(ctx)
        assert not result.any(), "should not fire when OI change < threshold"

    def test_strong_variant_higher_threshold(self):
        """strong variant: OI >= 15% 필요"""
        from building_blocks.confirmations.oi_price_lag_detect import oi_price_lag_detect
        ctx_weak   = _make_ctx(oi_change_1h=0.12, price_change_1h=0.005)
        ctx_strong = _make_ctx(oi_change_1h=0.18, price_change_1h=0.005)
        weak_result   = oi_price_lag_detect(ctx_weak,   oi_threshold=0.15)
        strong_result = oi_price_lag_detect(ctx_strong, oi_threshold=0.15)
        assert not weak_result.any()
        assert strong_result.iloc[2:].any()

    def test_invalid_threshold_raises(self):
        ctx = _make_ctx()
        with pytest.raises(ValueError):
            oi_price_lag_detect(ctx, oi_threshold=0.0)
        with pytest.raises(ValueError):
            oi_price_lag_detect(ctx, price_threshold=-0.01)

    def test_missing_oi_column_graceful(self):
        """total_oi_change_1h 컬럼 없으면 전부 False"""
        idx = pd.date_range("2024-01-01", periods=5, freq="1h")
        klines = pd.DataFrame(
            {"open": [100]*5, "high": [101]*5, "low": [99]*5,
             "close": [100]*5, "volume": [1000]*5,
             "taker_buy_base_volume": [500]*5}, index=idx)
        features = pd.DataFrame({"close": [100]*5}, index=idx)
        ctx = Context(klines=klines, features=features, symbol="X")
        result = oi_price_lag_detect(ctx)
        assert not result.any()


# ── OI_PRESURGE_LONG Pattern ──────────────────────────────────────────────

class TestOiPresurgeLongPattern:
    def test_registered_in_library(self):
        assert "oi-presurge-long-v1" in PATTERN_LIBRARY

    def test_pattern_attributes(self):
        p = OI_PRESURGE_LONG
        assert p.direction == "long"
        assert p.entry_phase == "BREAKOUT_CONFIRM"
        assert p.target_phase == "TARGET"
        assert len(p.phases) == 4

    def test_phase_names(self):
        phase_ids = [ph.phase_id for ph in OI_PRESURGE_LONG.phases]
        assert phase_ids == [
            "QUIET_ACCUMULATION",
            "SOCIAL_IGNITION",
            "BREAKOUT_CONFIRM",
            "TARGET",
        ]

    def test_quiet_accumulation_phase(self):
        phase = OI_PRESURGE_LONG.phases[0]
        assert "oi_price_lag_detect" in phase.required_blocks
        assert "oi_spike_with_dump" in phase.disqualifier_blocks
        assert "extreme_volatility" in phase.disqualifier_blocks

    def test_breakout_phase_has_volume_confirm(self):
        phase = OI_PRESURGE_LONG.phases[2]
        assert "breakout_above_high" in phase.required_blocks
        volume_blocks = {"breakout_volume_confirm", "volume_spike", "bollinger_expansion"}
        found = any(
            any(b in grp for b in volume_blocks)
            for grp in phase.required_any_groups
        )
        assert found, "breakout phase must require volume confirmation"

    def test_tags_include_dalkkak(self):
        assert "dalkkak" in OI_PRESURGE_LONG.tags


# ── FixedStopPolicy ───────────────────────────────────────────────────────

class TestFixedStopPolicy:
    def setup_method(self):
        self.policy = FixedStopPolicy(stop_loss_usdt=200.0, rr_ratio=3.0)

    def test_stop_price_below_entry(self):
        stop = self.policy.get_stop_price(entry=100.0, atr=1.0)
        assert stop < 100.0

    def test_position_size_correct(self):
        # 100 진입, 99 stop → 단위당 1 USDT 리스크 → 200 코인
        size = self.policy.get_position_size(entry=100.0, stop=99.0)
        assert abs(size - 200.0) < 0.01

    def test_max_loss_never_exceeds_200(self):
        for entry, atr in [(100, 0.1), (50000, 100), (1.0, 0.05)]:
            stop = self.policy.get_stop_price(entry=entry, atr=atr)
            size = self.policy.get_position_size(entry=entry, stop=stop)
            actual_loss = size * abs(entry - stop)
            assert actual_loss <= 200.01, f"loss {actual_loss:.2f} > 200 for entry={entry} atr={atr}"

    def test_target_price_above_entry(self):
        target = self.policy.get_target_price(entry=100.0, stop=99.0)
        assert target > 100.0

    def test_rr_ratio_3_to_1(self):
        entry, stop = 100.0, 99.0
        risk = abs(entry - stop)
        target = self.policy.get_target_price(entry, stop)
        reward = abs(target - entry)
        assert abs(reward / risk - 3.0) < 0.001

    def test_zero_risk_returns_zero_size(self):
        size = self.policy.get_position_size(entry=100.0, stop=100.0)
        assert size == 0.0

    def test_summary_has_required_keys(self):
        summary = self.policy.summary(entry=100.0, atr=1.0)
        required = {
            "entry_price", "stop_price", "target_price",
            "position_size_coin", "position_size_usdt",
            "max_loss_usdt", "potential_gain_usdt", "rr_ratio",
        }
        assert required.issubset(summary.keys())

    def test_summary_max_loss_is_200(self):
        summary = self.policy.summary(entry=50000.0, atr=500.0)
        assert summary["max_loss_usdt"] == 200.0

    def test_default_policy_instance(self):
        assert DEFAULT_POLICY.stop_loss_usdt == 200.0
        assert DEFAULT_POLICY.rr_ratio == 3.0


# ── P&L Renderer ─────────────────────────────────────────────────────────

class TestPnlRenderer:
    def test_render_hit_returns_bytes(self):
        pytest.importorskip("PIL")
        from branding.pnl_renderer import TradeResult, render_pnl_card
        result = TradeResult(
            symbol="BTCUSDT",
            entry=94200.0,
            exit_price=117100.0,
            stop_price=93990.0,
            pnl_usdt=483.0,
            pattern_slug="oi-presurge-long-v1",
            hit=True,
            position_size_usdt=1800.0,
            rr_ratio=3.0,
        )
        card = render_pnl_card(result)
        assert isinstance(card, bytes)
        assert len(card) > 1000
        assert card[:4] == b"\x89PNG"

    def test_render_stop_returns_bytes(self):
        pytest.importorskip("PIL")
        from branding.pnl_renderer import TradeResult, render_pnl_card
        result = TradeResult(
            symbol="XRPUSDT",
            entry=0.55,
            exit_price=0.52,
            stop_price=0.52,
            pnl_usdt=-200.0,
            pattern_slug="oi-presurge-long-v1",
            hit=False,
        )
        card = render_pnl_card(result)
        assert isinstance(card, bytes)
        assert card[:4] == b"\x89PNG"


# ── Twitter Client Graceful Fallback ─────────────────────────────────────

class TestTwitterClientFallback:
    def test_no_token_available_false(self, monkeypatch):
        monkeypatch.delenv("GAME_TWITTER_ACCESS_TOKEN", raising=False)
        # 캐시된 싱글턴 리셋
        import social.twitter_client as mod
        mod._client = None
        from social.twitter_client import WTDTwitterClient
        client = WTDTwitterClient()
        assert client.available is False

    def test_no_token_sentiment_returns_empty(self, monkeypatch):
        monkeypatch.delenv("GAME_TWITTER_ACCESS_TOKEN", raising=False)
        import social.twitter_client as mod
        mod._client = None
        from social.twitter_client import WTDTwitterClient
        client = WTDTwitterClient()
        result = client.search_symbol_sentiment("BTC")
        assert result.signal is False
        assert result.tweet_count == 0

    def test_no_token_kol_returns_empty(self, monkeypatch):
        monkeypatch.delenv("GAME_TWITTER_ACCESS_TOKEN", raising=False)
        import social.twitter_client as mod
        mod._client = None
        from social.twitter_client import WTDTwitterClient
        client = WTDTwitterClient()
        hits = client.get_kol_mentions("BTC")
        assert hits == []

    def test_no_token_post_returns_none(self, monkeypatch):
        monkeypatch.delenv("GAME_TWITTER_ACCESS_TOKEN", raising=False)
        import social.twitter_client as mod
        mod._client = None
        from social.twitter_client import WTDTwitterClient
        client = WTDTwitterClient()
        result = client.post_pnl_card("test", "/tmp/test.png")
        assert result is None


# ── PositionGuard ─────────────────────────────────────────────────────────

class TestPositionGuard:
    def _guard(self):
        from patterns.position_guard import PositionGuard
        return PositionGuard()

    def _pos(self, symbol="BTCUSDT", direction="long"):
        from patterns.position_guard import Direction, OpenPosition
        return OpenPosition(
            symbol=symbol,
            direction=Direction(direction),
            entry_price=100.0,
            size_coin=1.0,
            stop_price=99.0,
            target_price=103.0,
        )

    def test_can_enter_empty_guard(self):
        from patterns.position_guard import Direction
        g = self._guard()
        ok, reason = g.can_enter("BTCUSDT", Direction.LONG)
        assert ok is True
        assert reason == ""

    def test_blocks_duplicate_same_direction(self):
        from patterns.position_guard import Direction
        g = self._guard()
        g.register(self._pos("BTCUSDT", "long"))
        ok, reason = g.can_enter("BTCUSDT", Direction.LONG)
        assert ok is False
        assert "already has" in reason

    def test_blocks_opposite_direction(self):
        from patterns.position_guard import Direction
        g = self._guard()
        g.register(self._pos("BTCUSDT", "long"))
        ok, reason = g.can_enter("BTCUSDT", Direction.SHORT)
        assert ok is False
        assert "opposing" in reason

    def test_close_removes_position(self):
        from patterns.position_guard import Direction
        g = self._guard()
        g.register(self._pos("BTCUSDT", "long"))
        g.close("BTCUSDT")
        ok, _ = g.can_enter("BTCUSDT", Direction.LONG)
        assert ok is True

    def test_different_symbols_independent(self):
        from patterns.position_guard import Direction
        g = self._guard()
        g.register(self._pos("BTCUSDT", "long"))
        ok, _ = g.can_enter("ETHUSDT", Direction.LONG)
        assert ok is True

    def test_summary_returns_list(self):
        g = self._guard()
        g.register(self._pos("BTCUSDT", "long"))
        s = g.summary()
        assert isinstance(s, list)
        assert len(s) == 1
        assert s[0]["symbol"] == "BTCUSDT"
        assert s[0]["direction"] == "long"


# ── KolStyleEngine ────────────────────────────────────────────────────────

class TestKolStyleEngine:
    def _trade(self, pnl=+600.0, pct=+15.0):
        from branding.kol_style_engine import TradeCaption
        return TradeCaption(
            symbol="BTCUSDT",
            direction="long",
            entry_price=94200.0,
            exit_price=97000.0 if pnl > 0 else 93990.0,
            pnl_usdt=pnl,
            pnl_pct=pct,
            pattern_name="oi-presurge-long-v1",
            hold_hours=4.5,
        )

    def test_plain_caption_win(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        from branding.kol_style_engine import generate_kol_caption
        cap = generate_kol_caption(self._trade(pnl=+600.0, pct=+15.0))
        assert isinstance(cap, str)
        assert len(cap) > 10
        assert "BTCUSDT" in cap

    def test_plain_caption_stop(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        from branding.kol_style_engine import generate_kol_caption
        cap = generate_kol_caption(self._trade(pnl=-200.0, pct=-3.0))
        assert isinstance(cap, str)
        assert "손절" in cap or "200" in cap

    def test_is_win_property(self):
        win = self._trade(pnl=+600.0)
        loss = self._trade(pnl=-200.0)
        assert win.is_win is True
        assert loss.is_win is False


# ── Gainers Screener (unit — offline) ────────────────────────────────────

class TestGainersScreener:
    def test_dataclass_fields(self):
        from universe.gainers import GainerCandidate
        c = GainerCandidate(
            symbol="XYZUSDT",
            price_change_24h_pct=8.5,
            atr_pct=12.0,
            volume_usdt_24h=10_000_000.0,
            listing_age_days=30,
            is_new_listing=True,
            composite_score=15.3,
        )
        assert c.is_new_listing is True
        assert c.composite_score == 15.3

    def test_load_gainer_candidates_offline(self, monkeypatch):
        """_fetch를 monkeypatch해서 오프라인 테스트."""
        import universe.gainers as mod

        now_ms = int(1_700_000_000_000)  # fixed timestamp

        mock_tickers = [
            {
                "symbol": "NEWUSDT",
                "priceChangePercent": "15.0",
                "quoteVolume": "20000000",
                "highPrice": "1.20",
                "lowPrice": "0.90",
                "lastPrice": "1.10",
            },
            {
                "symbol": "OLDUSDT",
                "priceChangePercent": "5.0",
                "quoteVolume": "8000000",
                "highPrice": "2.10",
                "lowPrice": "1.95",
                "lastPrice": "2.00",
            },
            # below min volume → filtered
            {
                "symbol": "TINUSDT",
                "priceChangePercent": "10.0",
                "quoteVolume": "100000",
                "highPrice": "0.05",
                "lowPrice": "0.04",
                "lastPrice": "0.045",
            },
        ]

        thirty_days_ms = 30 * 86400 * 1000
        year_ms = 400 * 86400 * 1000
        mock_info = {
            "symbols": [
                {
                    "symbol": "NEWUSDT",
                    "status": "TRADING",
                    "contractType": "PERPETUAL",
                    "quoteAsset": "USDT",
                    "onboardDate": now_ms - thirty_days_ms,
                },
                {
                    "symbol": "OLDUSDT",
                    "status": "TRADING",
                    "contractType": "PERPETUAL",
                    "quoteAsset": "USDT",
                    "onboardDate": now_ms - year_ms,
                },
                {
                    "symbol": "TINUSDT",
                    "status": "TRADING",
                    "contractType": "PERPETUAL",
                    "quoteAsset": "USDT",
                    "onboardDate": now_ms - thirty_days_ms,
                },
            ]
        }

        call_count = [0]

        def fake_fetch(path):
            call_count[0] += 1
            if "ticker" in path:
                return mock_tickers
            return mock_info

        monkeypatch.setattr(mod, "_fetch", fake_fetch)
        monkeypatch.setattr("time.time", lambda: now_ms / 1000)

        candidates = mod.load_gainer_candidates(top_n=5, min_volume_usdt=5_000_000)

        assert len(candidates) == 2, f"expected 2, got {candidates}"
        # NEWUSDT = new listing → boosted score → should rank first
        assert candidates[0].symbol == "NEWUSDT"
        assert candidates[0].is_new_listing is True
        assert candidates[1].symbol == "OLDUSDT"
        assert candidates[1].is_new_listing is False
        # composite score sorted descending
        assert candidates[0].composite_score >= candidates[1].composite_score

    def test_api_failure_raises_runtime_error(self, monkeypatch):
        import universe.gainers as mod
        monkeypatch.setattr(mod, "_fetch", lambda _: (_ for _ in ()).throw(Exception("timeout")))
        with pytest.raises(RuntimeError, match="Binance API fetch failed"):
            mod.load_gainer_candidates()
