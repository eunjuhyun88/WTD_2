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

## 🚫 Frozen / Non-Goals

다음 키워드/범위는 **신규 작업 금지**. PR 머지된 것이 있어도 Phase 2+로 동결.

### PRD §1.3 명시 Non-Goals

- ❌ **AI 차트 분석 툴** / TradingView 대체 / 범용 스크리너
- ❌ **대중형 소셜/카피트레이딩** (`copy.trad`, `copy_trading`, `leaderboard`, `subscription` 류)
- ❌ **초보자용 "AI가 알려주는 매매"**
- ❌ **자동매매 실행** (Phase 2+ 별도 레인)
- ❌ **TradingView feature parity**

### 메타 도구 동결 (야크쉐이빙 차단)

- ❌ **MemKraft 추가 개발** (`memkraft`, `mk.py` 외 신규 메모리 시스템)
- ❌ **Multi-Agent OS / 운영체제 신규 기능** (`multi.agent`, `multi-agent-os`, agent dispatcher 류)
- ❌ **새 slash command / 새 도구 시스템 확장** (현재 set 충분)
- ❌ **agent handoff / session 고도화** (현재 jsonl + CONTRACTS.md 충분)
- ❌ **worktree 정리 자동화 대규모 시스템** (수동 cleanup으로 충분)

### Polish 동결 (코어 미완성 동안)

- ❌ **Chart UX polish** (`chart.polish`, W-0212 류) — W-0210/W-0211 머지로 충분
- ❌ **Pine Script LLM-only 생성** — W-0211 Phase 1로 충분

---

## 🛡 Gate 규칙

`tools/claim.sh`가 다음 키워드 패턴 매칭 시 **확인 프롬프트** + CHARTER §Frozen 인용:

```
copy.trad | copy_trading | leaderboard.*sub
memkraft | multi.agent | multi-agent-os | agent.dispatcher
chart.polish | chart.ux.polish | w-0212
session.handoff.upgrade | new.slash.command
```

`--force` 플래그로 통과 가능하지만 사유를 prompt함.

---

## 변경 정책

- 이 문서 변경 = PRD 변경. 그 외 PR에서 수정 금지.
- "Frozen" 항목을 옮기려면 PRD/Master 문서 먼저 갱신 + ADR 작성.
- 이 가드레일이 시스템이 되어가면 (250줄 초과 / 별도 디렉토리 / 새 cron) 그것 자체가 야크쉐이빙. 즉시 롤백.
