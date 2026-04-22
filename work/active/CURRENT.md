# CURRENT — 단일 진실 (2026-04-23)

> 이 파일 = 지금 무엇이 진행 중인지의 유일한 source of truth.
> 세션 시작 시 반드시 먼저 읽는다. 세션 종료 시 반드시 업데이트.

---

## main SHA

`c3fd85d3` — PR #184 (`codex/w-0136-c-only-layout`) 포함 최신 `origin/main`

## 완료 (이번 세션)

| PR | 내용 |
|---|---|
| #172 (W-0123) | Indicator Viz v2 — AI search, 10 archetypes (A-J), TV-grade settings, 4 신규 컴포넌트 |
| #178 (W-0135) | gifted-raman follow-up — terminal real-data source cleanup |
| #180 (W-0131) | Tablet PeekDrawer capture review slot + chart click stabilization |

---

## 활성 Work Items (우선순위 순)

| ID | 파일 | 상태 | 핵심 미완 |
|---|---|---|---|
| **W-0137** | `W-0137-analyze-right-dock-collapse.md` | 🟡 PR-READY | 우측 dock collapse + sidebar summary HUD / 하단 detail panel 역할 분리 완료 |
| **W-0136** | `W-0136-c-only-layout.md` | 🔴 IN-PROGRESS | A/B 레이아웃 제거 + C-only + sidebar ANALYZE collapse |
| **W-0134** | `W-0134-cogochi-runtime-verification.md` | 🟡 PR-READY | PR #182 merge + root mixed runtime diff 폐기 |
| **W-0133** | `W-0133-repo-stabilization-refactor.md` | 🔴 IN-PROGRESS | CURRENT/AGENTS/baseline alignment + non-code lane 정리 |
| **W-0126** | `W-0126-ledger-supabase-record-store.md` | 🔴 BLOCKING | Supabase migration 018 (`pattern_ledger_records`) 미실행 |
| **W-0132** | `W-0132-copy-trading-phase1.md` | 🟡 READY | Phase 1 MVP — 독립 브랜치 가능 |
| **W-0122** | `W-0122-free-indicator-stack.md` | 🟡 IN-PROGRESS | Confluence Phase 2 (engine scorer + flywheel weights) |
| **W-0124** | `W-0124-engine-ingress-auth-hardening.md` | 🟠 DEFERRED | GCP ingress 인증 — infra 변경, 별도 세션 |

---

## 즉시 실행 순서

1. **W-0137** — branch push + PR 생성
2. **W-0126** — mainline integration lane push + PR 생성
3. **Supabase migration 018** — `app/supabase/migrations/018_pattern_ledger_records.sql` (MCP or psql)

---

## 다음 세션 진입 스크립트

```bash
# 1. Context 로드
cat work/active/CURRENT.md
cat work/active/W-0133-repo-stabilization-refactor.md

# 2. 코드 확인
# .gitignore
# work/active/CURRENT.md
```

---

## 브랜치 매핑

| 브랜치 | Work Item | 상태 |
|---|---|---|
| main | — | 최신 (`c3fd85d3`) |
| codex/w-0137-analyze-right-dock-collapse | W-0137 | ACTIVE |
| codex/w-0136-c-only-layout | W-0136 | ACTIVE |
| codex/w-0134-runtime-stabilization | W-0134 | PR #182 OPEN |
| codex/w-0133-noncode-cleanup | W-0133 | ACTIVE |

---

## 인프라 미완 (사람 직접 실행 필요)

- [ ] Supabase migration 018 실행 (psql pooler)
- [ ] GCP cogotchi 재배포 필요 시: `gcloud run services update cogotchi-...`
- [ ] Vercel EXCHANGE_ENCRYPTION_KEY 환경변수 설정 (프로덕션)
