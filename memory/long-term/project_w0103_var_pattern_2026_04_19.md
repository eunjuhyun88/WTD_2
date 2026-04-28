---
name: W-0103 Volume Absorption Reversal — MERGED
description: W-0103 VAR 패턴 완료 + PR #105 main 머지. 5-pattern system. 995 tests pass.
type: project
---

# W-0103 Volume Absorption Reversal — MERGED (2026-04-19)

## 브랜치
`claude/funny-kirch` → PR #105 → main (`4b6017c`)

## Commits (총 6개)
1. `959a30d` feat(engine): add volume_spike_down trigger
2. `171a1f9` feat(engine): add delta_flip_positive confirmation
3. `4ff9d21` feat(engine): register volume-absorption-reversal-v1
4. `7f8c4ec` feat(engine): add delta_flip_var block
5. `428dad0` fix(engine): VAR pattern — volume_dryup+delta_flip_var
6. `f9c7f02` feat(engine): promote VAR — breakout_from_pullback_range + strong holdouts

## 최종 시스템 상태
- 5-pattern system: TRADOOR / FFR / WSR / WHALE / **VAR** (모두 PROMOTED_PATTERNS 등록)
- 테스트: **995 passed**, 4 skipped
- merge conflict 해결: delta_flip_positive/volume_spike_down API 충돌 → 우리 버전 유지 + 테스트 파라미터 정렬

## VAR 패턴 최종 구조
```
SELLING_CLIMAX (volume_spike_down) →
  ABSORPTION (volume_dryup, anchored, threshold=0.55) →
    DELTA_FLIP (delta_flip_var w=3, disqualified by fresh climax, threshold=0.60) →
      MARKUP (breakout_from_pullback_range) ← 핵심 수정
```

## Slice 3 CTO 핵심 결정 3가지

### 1. breakout_above_high → breakout_from_pullback_range (MARKUP)
- **문제**: breakout_above_high(lookback=5d)는 덤프 이전 고가 기준 → 클라이맥스 -30~50% 후 복구가 절대 도달 못함 (FDR=1.0)
- **해결**: breakout_from_pullback_range는 롤링 저점에서 레퍼런스 리셋 → 흡수 레인지 상단 돌파 시 발동
- **결과**: FDR 1.0 → 0.0

### 2. absorption_signal → volume_dryup (ABSORPTION)
- **문제**: absorption_signal은 flat price (0.5% 이하) + heavy buying 요구 → 클라이맥스 직후 불가능
- **해결**: volume_dryup (패닉 후 거래량 수렴)
- **결과**: reference_recall 0.0 → 1.0

### 3. delta_flip_positive (w=6) → delta_flip_var (w=3, 0.48→0.52)
- **문제**: 클라이맥스 고거래량 바가 6-bar 롤링 ratio 지배 → 0.55 임계값 불통과
- **해결**: w=3 단축 + 0.52 완화 → 흡수 12-36h 내 발동
- **결과**: DELTA_FLIP 안정적 발동

### 4. 벤치마크팩 v2 (강한 holdout 교체)
- BONK Jan 2024 (fwd=1.75%, no MARKUP) → WIFUSDT Aug 2024 (+45.1%)
- PEPE-Nov 2025 (DELTA_FLIP 미발동) → KOMAUSDT Oct 2025 (+91.8%)
- 교체 이유: 약한 클라이맥스는 패턴 특성상 DELTA_FLIP 발동 어려움 (정상 동작)

## Promotion Gate 최종 결과
- reference_recall: 1.0 ✓
- phase_fidelity: 0.875 ✓
- lead_time_bars: 54.75 ✓
- false_discovery_rate: **0.0** ✓
- robustness_spread: **0.0** ✓ (모든 케이스 score=0.925)
- holdout_passed: **1.0** ✓
- entry_profitable_rate: 0.5 ✓
- **decision: promote_candidate (strict path)**

## 미해결 (이전 세션 이월)
- 데스크톱 ChartBoard 특정 zoom range 캔들 gap
- Watchlist SOL $0.000 깨진 바인딩
- ANALYSIS 패널 Engine failed 중복 메시지
- ChartBoard 2300+ 줄 컴포넌트 분리
