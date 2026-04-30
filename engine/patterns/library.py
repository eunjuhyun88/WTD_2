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
            co_occurrence_window_bars=6,
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
            # Production lane (W-0150): TRADOOR/PTB's failure mode is
            # not "no breakout trigger exists" but "the generic rolling-
            # low breakout fires on the wrong regime". The target move
            # is specifically:
            #   real dump -> OI hold -> accumulation structure -> local
            #   range breakout with renewed OI expansion.
            #
            # `breakout_after_accumulation` confirms the local range
            # breakout with structure evidence: recent dump + OI hold +
            # higher-lows/compression before the break bar. More precise
            # than rolling-window breakouts which fire on the pre-dump
            # final rally rather than the post-accumulation SOS.
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
                "breakout_after_accumulation",
                "oi_expansion_confirm",
            ],
            optional_blocks=["breakout_from_pullback_range", "breakout_volume_confirm"],
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
            label="저점 확인 — 흡수 + 숏 축소 (W-0322: look-ahead 제거)",
            # cvd_absorption: taker-buy 비율 지속 + 가격 flat = 세력 매집 중 (forward-looking)
            # ls_ratio_recovery: long-short ratio 회복 (숏 축소 신호)
            # higher_lows_sequence 제거 → "이미 오름" 확인이었음, cvd_absorption으로 대체
            # oi_spike_with_dump 은 disqualifier — 신규 덤프 발생 시 매집 무효화.
            required_blocks=["cvd_absorption", "ls_ratio_recovery"],
            soft_blocks=[
                "smart_money_accumulation",
                "volume_dryup",
                "oi_hold_after_spike",
            ],
            disqualifier_blocks=["oi_spike_with_dump"],
            score_weights={
                "cvd_absorption": 0.45,
                "ls_ratio_recovery": 0.30,
                "smart_money_accumulation": 0.15,
                "volume_dryup": 0.05,
                "oi_hold_after_spike": 0.05,
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
        "횡보 압축(sideways ≥16 bars, range ≤6%) → Spring(지지선 하방 sweep 후 즉각 회복) → "
        "SoS(거래량 폭발 + reclaim) → LPS(저거래량 풀백 + cvd_absorption = 진입). "
        "순수 OHLCV 기반. W-0322: look-ahead bias 제거 — higher_lows 제거, "
        "구조 조건으로 교체. entry = LPS (Pruden 2007 §3). "
        "Academic basis: Wyckoff (1930), Murphy (1999) §6."
    ),
    phases=[
        PhaseCondition(
            phase_id="COMPRESSION_ZONE",
            label="Trading Range — lookback=36 bars, range ≤4%, 거래량 수렴",
            # sideways_compression_wyckoff: 36-bar range ≤4% (tighter than default)
            # Fire rate ~39% (vs 87% with defaults). state machine min_bars=36 further
            # restricts: machine must stay in this phase for ≥36 bars.
            # volume_dryup: 거래량 수렴 — energy coiling before release
            required_blocks=["sideways_compression_wyckoff"],
            required_any_groups=[],
            optional_blocks=["volume_dryup", "bollinger_squeeze"],
            soft_blocks=["absorption_signal", "cvd_absorption"],
            disqualifier_blocks=["extreme_volatility"],
            score_weights={
                "sideways_compression_wyckoff": 0.60,
                "volume_dryup": 0.20,
                "bollinger_squeeze": 0.10,
                "cvd_absorption": 0.05,
                "absorption_signal": 0.05,
            },
            phase_score_threshold=0.60,
            min_bars=36, max_bars=240,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SPRING",
            label="Spring — 지지선 하방 sweep + 즉각 회복",
            # sweep_below_low: 3-day prior low 이탈 후 close > prior_low (intrabar recovery)
            # 이것이 Wyckoff Spring의 정의: false downside breakout
            # post_dump_compression은 제거 (24-29% fire rate, 너무 광범위)
            required_blocks=["sweep_below_low"],
            optional_blocks=["volume_spike"],
            disqualifier_blocks=["extreme_volatility"],
            score_weights={
                "sweep_below_low": 0.80,
                "volume_spike": 0.20,
            },
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SIGN_OF_STRENGTH",
            label="SoS — 거래량 폭발 + close 65% 이상 회복",
            # volume_surge_bull: volume ≥ 150% avg = institutional demand
            # reclaim_after_dump(threshold=0.65): close 65% of range = strong close
            # Combined fire rate BTC: ~5% (both required)
            # "이미 오름" 이 아닌 "강한 수요 신호" 감지
            required_blocks=["volume_surge_bull", "reclaim_after_dump_strong"],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            score_weights={
                "volume_surge_bull": 0.55,
                "reclaim_after_dump": 0.35,
                "breakout_volume_confirm": 0.10,
            },
            phase_score_threshold=0.65,
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="LAST_POINT_OF_SUPPORT",
            label="LPS — 저거래량 풀백 + 흡수 = 진입",
            # volume_dryup: 풀백 시 거래량 감소 = weak-hand selling exhausted
            # cvd_absorption: taker-buy 비율 유지 = smart money still buying
            # 이것이 Wyckoff LPS의 핵심: 조용한 풀백 + 내부 매수세 유지
            required_blocks=["volume_dryup"],
            optional_blocks=["cvd_absorption", "absorption_signal"],
            disqualifier_blocks=["extreme_volatility"],
            score_weights={
                "volume_dryup": 0.65,
                "cvd_absorption": 0.25,
                "absorption_signal": 0.10,
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
            label="Markup — 축적 레인지 완전 이탈",
            required_blocks=["breakout_above_high"],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="LAST_POINT_OF_SUPPORT",
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

COMPRESSION_BREAKOUT_REVERSAL = PatternObject(
    slug="compression-breakout-reversal-v1",
    name="압축 돌파 반전 패턴 (가격 코일링형)",
    description=(
        "하락 조정 → 횡보 압축(가격 레인지 ≤6%, 거래량 수렴) → 레인지 상단 돌파. "
        "순수 OHLCV 기반 — 퍼프/OI/펀딩 데이터 불필요, 현물 거래소 커버 가능. "
        "볼린저/ATR 지표 없이 가격 레인지 자체로 코일링을 감지. "
        "VAR과 달리 셀링 클라이맥스를 요구하지 않음 — 일반 조정 후 횡보에도 발동."
    ),
    phases=[
        PhaseCondition(
            phase_id="SETUP",
            label="선행 하락 — 코일링 전 조정 확인",
            required_blocks=["recent_decline"],
            optional_blocks=[],
            disqualifier_blocks=[],
            min_bars=1, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="COILING",
            label="코일링 — 횡보 압축 + 거래량 수렴",
            required_blocks=["sideways_compression_cbr"],
            optional_blocks=["volume_dryup", "bollinger_squeeze"],
            soft_blocks=["post_dump_compression"],
            disqualifier_blocks=[],
            score_weights={
                "sideways_compression_cbr": 0.65,
                "volume_dryup": 0.25,
                "bollinger_squeeze": 0.10,
            },
            phase_score_threshold=0.55,
            anchor_from_previous_phase=True,
            anchor_phase_id="SETUP",
            transition_window_bars=120,
            min_bars=6, max_bars=72,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT",
            label="돌파 — 압축 레인지 상단 이탈",
            required_blocks=["consolidation_breakout_cbr"],
            optional_blocks=["breakout_volume_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
    ],
    entry_phase="BREAKOUT",
    target_phase="BREAKOUT",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["compression", "breakout", "coiling", "post_decline", "spot_compatible"],
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

FUNDING_FLIP_REVERSAL_SHORT = PatternObject(
    slug="funding-flip-reversal-short-v1",
    name="펀딩 과적재 반전 패턴 숏 버전 (롱 스퀴즈형)",
    description=(
        "펀딩 극단 플러스(롱 과적재) → 가격 상승 추세 → 펀딩 플립(양→음) + 매도 폭증"
        " → 저점 하향 형성(축적) → 숏 돌파. "
        "FFR의 반대: 롱 과적재 환경에서 펀딩 반전 = 강제 청산 시나리오. "
        "숏 수익성: 조정 + 하락 추세 캐치 (2026-04-19 실증)."
    ),
    phases=[
        PhaseCondition(
            phase_id="LONG_OVERHEAT",
            label="롱 과적재 (관망)",
            # Funding rate deeply positive = crowded longs.
            # `funding_extreme_long` calls funding_extreme(direction="long_overheat").
            # recent_rally: price usually rising when longs pile in.
            required_blocks=["funding_extreme_long"],
            optional_blocks=["recent_rally"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=8,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="DELTA_FLIP_NEGATIVE",
            label="펀딩 플립 — 핵심 이벤트",
            # Longs capitulating: funding crosses zero (positive→negative).
            # delta_flip_negative: recent bars positive funding → current bar negative.
            # oi_contraction_confirm: OI dropping 5% over 24h = longs unwinding.
            required_blocks=["delta_flip_negative", "oi_contraction_confirm"],
            optional_blocks=["negative_funding_bias"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SELLING_CLIMAX",
            label="매도 폭증 — 강제 청산",
            # After funding flips, longs are forced out with volume.
            # volume_surge_bear: taker-sell ratio >= 0.60 (elevated selling).
            # recent_decline: price has dropped >= 5% in 24h post-flip.
            required_blocks=["volume_surge_bear"],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ENTRY_ZONE",
            label="숏 진입 구간 — 구조 확인",
            # Longs exhausted; price forming lower highs.
            # Funding stays negative while structure improves (lower highs).
            required_blocks=["lower_highs_sequence"],
            required_any_groups=[["negative_funding_bias", "delta_flip_negative"]],
            soft_blocks=[
                "bollinger_squeeze",
                "atr_ultra_low",
                "oi_contraction_confirm",
                "volume_surge_bear",
            ],
            disqualifier_blocks=[],
            score_weights={
                "lower_highs_sequence": 0.45,
                "negative_funding_bias": 0.30,
                "delta_flip_negative": 0.20,
                "bollinger_squeeze": 0.05,
                "atr_ultra_low": 0.05,
                "oi_contraction_confirm": 0.10,
                "volume_surge_bear": 0.08,
            },
            phase_score_threshold=0.70,
            transition_window_bars=12,
            anchor_from_previous_phase=True,
            anchor_phase_id="DELTA_FLIP_NEGATIVE",
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKDOWN",
            label="숏 돌파 — 이전 지지선 붕괴",
            # Previous support breaks on volume = shorts in profit.
            required_blocks=[
                "breakout_below_low",
                "volume_surge_bear",
            ],
            optional_blocks=["lower_highs_sequence"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="ENTRY_ZONE",
    target_phase="BREAKDOWN",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["funding_reversal", "long_squeeze_short", "altcoin", "perp"],
)

GAP_FADE_SHORT = PatternObject(
    slug="gap-fade-short-v1",
    name="갭 페이드 숏 패턴 (갭 업→거절형)",
    description="야간 갭 업(공정가치 이탈) → 빠른 거절 → 매도 폭증 → 갭 메우기(공정가치 복귀)",
    phases=[
        PhaseCondition(
            phase_id="GAP_UP",
            label="갭 업 형성 (관망)",
            required_blocks=["intraday_gap_up"],
            optional_blocks=["atr_ultra_low"],
            min_bars=1, max_bars=2,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="REJECTION",
            label="갭 거절 — 빠른 역행",
            required_blocks=["gap_rejection_signal"],
            optional_blocks=["higher_highs_broken"],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="CLIMAX",
            label="매도 폭증 — 갭 흡수",
            required_blocks=["volume_surge_bear"],
            optional_blocks=["liq_zone_squeeze_setup"],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ENTRY_ZONE",
            label="숏 진입 구간 — 갭 메움 확인",
            required_blocks=["return_to_gap_level"],
            required_any_groups=[["volume_surge_bear", "liq_zone_squeeze_setup"]],
            soft_blocks=["atr_ultra_low", "recent_decline"],
            score_weights={
                "volume_surge_bear": 0.40,
                "liq_zone_squeeze_setup": 0.30,
                "atr_ultra_low": 0.20,
                "return_to_gap_level": 0.10,
            },
            phase_score_threshold=0.65,
            transition_window_bars=12,
            anchor_from_previous_phase=True,
            anchor_phase_id="CLIMAX",
            min_bars=2, max_bars=24,
            timeframe="1h",
        ),
    ],
    entry_phase="ENTRY_ZONE",
    target_phase="ENTRY_ZONE",  # Gap fade completes when price returns to gap level
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["gap_fade", "mean_reversion", "altcoin", "short_entry"],
)

# Registry: slug → PatternObject
VOLATILITY_SQUEEZE_BREAKOUT = PatternObject(
    slug="volatility-squeeze-breakout-v1",
    name="변동성 스퀴즈 돌파 패턴 (아카 L14+L15+L13형)",
    description=(
        "BB 스퀴즈 + ATR 극저 압축 → 볼륨 확인 돌파. "
        "아카 Alpha Terminal L14(볼린저 스퀴즈) + L15(ATR 극저) + L13(고가 돌파) 조합. "
        "Minervini VCP 크립토 적용형."
    ),
    phases=[
        PhaseCondition(
            phase_id="COMPRESSION",
            label="변동성 압축 (BB + ATR 이중 스퀴즈)",
            required_blocks=["bollinger_squeeze"],
            optional_blocks=["atr_ultra_low"],
            disqualifier_blocks=["extreme_volatility"],
            min_bars=3, max_bars=40,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT_SIGNAL",
            label="돌파 신호 (볼륨 + 고가 돌파)",
            required_blocks=["breakout_above_high", "breakout_volume_confirm"],
            optional_blocks=["bollinger_expansion"],
            soft_blocks=["volume_surge_bull"],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="TREND_CONFIRM",
            label="추세 확인 (저점 상승)",
            required_blocks=[],
            required_any_groups=[
                ["higher_lows_sequence", "ema_pullback"],
            ],
            soft_blocks=["delta_flip_positive"],
            min_bars=2, max_bars=20,
            timeframe="1h",
        ),
    ],
    entry_phase="BREAKOUT_SIGNAL",
    target_phase="TREND_CONFIRM",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["volatility_squeeze", "breakout", "minervini_vcp", "bollinger", "atr", "aka_l14_l15"],
)

ALPHA_CONFLUENCE = PatternObject(
    slug="alpha-confluence-v1",
    name="알파 컨플루언스 패턴 (아카 15레이어 복합형)",
    description=(
        "아카 Alpha Terminal의 핵심 레이어(L2 Flow + L11 CVD + L14 BB + L1 Wyckoff)가 "
        "동시에 강세 신호를 낼 때 진입. 단일 패턴보다 레이어 합산으로 신뢰도 극대화."
    ),
    phases=[
        PhaseCondition(
            phase_id="LAYER_SETUP",
            label="레이어 조건 형성 (FR + OI + 압축)",
            required_blocks=["funding_extreme", "bollinger_squeeze"],
            optional_blocks=["atr_ultra_low", "sideways_compression"],
            soft_blocks=["liq_zone_squeeze_setup"],
            disqualifier_blocks=["extreme_volatility"],
            min_bars=2, max_bars=30,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="CVD_SIGNAL",
            label="CVD 흡수 + 저점 상승 (L11 + L1)",
            required_blocks=["delta_flip_positive"],
            optional_blocks=["absorption_signal", "higher_lows_sequence"],
            soft_blocks=["smart_money_accumulation", "coinbase_premium_positive"],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ALPHA_ENTRY",
            label="알파 진입 (볼륨 + 캔들)",
            required_blocks=[],
            required_any_groups=[
                ["volume_surge_bull", "breakout_volume_confirm"],
                ["bullish_engulfing", "long_lower_wick"],
            ],
            soft_blocks=["breakout_above_high", "ema_pullback"],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
    ],
    entry_phase="ALPHA_ENTRY",
    target_phase="ALPHA_ENTRY",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["multi_layer", "confluence", "aka_alpha_terminal", "cvd", "funding", "bollinger"],
)

RADAR_GOLDEN_ENTRY = PatternObject(
    slug="radar-golden-entry-v1",
    name="Signal Radar 골든 진입 패턴 (GOLDEN 신호형)",
    description=(
        "바이낸스 ALPHA HUNTER V4.0 PRO의 GOLDEN 신호 조건을 WTD 빌딩 블록으로 이식. "
        "볼륨 가속(필터1) + CVD 방향성(필터2) + BTC 상대강도(필터3) 복합 충족 시 진입. "
        "fakeout 필터: cvd_price_divergence가 있으면 진입 차단 (가격 고점 + CVD 하락 = 분산 구조)."
    ),
    phases=[
        PhaseCondition(
            phase_id="MOMENTUM_BASE",
            label="모멘텀 기저 — 볼륨 가속 확인 (필터 1)",
            # Signal Radar filter 1: velocity >= 3.0 (big volume vs avg)
            # volume_surge_bull = vol_acceleration(3봉/24봉) >= surge_factor AND bullish bar
            required_blocks=["volume_surge_bull"],
            # BTC 상대강도: alt velocity / BTC velocity >= 1.2 (필터 4)
            required_any_groups=[["relative_velocity_bull", "alt_btc_accel_ratio"]],
            soft_blocks=["recent_rally"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SIGNAL_ENTRY",
            label="진입 신호 — CVD 방향성 + fakeout 차단 (필터 2+3)",
            # Signal Radar filter 2: CVD > dynCvdTarget AND NOT fakeout
            # delta_flip_positive = CVD turned net-buying (taker flow reversal)
            # absorption_signal = heavy net-buying while price flat (accumulation)
            required_blocks=[],
            required_any_groups=[
                ["delta_flip_positive", "absorption_signal"],
            ],
            soft_blocks=[
                # OB 불균형 (필터 3 근사): orderbook bid 달러 >> ask 달러
                "orderbook_imbalance_ratio",
                "higher_lows_sequence",
                "bollinger_expansion",
            ],
            # fakeout disqualifier: price at high but CVD declining = distribution
            disqualifier_blocks=["cvd_price_divergence"],
            score_weights={
                "delta_flip_positive": 0.50,
                "absorption_signal": 0.50,
                "orderbook_imbalance_ratio": 0.20,
                "higher_lows_sequence": 0.15,
                "bollinger_expansion": 0.15,
            },
            phase_score_threshold=0.50,
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
    ],
    entry_phase="SIGNAL_ENTRY",
    target_phase="SIGNAL_ENTRY",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["signal_radar", "golden", "momentum", "cvd", "fakeout_filter", "velocity"],
)

INSTITUTIONAL_DISTRIBUTION = PatternObject(
    slug="institutional-distribution-v1",
    name="기관 분배 숏 패턴 (CVD 이탈 + 유동성 약화형)",
    description=(
        "매수 플로우가 상승 중인데 가격이 하락(CVD 스팟 괴리) → OI 약화 → "
        "베어리시 진입 캔들. 기관이 매수세를 이용해 물량을 분배하는 구간을 포착. "
        "코인베이스 프리미엄 약세 + 롱 과열 구간에서 강도 상승."
    ),
    phases=[
        PhaseCondition(
            phase_id="CVD_DECOUPLING",
            label="CVD 이탈 (매수 플로우 vs 가격 괴리)",
            required_blocks=["recent_decline"],
            required_any_groups=[
                ["delta_flip_positive", "cvd_spot_price_divergence_bear"],
            ],
            disqualifier_blocks=["higher_lows_sequence"],
            # higher_lows_sequence disqualifies: accumulation not distribution
            min_bars=2, max_bars=16,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="LIQUIDITY_WEAKENING",
            label="유동성 약화 (OI 확인)",
            required_blocks=[],
            soft_blocks=["oi_exchange_divergence", "oi_spike_with_dump", "total_oi_spike"],
            # At least 1 soft OI block raises phase score; gating is via
            # required_any_groups=[] so the phase can advance without them
            # (OI data may be absent on some symbols).
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SHORT_ENTRY",
            label="숏 진입 (베어리시 캔들 확인)",
            required_blocks=[],
            required_any_groups=[
                ["bearish_engulfing", "long_upper_wick", "volume_surge_bear"],
            ],
            disqualifier_blocks=["bollinger_squeeze"],
            # bollinger_squeeze: price compressed = not yet breaking down
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
    ],
    entry_phase="SHORT_ENTRY",
    target_phase="SHORT_ENTRY",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="short",
    tags=["distribution", "short", "cvd", "institutional", "liquidity"],
)


# ─── W-0110: 유동성 스윕 반전 ─────────────────────────────────────────────────
LIQUIDITY_SWEEP_REVERSAL = PatternObject(
    slug="liquidity-sweep-reversal-v1",
    name="유동성 스윕 반전 패턴 (스탑 사냥 → 반전형)",
    description=(
        "마켓 메이커가 스탑 오더 스윕 → 즉각 가격 반전. "
        "급격한 탈출 후 낮은 수급으로 축적 형성. "
        "온체인 MEV 기술로 가시적인 암호 고유 현상. "
        "50~100% 목표."
    ),
    phases=[
        PhaseCondition(
            phase_id="BREAKOUT_CLIMAX",
            label="스윕 진입 (스탑 청산 구간)",
            required_blocks=["breakout_above_high", "volume_spike"],
            # Price breaks recent high + volume surge = MM stop hunt
            optional_blocks=["recent_rally"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="REVERSAL_SIGNAL",
            label="반전 신호 (스탑 후 가격 반전)",
            # Phase transition happens automatically; no blocks required.
            # This phase captures the moment where price reverses from the
            # sweep climax. Minimal volume expected (shorts covering silently).
            required_blocks=[],
            optional_blocks=[],
            disqualifier_blocks=["oi_spike_with_dump"],
            # If another dump occurs, not a sweep reversal
            min_bars=1, max_bars=3,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ACCUMULATION",
            label="축적 구간 — 진입 구간",
            required_blocks=["higher_lows_sequence", "oi_hold_after_spike"],
            required_any_groups=[["funding_flip", "positive_funding_bias", "ls_ratio_recovery"]],
            soft_blocks=["volume_dryup", "bollinger_squeeze"],
            disqualifier_blocks=["oi_spike_with_dump"],
            score_weights={
                "higher_lows_sequence": 0.40,
                "oi_hold_after_spike": 0.25,
                "funding_flip": 0.10,
                "positive_funding_bias": 0.08,
                "ls_ratio_recovery": 0.08,
                "volume_dryup": 0.05,
                "bollinger_squeeze": 0.04,
            },
            phase_score_threshold=0.70,
            transition_window_bars=18,
            anchor_from_previous_phase=True,
            anchor_phase_id="REVERSAL_SIGNAL",
            min_bars=6, max_bars=72,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT",
            label="브레이크아웃",
            required_blocks=["breakout_from_pullback_range"],
            optional_blocks=["breakout_volume_confirm"],
            soft_blocks=["oi_expansion_confirm"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=48,
            timeframe="1h",
        ),
    ],
    entry_phase="ACCUMULATION",
    target_phase="BREAKOUT",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["reversal", "long", "sweep", "liquidity", "crypto-native"],
)

# ─── W-0114: 딸깍 전략 ──────────────────────────────────────────────────────
# OI 선취매 + Social Ignition + Breakout 순차 발화 패턴
# Phase 1: OI 오르는데 가격 안 움직임 (선취매 구간)
# Phase 2: 소셜 트리거 (KOL 언급 OR 언급량 급증) — Twitter 토큰 복구 전까지 optional
# Phase 3: 브레이크아웃 확인 (진입 신호)
# Phase 4: TARGET 도달 = 성공
OI_PRESURGE_LONG = PatternObject(
    slug="oi-presurge-long-v1",
    name="OI 선취매 롱 (딸깍형)",
    description=(
        "OI↑ + price flat → 소셜 촉매(KOL 언급/언급 급증) → 브레이크아웃. "
        "Small losses(200 USDT 고정 손절), Big wins(3:1 R/R) 원칙. "
        "신규 상장 / 변동성 이력 큰 심볼 우선."
    ),
    phases=[
        PhaseCondition(
            phase_id="QUIET_ACCUMULATION",
            label="조용한 OI 축적 (선취매 관망)",
            required_blocks=["oi_price_lag_detect"],
            optional_blocks=["total_oi_spike", "bollinger_squeeze", "volume_dryup"],
            disqualifier_blocks=["oi_spike_with_dump", "extreme_volatility"],
            min_bars=3,
            max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SOCIAL_IGNITION",
            label="소셜 촉매 발화 (개미 유입 시작 감지)",
            # 실제 데이터 소스:
            #   kol_signal           : CoinGecko trending + community_score > 50
            #   social_sentiment_spike: CoinGecko trending OR Binance Square spike
            #   social_composite     : 3개 소스 중 2개 이상 동시 발화
            #   fear_greed_rising    : Alternative.me F&G 상승 (개미 유입 proxy)
            # Twitter 토큰 복구 후: kol_mention_detect(Twitter) 추가 예정
            required_blocks=[],
            required_any_groups=[
                ["cvd_surge_long", "whale_tick_buy", "orderbook_imbalance_ratio"],  # OFI proxy (Cont-Kukanov-Stoikov 2014)
                ["oi_price_lag_detect_strong", "relative_velocity_bull"],
            ],
            optional_blocks=["fear_greed_rising", "alt_btc_accel_ratio", "coinbase_premium_positive"],
            disqualifier_blocks=["cvd_spot_price_divergence_bear"],
            min_bars=1,
            max_bars=12,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT_CONFIRM",
            label="브레이크아웃 확인 (진입 신호)",
            required_blocks=["breakout_above_high"],
            required_any_groups=[
                ["breakout_volume_confirm", "volume_spike", "bollinger_expansion"],
            ],
            optional_blocks=["oi_expansion_confirm", "positive_funding_bias"],
            disqualifier_blocks=["extreme_volatility", "extended_from_ma"],
            min_bars=1,
            max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="TARGET",
            label="목표가 도달 (3:1 R/R)",
            required_blocks=["recent_rally"],
            optional_blocks=["oi_hold_after_spike"],
            min_bars=1,
            max_bars=72,
            timeframe="1h",
        ),
    ],
    entry_phase="BREAKOUT_CONFIRM",
    target_phase="TARGET",
    timeframe="1h",
    direction="long",
    tags=["dalkkak", "oi-presurge", "social-catalyst", "momentum"],
)


ALPHA_PRESURGE = PatternObject(
    slug="alpha-presurge-v1",
    name="Binance Alpha → Futures 펌프 예비 패턴",
    description=(
        "BSC/ETH 소형 토큰이 Binance Alpha에 상장 후 Futures 상장 전후로 "
        "10-30x 펌핑하는 패턴. 세 단계: "
        "(1) SCREENING_GATE — MC < 100M, DEX 유동성 확인, 홀더 구조 적정 "
        "(2) ACCUMULATION_ZONE — 세력 선물 숏 매집 + 현물 CVD 분리 + 음펀비 "
        "(3) SQUEEZE_TRIGGER — 개미 롱 청산 시작, 펀비 반전, OI 재확장. "
        "기준: MC 최저점 기준 < 100M, 고점 대비 낙폭 > 80%, SNS 활성. "
        "사례: RIVER, SIREN, RAVE, MYX, AIOT, XPIN (BSC 위주). "
        "출처: 2026-04-21 사용자 분석 문서."
    ),
    phases=[
        PhaseCondition(
            phase_id="SCREENING_GATE",
            label="스크리닝 통과 (MC/홀더/DEX 유동성)",
            # DEX 데이터가 있어야 함 (Alpha 코인 = DEX에 먼저 상장)
            # dex_buy_pressure는 DEX 볼륨이 있을 때만 발화 — 없으면 패스
            required_blocks=[],
            required_any_groups=[
                # Criterion 1: MC range gate (소형주)
                # dex_buy_pressure fires only when dex_volume_h24 > 10K
                # = DEX 활성화 확인. 없으면 다음 그룹 통과로 진행
                ["dex_buy_pressure", "volume_dryup"],  # DEX active OR compressed CEX vol
            ],
            optional_blocks=[
                "holder_concentration_ok",  # holder data가 있으면 bonus
            ],
            disqualifier_blocks=["extreme_volatility"],
            min_bars=1, max_bars=72,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ACCUMULATION_ZONE",
            label="세력 숏 매집 구간 (음펀비 + CVD 분리)",
            # $IN 분석: spot CVD 회복 중인데 선물 CVD는 밀림 = 세력 숏 매집
            required_blocks=["spot_futures_cvd_divergence"],
            required_any_groups=[
                # 음펀비 지속 OR 극단적 음펀비
                ["negative_funding_bias", "funding_extreme"],
                # 가격 우하향 or 박스권 (아직 추세 전환 전)
                ["recent_decline", "sideways_compression", "bollinger_squeeze"],
            ],
            optional_blocks=[
                "oi_contraction_confirm",  # OI 감소 = 아직 발사 준비 안 됨 (확인)
                "volume_dryup",            # 볼륨 감소 = 개미 관심 식음
                "dex_buy_pressure",        # DEX에서는 사고 있음
            ],
            disqualifier_blocks=["oi_spike_with_dump"],  # 진짜 덤프는 아니어야 함
            min_bars=3, max_bars=96,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SQUEEZE_TRIGGER",
            label="스퀴즈 트리거 (숏 청산 + 추세 전환)",
            # 세력 숏 청산 시작 → 개미 롱 청산 → 가격 급등
            required_blocks=["ls_ratio_recovery"],      # 개미 롱 비율 감소 시작
            required_any_groups=[
                # 펀딩 반전 OR OI 재팽창 (둘 중 하나면 됨)
                ["funding_flip", "oi_expansion_confirm"],
                # 추세 전환 신호
                ["higher_lows_sequence", "reclaim_after_dump", "breakout_above_high"],
            ],
            optional_blocks=[
                "dex_buy_pressure",     # DEX 매수 동반
                "volume_surge_bull",    # 볼륨 동반 상승
                "positive_funding_bias",
                "holder_concentration_ok",
            ],
            disqualifier_blocks=["extended_from_ma"],  # 이미 많이 오른 건 제외
            min_bars=1, max_bars=24,
            timeframe="1h",
        ),
    ],
    entry_phase="SQUEEZE_TRIGGER",
    target_phase="SQUEEZE_TRIGGER",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["alpha-presurge", "bsc", "small-cap", "futures-listing", "squeeze"],
    version=1,
    created_by="cto-research",
)


# ─── W-0147: HTML reference signal coverage ──────────────────────────────────
# These are source-specific registrations for the Telegram HTML references in
# tmp/telegram_refs. They intentionally reuse existing runtime blocks so the
# signals are searchable by the engine before a later benchmark/eval slice
# promotes or rejects them.
def _html_pattern(
    *,
    slug: str,
    name: str,
    description: str,
    required_blocks: list[str] | None = None,
    required_any_groups: list[list[str]] | None = None,
    optional_blocks: list[str] | None = None,
    soft_blocks: list[str] | None = None,
    disqualifier_blocks: list[str] | None = None,
    direction: str = "long",
    tags: list[str] | None = None,
    phase_id: str = "SIGNAL",
    label: str = "HTML reference signal",
) -> PatternObject:
    return PatternObject(
        slug=slug,
        name=name,
        description=description,
        phases=[
            PhaseCondition(
                phase_id=phase_id,
                label=label,
                required_blocks=required_blocks or [],
                required_any_groups=required_any_groups or [],
                optional_blocks=optional_blocks or [],
                soft_blocks=soft_blocks or [],
                disqualifier_blocks=disqualifier_blocks or [],
                min_bars=1,
                max_bars=12,
                timeframe="1h",
            )
        ],
        entry_phase=phase_id,
        target_phase=phase_id,
        timeframe="1h",
        universe_scope="binance_dynamic",
        direction=direction,  # type: ignore[arg-type]
        tags=["html_ref", *(tags or [])],
        version=1,
        created_by="w-0147-html-reference",
    )


RADAR_CVD_BREAKOUT = _html_pattern(
    slug="radar-cvd-breakout-v1",
    name="Signal Radar CVD 자금 유입 돌파",
    description="바이낸스 시그널 레이더의 일반 CVD 돌파 로그. CVD 순매수와 속도 가속을 함께 본다.",
    required_any_groups=[["delta_flip_positive", "absorption_signal"]],
    optional_blocks=["volume_surge_bull", "relative_velocity_bull", "recent_rally"],
    tags=["signal_radar", "cvd", "money_flow"],
)

RADAR_WHALE_BLOCK_TRADE = _html_pattern(
    slug="radar-whale-block-trade-v1",
    name="Signal Radar 고래 블록 체결",
    description="바이낸스 시그널 레이더의 WHALE BLOCK TRADE 이벤트. 대형 매수 체결을 볼륨/스마트머니 프록시로 등록한다.",
    required_any_groups=[["volume_surge_bull", "smart_money_accumulation", "total_oi_spike"]],
    optional_blocks=["recent_rally", "delta_flip_positive"],
    tags=["signal_radar", "whale", "block_trade"],
)

RADAR_MICRO_SQUEEZE_BREAKOUT = PatternObject(
    slug="radar-micro-squeeze-breakout-v1",
    name="Signal Radar MICRO-SQUEEZE BREAKOUT",
    description="Signal Radar의 바닥 압축 후 CVD 순매수 돌파 이벤트.",
    phases=[
        PhaseCondition(
            phase_id="SQUEEZE_SETUP",
            label="micro squeeze setup",
            required_blocks=[],
            required_any_groups=[["bollinger_squeeze", "liq_zone_squeeze_setup", "atr_ultra_low"]],
            optional_blocks=["volume_dryup"],
            disqualifier_blocks=["extreme_volatility"],
            min_bars=2,
            max_bars=18,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="CVD_BREAKOUT",
            label="CVD breakout from squeeze",
            required_any_groups=[
                ["delta_flip_positive", "absorption_signal"],
                ["breakout_above_high", "volume_surge_bull", "bollinger_expansion"],
            ],
            required_blocks=[],
            optional_blocks=["orderbook_imbalance_ratio"],
            min_bars=1,
            max_bars=6,
            timeframe="1h",
        ),
    ],
    entry_phase="CVD_BREAKOUT",
    target_phase="CVD_BREAKOUT",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["html_ref", "signal_radar", "micro_squeeze", "cvd"],
    created_by="w-0147-html-reference",
)

RADAR_ORDERBOOK_IMBALANCE = _html_pattern(
    slug="radar-orderbook-imbalance-v1",
    name="Signal Radar ORDERBOOK IMBALANCE",
    description="Signal Radar의 매수벽 우위 이벤트. bid/ask 불균형과 CVD/모멘텀을 함께 본다.",
    required_blocks=["orderbook_imbalance_ratio"],
    optional_blocks=["delta_flip_positive", "volume_surge_bull", "recent_rally"],
    tags=["signal_radar", "orderbook", "imbalance"],
)

RADAR_HOT_TARGET_CLUSTER = _html_pattern(
    slug="radar-hot-target-cluster-v1",
    name="Signal Radar 핫 타겟 클러스터",
    description="최근 30분 Signal Radar 이벤트 누적 랭킹을 패턴 엔진용 클러스터 신호로 등록한다.",
    required_any_groups=[
        ["volume_surge_bull", "delta_flip_positive", "orderbook_imbalance_ratio", "bollinger_squeeze"],
    ],
    optional_blocks=["relative_velocity_bull", "smart_money_accumulation"],
    tags=["signal_radar", "hot_target", "cluster"],
)

ALPHA_TERMINAL_SHORT_SQUEEZE = PatternObject(
    slug="alpha-terminal-short-squeeze-v1",
    name="Alpha Terminal SHORT_SQUEEZE",
    description="Alpha Terminal setupTag SHORT_SQUEEZE. 음펀비/숏 과밀, 압축, 상방 스퀴즈 트리거.",
    phases=[
        PhaseCondition(
            phase_id="SHORT_CROWDING",
            label="short crowding and compression",
            required_blocks=["funding_extreme_short"],
            optional_blocks=["negative_funding_bias", "bollinger_squeeze", "atr_ultra_low", "oi_change"],
            min_bars=1,
            max_bars=24,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="SQUEEZE_TRIGGER",
            label="squeeze trigger",
            required_blocks=[],
            required_any_groups=[
                ["funding_flip", "ls_ratio_recovery", "positive_funding_bias"],
                ["breakout_above_high", "oi_expansion_confirm", "volume_surge_bull"],
            ],
            optional_blocks=["bollinger_expansion", "vwap_break"],
            min_bars=1,
            max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="SQUEEZE_TRIGGER",
    target_phase="SQUEEZE_TRIGGER",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["html_ref", "alpha_terminal", "short_squeeze"],
    created_by="w-0147-html-reference",
)

ALPHA_TERMINAL_BOTTOM_ABSORPTION = PatternObject(
    slug="alpha-terminal-bottom-absorption-v1",
    name="Alpha Terminal BOTTOM_ABSORPTION",
    description="Alpha Terminal setupTag BOTTOM_ABSORPTION. 와이코프 축적 + CVD 흡수.",
    phases=[
        PhaseCondition(
            phase_id="BASE",
            label="bottom base",
            required_blocks=[],
            required_any_groups=[["sideways_compression", "bollinger_squeeze", "volume_dryup"]],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=["extreme_volatility"],
            min_bars=2,
            max_bars=36,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ABSORPTION_ENTRY",
            label="CVD absorption entry",
            required_blocks=[],
            required_any_groups=[
                ["absorption_signal", "delta_flip_positive"],
                ["higher_lows_sequence", "reclaim_after_dump"],
            ],
            optional_blocks=["vwap_break", "smart_money_accumulation"],
            min_bars=1,
            max_bars=18,
            timeframe="1h",
        ),
    ],
    entry_phase="ABSORPTION_ENTRY",
    target_phase="ABSORPTION_ENTRY",
    timeframe="1h",
    universe_scope="binance_dynamic",
    direction="long",
    tags=["html_ref", "alpha_terminal", "bottom_absorption", "cvd"],
    created_by="w-0147-html-reference",
)

ALPHA_TERMINAL_BREAKOUT_MOMENTUM = _html_pattern(
    slug="alpha-terminal-breakout-momentum-v1",
    name="Alpha Terminal BREAKOUT_MOMENTUM",
    description="Alpha Terminal setupTag BREAKOUT_MOMENTUM. 고가 돌파, VWAP/MTF 확인, 볼륨 가속.",
    required_blocks=["breakout_above_high"],
    required_any_groups=[
        ["volume_surge_bull", "breakout_volume_confirm", "oi_acceleration"],
        ["vwap_break", "relative_strength_btc", "higher_lows_sequence"],
    ],
    optional_blocks=["relative_velocity_bull", "oi_expansion_confirm", "bollinger_expansion"],
    tags=["alpha_terminal", "breakout_momentum", "vwap"],
)

ALPHA_TERMINAL_VWAP_BREAK = _html_pattern(
    slug="alpha-terminal-vwap-break-v1",
    name="Alpha Terminal VWAP_BREAK",
    description="Alpha Terminal setupTag VWAP_BREAK. 단기 VWAP 돌파와 BTC 상대강도 우위.",
    required_blocks=["vwap_break"],
    required_any_groups=[["relative_strength_btc", "relative_velocity_bull", "oi_acceleration"]],
    optional_blocks=["volume_surge_bull", "breakout_volume_confirm", "recent_rally"],
    tags=["alpha_terminal", "vwap", "scalp"],
)

ALPHA_TERMINAL_STRONG_BULL_CONFLUENCE = _html_pattern(
    slug="alpha-terminal-strong-bull-confluence-v1",
    name="Alpha Terminal STRONG_BULL confluence",
    description="Alpha Terminal alphaScore >= 60에 대응하는 강한 상승 컨플루언스.",
    required_any_groups=[
        ["delta_flip_positive", "absorption_signal", "positive_funding_bias"],
        ["volume_surge_bull", "breakout_volume_confirm", "vwap_break"],
        ["higher_lows_sequence", "relative_strength_btc", "bollinger_expansion"],
    ],
    optional_blocks=["funding_extreme_short", "oi_expansion_confirm", "orderbook_imbalance_ratio"],
    tags=["alpha_terminal", "alpha_score", "strong_bull"],
)

ALPHA_TERMINAL_STRONG_BEAR_CONFLUENCE = _html_pattern(
    slug="alpha-terminal-strong-bear-confluence-v1",
    name="Alpha Terminal STRONG_BEAR confluence",
    description="Alpha Terminal alphaScore <= -60에 대응하는 강한 하락/분배 컨플루언스.",
    required_any_groups=[
        ["recent_decline", "cvd_spot_price_divergence_bear"],
        ["volume_surge_bear", "bearish_engulfing", "long_upper_wick"],
    ],
    optional_blocks=["negative_funding_bias", "extended_from_ma", "coinbase_premium_weak"],
    direction="short",
    tags=["alpha_terminal", "alpha_score", "strong_bear"],
)

ALPHA_FLOW_BULL_BIAS = _html_pattern(
    slug="alpha-flow-bull-bias-v1",
    name="Alpha Flow BULL/STRONG_BULL bias",
    description="나혼자매매 Alpha Flow의 상승 편향 aggregate를 runtime 패턴으로 등록.",
    required_any_groups=[
        ["delta_flip_positive", "absorption_signal", "positive_funding_bias"],
        ["higher_lows_sequence", "volume_surge_bull", "breakout_volume_confirm"],
    ],
    optional_blocks=["bollinger_squeeze", "atr_ultra_low", "relative_strength_btc"],
    tags=["alpha_flow", "alpha_score", "bull_bias"],
)

ALPHA_FLOW_BEAR_BIAS = _html_pattern(
    slug="alpha-flow-bear-bias-v1",
    name="Alpha Flow BEAR/STRONG_BEAR bias",
    description="나혼자매매 Alpha Flow의 하락/분산 편향 aggregate를 runtime 패턴으로 등록.",
    required_any_groups=[
        ["recent_decline", "cvd_spot_price_divergence_bear"],
        ["volume_surge_bear", "bearish_engulfing", "long_upper_wick"],
    ],
    optional_blocks=["negative_funding_bias", "extended_from_ma"],
    direction="short",
    tags=["alpha_flow", "alpha_score", "bear_bias"],
)

ALPHA_FLOW_WYCKOFF_ACCUMULATION = _html_pattern(
    slug="alpha-flow-wyckoff-accumulation-v1",
    name="Alpha Flow WYCKOFF accumulation",
    description="Alpha Flow WYCKOFF 필터. 횡보/스프링 후 흡수와 저점 상승.",
    required_any_groups=[
        ["sideways_compression", "sweep_below_low", "bollinger_squeeze"],
        ["absorption_signal", "higher_lows_sequence", "delta_flip_positive"],
    ],
    optional_blocks=["volume_dryup", "reclaim_after_dump"],
    tags=["alpha_flow", "wyckoff", "accumulation"],
)

ALPHA_FLOW_MTF_ACCUMULATION = _html_pattern(
    slug="alpha-flow-mtf-accumulation-v1",
    name="Alpha Flow MTF accumulation",
    description="Alpha Flow MTF 필터. 여러 시간축의 축적을 단일 runtime 프록시로 등록.",
    required_any_groups=[
        ["higher_lows_sequence", "ema_pullback"],
        ["relative_strength_btc", "relative_velocity_bull", "alt_btc_accel_ratio"],
    ],
    optional_blocks=["bollinger_squeeze", "volume_dryup"],
    tags=["alpha_flow", "mtf", "accumulation"],
)

ALPHA_FLOW_LIQUIDITY_ZONE = _html_pattern(
    slug="alpha-flow-liquidity-zone-v1",
    name="Alpha Flow LIQ liquidity zone",
    description="Alpha Flow 청산존/유동성존 필터. 압축된 유동성 구간과 호가 불균형을 본다.",
    required_any_groups=[["liq_zone_squeeze_setup", "orderbook_imbalance_ratio"]],
    optional_blocks=["bollinger_squeeze", "atr_ultra_low"],
    tags=["alpha_flow", "liquidity", "orderbook"],
)

ALPHA_FLOW_EXTREME_FLOW = _html_pattern(
    slug="alpha-flow-extreme-flow-v1",
    name="Alpha Flow EXTREME funding/OI flow",
    description="Alpha Flow EXTREME 필터. 극단 펀딩과 OI/볼륨 변화를 위험/기회 신호로 등록.",
    required_any_groups=[
        ["funding_extreme", "funding_extreme_short"],
        ["oi_change", "oi_expansion_confirm", "volume_surge_bull", "volume_surge_bear"],
    ],
    optional_blocks=["venue_funding_spread_extreme"],
    tags=["alpha_flow", "extreme", "funding", "oi"],
)

ALPHA_HUNTER_ACTIVITY_SURGE = _html_pattern(
    slug="alpha-hunter-activity-surge-v1",
    name="Alpha Hunter S1 activity surge",
    description="Alpha Hunter S1 거래 활성도. 거래량/시총과 평균 체결 활성도를 볼륨 가속으로 등록.",
    required_any_groups=[["volume_spike", "volume_surge_bull", "volume_surge_bear"]],
    optional_blocks=["relative_velocity_bull"],
    tags=["alpha_hunter", "s1", "activity"],
)

ALPHA_HUNTER_LIQUIDITY_HEALTH = _html_pattern(
    slug="alpha-hunter-liquidity-health-v1",
    name="Alpha Hunter S2 liquidity health",
    description="Alpha Hunter S2 유동성/시총 건강도. DEX 활성과 홀더 구조 프록시.",
    required_any_groups=[["dex_buy_pressure", "holder_concentration_ok", "volume_dryup"]],
    optional_blocks=["liq_zone_squeeze_setup"],
    tags=["alpha_hunter", "s2", "liquidity"],
)

ALPHA_HUNTER_TRADE_FLOW_ACCUMULATION = _html_pattern(
    slug="alpha-hunter-trade-flow-accumulation-v1",
    name="Alpha Hunter S3 trade-flow accumulation",
    description="Alpha Hunter S3 체결 매수 우위. CVD/흡수 블록으로 등록.",
    required_any_groups=[["delta_flip_positive", "absorption_signal", "cvd_buying"]],
    optional_blocks=["volume_surge_bull"],
    tags=["alpha_hunter", "s3", "trade_flow"],
)

ALPHA_HUNTER_MOMENTUM_BULL_DIVERGENCE = _html_pattern(
    slug="alpha-hunter-momentum-bull-divergence-v1",
    name="Alpha Hunter S4 bullish momentum divergence",
    description="Alpha Hunter S4 RSI 강세 다이버전스/상승 모멘텀.",
    required_any_groups=[["rsi_bullish_divergence", "rsi_threshold", "ema_pullback"]],
    optional_blocks=["volume_surge_bull", "relative_strength_btc"],
    tags=["alpha_hunter", "s4", "momentum", "bull_divergence"],
)

ALPHA_HUNTER_MOMENTUM_BEAR_DIVERGENCE = _html_pattern(
    slug="alpha-hunter-momentum-bear-divergence-v1",
    name="Alpha Hunter S4 bearish momentum divergence",
    description="Alpha Hunter S4 RSI 약세 다이버전스/하락 모멘텀.",
    required_any_groups=[["rsi_bearish_divergence", "recent_decline", "extended_from_ma"]],
    optional_blocks=["volume_surge_bear"],
    direction="short",
    tags=["alpha_hunter", "s4", "momentum", "bear_divergence"],
)

ALPHA_HUNTER_HOLDER_QUALITY = _html_pattern(
    slug="alpha-hunter-holder-quality-v1",
    name="Alpha Hunter S5 holder quality",
    description="Alpha Hunter S5 홀더/커뮤니티 품질. 홀더 집중도와 소셜 프록시.",
    required_any_groups=[["holder_concentration_ok", "social_sentiment_spike", "kol_signal"]],
    optional_blocks=["dex_buy_pressure"],
    tags=["alpha_hunter", "s5", "holders"],
)

ALPHA_HUNTER_LISTING_STAGE_CATALYST = _html_pattern(
    slug="alpha-hunter-listing-stage-catalyst-v1",
    name="Alpha Hunter S6 listing-stage catalyst",
    description="Alpha Hunter S6 상장 단계 촉매. Alpha/spot/futures 기대감을 소셜·상대속도·거래소 고립 펌프로 등록.",
    required_any_groups=[["isolated_venue_pump", "relative_velocity_bull", "social_sentiment_spike"]],
    optional_blocks=["kol_signal", "fear_greed_rising"],
    tags=["alpha_hunter", "s6", "listing_stage"],
)

ALPHA_HUNTER_DEX_BUY_PRESSURE = _html_pattern(
    slug="alpha-hunter-dex-buy-pressure-v1",
    name="Alpha Hunter S7 DEX buy pressure",
    description="Alpha Hunter S7 DexScreener 매수 우위/5분 선행 신호.",
    required_blocks=["dex_buy_pressure"],
    optional_blocks=["volume_surge_bull", "relative_velocity_bull"],
    tags=["alpha_hunter", "s7", "dex"],
)

ALPHA_HUNTER_HOLDER_RATIO_QUALITY = _html_pattern(
    slug="alpha-hunter-holder-ratio-quality-v1",
    name="Alpha Hunter S8 holder ratio quality",
    description="Alpha Hunter S8 홀더당 평균 보유/유통율/거래빈도 품질.",
    required_blocks=["holder_concentration_ok"],
    optional_blocks=["dex_buy_pressure", "volume_dryup"],
    tags=["alpha_hunter", "s8", "holders"],
)

ALPHA_HUNTER_ACCUMULATION = _html_pattern(
    slug="alpha-hunter-accumulation-v1",
    name="Alpha Hunter S9 accumulation",
    description="Alpha Hunter S9 매집 진행. 가격 횡보, 매수 우위, DEX 매수, RSI 회복.",
    required_any_groups=[
        ["sideways_compression", "bollinger_squeeze", "volume_dryup"],
        ["delta_flip_positive", "dex_buy_pressure", "absorption_signal"],
    ],
    optional_blocks=["rsi_threshold", "higher_lows_sequence"],
    tags=["alpha_hunter", "s9", "accumulation"],
)

ALPHA_HUNTER_PRE_PUMP = _html_pattern(
    slug="alpha-hunter-pre-pump-v1",
    name="Alpha Hunter S10 PRE-PUMP",
    description="Alpha Hunter S10 급등 전 신호. 5분 선행 돌파, 거래량 폭발, RSI 탈출, DEX 극단 매수.",
    required_any_groups=[
        ["dex_buy_pressure", "volume_surge_bull", "volume_spike"],
        ["rsi_bullish_divergence", "rsi_threshold", "breakout_above_high"],
    ],
    optional_blocks=["higher_lows_sequence", "relative_velocity_bull"],
    tags=["alpha_hunter", "s10", "pre_pump"],
)

ALPHA_HUNTER_PRE_DUMP = _html_pattern(
    slug="alpha-hunter-pre-dump-v1",
    name="Alpha Hunter S11 PRE-DUMP",
    description="Alpha Hunter S11 급락 전 경고. 고점 매도, DEX 극단 매도, 약세 다이버전스, 유동성 위험.",
    required_any_groups=[
        ["rsi_bearish_divergence", "extended_from_ma", "recent_decline"],
        ["volume_surge_bear", "cvd_spot_price_divergence_bear", "coinbase_premium_weak"],
    ],
    optional_blocks=["long_upper_wick", "bearish_engulfing"],
    direction="short",
    tags=["alpha_hunter", "s11", "pre_dump"],
)

ALPHA_HUNTER_SECTOR_ROTATION = _html_pattern(
    slug="alpha-hunter-sector-rotation-v1",
    name="Alpha Hunter S12 sector rotation",
    description="Alpha Hunter S12 섹터 평균 점수. 섹터 강세를 BTC 상대강도/상대속도 프록시로 등록.",
    required_any_groups=[["relative_strength_btc", "relative_velocity_bull", "alt_btc_accel_ratio"]],
    optional_blocks=["recent_rally", "volume_surge_bull"],
    tags=["alpha_hunter", "s12", "sector"],
)

ALPHA_HUNTER_MULTI_FUNDING_SKEW = _html_pattern(
    slug="alpha-hunter-multi-funding-skew-v1",
    name="Alpha Hunter S14 multi-exchange funding skew",
    description="Alpha Hunter S14 거래소간 funding skew/평균 FR 극단.",
    required_any_groups=[["venue_funding_spread_extreme", "funding_extreme", "funding_extreme_short"]],
    optional_blocks=["negative_funding_bias", "positive_funding_bias"],
    tags=["alpha_hunter", "s14", "funding"],
)

ALPHA_HUNTER_MULTI_EXCHANGE_LEAD = _html_pattern(
    slug="alpha-hunter-multi-exchange-lead-v1",
    name="Alpha Hunter S15 multi-exchange lead",
    description="Alpha Hunter S15 MEXC/Bitget 선행 수급. 고립 거래소 펌프와 venue divergence.",
    required_any_groups=[["isolated_venue_pump", "venue_oi_divergence_bull", "relative_velocity_bull"]],
    optional_blocks=["volume_surge_bull"],
    tags=["alpha_hunter", "s15", "exchange_lead"],
)

ALPHA_HUNTER_BB_SQUEEZE = _html_pattern(
    slug="alpha-hunter-bb-squeeze-v1",
    name="Alpha Hunter S16 BB squeeze",
    description="Alpha Hunter S16 볼린저 밴드 스퀴즈.",
    required_blocks=["bollinger_squeeze"],
    optional_blocks=["atr_ultra_low", "volume_dryup"],
    disqualifier_blocks=["extreme_volatility"],
    tags=["alpha_hunter", "s16", "bb_squeeze"],
)

ALPHA_HUNTER_ORDERBOOK_WALL = _html_pattern(
    slug="alpha-hunter-orderbook-wall-v1",
    name="Alpha Hunter S17 orderbook wall",
    description="Alpha Hunter S17 매수벽/매도벽 호가 불균형.",
    required_blocks=["orderbook_imbalance_ratio"],
    optional_blocks=["recent_rally", "recent_decline"],
    tags=["alpha_hunter", "s17", "orderbook"],
)

ALPHA_HUNTER_WHALE_FLOW = _html_pattern(
    slug="alpha-hunter-whale-flow-v1",
    name="Alpha Hunter S18 whale flow",
    description="Alpha Hunter S18 고래 체결 플로우.",
    required_any_groups=[["smart_money_accumulation", "volume_surge_bull", "total_oi_spike"]],
    optional_blocks=["delta_flip_positive", "dex_buy_pressure"],
    tags=["alpha_hunter", "s18", "whale"],
)

ALPHA_HUNTER_HUNT_SCORE = _html_pattern(
    slug="alpha-hunter-hunt-score-v1",
    name="Alpha Hunter composite HUNT score",
    description="Alpha Hunter computeHuntScore aggregate. pre-pump, accumulation, exchange lead를 합친 최종 사냥 점수.",
    required_any_groups=[
        ["dex_buy_pressure", "volume_surge_bull", "relative_velocity_bull"],
        ["sideways_compression", "absorption_signal", "higher_lows_sequence"],
        ["isolated_venue_pump", "venue_oi_divergence_bull", "social_sentiment_spike"],
    ],
    optional_blocks=["holder_concentration_ok", "bollinger_squeeze", "oi_expansion_confirm"],
    tags=["alpha_hunter", "hunt_score", "composite"],
)

HTML_REFERENCE_PATTERNS = [
    RADAR_CVD_BREAKOUT,
    RADAR_WHALE_BLOCK_TRADE,
    RADAR_MICRO_SQUEEZE_BREAKOUT,
    RADAR_ORDERBOOK_IMBALANCE,
    RADAR_HOT_TARGET_CLUSTER,
    ALPHA_TERMINAL_SHORT_SQUEEZE,
    ALPHA_TERMINAL_BOTTOM_ABSORPTION,
    ALPHA_TERMINAL_BREAKOUT_MOMENTUM,
    ALPHA_TERMINAL_VWAP_BREAK,
    ALPHA_TERMINAL_STRONG_BULL_CONFLUENCE,
    ALPHA_TERMINAL_STRONG_BEAR_CONFLUENCE,
    ALPHA_FLOW_BULL_BIAS,
    ALPHA_FLOW_BEAR_BIAS,
    ALPHA_FLOW_WYCKOFF_ACCUMULATION,
    ALPHA_FLOW_MTF_ACCUMULATION,
    ALPHA_FLOW_LIQUIDITY_ZONE,
    ALPHA_FLOW_EXTREME_FLOW,
    ALPHA_HUNTER_ACTIVITY_SURGE,
    ALPHA_HUNTER_LIQUIDITY_HEALTH,
    ALPHA_HUNTER_TRADE_FLOW_ACCUMULATION,
    ALPHA_HUNTER_MOMENTUM_BULL_DIVERGENCE,
    ALPHA_HUNTER_MOMENTUM_BEAR_DIVERGENCE,
    ALPHA_HUNTER_HOLDER_QUALITY,
    ALPHA_HUNTER_LISTING_STAGE_CATALYST,
    ALPHA_HUNTER_DEX_BUY_PRESSURE,
    ALPHA_HUNTER_HOLDER_RATIO_QUALITY,
    ALPHA_HUNTER_ACCUMULATION,
    ALPHA_HUNTER_PRE_PUMP,
    ALPHA_HUNTER_PRE_DUMP,
    ALPHA_HUNTER_SECTOR_ROTATION,
    ALPHA_HUNTER_MULTI_FUNDING_SKEW,
    ALPHA_HUNTER_MULTI_EXCHANGE_LEAD,
    ALPHA_HUNTER_BB_SQUEEZE,
    ALPHA_HUNTER_ORDERBOOK_WALL,
    ALPHA_HUNTER_WHALE_FLOW,
    ALPHA_HUNTER_HUNT_SCORE,
]


PATTERN_LIBRARY: dict[str, PatternObject] = {
    TRADOOR_OI_REVERSAL.slug: TRADOOR_OI_REVERSAL,
    FUNDING_FLIP_REVERSAL.slug: FUNDING_FLIP_REVERSAL,
    WYCKOFF_SPRING_REVERSAL.slug: WYCKOFF_SPRING_REVERSAL,
    WHALE_ACCUMULATION_REVERSAL.slug: WHALE_ACCUMULATION_REVERSAL,
    VOLUME_ABSORPTION_REVERSAL.slug: VOLUME_ABSORPTION_REVERSAL,
    FUNDING_FLIP_SHORT.slug: FUNDING_FLIP_SHORT,
    GAP_FADE_SHORT.slug: GAP_FADE_SHORT,
    VOLATILITY_SQUEEZE_BREAKOUT.slug: VOLATILITY_SQUEEZE_BREAKOUT,
    ALPHA_CONFLUENCE.slug: ALPHA_CONFLUENCE,
    RADAR_GOLDEN_ENTRY.slug: RADAR_GOLDEN_ENTRY,
    COMPRESSION_BREAKOUT_REVERSAL.slug: COMPRESSION_BREAKOUT_REVERSAL,
    LIQUIDITY_SWEEP_REVERSAL.slug: LIQUIDITY_SWEEP_REVERSAL,
    INSTITUTIONAL_DISTRIBUTION.slug: INSTITUTIONAL_DISTRIBUTION,
    FUNDING_FLIP_REVERSAL_SHORT.slug: FUNDING_FLIP_REVERSAL_SHORT,
    OI_PRESURGE_LONG.slug: OI_PRESURGE_LONG,  # W-0114 딸깍 전략
    ALPHA_PRESURGE.slug: ALPHA_PRESURGE,      # W-0115 Alpha Universe
    **{pattern.slug: pattern for pattern in HTML_REFERENCE_PATTERNS},
}

# Patterns derived from HTML reference sources — tagged "html_ref".
# This list is built dynamically so new html_ref patterns are picked up
# automatically when added to PATTERN_LIBRARY.
HTML_REFERENCE_PATTERNS: list[PatternObject] = [
    p for p in PATTERN_LIBRARY.values() if "html_ref" in p.tags
]


def get_pattern(slug: str) -> PatternObject:
    if slug not in PATTERN_LIBRARY:
        raise KeyError(f"Unknown pattern: {slug!r}. Available: {list(PATTERN_LIBRARY)}")
    return PATTERN_LIBRARY[slug]


# ── Registry seeding ────────────────────────────────────────────────────────
# On module load, seed the JSON-backed registry from the static library.
# Only writes entries that don't already exist (preserves user-created patterns).
try:
    from patterns.registry import PATTERN_REGISTRY_STORE as _REGISTRY_STORE
    _REGISTRY_STORE.seed_from_library(PATTERN_LIBRARY)
except Exception:
    pass  # Never break startup if registry write fails
