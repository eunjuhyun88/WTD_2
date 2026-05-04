# Product Charter — 1 page truth

> PRD `-1_PRODUCT_PRD.md` + `00_MASTER_ARCHITECTURE.md` §1, §4의 핵심만 1페이지에 고정.
> 이 문서가 가드레일이다. `tools/start.sh`와 `tools/claim.sh`가 이 문서를 참조해 야크쉐이빙을 차단한다.
> 변경은 PRD가 변할 때만. 임의 갱신 금지.

---

## 🎯 Product Goal (PRD §1.1)

**Pattern Research Operating System (Trader Memory OS)**

> 트레이더의 감각을 패턴 객체로 저장하고, 그 패턴을 시장 전체에서 상태기계로
> 추적하고, 결과 ledger로 검증해, 최종적으로 실행 가능한 시그널로 승격시키는 엔진.

핵심 해자 (PRD §1.4):
1. 유저 judgment ledger — 복제 불가
2. 팀 공용 pattern library — lock-in
3. 수동 레이블 → fine-tune 훈련 자산

---

## ✅ In-Scope — 코어 갭 (Master §4)

7-Layer Architecture에서 채워야 할 것만:

| Layer | 상태 | 현재 갭 |
|---|---|---|
| L3 Pattern Object | ⚠️ | hardcoded → registry-backed |
| L4 State Machine | ⚠️ | in-memory → durable Postgres |
| L5 Search | ⚠️ | reranker 미구현 |
| L6 Ledger | ⚠️ | JSON → 4-split (entry/score/outcome/verdict) |
| L7 Refinement | ❌ | verdict loop 미완성 |

추가 (CTO Doc 11 §7):
- AI Parser endpoint (자연어 → PatternDraft JSON)
- Visualization Intent Router (6 intent × 6 template)
- LambdaRank Reranker (verdict ≥ 50 후)
- Semantic RAG (pgvector, 뉴스 ingest 후)

---

## ✅ Frozen 전면 해제 (2026-05-01, 사용자 결정)

> 이전 Frozen/Non-Goals 항목 전면 해제. TradingView feature parity, AI 차트 분석, LLM chat, 모바일 native, 카피트레이딩 시그널, 자동매매, Portfolio P&L, social, customer-facing LLM 포함 전체 In-Scope.

### 유일한 유지 제약 (야크쉐이빙 방지)

- ❌ **신규** MemKraft 대체/확장 시스템 (별도 메모리 stack 빌드)
- ❌ **신규** slash command 시스템 (현재 set 충분)
- ❌ **신규** worktree 정리 자동화 대규모 시스템 (수동 cleanup으로 충분)

> **2026-05-04 해제**: `agent dispatcher / orchestration OS / handoff framework` 항목은 W-0404 (AI Agent NL Interface) 상업화를 위해 In-Scope로 전환. customer-facing 프로덕트 핵심이므로 빌드 허용. 단 멀티-에이전트 coordination 도구(claim.sh 류)는 여전히 §Coordination Frozen 유지.

→ 핵심: **메모리 stack / slash 시스템**만 frozen. 에이전트 프로덕트 빌드는 In-Scope.

### Paper Trading

- ✅ **Paper Trading 허용** — 검증 도구 + 사용자 경험 포함. PRD master § 0.3 참조.

---

## 🤝 Coordination — 멀티 에이전트 충돌 방지

**원칙: 도구 빌드 ❌ vs 도구 사용 ✅** — frozen은 "새 OS/dispatcher 만들기" 금지일 뿐, GitHub의 기본 기능 활용은 권장.

### ✅ Allowed (도구 사용)

- **GitHub Issue + assignee = mutex** — 1 work item = 1 Issue = 1 assignee. 다른 에이전트가 부팅 시 `gh issue list --assignee "*"` 으로 누가 뭐하나 즉시 확인.
- **GitHub Project v2** (필요시) — Issue 시각화, status board. 기본 기능 사용.
- **Branch naming `feat/issue-N-slug`** — branch ↔ Issue 자명 연결.
- **PR body `Closes #N`** — 머지 시 Issue 자동 close = lock 자동 해제.
- 기존 `tools/start.sh`, `tools/claim.sh`, `tools/end.sh` **안정화·버그 수정**.

### ❌ Frozen (도구 빌드)

- **멀티 에이전트 coordination용** 자체 dispatcher / handoff framework 신규 빌드. (※ customer-facing AI agent product의 orchestration layer는 In-Scope — W-0404 참조)
- MemKraft 대체 메모리 시스템 신규 빌드.
- 250줄 넘는 신규 coordination 도구 stack.

### 운영 프로토콜 (요약)

```
부팅:  gh issue list --state open --json number,title,assignees    # 누가 뭐하나
claim: gh issue edit N --add-assignee @me                            # mutex 획득
work:  git checkout -b feat/issue-N-slug                             # branch ↔ Issue
PR:    body에 "Closes #N"                                            # 머지 = 자동 close = lock 해제
```

상세: `docs/runbooks/multi-agent-coordination.md`

---

## 🛡 Gate 규칙

`tools/claim.sh`가 다음 키워드 패턴 매칭 시 **확인 프롬프트** + CHARTER §Frozen 인용:

```
copy.trad | copy_trading | leaderboard.*sub
new.memkraft | new.multi.agent
new.slash.command | new.coordination.stack
```

> 해제 이력:
> - `chart.polish | chart.ux.polish | w-0212` → 2026-05-01 해제
> - `new.dispatcher | new.handoff.framework` → 2026-05-04 해제 (W-0404 customer-facing agent In-Scope)
> - `session.handoff.upgrade` → 유령 패턴 (CHARTER 미명시, claim.sh에만 존재하던 오류) 제거

→ Issue/assignee/Project 사용 자체는 게이트 대상 아님 (§Coordination Allowed).

`--force` 플래그로 통과 가능하지만 사유를 prompt함.

---

## 변경 정책

- 이 문서 변경 = PRD 변경. 그 외 PR에서 수정 금지.
- "Frozen" 항목을 옮기려면 PRD/Master 문서 먼저 갱신 + ADR 작성.
- 이 가드레일이 시스템이 되어가면 (250줄 초과 / 별도 디렉토리 / 새 cron) 그것 자체가 야크쉐이빙. 즉시 롤백.
