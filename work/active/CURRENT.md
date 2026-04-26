# CURRENT — Wave 1+2+3 전체 완료 (2026-04-27)

> 신규 진입자는 `./tools/start.sh` 출력과 아래 파일만 먼저 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — compact active P0/P1/P2
> - `docs/live/W-0220-checklist.md` — 전체 체크리스트
> - `docs/live/branch-strategy.md` — 브랜치/Wave/Worktree 규칙

---

## main SHA

`052f63cf` — origin/main — Wave 1+2+3 전체 머지 완료

---

## Wave 상태

| Wave | 상태 | PR |
|------|------|----|
| Wave 1 (F-02, A-03-eng, A-04-eng, D-03-eng) | ✅ 완료 | #370~#373 |
| Wave 2 (F-02-app, D-03-app, A-04-app, A-03-app, H-07) | ✅ 완료 | #381, #383, #386, #390, #380 |
| Wave 3 (H-08, F-17, F-30 Phase1+2) | ✅ 완료 | #377, #378, #387 |

---

## 잔여 운영 작업 (사람이 직접)

- [ ] Supabase migration 023 실행 (`capture_records_is_watching`)
- [ ] Supabase migration 024 실행 (ledger 4-table 생성)
- [ ] F-30 Phase 3 (backfill) — 별도 PR, dual-write 기간 후
- [ ] F-30 Phase 4 (H-08 read path → `ledger_verdicts`) — backfill 검증 후

---

## 다음 후보 (미설계)

- Wave 4 설계 필요 (spec/PRIORITIES.md 참조)
- F-30 Phase 3 backfill PR

## Frozen

- Copy Trading Phase 2+, MemKraft/Multi-Agent OS 추가 개발, Chart UX polish, 자동매매 실행.

## 활성 Work Items

현재 활성 work item 없음 — Wave 1+2+3 전체 완료.
다음 Wave 설계 후 갱신 예정.
