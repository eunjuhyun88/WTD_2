# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines. 50 lines 넘으면 archive로 이전.
> Charter 정합성: `spec/CHARTER.md` In-Scope 안에 들어가야 함. Non-Goal 진입 금지.

---

## P0 — Ledger durability (L6 코어)

**Owner**: 미할당  |  **Branch**: `feat/w-0215-ledger-supabase-cutover`
**Charter**: L6 ⚠️ (JSON files → Cloud Run 재시작 시 소실 = judgment ledger 손실 = 코어 해자 1번 깨짐)

- `engine/ledger/store.py` Supabase write path 기본 활성화
- 기존 `ledger_data/{slug}/*.json` → Supabase backfill 스크립트
- W-0126 머지된 `supabase_record_store.py` hot path 검증

Exit: Cloud Run 재시작 후 ledger 데이터 손실 0건 + Engine CI pass

## P1 — Verdict loop (L7 코어)

**Owner**: 미할당  |  **Branch**: `feat/w-0216-verdict-loop`
**Charter**: L7 ❌ (verdict loop 미완성 = 학습 자산 비활성)

- user verdict UI 노출
- `pattern_ledger_records.outcome` → ledger split (entry/score/outcome/verdict)
- 다음 단계 LambdaRank Reranker(P3) 선행조건

## P2 — L3 registry-backed patterns

**Owner**: 미할당  |  **Branch**: `feat/w-0160-pattern-definition` (W-0160 후속)
**Charter**: L3 ⚠️ (hardcoded library.py → registry-backed)

- `engine/patterns/library.py` 16패턴 → registry 통합
- `definition_id` versioning (W-0160 부분 머지됨)

---

## Frozen / Non-Goals (CHARTER §Frozen 참조)

- ❌ W-0132 Copy Trading Phase 2+ (Non-Goal: 대중형 소셜/카피)
- ❌ W-0212 Chart UX polish (Polish 동결)
- ❌ MemKraft / Multi-Agent OS 추가 개발 (메타 도구 동결)
- ❌ 새 slash command / agent handoff 고도화
- ❌ PR #285 (W-0114 research compare) — stale, 종료 판단 필요

## 인프라 (사람 작업)

- GCP cogotchi-worker Cloud Build trigger
- Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
- `app/vercel.json` 브랜치 가드레일
