# W-0251 — Wave 4 통합 실행 설계

> **이 문서가 Wave 4의 단일 진실.** 아래 항목들은 이 문서로 대체됨:
> W-0221, W-0222, W-0223, W-0224, W-0225, W-0226, W-0227, W-0228,
> W-0229, W-0230, W-0231, W-0232, W-0233, W-0234, W-0235, W-0236,
> W-0237, W-0238, W-0239, W-0240, W-0241, W-0242, W-0243, W-0244,
> W-0245, W-0246, W-0247, W-0248, W-0249, W-0250
>
> **작성**: CTO + AI Researcher | **코드 기준 SHA**: 6d7de4fe | 2026-04-27
> **선행 조건**: W-0215 (MM Hunter V-00 audit) 완료 후 병렬 시작 가능

---

## 0. 이 문서가 필요한 이유 — 발견된 충돌 목록

| 충돌 | 원인 | 해결 방향 |
|---|---|---|
| W-0232 번호 중복 | F-17(Viz Router)과 H-07(F-60 Gate)이 같은 번호 사용 | H-07은 W-0229로 통합, W-0232 = F-17 전용 |
| W-0221 vs W-0244 (F-7) | 한 쪽은 pre-commit gate, 한 쪽은 GitHub Actions hook | 순서 명확화: 221→phase A, 244→phase B. 본 문서 §Stream E로 통합 |
| W-0245 잘못된 선행 참조 | W-0241/W-0242 (stale) 참조 | Wave 1 완료 항목 참조 → "engine done" 명시 |
| F-02 레이블 불일치 | W-0222 구현 = `missed/unclear` vs PRD 스펙 = `near_miss/too_early` | **F-02-fix** 신규 작업으로 이관 migration 포함 |
| F-60 Gate 이중 설계 | W-0229(단순 상태) vs W-0232-h07(풀 설계) | W-0229 폐기, W-0232-h07 기반으로 H-07-eng/app 신규 작성 |
| Wave 1/2 완료 항목 혼재 | W-0223~W-0228 = 이미 완료됐지만 P0처럼 표기 | §1에 완료 목록 분리, Wave 4 실행 항목에서 제거 |
| F-30 Ledger 의존성 역전 | W-0231이 H-08 이전에 착수하도록 설계됨 | H-08 → F-02-fix → F-30 순서로 수정 |

---

## 1. 완료 항목 (Wave 1 / Wave 2 — 코드 검증)

다음은 **이미 코드에 존재**하며 Wave 4에서 재구현 불필요:

| Work Item | Feature | 코드 위치 | 비고 |
|---|---|---|---|
| W-0223 | A-03-eng `POST /patterns/parse` | `routes/patterns.py:190` | Claude Sonnet 4.6 연결 |
| W-0224 | A-04-eng `POST /patterns/draft-from-range` | `routes/patterns.py:427` | 12 features 추출 |
| W-0225 | D-03-eng `POST /captures/{id}/watch` | `routes/captures.py:698` | idempotent |
| W-0226 | A-03-app AI Parser UI | Wave 2 PR #390 | AIParserModal |
| W-0227 | A-04-app Chart Drag UI | Wave 2 PR #388 | DraftFromRangePanel |
| W-0228 | D-03-app Watch 버튼 | Wave 2 PR #386 | VerdictInboxPanel 내 Watch toggle |
| W-0222 | F-02 5-cat verdict engine | `types.py:54` — 구현됨 | ⚠️ 레이블 불일치 — F-02-fix 필요 |

---

## 2. F-02-fix — Verdict 레이블 정합 ← P0 BLOCKER

> **이 작업을 건너뛰면 LightGBM Layer C 훈련 데이터가 오염됨.**

### 현황

```
현재 코드 (engine/ledger/types.py:54):
  valid | invalid | missed | too_late | unclear

PRD 확정 스펙 (W-0220-product-prd-master.md §5):
  valid | invalid | near_miss | too_early | too_late
```

### 레이블 변경 의미 (AI Researcher 설계)

| 기존 | 신규 | 변경 이유 |
|---|---|---|
| `missed` | `near_miss` | "패턴 맞음, 타점 미스" — refinement 방향 = threshold shift |
| `unclear` | `too_early` | "타이밍 조기 진입" — 학습 라벨 의미 명확화 |
| `too_late` | `too_late` | 유지 |

**`unclear` 완전 제거** — 의미 불명확 라벨은 LightGBM 노이즈. 판단 보류 = `too_early`로 통합.

### 구현 명세

```python
# engine/ledger/types.py:54
# Before
VerdictLabel = Literal["valid", "invalid", "missed", "too_late", "unclear"]

# After
VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]
```

**영향 파일:**
```
engine/ledger/types.py           — VerdictLabel 타입 변경
engine/api/routes/captures.py   — verdict validation
engine/scoring/label_maker.py   — 학습 라벨 생성 로직 업데이트
app/src/.../VerdictInboxPanel.svelte — 5-cat 버튼 텍스트 + value
```

**Migration (migration 022):**
```sql
-- 기존 missed → near_miss
UPDATE pattern_ledger_records
SET payload = jsonb_set(payload, '{user_verdict}', '"near_miss"')
WHERE payload->>'user_verdict' = 'missed';

-- 기존 unclear → too_early
UPDATE pattern_ledger_records
SET payload = jsonb_set(payload, '{user_verdict}', '"too_early"')
WHERE payload->>'user_verdict' = 'unclear';
```

**Exit Criteria:**
- [ ] `POST /captures/{id}/verdict` body `{ "verdict": "near_miss" }` → 200
- [ ] `unclear` 값 제출 시 → 422
- [ ] migration 022 실행 후 기존 `missed` 행 0개 확인
- [ ] VerdictInboxPanel 5개 버튼: 성공/실패/니어미스/조기진입/늦은진입
- [ ] Engine CI ✅ / App CI ✅

---

## 3. 병렬 실행 스트림 (5개)

> F-02-fix 완료 후 아래 5개 스트림 병렬 시작 가능. 각 스트림은 내부 순서 존재.

```
F-02-fix (migration 022) — BLOCKER
    ↓
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Stream A │ Stream B │ Stream C │ Stream D │ Stream E │
│ Core UX  │ Dashboard│ Data/ML  │ Infra/Biz│ Meta     │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## Stream A — Core UX (4 items, 독립 실행 가능)

### A-1. F-3: Telegram → Verdict Deep Link
> Branch: `feat/F3-telegram-verdict-deeplink` | Effort: M | 3일
> **기반**: W-0234 설계 채택 (signed URL 방식)

**API 계약:**
```
POST /captures/{id}/verdict-link
  → 생성: signed JWT { capture_id, user_id, exp: +72h }
  → URL: {APP_ORIGIN}/verdict/{capture_id}?t={token}

GET /verdict/{capture_id} (app route)
  → token 검증 → 유효: VerdictModal 즉시 팝업
  → 만료/무효: 일반 로그인 redirect
```

**구현 범위:**
```
engine/notifications/telegram_notifier.py  — deep link URL 생성 (1-3줄 추가)
engine/api/routes/captures.py              — verdict-link 엔드포인트 신규
app/src/routes/verdict/[capture_id]/+page.svelte — 신규 landing 페이지
app/src/lib/components/.../VerdictInboxPanel.svelte — standalone prop 추가
```

**Exit Criteria:**
- [ ] Telegram 알림에 `{APP_ORIGIN}/verdict/{id}?t=xxx` 포함
- [ ] 클릭 → 앱 → VerdictInbox 즉시 렌더 (≤ 30초 내 verdict 입력 가능)
- [ ] 만료 token → 일반 로그인 redirect
- [ ] App CI ✅

---

### A-2. F-4: 5-card Decision HUD
> Branch: `feat/F4-decision-hud` | Effort: M | 4일
> **선행**: Wave 1 완료 (Watch/Search 엔드포인트 BUILT)

**5-card 구성 (확정):**
```
Card 1 — Pattern Status
  pattern_slug / phase (ACCUMULATION/BREAKOUT/…) / last_alert_at
  alert_count_7d / capture_count

Card 2 — Top Evidence
  상위 building_block 3개 + signal_strength (0~1)
  출처: GET /patterns/{slug}/candidates 응답

Card 3 — Risk
  invalidation 조건 2-3개 (Disqualifier building blocks)
  현재 시장 조건 vs 조건 매칭 여부

Card 4 — Next Transition
  예상 다음 phase + 전환 조건
  출처: state_machine.py phase_transitions

Card 5 — Actions
  [Watch] [Capture] [Search Similar] [Submit Verdict]
  각 버튼 → 기존 엔드포인트 연결
```

**구현 범위:**
```
app/src/lib/components/terminal/DecisionHUD.svelte  — 신규 (5-card)
app/src/routes/terminal/+page.svelte               — HUD 컴포넌트 삽입
engine/api/routes/patterns.py                      — /candidates 응답에 evidence 필드 추가 (선택)
```

---

### A-3. F-5: IDE-style Split-Pane
> Branch: `feat/F5-ide-split-pane` | Effort: M-L | 5일
> **기반**: W-0243 설계 채택. W-0232-f17(Viz Router) 이후 통합.

**3 mode 정의 (확정):**
```
Observe  — Chart 70% | HUD 30%
           용도: 패턴 모니터링, 알림 확인
Analyze  — Chart 50% | Search Results 30% | HUD 20%   ← default
           용도: 유사 케이스 탐색, PatternDraft 작성
Execute  — Chart 40% | Workspace 30% | Actions 30%
           용도: Watch 등록, Capture 저장, Verdict 입력
```

**CSS Grid 레이아웃:**
```css
.ide-layout {
  display: grid;
  grid-template-columns: var(--pane-chart) var(--pane-search) var(--pane-hud);
  transition: grid-template-columns 200ms ease;
}
/* Observe:  70% 0%  30%  */
/* Analyze:  50% 30% 20%  */
/* Execute:  40% 30% 30%  */
```

**구현 범위:**
```
app/src/lib/components/layout/SplitPane.svelte      — 신규 (CSS Grid + resize)
app/src/routes/terminal/+page.svelte                — mode store 연결
app/src/stores/ide-mode.ts                          — 신규 (observe|analyze|execute)
```

---

### A-4. F-2: Search Result List UX
> Branch: `feat/F2-search-result-ux` | Effort: M | 4일
> **기반**: W-0236 설계 채택.
> **선행**: Wave 1 완료 (POST /search/similar BUILT)

**결과 리스트 스펙:**
```
top 10~20 candidates:
  symbol | similarity_score | phase | last_alert_at
  chart thumbnail (GET /market/ohlcv?symbol=X&tf=1h&limit=24)
  [Watch] 1-click 버튼 → POST /captures/{id}/watch

정렬: similarity_score DESC
필터: phase (ACCUMULATION 우선 표시)
```

**구현 범위:**
```
app/src/lib/components/search/SearchResultList.svelte  — 신규
app/src/lib/components/search/CandidateCard.svelte     — 신규 (썸네일 + 메타)
app/src/routes/terminal/+page.svelte                   — Analyze mode 우측 패널에 삽입
```

---

## Stream B — Dashboard (3 items, A-1 이후 권장)

### B-1. F-11: Dashboard WATCHING + Candidate Review
> Branch: `feat/F11-dashboard-watching` | Effort: M | 5일
> **기반**: W-0240 설계 채택.
> **선행**: D-03-app Watch 버튼 (Wave 2 완료)

**WATCHING 섹션 (현재: BTC/ETH 2-item 정적 → 실제 데이터로 교체):**
```
API: GET /captures?watching=true&user_id={uid}
응답: [ { capture_id, symbol, pattern_slug, phase, watched_at, alert_count } ]

카드당:
  symbol | phase badge | 경과 시간
  [Verdict 제출] (outcome_ready 상태 시) / [Watching 중] (그 외)
  sparkline 7-day
```

**PatternDraft 저장 위치 (W-0240 미해결 → 확정):**
```
PatternDraft = capture_records 테이블 내 record_type='draft' 행
GET /captures?record_type=draft → Draft 목록
Draft → Candidate 승격: POST /captures/{id}/promote-to-candidate
```

**Candidate Review Queue:**
```
API: GET /patterns/candidates?status=pending
    → [ { slug, symbol, draft_body, created_at, similar_count } ]

UI: CandidateReviewModal
  PatternDraft 미리보기 | 유사 케이스 top 3
  [Approve → Object] [Reject] [수정 후 재제출]
```

---

### B-2. F-13: Telegram Bot 연결 UI
> Branch: `feat/F13-telegram-bot-connect` | Effort: M | 3일
> **기반**: W-0239 설계 채택.

**6자리 코드 인증 플로우:**
```
1. 앱 → POST /users/{id}/telegram-connect
      → { code: "892341", expires_at: +10m } 생성 + DB 저장 (migration 023)

2. 유저 → Telegram 봇에 /connect 892341 입력
      → 봇이 POST /telegram/verify-code → user_id 매핑 저장

3. 매핑 완료 → 앱 polling (10초 간격) → 연결 완료 표시
```

**Migration 023:**
```sql
CREATE TABLE telegram_connect_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  code varchar(6) NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  telegram_chat_id bigint
);
CREATE UNIQUE INDEX ON telegram_connect_codes(code) WHERE verified_at IS NULL;
```

---

### B-3. F-14: PatternObject Lifecycle UI
> Branch: `feat/F14-pattern-lifecycle` | Effort: M | 4일
> **선행**: B-1 (PatternDraft 저장 위치 확정 후)
> **수정**: W-0245의 잘못된 선행 참조(W-0241/W-0242) → **Wave 1 완료로 선행 없음**

**Draft → Candidate → Object 승격 흐름:**
```
[Input: AI Parser or Chart Drag]
  → PatternDraft (capture_records record_type='draft')
  → 유저가 [Review] 클릭
  → CandidateReviewModal (Stream B-1에서 구현)
  → [Approve] 클릭
  → POST /captures/{id}/promote-to-candidate
  → GET /patterns/candidates 목록 진입
  → CTO/Admin [Promote to Object] 승인
  → POST /patterns/candidates/{id}/promote
  → 53 PatternObject 카탈로그에 추가됨
```

---

## Stream C — Data / ML (3 items)

### C-1. H-07 + H-08: F-60 Gate + per-user accuracy
> Branch: `feat/H07-H08-f60-gate-accuracy` | Effort: M | 3일
> **기반**: W-0232-h07 설계 채택 (W-0229 폐기). W-0230 H-08 합산.
> **선행**: F-02-fix (레이블 정합 후)

**통합 엔드포인트 (H-07 + H-08 단일 라우트로 통합):**
```python
GET /users/{user_id}/f60-status
→ {
    verdict_count: int,          # 전체 제출 수
    resolved_count: int,         # valid + invalid + near_miss + too_early + too_late
    accuracy: float,             # (valid + near_miss) / resolved_count
    gate_passed: bool,           # resolved_count >= 200 AND accuracy >= threshold
    threshold: float,            # config 기본 0.55, Q2 미확정 시 0.55 사용
    remaining: int,              # max(0, 200 - resolved_count)
    breakdown: {                 # H-08 per-label
      valid: int, invalid: int, near_miss: int, too_early: int, too_late: int
    }
  }
```

**accuracy 계산 근거 (AI Researcher):**
- `near_miss` = 패턴 방향 맞음, 타점 미스 → **패턴 자체는 유효** → accuracy에 포함
- `too_early` / `too_late` = 타이밍 실패 → accuracy에서 제외 (타이밍 학습 신호)
- `invalid` = 패턴 무효 → accuracy에서 차감

**App 구현:**
```
GET /users/{id}/f60-status → ProgressBar 컴포넌트
  "[N]건 / 200건 | 정확도 [X]%"
  조건: resolved_count < 200 → bar progress
        accuracy < 0.55 → "정확도 부족" 표시
```

---

### C-2. F-16: Search Recall 검증
> Branch: `feat/F16-search-recall-verify` | Effort: M | 3일
> **기반**: W-0247 설계 채택.

**50-query eval set 구성 (AI Researcher 설계):**
```python
# engine/tests/eval/search_eval_set.py
EVAL_QUERIES = [
  # 10개 — OI spike 패턴 계열
  { "pattern_family": "oi_reversal", "symbol": "BTC", ... },
  # 10개 — Wyckoff accumulation 계열
  { "pattern_family": "wyckoff_accumulation", ... },
  # 10개 — Short squeeze 계열
  # 10개 — Funding flip 계열
  # 10개 — Vol compression 계열
]
```

**Layer 가중 튜닝 목표:**
```
현재: A:0.45 / B:0.30 / C:0.25 (Layer C 미훈련 = 실질 A:0.60 / B:0.40)
목표: recall@10 ≥ 0.70

튜닝 순서:
1. Layer C None 상태에서 A+B 최적 비율 탐색 (grid search 0.5~0.8 / 0.2~0.5)
2. Layer C 훈련 후 (verdict 50+) A/B/C 비율 재탐색
3. quality_ledger.py 자동 조정 범위 확인
```

**Exit Criteria:**
- [ ] 50 query eval set 작성 완료
- [ ] `recall@10 ≥ 0.70` 달성 (현재 가중치 또는 튜닝 후)
- [ ] Engine CI ✅

---

### C-3. F-30: Ledger 4-table 분리
> Branch: `feat/F30-ledger-4table` | Effort: M | 4일
> **선행**: H-07/H-08 완료 (ledger 쿼리 패턴 확정 후 분리)
> **기반**: W-0231 Phase 1-2 + W-0233 Phase 3 통합.

**3단계 실행 계획 (데이터 손실 없음):**
```
Phase 1 — Migration (migration 024): 신규 4개 테이블 생성 (empty)
  ledger_entries   (record_type = 'entry')
  ledger_scores    (record_type = 'score')
  ledger_outcomes  (record_type = 'outcome')
  ledger_verdicts  (record_type = 'verdict')

Phase 2 — Dual-write (1스프린트 운영): 기존 1-table + 신규 4-table 동시 쓰기
  engine/ledger/supabase_store.py 에 dual-write 로직 추가
  모니터링: 양쪽 row count 일치 여부 확인

Phase 3 — Backfill + Cutover (migration 025):
  INSERT INTO ledger_verdicts SELECT ... FROM pattern_ledger_records WHERE record_type='verdict'
  읽기 경로를 신규 4-table로 전환
  기존 pattern_ledger_records = 보존 (6개월 후 archive)
```

---

## Stream D — Infra / Monetization (3 items, 독립)

### D-1. F-18: Stripe + tier enforcement
> Branch: `feat/F18-stripe-tier` | Effort: M | 4일
> **기반**: W-0248 설계 채택.

**tier 정의:**
```
Free: capture ≤ 10/mo, search ≤ 20/mo, verdict 무제한
Pro ($29/mo): 무제한. F-60 gate 해제 시 marketplace 접근
```

**Migration 028:**
```sql
ALTER TABLE user_profiles ADD COLUMN tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro'));
ALTER TABLE user_profiles ADD COLUMN stripe_customer_id text;
ALTER TABLE user_profiles ADD COLUMN stripe_subscription_id text;
ALTER TABLE user_profiles ADD COLUMN subscription_ends_at timestamptz;
```

**Stripe webhook events:**
```
checkout.session.completed → tier = 'pro', subscription_id 저장
customer.subscription.deleted → tier = 'free'
invoice.payment_failed → 3일 유예 후 downgrade
```

---

### D-2. F-19: Observability
> Branch: `feat/F19-observability` | Effort: M | 3일
> **기반**: W-0249 설계 채택.

**대시보드 지표 (3종):**
```
p95 latency 기준:  POST /search/similar < 2s
                   POST /patterns/parse < 3s (LLM 호출 포함)
                   GET /captures/* < 500ms

error rate:        5xx < 0.5% / 4xx (client) 무시
cost per WAA:      LLM 비용 / 주간 활성 에이전트 < $8

Sentry:            engine + app 양쪽. DSN 분리.
                   performance sampling = 0.1 (10%)
                   error sampling = 1.0 (100%)
```

---

### D-3. F-7: 메타 자동화 (Phase A + B 통합)
> Branch: `feat/F7-meta-automation` | Effort: S | 1.5일
> **통합**: W-0221 (pre-commit gate) → Phase A / W-0244 (post-merge hook) → Phase B
> 이전 두 work item의 충돌 해소 — 두 phase를 동일 브랜치에서 순차 구현

**Phase A — pre-commit gate (W-0221 기반):**
```bash
# .githooks/pre-commit
#!/bin/bash
# CURRENT.md SHA가 origin/main과 다르면 경고만 (block 안 함)
CURRENT_SHA=$(grep "main SHA" work/active/CURRENT.md | grep -oP '[0-9a-f]{8,}' | head -1)
MAIN_SHA=$(git rev-parse origin/main 2>/dev/null | head -c 8)
if [ "$CURRENT_SHA" != "$MAIN_SHA" ]; then
  echo "⚠️  CURRENT.md SHA ($CURRENT_SHA) != main ($MAIN_SHA). 업데이트 권장."
fi
```

**Phase B — post-merge automation (W-0244 기반):**
```yaml
# .github/workflows/sync-current-md.yml
on:
  push:
    branches: [main]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          SHA=$(git rev-parse HEAD | head -c 8)
          sed -i "s/\`[0-9a-f]\{8\}\` — origin\/main/\`$SHA\` — origin\/main/" work/active/CURRENT.md
          git config user.email "bot@cogochi.app"
          git config user.name "Cogochi Bot"
          git add work/active/CURRENT.md
          git diff --cached --quiet || git commit -m "chore: sync CURRENT.md SHA ($SHA)"
          git push
```

**Phase C — worktree cron:**
```yaml
# .github/workflows/worktree-cleanup-check.yml
on:
  schedule:
    - cron: '0 15 * * *'  # 매일 00:00 KST
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
          COUNT=$(git worktree list | wc -l)
          if [ "$COUNT" -gt 10 ]; then
            echo "::warning::worktree 수 $COUNT > 10. 정리 필요."
          fi
```

---

### D-4. F-20~22: Infra Cleanup
> Branch: `feat/F20-infra-cleanup` | Effort: S | 1.5일
> **기반**: W-0250 설계 채택.

```
① app/vercel.json — branchMatcher: release만 production
② .github/workflows/deploy.yml — release push → vercel --prod
③ GCP Cloud Build trigger — engine main push → Cloud Run 자동 배포
④ Vercel env: EXCHANGE_ENCRYPTION_KEY production 설정 확인
```

---

## Stream E — F-12 + F-15 (Korea + PersonalVariant)

### E-1. F-12: DESIGN_V3.1 features
> Branch: `feat/F12-design-v31-features` | Effort: M | 3일
> **기반**: W-0238 설계 채택.
> **영향**: L2 feature_windows 테이블 + 40+dim Layer A 검색 가중치 업데이트

**3개 신규 피처 (migration 026):**
```sql
ALTER TABLE feature_windows
  ADD COLUMN kimchi_premium float,        -- Upbit KRW vs Binance USDT 괴리율
  ADD COLUMN session_apac float,          -- 아시아 세션 거래량 비중
  ADD COLUMN session_us float,            -- 미국 세션 거래량 비중
  ADD COLUMN session_eu float,            -- 유럽 세션 거래량 비중
  ADD COLUMN oi_normalized_cvd float;     -- OI 정규화 CVD
```

**Korea persona 중요도 (AI Researcher):**
- kimchi_premium > 3%: 국내 선물 포지션 쏠림 신호 → OI 급변 선행
- session_apac: 아시아 세션 지배적 코인 = 한국 트레이더 중심 패턴

---

### E-2. F-15: PersonalVariant runtime UI
> Branch: `feat/F15-personal-variant-ui` | Effort: S-M | 2일
> **기반**: W-0246 설계 채택.
> **선행**: `active_variant_registry.py` (6KB) — Wave 1에서 BUILT

**UI 스펙:**
```
각 PatternObject 상세 페이지에 [Customize Thresholds] 버튼
  → VariantPanel 슬라이드인
  → 파라미터 목록: [ oi_threshold, funding_threshold, lcs_min_length, ... ]
  → 기존 값 + 슬라이더 + [저장]

API:
  GET  /patterns/{slug}/active-variant  → 현재 유저 threshold
  POST /patterns/{slug}/active-variant  → 새 threshold 저장
  DELETE /patterns/{slug}/active-variant → 기본값 복원
```

---

## 4. 의존성 그래프 (검증됨)

```
F-02-fix (migration 022)
├── A-1 F-3 Telegram deeplink      [독립]
├── A-2 F-4 Decision HUD           [독립]
├── A-3 F-5 IDE split-pane         [독립]
├── A-4 F-2 Search result UX       [독립]
├── B-2 F-13 Telegram bot UI       [독립]
├── D-3 F-7 Meta automation        [독립]
├── D-4 F-20-22 Infra              [독립]
├── E-1 F-12 DESIGN_V3.1           [독립]
├── E-2 F-15 PersonalVariant UI    [독립]
│
├── C-1 H-07+H-08 F-60 Gate  ← F-02-fix (레이블 확정 후)
│       ↓
│   D-1 F-18 Stripe tier  ← H-07 (gate 로직 확정 후 tier 연동)
│
├── B-1 F-11 WATCHING + Review  ← D-03-app Wave 1 완료 (즉시 가능)
│       ↓
│   B-3 F-14 Pattern lifecycle  ← B-1 (PatternDraft 저장 경로 확정 후)
│
└── C-2 F-16 recall verify  ← 독립 (eval set 먼저)
        ↓
    C-3 F-30 Ledger 4-table  ← C-1 H-07/H-08 (쿼리 패턴 확정 후)
```

---

## 5. Migration 순서 (절대 순서)

| 번호 | 내용 | 작업 |
|---|---|---|
| 022 | F-02-fix: verdict 레이블 이관 | Stream 시작 전 BLOCKER |
| 023 | Telegram connect codes 테이블 | B-2 F-13 |
| 024 | Ledger 4-table 생성 (empty) | C-3 F-30 Phase 1 |
| 025 | Ledger backfill + cutover | C-3 F-30 Phase 3 |
| 026 | feature_windows DESIGN_V3.1 컬럼 추가 | E-1 F-12 |
| 027 | (예약) | — |
| 028 | user_profiles Stripe 컬럼 추가 | D-1 F-18 |

---

## 6. 폐기 목록

다음 work item들은 이 문서로 대체됨. 실행 불필요:

| Work Item | 이유 |
|---|---|
| W-0221 F-7 pre-commit gate | §Stream D-3에 통합됨 |
| W-0229 F-60 Gate (단순 상태) | §Stream C-1 H-07+H-08에 통합됨 |
| W-0232-h07 F-60 Gate design | §Stream C-1에 반영됨, 별도 실행 불필요 |
| W-0241 A-03-eng | Wave 1 완료 (routes/patterns.py:190) |
| W-0242 A-04-eng | Wave 1 완료 (routes/patterns.py:427) |

---

## 7. 실행 우선순위 요약

```
즉시 (이번 주):
  1. F-02-fix (migration 022) — BLOCKER
  2. F-7 meta automation (D-3) — 독립, 1.5일

Week 1:
  3. H-07+H-08 F-60 Gate (C-1) — F-02-fix 직후
  4. F-3 Telegram deeplink (A-1) — 독립
  5. F-11 WATCHING (B-1) — 독립

Week 2:
  6. F-4 Decision HUD (A-2)
  7. F-5 IDE split-pane (A-3)
  8. F-12 Korea features (E-1)
  9. F-13 Telegram bot UI (B-2)

Week 3-4:
  10. F-18 Stripe (D-1) — H-07 후
  11. F-14 Pattern lifecycle (B-3) — B-1 후
  12. F-16 recall verify (C-2)
  13. F-19 Observability (D-2)
  14. F-20-22 Infra (D-4)

Week 5+:
  15. F-2 Search UX (A-4)
  16. F-15 PersonalVariant UI (E-2)
  17. F-30 Ledger 4-table (C-3) — 가장 리스크 큰 migration, 마지막
```

---

*W-0251 | CTO+AI Researcher A024 | 2026-04-27 | 다음 체크포인트: F-02-fix 완료 후*
