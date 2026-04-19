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
            # required_any_groups 사용 — OR 시맨틱: 두 신호 중 하나면 충분.
            # oi_spike_with_dump: OI 급등 + 가격 급락 = 강제 청산 cascade (Scenario A)
            # funding_extreme_short: 펀딩 극단 음수 = 숏 과적재 (Scenario B)
            # (두 신호가 동시에 발화하는 경우는 극히 드물므로 AND는 비현실적.)
            # (funding_extreme_short is an alias registered in block_evaluator
            #  that calls funding_extreme(direction="short_overheat").)
            # smart_money_accumulation (soft): OKX live API — 과거 데이터 없음,
            #   라이브 모니터링에서만 스코어 보너스.
            required_blocks=[],
            required_any_groups=[["oi_spike_with_dump", "funding_extreme_short"]],
            soft_blocks=["smart_money_accumulation"],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=24,
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
            # oi_hold_after_spike: 선행 OI 스파이크 후 보유 유지 = 세력이 청산 안 함.
            #   Binance perp oi_change_1h/24h 기반 — 역사 데이터 사용 가능.
            # total_oi_spike (optional): 다거래소 동반 OI 상승 (fetch_exchange_oi 필요 — 라이브 전용).
            # coinbase_premium_positive (optional): 기관 매수 확인 — 라이브 전용.
            required_blocks=["oi_hold_after_spike"],
            optional_blocks=["total_oi_spike", "coinbase_premium_positive", "oi_exchange_divergence"],
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

WYCKOFF_SPRING_REVERSAL = PatternObject(
    slug="wyckoff-spring-reversal-v1",
    name="Wyckoff 스프링 반전 패턴 (지지선 압축형)",
    description=(
        "지지선 근처 횡보 압축 → 거짓 하방 이탈(Spring, 약손 청산) → 즉각 회복 + 거래량 폭발(SoS)"
        " → Spring 저점 위 풀백(LPS) → 축적 레인지 완전 이탈(Markup). "
        "순수 가격 구조 + 거래량 패턴 기반. 퍼프 데이터 불필요. "
        "TRADOOR(OI기반)/FFR(펀딩기반)와 구별되는 price-action-driven 패턴. "
        "실증: ENA +20.3%, FARTCOIN +14.2%, STRK +13.7%, KAITO +11.8% (2026-04-19)."
    ),
    phases=[
        PhaseCondition(
            phase_id="COMPRESSION_ZONE",
            label="지지선 압축 (매집 준비)",
            required_blocks=[],
            required_any_groups=[
                ["sideways_compression", "bollinger_squeeze", "volume_dryup"],
            ],
            optional_blocks=["volume_dryup"],
            soft_blocks=["absorption_signal"],
            disqualifier_blocks=[],
            score_weights={
                "sideways_compression": 0.50,
                "bollinger_squeeze": 0.30,
                "volume_dryup": 0.20,
                "absorption_signal": 0.15,
            },
            min_bars=6, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SPRING",
            label="스프링 — 거짓 하방 이탈",
            required_blocks=["post_dump_compression"],
            optional_blocks=["reclaim_after_dump"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SIGN_OF_STRENGTH",
            label="강도 신호 — 거래량 폭발 돌파",
            required_blocks=["higher_lows_sequence"],
            optional_blocks=[
                "breakout_volume_confirm",
                "cvd_buying",
                "absorption_signal",
            ],
            disqualifier_blocks=[],
            score_weights={
                "higher_lows_sequence": 0.55,
                "breakout_volume_confirm": 0.25,
                "cvd_buying": 0.15,
                "absorption_signal": 0.10,
            },
            phase_score_threshold=0.55,
            min_bars=2, max_bars=24,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="LAST_POINT_OF_SUPPORT",
            label="최후 지지점 — 진입 구간",
            required_blocks=["reclaim_after_dump", "higher_lows_sequence"],
            optional_blocks=[],
            disqualifier_blocks=[],
            score_weights={
                "reclaim_after_dump": 0.55,
                "higher_lows_sequence": 0.45,
            },
            phase_score_threshold=0.60,
            transition_window_bars=24,
            anchor_from_previous_phase=True,
            anchor_phase_id="SIGN_OF_STRENGTH",
            min_bars=2, max_bars=24,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="MARKUP",
            label="마크업 — 축적 레인지 완전 이탈",
            required_blocks=["breakout_above_high"],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="SIGN_OF_STRENGTH",
    target_phase="MARKUP",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["wyckoff", "spring", "price_action", "accumulation", "altcoin"],
)

VOLUME_ABSORPTION_REVERSAL = PatternObject(
    slug="volume-absorption-reversal-v1",
    name="거래량 흡수 반전 패턴 (셀링 클라이맥스형)",
    description=(
        "셀링 클라이맥스(고거래량 하락 바) → 흡수(가격 평탄화 + 순매수 유지) → "
        "CVD 델타 양전환(매도 프레셔 소진) → 돌파(MARKUP). "
        "순수 OHLCV + taker_buy_base_volume 기반 — 퍼프/OI 데이터 불필요, "
        "현물 거래소에서도 커버 가능. WSR보다 이른 진입(earlier entry)을 노린다."
    ),
    phases=[
        PhaseCondition(
            phase_id="SELLING_CLIMAX",
            label="셀링 클라이맥스 — 고거래량 하락 바",
            required_blocks=["volume_spike_down"],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=3,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ABSORPTION",
            label="흡수 — 패닉 후 거래량 수렴 + 저점 안정화",
            # volume_dryup: 클라이맥스 후 거래량이 평균 대비 수렴 — 공포 매도 소진 확인.
            # absorption_signal(FFR용)은 flat price + heavy buying을 요구하는데,
            # 클라이맥스 직후 가격이 여전히 크게 흔들려 price_move_threshold를 통과 못함.
            # volume_dryup이 post-climax 흡수 구간(12-36h)에서 신뢰성 높게 발동.
            required_blocks=["volume_dryup"],
            optional_blocks=["sideways_compression"],
            soft_blocks=["cvd_buying"],
            disqualifier_blocks=[],
            score_weights={
                "volume_dryup": 0.70,
                "sideways_compression": 0.20,
                "cvd_buying": 0.10,
            },
            phase_score_threshold=0.55,
            anchor_from_previous_phase=True,
            anchor_phase_id="SELLING_CLIMAX",
            transition_window_bars=24,
            min_bars=3, max_bars=24,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="DELTA_FLIP",
            label="델타 양전환 — 매도 프레셔 소진",
            # delta_flip_var: w=3, flip_from_below=0.48, flip_to_at_least=0.52.
            # 기본값(w=6, 0.50→0.55)은 클라이맥스 고거래량 바가 6-bar 롤링에 포함돼
            # ratio가 0.55 아래로 고정됨. w=3 단축 + 0.52 임계값으로
            # 흡수 구간 12-36h 내에서 안정적으로 발동.
            # higher_lows_sequence: 저점 상승 구조 동반 확인
            required_blocks=["delta_flip_var"],
            optional_blocks=["higher_lows_sequence"],
            disqualifier_blocks=["volume_spike_down"],  # 신규 덤프 시 무효
            score_weights={
                "delta_flip_var": 0.65,
                "higher_lows_sequence": 0.35,
            },
            phase_score_threshold=0.60,
            anchor_from_previous_phase=True,
            anchor_phase_id="ABSORPTION",
            transition_window_bars=24,
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="MARKUP",
            label="마크업 — 흡수 레인지 이탈",
            # breakout_from_pullback_range: 클라이맥스 저점에서 레짐 리셋 후 포스트-클라이맥스
            # 레인지 고점 돌파. breakout_above_high(lookback_days=5)는 덤프 이전 가격을
            # 기준으로 삼아 -30~50% 클라이맥스 후 절대 발동 안 됨. breakout_from_pullback_range는
            # 롤링 로우마다 레퍼런스 리셋 → 흡수 레인지 상단 돌파 시 발동.
            required_blocks=["breakout_from_pullback_range"],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="DELTA_FLIP",
    target_phase="MARKUP",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["volume_absorption", "cvd", "selling_climax", "spot_compatible"],
)

FUNDING_FLIP_SHORT = PatternObject(
    slug="funding-flip-short-v1",
    name="펀딩 플립 숏 패턴 (롱 과열 → 반전형)",
    description=(
        "롱 포지션이 극단적으로 과열(펀딩률 높음) → 펀딩 정상화 → 베어리시 캔들 진입. "
        "FFR의 숏 버전. 롱이 극단적으로 몰린 상황에서 숏 기회를 포착."
    ),
    phases=[
        PhaseCondition(
            phase_id="LONG_OVERHEAT",
            label="롱 과열 (숏 대기)",
            required_blocks=["funding_extreme"],
            # funding_extreme defaults to direction="long_overheat"
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="FUNDING_NORMALIZE",
            label="펀딩 정상화 (롱 청산 시작)",
            required_blocks=["funding_flip"],
            # Note: funding_flip detects negative→positive flip for longs.
            # For short setup we use this as a signal that crowded longs
            # are unwinding (funding dropping from extreme positive).
            # A dedicated funding_flip_down block would be more precise;
            # for v1 we use funding_extreme as a soft disqualifier instead.
            disqualifier_blocks=["funding_extreme"],  # extreme must be gone
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SHORT_ENTRY",
            label="숏 진입 (베어리시 캔들)",
            required_blocks=[],
            required_any_groups=[
                ["bearish_engulfing", "long_upper_wick"],
            ],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
    ],
    entry_phase="SHORT_ENTRY",
    target_phase="SHORT_ENTRY",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="short",
    tags=["funding", "short", "reversal", "crowded_longs"],
)

GAP_FADE_SHORT = PatternObject(
    slug="gap-fade-short-v1",
    name="갭 페이드 숏 패턴 (갭업 → 되돌림형)",
    description=(
        "랠리 후 갭업 오픈 → 상단 캔들 거부 → 되돌림 숏. "
        "리테일 FOMO 갭에서 공급 소진을 포착."
    ),
    phases=[
        PhaseCondition(
            phase_id="EXTENDED_RALLY",
            label="과도한 랠리 (갭 조건 형성)",
            required_blocks=["recent_rally"],
            disqualifier_blocks=["volume_below_average"],
            min_bars=2, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="GAP_REJECTION",
            label="갭업 + 상단 거부",
            required_blocks=["gap_up"],
            required_any_groups=[
                ["long_upper_wick", "bearish_engulfing"],
            ],
            min_bars=1, max_bars=3,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKDOWN_CONFIRM",
            label="하락 확인",
            required_blocks=[],
            required_any_groups=[
                ["dead_cross", "bearish_engulfing"],
            ],
            soft_blocks=["volume_spike_down"],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
    ],
    entry_phase="GAP_REJECTION",
    target_phase="BREAKDOWN_CONFIRM",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="short",
    tags=["gap", "short", "fade", "mean_reversion", "retail_fomo"],
)

# Registry: slug → PatternObject
PATTERN_LIBRARY: dict[str, PatternObject] = {
    TRADOOR_OI_REVERSAL.slug: TRADOOR_OI_REVERSAL,
    FUNDING_FLIP_REVERSAL.slug: FUNDING_FLIP_REVERSAL,
    WYCKOFF_SPRING_REVERSAL.slug: WYCKOFF_SPRING_REVERSAL,
    WHALE_ACCUMULATION_REVERSAL.slug: WHALE_ACCUMULATION_REVERSAL,
    VOLUME_ABSORPTION_REVERSAL.slug: VOLUME_ABSORPTION_REVERSAL,
    FUNDING_FLIP_SHORT.slug: FUNDING_FLIP_SHORT,
    GAP_FADE_SHORT.slug: GAP_FADE_SHORT,
}

def get_pattern(slug: str) -> PatternObject:
    if slug not in PATTERN_LIBRARY:
        raise KeyError(f"Unknown pattern: {slug!r}. Available: {list(PATTERN_LIBRARY)}")
    return PATTERN_LIBRARY[slug]
