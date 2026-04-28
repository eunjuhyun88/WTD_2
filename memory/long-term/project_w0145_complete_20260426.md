---
name: project_w0145_complete_20260426
description: W-0145 완료 — corpus seed-search 40+dim weighted L1 upgrade. PR #346 머지. main=3ce9cf5d.
type: project
---

PR #346 머지 완료 (2026-04-26). main = `3ce9cf5d`.

## W-0145 완료 내용

- `engine/search/_signals.py` 신규: SIGNAL_WEIGHTS(40+dim), fetch_feature_signals_batch, weighted_l1_score
- `engine/search/similar.py`: _signals에서 import, ~80줄 중복 제거
- `engine/search/runtime.py`: run_seed_search에 FeatureWindowStore enrichment + weighted L1 적용 (6-dim 비가중 → 40+dim 가중)
- `engine/tests/test_search_corpus.py`: 8개 신규 테스트, 22/22 통과

**Why:** similar.py와 runtime.py 간 scoring 로직 불일치 해소 — corpus seed-search가 40+dim 가중 L1 기준으로 통일됨.

**How to apply:** 다음 search 작업 시 _signals.py를 공유 기반으로 사용. Vercel은 required_status_checks에 없어 머지 블로커 아님.

## 다음

W-0132 copy trading P1 (main=3ce9cf5d 기준 새 브랜치)
