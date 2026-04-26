# Telegram Refs Analysis (Live Note)

**Tier:** core
**Source:** work/active/W-0220-telegram-refs-analysis.md
**Updated:** 2026-04-26
**Refs:** tmp/telegram_refs/ 4채널 (Alpha Hunter v1.0 / Alpha Terminal v4 / 시그널 레이더 v3 / 나혼자매매 Alpha Flow by 아카)

## Current State

- 4채널 모두 broadcasting 방식 (실시간 푸시, 사후 랭킹). **Cogochi의 차별점**: on-demand search + verdict-validated archive
- **공통 vocabulary 13개 채택** → 92 Building Blocks에 base layer로 (kimchi_premium 신규):
  - `oi_surge` / `oi_collapse` / `liq_cascade`
  - `funding_extreme_short` / `funding_extreme_long`
  - `cvd_breakout` / `whale_block` / `bb_squeeze_breakout` / `orderbook_imbalance` / `micro_volatility_low`
  - `taker_ratio_extreme_buy` / `taker_ratio_extreme_sell`
  - `kimchi_premium_extreme` (Korea P0)
- **Wyckoff phase 명명 canonical**: ACCUMULATION → DISTRIBUTION → BREAKOUT → RETEST → [SQUEEZE 전조]
- 4채널 모두 동일 어휘 → 한국 시장 표준
- Chart Drag 자동추출 features 12개: OI Δ%, L/S ratio, CVD, Liq heatmap, taker ratio, funding, OB depth, BB width, ATR, kimchi premium, 온체인 Tx, F&G

## Decisions

- F-60 카피시그널 메시지 JSON schema 13-field 표준 채택 (signal_id / issuer.verified_badge / phase_path_observed / alpha_score / trigger_features / trade_plan / thesis_one_liner / chart_attachment_url / verdict_eta / expiry_ttl_minutes / confidence …)
- **F-60 발행자 책임**: verified badge + 3개월+ 트랙레코드 + 결과 보고 자동화 (slippage+fee 반영) + disclaimer 자동 + 손실 시 환불/재신청 정책
- **broadcasting-only 모방 안 함** (영구 Non-Goal)

## Next

- N-05 Marketplace 작업 시 본 schema를 publish 엔드포인트 컨트랙트로 사용
- 13 base vocabulary가 92 Building Blocks 어휘에 이미 있는지 매핑 검증 (kimchi_premium 신규 등록)

## See Also

- `prd-master.md` (live-note)
- `feature-impl-map.md` (live-note) — N-05 / N-06 Marketplace 항목
