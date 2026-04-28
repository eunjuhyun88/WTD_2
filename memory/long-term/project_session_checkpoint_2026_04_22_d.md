---
name: session_checkpoint_2026_04_22_d
description: 체크포인트 2026-04-22 (최신 D): W-0121/W-0122/W-0125/W-0126 전체 완료. main=bbf76d39.
type: project
---

## 완료된 작업 (이 세션)

**main HEAD: `bbf76d39` feat(W-0125): timing instrumentation**

### 머지된 PR들
- PR #165: feat(W-0121/W-0122/W-0126) — Phase 1A~3B + batch outcome stats
- PR #170: feat(W-0125) — X-Process-Time header + slow warn + app ingress log
- PR #168 (codex): fix(chatbattle) — build-time exchange secret crash 수정
- PR #171: 중복으로 닫음 (PR #168이 선점)

### 완료 항목
- W-0126: SupabaseLedgerRecordStore — O(1) family stats, migration 018
- W-0122 Phase 3A: scan/normalize.ts + scan/concurrency.ts (shared helpers)
- W-0122 Phase 3B: summarize_family() / count_records() hot-path 제거
- W-0122 batch: SupabaseLedgerStore.batch_list_all() — /stats/all 2N→1 roundtrip
- W-0125: engine middleware X-Process-Time-Ms + slow-request warn + app ingress timer
- exchange: EXCHANGE_ENCRYPTION_KEY IIFE→lazy check (main에 fix 적용됨)

**Why:** CTO audit 후속 — O(N) 파일스캔 병목 제거, GCP 다중인스턴스 공유상태, 운영 타이밍 계측
**How to apply:** 다음 슬라이스는 인프라 배포(Supabase migration + GCP env) 또는 Scan fan-out 계측(W-0125 Patch D)

## 미완료 (인프라 — 사용자 실행 필요)
- Supabase 대시보드: `018_pattern_ledger_records.sql` 실행
- GCP: `ENGINE_INTERNAL_SECRET` + `EXCHANGE_ENCRYPTION_KEY` env 주입
- GCP: cogotchi + worker 재배포 (asia-southeast1)
- Vercel: `EXCHANGE_ENCRYPTION_KEY` env 추가 (exchange 기능 활성화)

## 다음 코드 작업 후보
1. W-0125 Patch D — scan fan-out 계측 (`_runServerScanInternal` 소스별 타이밍)
2. W-0129 — ML 첫 학습 파이프라인 (61건 seed 활용, train endpoint 테스트)
3. Cloud Scheduler 복구 확인
