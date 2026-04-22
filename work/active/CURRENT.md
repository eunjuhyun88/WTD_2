# CURRENT — 단일 진실 (2026-04-22)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`8cd447c6` + PR #172 머지됨 → main 현재: fa806744 포함

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #172 (W-0123) | Indicator Viz v2 — AI search, 10 archetypes (A-J), TV-grade settings, 4 신규 컴포넌트 |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0135** | `W-0135-gifted-raman-integration.md` | 🔴 IN-PROGRESS | `claude/gifted-raman` clean import/manual merge/verify lane 재구성 |
| **W-0134** | `W-0134-cogochi-runtime-verification.md` | 🔴 IN-PROGRESS | desktop/mobile shell state, AI send, chart runtime exceptions, analyze fallback |
| **W-0133** | `W-0133-repo-stabilization-refactor.md` | 🔴 IN-PROGRESS | CURRENT/AGENTS/baseline alignment + stabilization sequencing |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🔴 BLOCKING | Supabase migration 018 (`pattern_ledger_records`) 미실행 |
| **W-0131** | `W-0131-tablet-peek-drawer.md` | 🟡 READY | CenterPanel PeekDrawer → CaptureReviewDrawer 연결 |
| **W-0132** | `W-0132-copy-trading-phase1.md` | 🟡 READY | Phase 1 MVP — 독립 브랜치 가능 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## 즉시 실행 순서

1. **W-0135** — `claude/gifted-raman` integration plan: clean import → manual merge → authenticated verify
2. **W-0134** — Cogochi runtime verification + mobile/AI/chart repair
3. **Supabase migration 018** — `app/supabase/migrations/018_pattern_ledger_records.sql` (MCP or psql)

---

## 다음 세션 진입 스크립트

```bash
# 1. Context 로드
cat work/active/CURRENT.md
cat work/active/W-0131-tablet-peek-drawer.md   # 활성 task

# 2. 코드 확인
# app/src/components/terminal/workspace/CenterPanel.svelte
# app/src/components/terminal/chart/CaptureAnnotationLayer.svelte
```

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (W-0123 포함) |
| claude/w-0131-tablet-peek-drawer | W-0131 | NOT YET CREATED |
| claude/w-0132-copy-trading-p1 | W-0132 | NOT YET CREATED |

---

## 인프라 미완 (사람 직접 실행 필요)

- [ ] Supabase migration 018 실행 (psql pooler)
- [ ] GCP cogotchi 재배포 필요 시: `gcloud run services update cogotchi-...`
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
