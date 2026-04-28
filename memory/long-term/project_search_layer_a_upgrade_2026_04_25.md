---
name: Search Layer A Upgrade (W-0162) — 2026-04-25
description: 3-layer search Layer A를 3차원 → 40+ 차원으로 업그레이드. feature_snapshot 우선 + FeatureWindowStore enrichment + weighted L1.
type: project
---

# Search Layer A Upgrade (W-0162 strangler)

## 변경 파일
`engine/search/similar.py`

## 핵심 변경 3가지

### 1. `_extract_reference_sig()` — reference 차원 확장
- **Before**: `search_hints`의 3개 필드만 (close_return_pct, realized_vol_pct, volume_ratio)
- **After**: `pattern_draft.feature_snapshot` 우선 사용 (캡처 시점의 40+ 신호 전부)
- search_hints는 feature_snapshot 없을 때 fallback

### 2. `_fetch_feature_signals_batch()` — corpus enrichment
- FeatureWindowStore SQLite에서 corpus window start_ts ±8h 내 nearest bar의 40+ 신호를 배치 조회
- {window_id: signals_dict} 반환
- DB 없으면 graceful fallback (기존 corpus signature만 사용)

### 3. `_layer_a()` → weighted L1
- `_SIGNAL_WEIGHTS` dict 추가 (35개 신호, 1.0~2.0 범위)
- OI/funding 신호: 2.0 (leading indicator)
- positioning flags: 1.5-1.8x
- price structure/volume: 1.0-1.5x
- weighted average L1 → `1 / (1 + dist)`

## Layer C도 개선
- fw_enrichment signals를 feature_snapshot 대신 Layer C에도 우선 전달
- `fw_enrichment.get(w.window_id)` → `w.signature.get("feature_snapshot")` → transitions fallback

## 남은 W-0162 작업
SearchCorpusStore를 FeatureWindowStore 기반으로 완전히 전환하는 strangler 마무리.
현재는 search time enrichment만. build time enrichment (corpus 생성 시 feature signals bake-in)가 다음.

**Why:** Layer A가 3차원이면 OI spike가 있어도 찾을 수 없었음. 40+ 차원이면 실제 패턴 시그니처 기반 검색 가능.
**How to apply:** 유사도 검색 품질 이슈 발생 시 이 파일 참조.
