---
name: W-0103 VAR Slice 1 완료 (2026-04-19)
description: 5번째 패턴 Volume Absorption Reversal Slice 1 구현 — volume_spike_down + delta_flip_positive + VAR PatternObject. 968 tests pass.
type: project
---

## W-0103 VAR Slice 1 완료

**브랜치:** `claude/w-0103-var-pattern` (commit 18ed218)
**테스트:** 968 passed (20 new)

### 구현 내용

새 building blocks (2개):
- `engine/building_blocks/triggers/volume_spike_down.py`
  - close < open AND volume ≥ multiple(3.0) × avg(prior 24 bars)
  - SELLING_CLIMAX 앵커 블록
- `engine/building_blocks/confirmations/delta_flip_positive.py`
  - rolling taker-buy ratio가 neutral(0.5) 아래→위 전환
  - 첫 bar NaN false-positive 방지 (prev_known guard)
  - ABSORPTION 전환 블록

VAR PatternObject (`volume-absorption-reversal-v1`):
```
SELLING_CLIMAX → ABSORPTION → BASE_FORMATION → BREAKOUT
```
- 순수 OHLCV + taker buy volume 기반 (OI/funding 불필요)
- entry_phase=BASE_FORMATION, target_phase=BREAKOUT
- tags: ["volume_absorption", "selling_climax", "price_action", "ohlcv_only", "altcoin"]

### 5-pattern system
| 슬러그 | 유형 | 상태 |
|--------|------|------|
| tradoor-oi-reversal-v1 | OI 기반 | PROMOTED |
| funding-flip-reversal-v1 | 펀딩 기반 | PROMOTED |
| wyckoff-spring-reversal-v1 | price-action | PROMOTED |
| whale-accumulation-reversal-v1 | onchain/OI | promote_candidate |
| volume-absorption-reversal-v1 | OHLCV-only | 신규 (미벤치마크) |

### 다음 슬라이스
- **Slice 2:** VAR 벤치마크팩 생성 (FARTCOIN/POPCAT/PEPE)
  - `python3 -m engine.research.pattern_search.pattern_discovery --pattern volume-absorption-reversal-v1`
  - 목표: promote_candidate (score ≥ 0.85)
- **Slice 3 (P1):** Compression detector onset dedup (ExtremeEventDetector onset_only=True)

**Why:** Slice 1은 기반 블록 + 패턴 구조. Slice 2 벤치마크 없이는 promote 불가.
**How to apply:** Slice 2 시작 전 `engine/research/pattern_search/` 구조 확인 필요.
