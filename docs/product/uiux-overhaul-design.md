# UI/UX Overhaul Design — WTD v2

> 단일 진실 소스. v2 전면 재작성 (2026-04-25)
> 이전 버전의 "다 넣기" 접근을 폐기한다.

---

## 0. 핵심 원칙 (이것만 기억하면 됨)

```
차트      = 관측  (market truth)
오른쪽    = 판단  (state machine 요약, 4카드 이하)
하단      = 검증  (evidence + compare + ledger + refinement)
AI        = 해석  (human-readable research copilot)
저장      = 패턴 객체 생성
```

**숫자 = 하단. 판단 = 오른쪽. 같은 데이터 두 번 없음. 카드 많아지면 설계 실패.**

---

## 1. 정보 배치 원칙

### 차트에 둘 것 (가격축/시간축과 붙어야 의미 있는 것)

- 캔들 + MA/VWAP
- range high/low, entry/stop/target marker
- breakout line, major liq rail
- **phase marker** (FAKE → ARCH → REAL → ACCUM → BREAKOUT)
- sub-pane: OI / Funding / CVD / Liq imbalance / Volume

### 오른쪽에 둘 것 (지금 당장 행동에 필요한 결론만)

- Phase, Confidence, Bias → 숫자보다 결론
- Top Evidence 3개 (문장형, 수치 최소)
- Risk 2개 (invalidation 조건)
- Action 버튼 3개

### 하단에 둘 것 (근거 검증 / 비교 / 회고 / refinement)

- Phase Timeline (시계열)
- Feature Evidence Table (raw + threshold + pass/fail)
- Compare (current vs seed vs near-miss)
- Ledger (성과 검증)
- Judgment (User Refinement)

### AI에 둘 것 (설명 / 서사화 / 반론)

- 왜 이 phase인지 설명
- 현재 vs PTB/TRADOOR 비교 요약
- 실패 시나리오
- threshold 조정 제안
- AI는 데이터를 소유하지 않는다. 전달받아 해석만 한다.

---

## 2. 3모드 분리

한 화면에 Observe / Analyze / Execute가 동시에 소리치면 안 된다.

| 모드 | 트리거 | 차트 | 오른쪽 | 하단 |
|---|---|---|---|---|
| **Observe** | 기본 상태 / 빠른 종목 전환 | 100% 집중 | HUD minimal (phase chip만) | 접힘 |
| **Analyze** | 한 종목 깊게 볼 때 | 70% | HUD full (4카드) | workspace open |
| **Execute** | 진입/손절/타겟 확정 시 | 60% | HUD + Execution Board | Evidence only |

모드 전환: 우측 상단 `[O]` `[A]` `[E]` 토글 or 하단 workspace 열면 자동 Analyze.

---

## 3. 즉시 삭제 목록 (지금 화면에서 없애야 할 것)

| 항목 | 이유 |
|---|---|
| 오른쪽 DETAIL PANEL + AI DETAIL 동시 노출 | 완전 중복 + 시선 분산. 버튼으로 슬라이드 |
| Analyze 카드 안의 또 다른 Analyze 카드 구조 | 계층 붕괴. 세부는 하단으로 |
| 오른쪽의 Proposal / Entry / Stop / Target | Execute 모드에서만 보이게 |
| raw metric 카드 5~6개 묶음 (OI 4h, Funding 등) | 판단이 아니라 근거. 하단 Evidence Table로 |
| Score / Confidence / Bias 3개 분리 표시 | 1개 카드로 합치기 |
| 오른쪽과 하단에 같은 요약 중복 노출 | 한 곳만. 오른쪽 = 결론, 하단 = 근거 |

---

## 4. 즉시 합칠 목록

| 합칠 대상 | 합친 결과 |
|---|---|
| Score + Confidence + Bias | → Current State 카드 1개 |
| Leader + Venue + Symbol + TF | → Context 한 줄 (카드 아님) |
| OI 요약 + Funding 요약 + CVD 요약 | → Top Evidence 3 (문장형) |

---

## 5. 화면 와이어프레임

### 5-1. Analyze 모드 (가장 중요)

```
┌─────────────────────────────────────────────────────┬──────────────────┐
│                    CHART BOARD                      │  DECISION HUD    │
│                                                     │                  │
│  캔들 + MA + OI/Fund/CVD sub-pane                  │  [1] State       │
│  phase marker overlay                               │  Pattern: tradoor│
│  range primitive (drag select)                      │  Phase: ACCUM    │
│                                                     │  Bias: BEAR      │
│                                                     │  Conf: 50%       │
│                                                     │                  │
│                                                     │  [2] Evidence    │
│                                                     │  ✔ OI +18% hold  │
│                                                     │  ✔ Fund flip     │
│                                                     │  ✔ CVD reversal  │
│                                                     │                  │
│                                                     │  [3] Risk        │
│                                                     │  ⚠ BKT 미확정   │
│                                                     │  ⚠ low 깨지면 X  │
│                                                     │                  │
│                                                     │  [4] Actions     │
│                                                     │  [Save Setup]    │
│                                                     │  [Compare]       │
│                                                     │  [AI Explain]    │
├─────────────────────────────────────────────────────┴──────────────────┤
│ WORKSPACE                                                              │
│ [Phase] [Evidence] [Compare] [Ledger] [Judgment]  ← 섹션 토글         │
│                                                                        │
│ Phase: FAKE → ARCH → REAL → [ACCUM▶] → BREAKOUT                       │
│                                                                        │
│ Evidence:                                                              │
│ Feature      | Value | Threshold | Status | Why                        │
│ OI zscore    | 2.7   | >2.0      | PASS   | real_dump 핵심            │
│ funding flip | yes   | required  | PASS   | accum 전환 신호            │
│ breakout_str | 0.004 | >0.01     | FAIL   | 아직 breakout 아님         │
│                                                                        │
│ [Compare: current vs TRADOOR]  [current vs PTB]  [near-miss]          │
│                                                                        │
│ Ledger: 성공률 63%  avg +18%  최근: ✔ ✔ ✖ ✔ ✔                       │
│                                                                        │
│ [Valid]  [Invalid]  [Too Early]  [Too Late]  [Near Miss]               │
└────────────────────────────────────────────────────────────────────────┘
```

### 5-2. Observe 모드

```
┌──────────────────────────────────────────────────┬──────────────┐
│                 CHART BOARD (full focus)          │ Phase chip   │
│                                                   │ ACCUM · 50%  │
│  캔들 + pane + phase marker                      │              │
│                                                   │ [→ Analyze]  │
└──────────────────────────────────────────────────┴──────────────┘
```

### 5-3. Execute 모드

```
┌──────────────────────────────────────┬────────────────────────────┐
│         CHART BOARD (60%)            │  EXECUTION BOARD           │
│  entry marker / stop / target        │  Entry: 82,400             │
│                                      │  Stop:  81,200  (-1.5%)    │
│                                      │  TP1:   85,000  (+3.2%)    │
│                                      │  TP2:   88,000  (+6.8%)    │
│                                      │  R:R    2.1x               │
│                                      │  Pattern: ACCUM conf 78%   │
│                                      │  [Confirm Save]            │
├──────────────────────────────────────┴────────────────────────────┤
│ Evidence (compressed): OI PASS · Fund PASS · BKT FAIL             │
└───────────────────────────────────────────────────────────────────┘
```

---

## 6. 오른쪽 HUD 상세 계약

**4카드 이상 절대 추가 금지.**

### 카드 1 — Current State

```
Pattern:  tradoor_oi_reversal_v1
Phase:    ACCUMULATION
Bias:     BEAR
Conf:     50%  ·  Score: -15.3
```

- Pattern family slug (human readable 아님, 정확한 이름)
- Phase: state machine 현재 출력
- Bias: BULL / BEAR / NEUTRAL
- Conf: 0–100

### 카드 2 — Top Evidence (3개 고정)

```
✔ OI spike 후 유지 (p84)
✔ Funding 음수 전환 확인
✔ Higher lows 3회
```

- 최고 confidence block 3개만
- raw 수치 최소화 (percentile로만)
- 설명은 한 줄 이하

### 카드 3 — Risk

```
⚠ Breakout 미확정 (threshold below)
⚠ Fresh low 시 INVALID
```

- invalidation 조건 2개
- next phase transition 조건 1개 (선택)

### 카드 4 — Actions

```
[ Save Setup  ]
[ Compare     ]
[ AI Explain  ]
```

- Save Setup: range 선택 완료 시 활성
- Compare: 현재 심볼을 seed/PTB와 비교 (하단 Compare 섹션 open)
- AI Explain: 현재 state를 AI 패널에 주입

---

## 7. 하단 Workspace 상세 계약

탭이 아니라 **섹션 토글**. 기본은 Phase + Evidence 동시 보임.

### 섹션 1 — Phase Timeline

```
[FAKE_DUMP] → [ARCH_ZONE] → [REAL_DUMP] → [ACCUMULATION ◀ 현재] → [BREAKOUT]

상태: 3/5 phases complete
다음 전환 조건: breakout_strength > 0.01 AND OI re-expansion
실패 조건: fresh low < 81,200
```

state machine과 1:1 연결.

### 섹션 2 — Feature Evidence Table

| Feature | Value | Threshold | Status | Phase Relevance |
|---|---|---|---|---|
| OI zscore | 2.7 | >2.0 | PASS | real_dump 핵심 |
| funding_flip | yes | required | PASS | accum 전환 |
| breakout_strength | 0.004 | >0.01 | FAIL | 아직 아님 |
| higher_low_count | 3 | ≥2 | PASS | accum 확인 |
| liq_imbalance | 1.8 | >1.5 | PASS | squeeze 구간 |

각 행: block/feature slug + current value + threshold + pass/fail + 1줄 why.
이게 "왜 이 판정이 나왔는지"의 전부를 보여준다.

### 섹션 3 — Compare

```
[current vs TRADOOR (seed)]  [current vs PTB]  [near-miss 사례 3건]
```

비교 항목:
- Phase path diff (시계열)
- Feature diff (table)
- Outcome diff (actual result)
- AI summary (선택)

*단순히 차트 두 개 나란히 두는 게 아님. 패턴 객체 수준 비교.*

### 섹션 4 — Ledger

```
Pattern family: tradoor_oi_reversal_v1
Total: 23건  Success: 15 (65%)  Avg return: +18.2%
MFE: +24.1%  MAE: -4.3%
BTC bull: 73%  BTC bear: 51%  Sideways: 58%

Recent 10:  ✔ ✔ ✖ ✔ ✔ ✔ ✖ ✔ ✔ ✔
```

이게 없으면 연구가 아니라 예쁜 대시보드다.

### 섹션 5 — Judgment (User Refinement)

```
[ Valid ] [ Invalid ] [ Too Early ] [ Too Late ] [ Near Miss ]

Comment: ___________________________

자동 저장:
- current phase path
- feature snapshot
- chart snapshot ref
- ledger ref
```

---

## 8. Save Setup 흐름

Save는 그냥 저장이 아니다. **패턴 객체 생성**이다.

range 완료 후 오른쪽 `[Save Setup]` 클릭:

```
┌─ SAVE SETUP ────────────────────────────────────┐
│ Symbol: BTCUSDT  TF: 4h  Range: Apr21 14:00→16:00│
│ Phase: ACCUMULATION  Pattern: tradoor_oi_v1      │
│                                                  │
│ Auto-attached:                                   │
│  ✔ Chart snapshot                                │
│  ✔ Feature snapshot (OI, Fund, CVD, ...)         │
│  ✔ Phase path so far                             │
│  ✔ Active indicator list                         │
│                                                  │
│ Thesis: [___________________________________]    │
│ Tags: [ACCUM] [OI_REVERSAL] [+tag]              │
│ Note: [________________________________]         │
│                                                  │
│ Entry: ___  Stop: ___  Target: ___              │
│                                                  │
│ [Cancel]  [Save]  [Save & Find Similar →]        │
└──────────────────────────────────────────────────┘
```

저장 완료:
- 하단 workspace SIMILAR 섹션 자동 open (Find Similar 10건)
- 저장 확인 1줄 toast: "BTCUSDT 4h Apr21 저장됨 · 유사 10건"

---

## 9. Find Similar (SIMILAR 섹션)

저장 직후 하단 workspace에 자동 표시.

```
SIMILAR — tradoor_oi_reversal_v1 기준  (benchmark_search 결과)

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ ETHUSDT  │ │ SOLUSDT  │ │ BNBUSDT  │ │ ADAUSDT  │
│ Apr14 4h │ │ Mar28 1h │ │ Feb12 4h │ │ Jan07 4h │
│ Sim 91%  │ │ Sim 87%  │ │ Sim 84%  │ │ Sim 81%  │
│ +14.2%   │ │ -3.1%    │ │ +9.8%    │ │ +22.1%   │
│ VALID    │ │ STOPPED  │ │ VALID    │ │ VALID    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

(수평 스크롤, 최대 10건)

카드 클릭 → 해당 심볼/구간으로 terminal 이동 + 구간 하이라이트
빈 결과: "유사 케이스 없음 — 더 많은 capture가 쌓이면 결과가 개선됩니다"
```

---

## 10. AI Explain 흐름

AI 패널은 독립 탭이 아니라 **슬라이드오버**다.

`[AI Explain]` 클릭 시 오른쪽에서 슬라이드:

```
┌─ AI RESEARCH PANEL ────────────────────────────┐
│ Context (auto-injected):                        │
│ - Symbol: BTCUSDT 4h                           │
│ - Phase: ACCUMULATION                          │
│ - Confidence: 50%                              │
│ - Evidence: [OI, Fund, CVD snapshot]           │
│ - Pattern: tradoor_oi_reversal_v1              │
│                                                 │
│ AI:                                             │
│ "현재 구조는 REAL_DUMP 이후 OI가 유지되면서     │
│  Higher lows가 3회 형성됐습니다. Funding이      │
│  음수로 전환된 것은 세력 포지셔닝 신호입니다.    │
│  BREAKOUT 조건인 breakout_strength가 아직       │
│  0.004 수준으로 threshold(0.01) 미달이므로      │
│  진입보다 모니터링 구간입니다.                   │
│                                                 │
│  실패 시나리오: 81,200 이하 fresh low 발생 시    │
│  REAL_DUMP 재테스트 → INVALID 처리됩니다."      │
│                                                 │
│ [Regenerate] [Copy] [Save to Note]             │
└─────────────────────────────────────────────────┘
```

AI는 계산하지 않는다. 이미 계산된 state를 사람 언어로 구조화한다.

---

## 11. 구현 Phase 순서

### Phase 1 — 정보 위계 정리 (모드 분리 + 오른쪽 수술)

**삭제:**
- 오른쪽 DETAIL PANEL / AI DETAIL 동시 노출 → 슬라이드오버로
- raw metric 카드 5~6개 → 하단 Evidence Table로
- 오른쪽 Proposal/Entry/Stop/Target → Execute 모드로

**합치기:**
- Score + Confidence + Bias → Current State 카드 1개
- OI/Fund/CVD 각 카드 → Top Evidence 3 문장형

**추가:**
- Observe / Analyze / Execute 모드 토글 (우측 상단)
- 오른쪽 4카드 구조 정착

**Exit:** `npm --prefix app run check` 0 error. 오른쪽에 5카드 이상 없음.

### Phase 2 — 하단 Workspace 구축 (W-0140 흡수)

**변경:**
- 탭 구조 → 섹션 토글 구조
- `workspaceEnvelope`/`workspaceStudyMap` 기반 Evidence Table
- Phase Timeline (state machine 연결)
- Judgment 버튼 5개

**Exit:** Evidence Table이 feature block pass/fail을 정확히 표시.

### Phase 3 — Save + Find Similar (W-0200 흡수)

**추가:**
- Save Setup modal → 패턴 객체 생성 form
- 저장 완료 → SIMILAR 섹션 자동 open
- benchmark_search 10건 카드

**Exit:** range select → save → similar 10건 → outcome 확인 루프 완주.

### Phase 4 — AI Explain 슬라이드오버

**추가:**
- 슬라이드오버 패널
- context auto-inject (phase + evidence + snapshot)
- AI 응답 렌더링

---

## 12. 불변 규칙

1. **숫자 = 하단. 판단 = 오른쪽.** 절대 반대로 두지 않는다.
2. **같은 데이터를 두 곳에 두지 않는다.** 오른쪽에 있으면 하단에서 제거.
3. **오른쪽은 4카드 이하.** 더 넣으면 설계 실패 신호다.
4. **Execute 콘텐츠는 Execute 모드에서만.** Entry/Stop/Target이 Analyze 모드에 있으면 안 됨.
5. **AI는 데이터를 소유하지 않는다.** 주입받아 설명만.
6. **하단은 작은 카드 모음이 아니라 넓은 테이블.** 카드 많아지면 다시 생각.

---

## 13. 관련 문서

- `work/active/W-0201-uiux-overhaul.md` — 구현 work item
- `docs/product/indicator-visual-design-v2.md` — indicator 패널 계약
- `docs/product/core-loop.md` — Pattern Object → State Machine → Ledger → Refinement
- `engine/patterns/state_machine.py` — phase 판정 진실 소스
- `engine/ledger/` — ledger 진실 소스
