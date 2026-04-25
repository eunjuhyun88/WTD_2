# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines. 50 lines 넘으면 archive로 이전.
> 진행중 작업 = 자기 P0 자기가 maintain. 완료 = 다음 priority promotion.

---

## P0 — Multi-Agent OS v2 적용 (Phase 3-4)

**Owner**: A007+
**Branch**: feat/multi-agent-os-* (각 phase별)
**Spec**: `design/proposed/multi-agent-os-v2.md`

남은 작업:
- Phase 3: `design/current/invariants.yml` + `tools/verify_design.sh` (drift 차단)
- Phase 4: `.gitattributes` + memory-sync hook scope 축소

Exit: `./tools/verify_design.sh` PR마다 자동 실행, drift 0 확인.

---

## P1 — W-0145 Search Corpus 40+차원

**Owner**: 미할당
**Branch**: feat/w-0145-search-corpus-40dim

- `engine/search/corpus_builder.py` 40차원 확장
- OI/funding 2× 가중치
- recall@10 ≥ 0.7

Spec: `work/active/W-0145-operational-seed-search-corpus.md`

---

## P2 — W-0132 Copy Trading Phase 1

**Owner**: 미할당
**Branch**: feat/w-0132-copy-trading-phase1

- Supabase migration 022 (trader_profiles + copy_subscriptions)
- `engine/copy_trading/` (leader_score, leaderboard, API route)
- App `CopyTradingLeaderboard.svelte` + 3 routes

Spec: `work/active/W-0132-copy-trading-phase1.md`
PRD: `memory/decisions/dec-2026-04-22-copy-trading-prd.md` (있으면)

---

## Frozen / Waiting

- PR #308 (W-0211 multi-pane + Pine Script) — App CI 진행중
- 인프라 (사람 작업): GCP worker Cloud Build trigger, Vercel `EXCHANGE_ENCRYPTION_KEY`
