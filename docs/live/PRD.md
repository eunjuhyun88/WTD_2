# PRD: Cogochi — Pattern Research OS

Version: v4.0 (code-verified, 2026-04-26)
Agent: A023

---

## 1. Product Definition

Cogochi는 크립토 선물 트레이더가 자신의 판단을 저장하고, 시장 전체에서 같은 구조를 찾고, 결과를 추적해서 판단력을 개선하는 **패턴 연구 운영 체제**다.

차트 도구가 아니다. 브로커가 아니다. 트레이더의 판단을 데이터로 전환하는 파이프라인이다.

---

## 2. Core Loop (확정)

```
[INPUT] → RESOLVE → SEARCH → WATCH → VERDICT → REFINEMENT → [MONETIZE]
```

### 2.1 INPUT (3 모드)

| 모드 | 설명 | 구현 상태 |
|------|------|-----------|
| C — Catalog select | 기존 패턴 라이브러리에서 선택 | BUILT |
| F-0b — AI Parser | 텍스트/스크린샷 입력 → Claude → PatternDraft | NOT BUILT |
| F-0a — Chart Drag | 차트에서 range 선택 → 12 feature 추출 → PatternDraft | NOT BUILT |

### 2.2 RESOLVE

현재 시장 데이터에서 선택한 패턴의 phase 상태를 평가한다.

- Engine: `POST /patterns/{slug}/evaluate`
- 상태: BUILT

### 2.3 SEARCH

저장된 캡처 증거를 기반으로 유사한 과거/현재 케이스를 탐색한다.

- Engine: `POST /search/similar` (3-Layer Blend: Layer A L1 + Layer B LCS + Layer C LightGBM)
- 상태: BUILT (Layer C는 미훈련 시 None fallback)

### 2.4 WATCH

평가된 패턴+심볼 조합을 모니터링에 등록한다.

- alpha watch: BUILT (`POST /alpha/watch`)
- capture → monitoring 연결: NOT BUILT

### 2.5 VERDICT

72시간 후 자동 결과 판정 + 유저 수동 레이블.

- Auto verdict: BUILT (APScheduler outcome_resolver)
- User verdict UI: BUILT (3 카테고리: valid/invalid/missed)
- User verdict 5-cat: NOT BUILT (NEAR_MISS, TOO_EARLY, TOO_LATE 없음)

### 2.6 REFINEMENT

판정 데이터로 패턴 가중치와 ML 모델을 개선한다.

- Phase A weight optimization: BUILT (Hill Climbing)
- Phase B LightGBM training: BUILT (코드 있음, 미훈련)
- Refinement trigger scheduler: BUILT

### 2.7 MONETIZE (F-60 Gate)

Verdict 200건 이상 + 정확도 임계값 통과 → Copy Signal Marketplace 진입.

- F-60 gate logic: NOT BUILT
- Copy signal marketplace: NOT BUILT

---

## 3. Feature Status Table

| Feature ID | 기능 | 상태 | 선행조건 |
|------------|------|------|----------|
| F-C | Catalog select capture | BUILT | — |
| F-0b | AI Parser (text → PatternDraft) | NOT BUILT | — |
| F-0a | Chart Drag (range → PatternDraft) | NOT BUILT | — |
| F-V3 | Verdict 3-cat (valid/invalid/missed) | BUILT | — |
| F-V5 | Verdict 5-cat (+near_miss, too_early, too_late) | NOT BUILT | F-V3 |
| F-W | 1-click Watch (capture → monitoring) | NOT BUILT | — |
| F-S | Stats Engine display | BUILT (engine), partial UI | — |
| F-60 | F-60 Gate (verdict count + accuracy) | NOT BUILT | F-V5 |
| F-MKT | Copy Signal Marketplace | NOT BUILT | F-60 |

---

## 4. Data Architecture (실제)

| Layer | 저장소 | 용도 |
|-------|--------|------|
| Primary write | SQLite WAL | PatternState, Capture, Outcome |
| Durable read | Supabase | Ledger records, Capture records |
| Feature store | Supabase feature_windows | 138,915 rows (backfill 완료) |
| Cache | In-memory (5min TTL) | PatternStats, Search results |
| ML models | SQLite + file | LightGBM per pattern/timeframe |

---

## 5. Non-Goals (Day-1)

- 실시간 **실자금** 자동 매매 (paper 시뮬은 §5b Pattern Verification Lane으로 허용)
- 포지션 사이징 자동화 (실자금)
- 타 거래소 포지션 동기화
- 모바일 앱

## 5b. Pattern Verification Lane (PRD v3, 2026-04-28)

**핵심 인사이트**: JUDGE/Verdict는 사람 판단 신호, Paper P&L은 시장 판단 신호. 둘을 함께 봐야 패턴 품질이 진짜 검증된다.

```
패턴 발견 → Capture → JUDGE/Verdict (사람 판단)
                          ↓
                 Paper Execution → P&L (시장 판단) ← v3 추가
                          ↓
                 두 신호 비교 → refinement 학습 라벨
```

### 4-Phase Roadmap

| Phase | 내용 | 실자금 |
|---|---|---|
| P1 Signal Card | 패턴 → entry/exit/stop 카드 (체결 X) | 0 |
| P2 Backtest | 과거 데이터 hit rate / Sharpe | 0 |
| P3 Paper Execution | 시뮬 체결 + 슬리피지/수수료 + P&L | 0 |
| P4 Mode 비교 | 수동 vs AI vs rule-based 변환 비교 | 0 |

### Frozen 격리

- 신규 코드: `engine/verification/`, `app/routes/paper/`
- 금지: 실자금 주문 / 거래소 API key / `engine/copy_trading/` 수정·import
- 상세: `docs/live/W-0220-product-prd-master.md` § 0.3, `work/active/W-0281-pattern-verification-lane.md`

### 우선순위

W-0254 H-07/H-08 머지 후 V-PV-01 시작 (현재 P0 침범 X).

---

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Capture → Verdict 완료율 | ≥ 60% | ledger verdict_count / entry_count |
| Verdict 정확도 (valid+near_miss rate) | ≥ 55% | F-60 gate 기준 |
| Search latency P95 | ≤ 500ms | engine /search/similar |
| Pattern scan 주기 | 15min | APScheduler pattern_scan |
| 동시 유저 | ≥ 100 | Supabase connection pool + SQLite WAL |

---

## 7. Open Questions (검토 필요)

1. Verdict 5-cat에서 "missed"는 "too_late"로 통합 가능한가? (현재 "missed" = 기회 놓침)
2. F-60 gate 정확도 임계값 — 몇 %로 설정할 것인가?
3. F-0a Chart Drag는 app/terminal에 드래그 UI를 추가하는가, 아니면 range input form인가?
4. AI Parser (F-0b)의 텍스트 입력 — 자유 텍스트인가 구조화 템플릿인가?
