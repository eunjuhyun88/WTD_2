---
name: Supabase feature_windows corpus backfill (2026-04-26)
description: SQLite 138,891행 → Supabase 직접 migration 완료. /search/similar GCP에서 작동 확인.
type: project
---

# Supabase feature_windows corpus backfill

**Why:** builder의 incremental 로직이 `latest_bar_ts_ms` 기준으로 Supabase를 "최신"으로 판단해서 쓰지 않음. GCP /search/similar가 항상 empty 반환하던 근본 원인.

**How to apply:** 다음에 corpus가 비어있다는 증상이 나오면 SQLite → Supabase 직접 migration 재실행.

## 상태

| 항목 | 전 | 후 |
|---|---|---|
| Supabase rows | 197 | **138,915** |
| symbol-tf pairs | 1 | **87** (29 symbols × 3 tf) |
| filter_candidates | empty | 후보 반환 작동 |

## 원인 분석

`SupabaseFeatureWindowStore.latest_bar_ts_ms()` → April 23 반환
→ builder: "모든 klines ≤ April 23 → 75,990 rows skipped"
→ SQLite에 138,891행 있었지만 Supabase는 197행에서 멈춤

## 해결

직접 migration script (uv run python):
```python
# SQLite에서 CHUNK=500으로 읽어 Supabase upsert
# 3분 소요, 138,891/138,891 완료
```

## 다음 고려사항

- Cloud Scheduler `feature-windows-build` job이 매일 새 bars를 씀 (정기 갱신)
- 현재 29 symbols → 107 symbols로 확장하려면 data_cache 먼저 채워야 함
- main SHA: `87f44b0b`
