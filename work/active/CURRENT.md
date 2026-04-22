# CURRENT — 단일 진실 (2026-04-23)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`00572e1d` — PR #189 (`codex/w-0140-analyze-tab-consolidation`) 포함 최신 `origin/main`

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #185 (W-0137) | C sidebar ANALYZE를 right-dock collapse + summary/detail 구조로 재분리 |
| #186 (W-0126) | ledger record store boundary refactor를 최신 mainline에 통합 |
| #189 (W-0140) | bottom ANALYZE tab 상세 workspace 재구성 |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0141** | `W-0141-market-data-plane.md` | 🔴 IN-PROGRESS | chart/analyze/AI/backend source 를 하나의 canonical data plane 으로 재정의 |
| **W-0140** | `W-0140-analyze-tab-consolidation.md` | 🔴 IN-PROGRESS | 하단 ANALYZE 탭을 sidebar HUD와 역할이 다른 상세 workspace로 재구성 |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🟡 PR-READY | engine mainline integration 완료, 운영 migration 018만 남음 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## 즉시 실행 순서

1. **W-0141** — market data plane 계약 문서 + producer/consumer migration plan 고정
2. **W-0140** — analyze summary/detail 를 shared study contract 소비 구조로 전환
3. **Supabase migration 018** — `app/supabase/migrations/018_pattern_ledger_records.sql` (MCP or psql)

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (`00572e1d`) |
| codex/w-0141-market-data-plane | W-0141 | ACTIVE |

---

## 인프라 미완 (사람 직접 실행 필요)

- [ ] Supabase migration 018 실행 (psql pooler)
- [ ] GCP cogotchi 재배포 필요 시: `gcloud run services update cogotchi-...`
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
