"""Built-in pattern library.

Patterns defined here are available to PatternStateMachine by slug.
"""
from __future__ import annotations
from patterns.types import PatternObject, PhaseCondition

TRADOOR_OI_REVERSAL = PatternObject(
    slug="tradoor-oi-reversal-v1",
    name="OI 급등 반전 패턴 (TRADOOR/PTB형)",
    description=(
        "급락+OI급등 두 번. 두 번째가 진짜(거래량 폭발 동반). "
        "이후 저점 상승 + 펀딩 양전환 = 진입 구간. "
        "OI 재급등 시 50~100% 목표."
    ),
    phases=[
        PhaseCondition(
            phase_id="FAKE_DUMP",
            label="가짜 신호 (관망)",
            required_blocks=["recent_decline", "funding_extreme"],
            optional_blocks=["oi_change"],
            disqualifier_blocks=["oi_spike_with_dump"],  # real dump disqualifies fake
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ARCH_ZONE",
            label="번지대 형성 (진입 금지)",
            # Pre-dump "bungee zone". Originally required strict
            # ``sideways_compression``, but empirical evidence on
            # TRADOORUSDT (W-0086, run 9de9234b) showed 0 sideways_
            # compression fires in the 90h pre-dump window because the
            # actual pre-dump regime was a directional decline, not a
            # tight range, so the state machine stalled at FAKE_DUMP
            # even after the REAL_DUMP OI gate (H7 Axis-A) was fixed.
            #
            # Per Pruden (2007) "The Three Skills of Top Trading",
            # Wyckoff's arch-zone generalises to multiple pre-dump
            # structures: classical sideways range, Bollinger-style
            # volatility squeeze (Bollinger 2001), or volume exhaustion
            # (Edwards & Magee 1948 "drying up" volume preceding a
            # breakdown). Hudson & Urquhart (2021) validate intraday
            # crypto compression via volatility-normalised measures,
            # making Bollinger-style squeeze an equally valid arch-zone
            # proxy on hourly crypto.
            #
            # required_any_groups accepts any one compression signal;
            # the oi_spike_with_dump disqualifier still prevents entry
            # on the actual dump bar. FAKE_DUMP's advance blocks
            # (recent_decline, funding_extreme) are deliberately NOT in
            # this group so FAKE_DUMP blocks cannot auto-trigger
            # ARCH_ZONE on the same bar — the two phases stay
            # structurally distinct.
            required_blocks=[],
            required_any_groups=[
                ["sideways_compression", "bollinger_squeeze", "volume_dryup"],
            ],
            optional_blocks=["volume_dryup"],
            disqualifier_blocks=["oi_spike_with_dump"],
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="REAL_DUMP",
            label="진짜 신호 — 핵심 이벤트",
            required_blocks=["oi_spike_with_dump", "volume_spike"],
            optional_blocks=["recent_decline", "funding_extreme"],
            disqualifier_blocks=[],
            # max_bars widening trail:
            #   4  -> 12 (W-0086 run ade68a09, Park-Hahn-Lee 2023 central
            #            4-12h higher-lows formation range, calibrated on
            #            TRADOOR's observed 5-bar gap)
            #   12 -> 18 (W-0086 slice 2026-04-18, FARTCOIN diagnosis:
            #            first higher_lows_sequence fire at bar 16 after
            #            REAL_DUMP entry — 4 bars outside the 12-bar
            #            ceiling — caused state-machine regression to
            #            ARCH_ZONE before ACCUMULATION could form. Park-
            #            Hahn-Lee's cited range captures TRADOOR but not
            #            the slower-consolidation tail. 18 = FARTCOIN's
            #            observed 16-bar gap + 2-bar safety margin, and
            #            is the minimum that preserves multi-symbol
            #            coverage without widening into the "pattern is
            #            silent because the setup is not a real cascade"
            #            regime beyond 24h.)
            # ACCUMULATION.transition_window_bars must track max_bars —
            # ACCUMULATION can only anchor while REAL_DUMP is still the
            # current phase (state_machine._get_anchor_transition_id).
            min_bars=1, max_bars=18,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ACCUMULATION",
            label="축적 구간 — 진입 구간",
            required_blocks=["higher_lows_sequence", "oi_hold_after_spike"],
            required_any_groups=[["funding_flip", "positive_funding_bias", "ls_ratio_recovery"]],
            soft_blocks=[
                "volume_dryup",
                "bollinger_squeeze",
                "post_dump_compression",
                "reclaim_after_dump",
            ],
            disqualifier_blocks=["oi_spike_with_dump"],
            score_weights={
                "higher_lows_sequence": 0.40,
                "oi_hold_after_spike": 0.30,
                "funding_flip": 0.15,
                "positive_funding_bias": 0.15,
                "ls_ratio_recovery": 0.15,
                "post_dump_compression": 0.10,
                "volume_dryup": 0.05,
                "bollinger_squeeze": 0.05,
                "reclaim_after_dump": 0.05,
            },
            phase_score_threshold=0.70,
            # Kept aligned with REAL_DUMP.max_bars (see REAL_DUMP widening
            # trail comment) so ACCUMULATION has the full REAL_DUMP-active
            # window to anchor. Narrower would waste the REAL_DUMP hold,
            # wider would be inert.
            transition_window_bars=18,
            anchor_from_previous_phase=True,
            anchor_phase_id="REAL_DUMP",
            min_bars=6, max_bars=72,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT",
            label="브레이크아웃",
            # Phase-anchored + OI-committed breakout confirmation, with
            # volume relegated to an optional boost (see each block's
            # module docstring for the full literature trail):
            #   - breakout_from_pullback_range: Wyckoff Sign-of-Strength,
            #     close breaks the rally high since the most recent
            #     pullback low. Anchors breakout reference to the phase
            #     structure rather than a fixed calendar window (Wyckoff
            #     1911; Pruden 2007; Weis & Wyckoff 2013). Replaces
            #     breakout_above_high as the primary breakout trigger
            #     because rolling-window breakouts catch the pre-dump
            #     final rally, not the post-accumulation SOS.
            #   - oi_expansion_confirm: 5% OI rise over 24h
            #     (Bessembinder & Seguin 1993; Wang & Yau 2000) — a real
            #     breakout should carry directional positioning, not just
            #     a stretched price move.
            #   - breakout_volume_confirm (optional): 2.5x avg volume
            #     (Edwards & Magee 1948; Murphy 1999; Baur & Dimpfl 2018).
            #     Crypto-specific asymmetric volume behaviour (Koutmos
            #     2019; Easley, López de Prado & O'Hara 2021) means
            #     post-dump V-reversals often complete on below-average
            #     volume as shorts cover silently, so demanding 2.5x
            #     here structurally excludes real crypto breakouts.
            #     Kept as an optional score boost rather than a hard gate.
            required_blocks=[
                "breakout_from_pullback_range",
                "oi_expansion_confirm",
            ],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="ACCUMULATION",
    target_phase="BREAKOUT",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["oi_reversal", "whale_short_squeeze", "altcoin", "perp"],
)

FUNDING_FLIP_REVERSAL = PatternObject(
    slug="funding-flip-reversal-v1",
    name="펀딩 과적재 반전 패턴 (숏 스퀴즈형)",
    description=(
        "펀딩 극단 마이너스(숏 과적재) → 가격 압축 → 펀딩 플립(음→양) + OI 확장"
        " → 고점 상향 형성(축적) → 숏 스퀴즈 브레이크아웃. "
        "OI 급락보다 펀딩 레이트 극단으로 시작한다는 점에서 TRADOOR와 구별됨."
    ),
    phases=[
        PhaseCondition(
            phase_id="SHORT_OVERHEAT",
            label="숏 과적재 (관망)",
            # Funding rate deeply negative = crowded shorts.
            # `funding_extreme_short` is an alias registered in
            # block_evaluator that calls funding_extreme(direction="short_overheat").
            # recent_decline: price usually falling when shorts pile in.
            required_blocks=["funding_extreme_short"],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="COMPRESSION",
            label="횡보 압축 (숏 추가 멈춤)",
            # Price stops falling while shorts remain crowded.
            # Any one compression signal is sufficient — same
            # required_any_groups approach as TRADOOR's ARCH_ZONE.
            required_blocks=[],
            required_any_groups=[
                ["sideways_compression", "bollinger_squeeze", "volume_dryup"],
            ],
            optional_blocks=["volume_dryup"],
            # absorption_signal: heavy CVD buying while price is flat signals
            # hidden accumulation — a sell-wall being absorbed. This is the
            # ALPHA TERMINAL S2 "흡수(Absorption)" concept: "CVD 대량 매수인데
            # 가격 미반응 → 매도벽 흡수 중" (ORDI Apr14 case: 0.0-0.1M volume).
            soft_blocks=["absorption_signal"],
            disqualifier_blocks=[],
            score_weights={
                "sideways_compression": 0.50,
                "bollinger_squeeze": 0.30,
                "volume_dryup": 0.20,
                "absorption_signal": 0.15,
            },
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="FLIP_SIGNAL",
            label="펀딩 플립 — 핵심 이벤트",
            # Shorts start capitulating: funding crosses zero + OI expanding.
            # funding_flip: last N bars negative → current bar positive.
            # oi_expansion_confirm: 5% OI rise over 24h (Bessembinder 1993).
            required_blocks=["funding_flip", "oi_expansion_confirm"],
            optional_blocks=["positive_funding_bias"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ENTRY_ZONE",
            label="숏 스퀴즈 진입 구간",
            # Funding stays positive while structure improves (higher lows).
            # Analogous to TRADOOR's ACCUMULATION phase.
            required_blocks=["higher_lows_sequence"],
            required_any_groups=[["positive_funding_bias", "funding_flip"]],
            soft_blocks=[
                "bollinger_squeeze",
                "volume_dryup",
                "oi_expansion_confirm",
                # cvd_buying: taker order-flow is net-buy while we await squeeze.
                # Mirrors ALPHA TERMINAL S1 "CVD from multiple exchanges aligning".
                "cvd_buying",
                # absorption_signal: carry-over from COMPRESSION — if buying is still
                # being absorbed by remaining sell-walls in ENTRY_ZONE, squeeze is
                # even more imminent when the wall finally exhausts.
                "absorption_signal",
            ],
            disqualifier_blocks=[],
            score_weights={
                "higher_lows_sequence": 0.45,
                "positive_funding_bias": 0.30,
                "funding_flip": 0.20,
                "bollinger_squeeze": 0.05,
                "volume_dryup": 0.05,
                "oi_expansion_confirm": 0.10,
                "cvd_buying": 0.08,
                "absorption_signal": 0.08,
            },
            phase_score_threshold=0.70,
            transition_window_bars=12,
            anchor_from_previous_phase=True,
            anchor_phase_id="FLIP_SIGNAL",
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SQUEEZE",
            label="숏 스퀴즈 브레이크아웃",
            required_blocks=[
                "breakout_from_pullback_range",
                "oi_expansion_confirm",
            ],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="ENTRY_ZONE",
    target_phase="SQUEEZE",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["funding_reversal", "short_squeeze", "altcoin", "perp"],
)

WHALE_ACCUMULATION_REVERSAL = PatternObject(
    slug="whale-accumulation-reversal-v1",
    name="세력 매집 반전 패턴 (채널 분석 기반)",
    description=(
        "세력이 OI 급등과 함께 개인 롱 청산 유도(과열 숏 펀딩) → "
        "스마트머니 저점 매집 + 구조 반전(저점 상승) → "
        "기관 매수세(코인베이스 프리미엄) + 전 거래소 동반 OI 상승 = 진짜 반등. "
        "TRADOOR와 달리 온체인/거래소 스프레드 신호로 진짜 반등을 판별한다."
    ),
    phases=[
        PhaseCondition(
            phase_id="WHALE_ACCUMULATION",
            label="세력 매집 — 숏 누적 + 개인 청산 유도",
            # OI 급등+급락 + 스마트머니 매집 + 펀딩 극단 음수.
            # oi_spike_with_dump: OI 급등 + 가격 급락 = 강제 청산 cascade
            # smart_money_accumulation: OKX OnchainOS 대형 지갑 매집
            # funding_extreme_short: 펀딩 극단 음수 = 숏 과적재
            # (funding_extreme_short is an alias registered in block_evaluator
            #  that calls funding_extreme(direction="short_overheat").)
            required_blocks=[
                "oi_spike_with_dump",
                "smart_money_accumulation",
                "funding_extreme_short",
            ],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BOTTOM_CONFIRM",
            label="저점 확인 — 구조 반전 + 숏 축소",
            # 하락 멈춤 + 저점 상승 구조 + long-short ratio 회복.
            # higher_lows_sequence: 저점이 올라가는 구조
            # ls_ratio_recovery: long-short ratio 회복 (숏 축소 신호)
            # oi_spike_with_dump 은 disqualifier — 신규 덤프 발생 시 매집 무효화.
            required_blocks=["higher_lows_sequence", "ls_ratio_recovery"],
            soft_blocks=[
                "smart_money_accumulation",
                "volume_dryup",
                "bollinger_squeeze",
            ],
            disqualifier_blocks=["oi_spike_with_dump"],
            score_weights={
                "higher_lows_sequence": 0.40,
                "ls_ratio_recovery": 0.30,
                "smart_money_accumulation": 0.20,
                "volume_dryup": 0.10,
                "bollinger_squeeze": 0.05,
            },
            phase_score_threshold=0.70,
            anchor_from_previous_phase=True,
            anchor_phase_id="WHALE_ACCUMULATION",
            transition_window_bars=24,
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ENTRY_CONFIRM",
            label="진입 확정 — 기관 매수 + 전 거래소 동반 상승",
            # coinbase_premium_positive: Coinbase-Binance 스프레드 양수
            #   = 미국 기관(스팟) 매수 압력 (진짜 반등의 leading signal)
            # total_oi_spike(increase): Binance+Bybit+OKX 집계 OI 동반 상승
            # oi_exchange_divergence(low_concentration, 선택): 단일 거래소가
            #   혼자 끄는 반등이 아니라 전 거래소에서 합의된 반등.
            required_blocks=["coinbase_premium_positive", "total_oi_spike"],
            optional_blocks=["oi_exchange_divergence"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="BOTTOM_CONFIRM",
    target_phase="ENTRY_CONFIRM",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["whale_accumulation", "smart_money", "onchain_confirm", "altcoin", "perp"],
)

# Registry: slug → PatternObject
PATTERN_LIBRARY: dict[str, PatternObject] = {
    TRADOOR_OI_REVERSAL.slug: TRADOOR_OI_REVERSAL,
    FUNDING_FLIP_REVERSAL.slug: FUNDING_FLIP_REVERSAL,
    WHALE_ACCUMULATION_REVERSAL.slug: WHALE_ACCUMULATION_REVERSAL,
}

def get_pattern(slug: str) -> PatternObject:
    if slug not in PATTERN_LIBRARY:
        raise KeyError(f"Unknown pattern: {slug!r}. Available: {list(PATTERN_LIBRARY)}")
    return PATTERN_LIBRARY[slug]
