# Alpha Flow → Cogochi Terminal 통합 계획

> **Work ID**: `W-alpha-flow-integration`
> **Branch**: `claude/hardcore-haslett`
> **Surface**: `frontend-ui`
> **Baseline**: `/Users/ej/.claude/plans/iterative-juggling-owl.md` (v4.2 FINAL 3-panel)
> **Reference**: `/Users/ej/Desktop/나혼자매매 Alpha Flow_by 아카.html` (Alpha Terminal v3.0)
> **Prior**: `/Users/ej/.claude/plans/serene-questing-raccoon.md` (3-panel + Pattern Journal)

---

## Context

이미 3-panel 레이아웃(`iterative-juggling-owl.md` v4.2 FINAL)은 설계 완료 상태다. **하지만 현재 `/terminal/+page.svelte` 는 그 설계대로 구현되지 않고 2-panel(Feed + Chart)로 되돌려져 있다.** 이번 작업은 (1) v4.2 3-panel 설계를 실제로 구현하고, 동시에 (2) Alpha Flow HTML의 고밀도 데이터 UI (11-cell Market Bar, 16-col 스캔 테이블, 7-section Deep Dive, Verdict 박스 with Entry/TP/SL, sparkline+layer badge 시스템)를 그 3패널 안에 흡수하고, (3) 유저가 "SOL 4H 분석해줘" 같이 자연어로 질문했을 때 **Claude 아티팩트처럼 채팅 피드 안에 풀폭 카드로 쫙** Deep Dive와 차트/수치가 뿌려지도록 한다는 것이다.

**핵심 사용자 요구**:
1. "하던 거 정리" — v4.2 3패널 설계 재구현 + 고아 컴포넌트(DeepDivePanel, MarketThermometer) 정리
2. "알파알람 html의 UI/UX를 우리 톤에 맞게" — Alpha Flow HTML의 데이터 밀도를 `--sc-*` (핑크/라임/베이지) 팔레트로 포팅
3. "자연어로 검색" — 이미 DOUNI 자연어 파이프라인 동작 중, 추가 없음
4. "클로드처럼 쫙 채팅에 보이게" — Deep Dive / Scan 테이블 / Verdict 가 채팅 피드 안에 **풀폭 인라인 아티팩트**로 렌더링
5. "CryptoQuant / Coinglass 급 자세함" — Alpha Flow의 모든 섹션(17-layer breakdown, S/R, Order Flow, Structure, Entry/TP/SL with R:R)을 한 화면에

**User decisions (확정)**:
- 레이아웃: **v4.2 FINAL의 3-panel (좌 Scanner 280px + 중앙 Chat + 우 Analysis 380px)** 재구현 (새로 발명하지 않음)
- Deep Dive 표시: **채팅 피드 안 인라인이 메인** (Claude Artifact 스타일로 쫙 풀폭) + 우측 380px 슬라이드인에 **동일한 Deep Dive 복제**해서 고정 참조용
- Market Bar 위치: **글로벌 `Header.svelte`에 통합** (모든 페이지에서 보임, 기존 MarketThermometer 치환)
- 토큰 마이그레이션: **지금 `--cg-*` → `--sc-*` 이행** (고아 컴포넌트 정리)
- 엔진 스코프: **순수 프런트엔드 UI only**. Alpha Flow HTML의 계산 로직(Wyckoff multi-window, Spring/UTAD, BB big squeeze 등)은 이번 범위 밖. 우리 17-layer 엔진의 SignalSnapshot 을 그대로 사용하고 없는 필드는 `—` fallback.

---

## 엔진 정책 (중요)

**백엔드/엔진은 건드리지 않는다.** 이번 작업은 **순수 프런트엔드 UI 통합**이다.

- `src/lib/engine/cogochi/**` — 읽기 전용. 타입만 참조.
- `src/routes/api/cogochi/**` — 읽기 전용. 계약/응답 변경 없음.
- `src/lib/server/**` — 손대지 않음.
- Alpha Flow HTML의 계산 로직 포팅은 **별도 후속 exec-plan**으로 분리. 이번 플랜의 범위 밖.
- SignalSnapshot 에 Alpha Flow 가 쓰는 필드가 없으면 UI 에서 `—` / graceful fallback.

---

## 초기 상태 & Progressive Disclosure

**기본 = 2-panel. 클릭하면 → 3-panel.**

| 상태 | 좌 (Scanner 280px) | 중앙 (Chat flex) | 우 (Analysis 380px) |
|---|---|---|---|
| **초기 로드** | ✅ 표시 | ✅ 표시 | ❌ **숨김** |
| **좌측 행 클릭** | ✅ 선택 하이라이트 | (불변) | ✅ **슬라이드인** (해당 심볼 Deep Dive) |
| **중앙 Deep Dive 카드 `[→ 우측에서 열기]` 버튼 클릭** | (불변) | (불변) | ✅ **슬라이드인** (동일 snapshot 복제) |
| **중앙 ScanTable row 클릭** | (불변) | (불변) | ✅ **슬라이드인** (해당 심볼 Deep Dive) |
| **우측 패널 ✕ 닫기** | (불변) | (불변) | ❌ **숨김** → 2-panel 복귀 |
| **≤1024px 모바일** | ❌ 숨김 | ✅ 풀폭 | (호출 시 오버레이) |

즉 `showAnalysis = $state(false)` 가 기본이고, 사용자가 채팅/스캐너에서 무언가를 클릭해야 우측 패널이 열린다. 우측 패널 없이도 중앙 채팅 안에서 Claude 아티팩트 인라인 Deep Dive 만으로 메인 경험이 완결된다.

---

## 최종 레이아웃 (v4.2 FINAL 3-panel + Alpha Flow 밀도 + Claude 아티팩트)

```
┌── Global Header (수정) ───────────────────────────────────────────────┐
│ COGOTCHI  │ TERMINAL │ LAB │ DASHBOARD          │ BTC $71.5K │ PROFILE │
├─── Alpha Market Bar (11-cell, Header row 2) ──────────────────────────┤
│ F&G 45·Ne│ 김프 +2.3%│ USD/KRW 1380│ BTC Tx 450K│ 멤풀 82K│ 수수료 45  │
│ S.Bull 3 │ Bull 12   │ Neut 24     │ Bear 8     │ S.Bear 1│ ⚡Ext 2    │
├────────────────────────────────────────────────────────────────────────┤
│ /terminal                                                              │
├── LEFT Scanner (280px) ──┬── CENTER Chat Feed (flex) ──┬── RIGHT (380)─┤
│ ┌─[▶ ALPHA SCAN] Top50▾ │ > SOL 4H 분석해줘             │  (슬라이드인) │
│ │ [DeFi][Meme][AI][L1L2]│                                │              │
│ │ [▲][▼][◈][★][⚡][🔥] │ ╔══════════════════════════╗   │ DeepDive     │
│ ├───────────────────────┤ ║ SOL/4H $185.22 +3.4%    ║   │ (slide-in)   │
│ │ SYM │ α  │ ↕ │ FLAG  │ ║ Alpha +42 · BULL BIAS   ║   │              │
│ │ SOL │+42 │ ▲ │ ★⚡   │ ║ ─────────────────────── ║   │ 7섹션 풀디테일│
│ │ ETH │+28 │ ▲ │ ◈    │ ║ [신호뱃지 14개 bull/bear]║   │              │
│ │ BTC │+15 │ ─ │       │ ║ ┌Entry┬TP1┬TP2┬SL┬R:R┐║   │ (인라인과    │
│ │ DOGE│ -8 │ ▼ │ 🔥    │ ║ │185.2│192.5│195.8│182│2.1│║│ 동일한       │
│ ├───────────────────────┤ ║ └────┴────┴────┴───┴──┘║   │ DeepDivePanel│
│ │ 24/50 ████████░░ 80%  │ ╚══════════════════════════╝   │ 을 variant  │
│ ├── MARKET (collapse) ──┤                                │ 'slide-in'  │
│ │ F&G 45  김프 +2.3%    │ ╔══════════════════════════╗   │ 으로 복제)  │
│ │ BTC.D 54.2%           │ ║  17-LAYER DEEP DIVE      ║   │              │
│ │                       │ ║  (7-section grid 풀폭)   ║   │              │
│ └───────────────────────┘ ║  [L1 Wyckoff 패턴/상/Phase]║  │              │
│                           ║  [MTF 컨플루언스 + CVD]  ║   │              │
│ (좌측 행 클릭  → 우측 로드)║  [실제청산 + L2 Flow]    ║   │              │
│ (좌측 더블클릭 → 중앙 분석)║  [BB 스퀴즈 + ATR 변동성]║   │              │
│                           ║  [가격 돌파 + 섹터 흐름] ║   │              │
│                           ║  [OB 호가창 + 시장온도]  ║   │              │
│                           ║  [15-Layer 점수 요약 막대]║  │              │
│                           ╚══════════════════════════╝   │              │
│                                                          │              │
│                           > scan top gainers             │              │
│                           ╔══════════════════════════╗   │              │
│                           ║ [ALL][▲BULL][▼BEAR][◈WK]║   │              │
│                           ║ ┌───┬────┬──┬──┬──┬──┐  ║   │              │
│                           ║ │SYM│Alpha│WK│MTF│...│  ║   │              │
│                           ║ │SOL│+42  │+18│+12│...│  ║   │              │
│                           ║ │ETH│+28  │+8 │+14│...│  ║   │              │
│                           ║ │...(16 cols × N rows) │  ║   │              │
│                           ║ └───┴─────┴──┴──┴──┴──┘  ║   │              │
│                           ╚══════════════════════════╝   │              │
│                           [________입력창_______] [▲]    │              │
└───────────────────────────┴──────────────────────────────┴──────────────┘
```

### 좌/중/우 역할 분리

| 패널 | 역할 | Alpha Flow 대응 | 구현 컴포넌트 |
|---|---|---|---|
| **좌 Scanner (280px)** | 빠른 스캐닝 / 심볼 브라우저. 4-col 컴팩트 테이블. 섹터/필터 프리셋. Market 접이식. | Alpha Flow의 controls + compact table (축소판) | `ScannerPanel.svelte` (신규, v4.2 설계대로) |
| **중앙 Chat Feed** | 자연어 인터랙션. Claude 아티팩트 인라인 렌더. 과거 대화 + 풀폭 Deep Dive 카드 + 풀폭 Scan 테이블 + Verdict 박스가 시간순 피드. | Alpha Flow의 deep-dive panel + verdict box + 16-col table을 **채팅 안에 쫙 풀폭으로** | 기존 `+page.svelte` 피드 + 신규 feed entry 타입 (`deep_dive`, `verdict`, `scan_table`) |
| **우 Analysis (380px slide-in)** | 마지막 분석 결과 고정 복제. 스크롤과 무관하게 참조용. | Alpha Flow의 우측 dd-panel을 slide-in variant로 | 동일한 `DeepDivePanel.svelte` (variant='slide-in') |
| **글로벌 Header Market Bar** | 시장 전체 심볼 (F&G, 김프 등) + 스캔 버킷 카운터 | Alpha Flow의 `.mkt-bar` 11-cell | `AlphaMarketBar.svelte` (신규) |

**인터랙션 규칙** (v4.2 FINAL과 동일):
| 액션 | 좌 Scanner | 중앙 Chat | 우 Analysis |
|---|---|---|---|
| 좌측 행 **클릭** | 선택 하이라이트 | 불변 | 해당 심볼 Deep Dive 로드 |
| 좌측 행 **더블클릭** | 선택 | "SOL 4H 분석해줘" 자동 전송 → 인라인 Deep Dive 렌더 | 로드 |
| 중앙 "BTC 4H 분석" | 불변 | **인라인 Deep Dive + Verdict 카드** 피드 추가 | 복제 슬라이드인 |
| 중앙 "scan defi" | DeFi 프리셋 스캔 시작 | **인라인 16-col Scan Table** 피드 추가 | 불변 |
| 우측 [📸 SAVE] | 불변 | 불변 | Pattern Save 모달 (v4.2 Sprint 3, 이번 범위 밖) |

**핵심 UX 약속**: 채팅 피드 안 인라인 렌더링이 **메인**이다. 우측 380px 슬라이드인은 "마지막 분석을 한 화면에 고정해서 참조용"일 뿐 없어도 메인 경험이 성립해야 한다.

---

## Sprint 구조

### Sprint 0 — 플랜 스냅샷 복제 (5분)

플랜 문서를 3곳에 보관:
1. `.claude/plans/snug-noodling-knuth.md` — 현재 위치 (그대로 유지)
2. `docs/exec-plans/active/alpha-flow-terminal-integration-2026-04-10.md` — exec-plan (Agent Context Protocol 호환)
3. `docs/design-docs/alpha-flow-terminal-uiux.md` — 영구 디자인 문서

세 파일 내용 동일. 수정은 `.claude/plans/` 에서 먼저.

---

### Sprint 1 — 정리 & Market Bar 통합

**1-A. 토큰 마이그레이션** (`--cg-*` → `--sc-*`)

수정 파일:
- `src/components/cogochi/MarketThermometer.svelte` — deprecated 예정이지만 일단 tokens 치환
- `src/components/cogochi/DeepDivePanel.svelte` — 827줄 CSS 대량 치환

치환 매핑:
| --cg-* | → | --sc-* |
|---|---|---|
| `--cg-bg` | → | `--sc-bg-0` |
| `--cg-surface` | → | `--sc-bg-1` |
| `--cg-surface-2` | → | `--sc-bg-2` |
| `--cg-border` | → | `--sc-line-soft` |
| `--cg-border-strong` | → | `--sc-line` |
| `--cg-text` | → | `--sc-text-0` |
| `--cg-text-dim` | → | `--sc-text-2` |
| `--cg-text-muted` | → | `--sc-text-3` |
| `--cg-cyan` / `.bull` | → | `--sc-good` (#adca7c) |
| `--cg-red` / `.bear` | → | `--sc-bad` (#cf7f8f) |
| `--cg-green` | → | `--sc-good` |
| `--cg-orange` / warn | → | `--sc-warn` (#f2d193) |
| `'IBM Plex Mono'` | → | `var(--sc-font-mono)` |
| `'IBM Plex Sans'` | → | `var(--sc-font-body)` |
| Binance `#f0b90b` | → | 유지 (브랜드색) |

검증: `grep -rn "cg-" src/components/cogochi/` → 0 hits (acc. 루트 `.cg-shell` 경로는 별도)

**1-B. AlphaMarketBar 신규 컴포넌트**

신규 파일: `src/components/cogochi/AlphaMarketBar.svelte`

Alpha Flow HTML의 `.mkt-bar` 11-cell을 `--sc-*` 톤으로 재구현. 높이 52px, 수평 스크롤.

Props:
```ts
{
  thermo: {
    fearGreed: number | null;
    btcDominance: number | null;
    kimchiPremium: number | null;    // BTC 김프 (Terminal 스캔 이후 업데이트)
    usdKrw: number | null;
    btcTx: number | null;
    mempoolPending: number | null;
    fastestFee: number | null;
  };
  buckets: {                         // null 이면 '—' 표시
    strongBull: number;  // alphaScore ≥ 55
    bull: number;        // 25 ≤ alphaScore < 55
    neutral: number;     // -24 ≤ alphaScore ≤ 24
    bear: number;        // -54 ≤ alphaScore ≤ -25
    strongBear: number;  // alphaScore ≤ -55
    extremeFR: number;   // |FR| > 0.07%
  } | null;
}
```

11개 셀: F&G, BTC 김프, USD/KRW, BTC Tx, 멤풀, 수수료, Strong Bull, Bull, Neutral, Bear, Strong Bear, Extreme FR (12번째)

색상 규칙:
- F&G < 30 → `--sc-good`; F&G > 70 → `--sc-bad`
- 김프 > 2 → `--sc-bad`; 김프 < -1 → `--sc-good`
- BTC Tx > 450K → `--sc-good`; < 250K → `--sc-bad`
- 멤풀 > 80K → `--sc-bad`; < 30K → `--sc-good`
- 수수료 > 80 sat/vB → `--sc-bad`; < 30 → `--sc-good`
- Strong Bull/Bull 셀 값 → `--sc-good`
- Strong Bear/Bear 셀 값 → `--sc-bad`
- Neutral 셀 값 → `--sc-accent`
- Extreme FR 셀 값 → `--sc-warn`

**1-C. 글로벌 Header에 연결**

수정 파일: `src/components/layout/Header.svelte`
1. Header 구조 변경: 1-row → 2-row
   - row 1: COGOTCHI 로고, 네비 탭, BTC 가격, PROFILE
   - row 2: `<AlphaMarketBar>` (풀폭, border-bottom)
2. `/api/cogochi/thermometer` 60초 폴링 → 내부 state
3. `alphaBuckets` store 구독 → buckets prop

수정 파일: `src/routes/cogochi/+layout.svelte`
- 기존 `<MarketThermometer>` mount 제거 (글로벌 Header로 이동했으므로)

신규 파일: `src/lib/stores/alphaBuckets.ts`
```ts
import { writable } from 'svelte/store';
export interface AlphaBuckets { strongBull:number; bull:number; neutral:number; bear:number; strongBear:number; extremeFR:number }
export const alphaBuckets = writable<AlphaBuckets | null>(null);
```
/terminal 의 scan 결과 완료 시 여기에 집계해서 push → Header가 구독.

---

### Sprint 2 — v4.2 3-Panel 레이아웃 + 좌측 Scanner

**2-A. ScannerPanel 신규 컴포넌트** (v4.2 FINAL 섹션 2-1)

신규 파일: `src/components/cogochi/ScannerPanel.svelte`

Props:
```ts
{
  onSelectSymbol: (symbol: string) => void;   // 클릭 → 우측 로드
  onAnalyzeSymbol: (symbol: string) => void;  // 더블클릭 → 중앙 분석
}
```

내부 state: `scanResults[]`, `sector`, `filters`, `sortCol`, `progress`, `topN`

구조 (v4.2 그대로):
```
┌─ SCANNER (280px) ────────────┐
│ [▶ ALPHA SCAN] [Top50 ▾]     │ ← 1줄: 스캔 버튼 + N 선택
│ [DeFi][Meme][AI][L1/L2]      │ ← 1줄: 섹터 프리셋
│ [▲][▼][◈][★][⚡][🔥]        │ ← 1줄: 필터 태그 (BULL/BEAR/WYCKOFF/MTF/SQUEEZE/LIQ)
│ ┌─────┬─────┬──┬────┐       │
│ │SYM  │ALPHA│↕ │FLAG│       │ ← 4-col 컴팩트 테이블
│ │SOL  │ +42 │▲ │★⚡ │       │   정렬: ALPHA desc 기본
│ │ETH  │ +28 │▲ │◈  │       │   클릭 → onSelectSymbol
│ │BTC  │ +15 │─ │   │       │   더블클릭 → onAnalyzeSymbol
│ │DOGE │  -8 │▼ │🔥 │       │
│ └─────┴─────┴──┴────┘       │
│ 24/50 ████████░░ 80%         │ ← 프로그레스 바 (progress 동안)
│ ── MARKET (접기) ──           │ ← <details open>
│ F&G: 45 Neutral              │
│ 김프: +2.3%  BTC.D: 54.2%   │
└──────────────────────────────┘
```

API: `POST /api/cogochi/scan` (기존 17-layer 엔진), body = `{ mode:'topN', topN, preset, sector }`

동작:
- 스캔 시작 시 버튼 `.run` 클래스 + 정지 버튼 표시
- progress bar 애니메이션
- 결과 row 하나씩 누적 렌더
- 스캔 완료 시 `alphaBuckets` store 에 버킷 집계 push (Sprint 1의 store)

**2-B. `+page.svelte` 3-panel 재구성**

수정 파일: `src/routes/terminal/+page.svelte`

변경:
1. 기존 2패널 (data-feed + chart-panel) → **3패널**
   - 좌: `<ScannerPanel>` (280px, flex-shrink:0)
   - 중: Data Feed (flex:1)
   - 우: Analysis slide-in (380px, flex-shrink:0, hidden by default)
2. 기존 `chart-panel` aside **제거**. 차트는 이제 Deep Dive 카드 내부에서 렌더.
3. CSS:
```css
.terminal-root { display: flex; flex-direction: column; }
.main-content { flex: 1; display: flex; min-height: 0; }
.scanner-col { width: 280px; flex-shrink: 0; border-right: 1px solid var(--sc-line-soft); overflow-y: auto; }
.data-feed { flex: 1; min-width: 0; overflow-y: auto; }
.analysis-col { width: 380px; flex-shrink: 0; border-left: 1px solid var(--sc-line-soft); overflow-y: auto; background: var(--sc-bg-1); }

@media (max-width: 1024px) {
  .scanner-col { display: none; }  /* 좌측 접기 */
  .analysis-col { position: fixed; top:0; right:0; height:100vh; box-shadow:-4px 0 20px rgba(0,0,0,0.4); z-index: var(--sc-z-modal); }
}
```
4. 새 state: `let showAnalysis = $state(false); let analysisSymbol = $state(''); let analysisSnapshot = $state<any>(null);`
5. `ScannerPanel.onSelectSymbol` → `analysisSymbol = s; fetchSnapshot(s); showAnalysis = true;`
6. `ScannerPanel.onAnalyzeSymbol` → `inputText = '${base} 4H 분석해줘'; handleSend();`

---

### Sprint 3 — Alpha Flow Density: Scan Table + Deep Dive + Verdict (Claude 아티팩트 인라인)

**3-A. ScanTable 신규 컴포넌트 (16-col dense)**

신규 파일: `src/components/cogochi/ScanTable.svelte`

Alpha Flow HTML의 메인 테이블을 `--sc-*` 톤으로 재구현. 채팅 피드 안에서 풀폭 카드로 렌더.

Props:
```ts
{
  results: ScanResult[];           // /api/cogochi/scan 결과
  onRowClick: (symbol: string) => void;    // 우측 Deep Dive 로드
  onRowAnalyze: (symbol: string) => void;  // 더블클릭 → 중앙 분석 트리거
}
```

**16 컬럼** (Alpha Flow 참조):
1. Symbol (+ ★MTF / ⚡BB / 🔥LIQ 뱃지)
2. Alpha (숫자 + 수평 progress bar + BULL/BEAR label)
3. Wyckoff (L1 score + pattern label)
4. MTF (L10 score)
5. CVD (L11 score + ↑↓흡수)
6. Liq (L9 score)
7. BB (L14 score + SQUEEZE/NORMAL)
8. ATR (L15 score + volState)
9. Breakout (L13 score)
10. Flow (L2 score)
11. Surge (L3 + `×factor`)
12. Kimchi (L8 + % premium)
13. FR% (색상)
14. OI Δ (% + sparkline)
15. Price Δ (24h %)
16. Signals (`▲N / ▼M`)

내부 state: `sortCol`, `sortDir` (컬럼 헤더 클릭 토글), `filter` (ALL/BULL/BEAR/WK/MTF/SQ/LIQ/EXT)

Filter Pills 섹션 (컴포넌트 상단):
```
[🔍 Symbol 검색] [ALL 24] [▲BULL 12] [▼BEAR 8] [◈WK 5] [★MTF 3] [⚡BB 4] [🔥LIQ 2] [⚡EXT 1]
```

Layer badge 시스템 (내부 helper):
- `.lb-bull` (score > 1) → bg `rgba(173,202,124,0.12)`, border `rgba(173,202,124,0.3)`, color `--sc-good`
- `.lb-bear` (score < -1) → bg `rgba(207,127,143,0.12)`, border `rgba(207,127,143,0.3)`, color `--sc-bad`
- `.lb-neut` (|score| ≤ 1) → bg `rgba(68,102,255,0.08)`, color `--sc-text-2`
- `.lb-warn` → bg `rgba(242,209,147,0.1)`, color `--sc-warn`

Sparkline helper (OI Δ 컬럼):
- 14px height bars, color: 상승=sc-good, 하락=sc-bad
- 14px × 5~6 개 bar = 미니 시퀀스

테이블 스타일:
- 배경 `--sc-bg-1`, row hover `--sc-bg-2`
- 헤더 `font-size:9px; color:var(--sc-text-3); letter-spacing:1.3px; text-transform:uppercase`
- 선택 row `.sel` → `border-left: 2px solid var(--sc-accent); background: rgba(219,154,159,0.04)`

**3-B. DeepDivePanel 확장 (7-section grid)**

수정 파일: `src/components/cogochi/DeepDivePanel.svelte` (827줄 → ~1100줄)

현재 구조: header, alerts bar, 17-layer table, C&E target, ATR trade plan, Binance link.

**추가**: Alpha Flow HTML의 7-section grid (현재의 17-layer table은 section 7 "LAYER SCORES" 으로 이동).

새 섹션 구조 (`.dd-grid` — `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))`):

1. **L1 WYCKOFF** (snapshot.l1)
   - 패턴 (ACCUMULATION/DISTRIBUTION/NONE)
   - Phase, 이전 추세 %, 레인지 폭
   - Spring/UTAD 플래그
   - SOS/SOW 플래그
   - C&E 목표가

2. **② MTF + ③ CVD** (snapshot.l10 + l11)
   - MTF: 각 TF 별 pattern (4H ACC, 1D DIST 등)
   - MTF 신호 bullets
   - CVD 추세 (↑ 매수 누적 / ↓ 매도 누적)
   - 흡수 감지 플래그 (Composite Man)
   - CVD 신호 bullets

3. **① 실제청산 + L2 Flow** (snapshot.l9 + l2)
   - 롱/숏 청산 USD (1H)
   - 총 청산 규모
   - Funding Rate (색상 + ⚡ extreme 표시)
   - OI 변화 %
   - L/S Ratio
   - Taker B/S + sparkline

4. **⑱ BB 스퀴즈 + ⑲ ATR 변동성** (snapshot.l14 + l15)
   - BB 상태 (SQUEEZE/BIG SQUEEZE/EXPANDING/NORMAL)
   - 밴드폭 %, 가격 위치 %, 상단/하단
   - BB 신호 bullets
   - ATR 값, ATR %, volState (ULTRA_LOW~EXTREME)
   - ATR 손절 (Long), ATR 목표 (TP1/TP2)

5. **⑫ 가격 돌파 + ④ 섹터 자금 흐름** (snapshot.l13 + l12)
   - 7일/30일 레인지 위치 %
   - 7D/30D 고저점
   - 돌파 신호 bullets
   - 섹터명, 섹터 평균 Alpha Score

6. **L4 호가창 + L7·L8 + L6 온체인** (snapshot.l4 + l7 + l8 + l6)
   - Bid/Ask Ratio + 상태
   - **OB mini viz**: 20개 bid/ask bar (Alpha Flow 참조, height=volume*20)
   - 공포탐욕 값 + label
   - 김치프리미엄 %
   - BTC 일일 Tx, 멤풀 대기, 수수료

7. **15-LAYER 점수 요약** (현재 17-layer table을 여기로 이동)
   - 각 layer: 라벨 + horizontal progress bar + 점수
   - 맨 아래에 `TOTAL ALPHA SCORE` 큰 숫자 (Alpha Flow HTML의 `font-size:24px`)

Props 추가:
```ts
{
  snapshot: SignalSnapshot;
  chartData?: Candle[];               // 차트 데이터 (인라인 variant 에서 CgChart 렌더)
  onClose?: () => void;
  variant?: 'inline' | 'slide-in';    // 기본 'inline'
}
```

**variant='inline'**:
- width 100%, max-width 1100px
- 닫기 버튼 없음 (피드 일부)
- 상단에 심볼/TF/가격/Alpha Score + **`[→ 우측 패널에서 열기]` 버튼** (옆에 고정 복제 유도)
- 헤더 바로 아래 `<CgChart>` (height 280px) 렌더
- 모든 7섹션 표시

**variant='slide-in'**:
- width 100% (380px 컨테이너 안 채움)
- 닫기 버튼 상단 고정
- CgChart 없음 (좁으므로 생략) — 또는 height 180px 축소
- 7섹션 세로로 스택

**3-C. VerdictBox 신규 컴포넌트** (Alpha Flow의 `.vbox`)

신규 파일: `src/components/cogochi/VerdictBox.svelte`

Props:
```ts
{ snapshot: SignalSnapshot }
```

렌더링 구조:
```
┌─ ◈ 종합 방향 판정 — SOL/USDT ──────────────────┐
│                                                  │
│ Signals (뱃지 14개)                              │
│ [▲ Wyckoff ACC Phase C] [▲ CVD 매수 누적] [⚠FR] │
│ [▲ MTF 트리플 ★★★] [▼ 상단 저항] [▲ BB 스퀴즈]│
│ ...                                              │
│                                                  │
│ ┌─ Verdict ────────────────────────────────────┐│
│ │ ▲ BULL BIAS — 상승 편향 · MTF 트리플 ★★★    ││
│ └──────────────────────────────────────────────┘│
│ 활성 신호 14개 · 상승 8개 / 하락 4개             │
│                                                  │
│ ┌─Entry──┬─C&E 목표─┬─ATR TP2─┬─SL──┬─R:R──┐  │
│ │$185.22 │ $192.50  │ $195.80 │$182 │ 2.1:1│  │
│ └────────┴──────────┴─────────┴─────┴──────┘  │
│ [→ Binance 차트 열기]                            │
└──────────────────────────────────────────────────┘
```

로직:
- alphaScore ≥ 25 → LONG 모드 (`.eb-entry` `--sc-good` 박스)
- alphaScore ≤ -25 → SHORT 모드 (`--sc-bad` 박스)
- verdict 텍스트: `snapshot.verdict` (이미 backend 에서 생성)
- Entry = `snapshot.l15.stopLong` 기준 currentPrice
- C&E 목표 = `snapshot.l1.ceTarget`
- ATR TP2 = `snapshot.l15.tp2Long`
- SL = `snapshot.l15.stopLong`
- R:R = `|tp - entry| / |entry - sl|` (1 decimal)
- Signals: snapshot 에서 각 layer 의 bullets 수집 (`l1.pattern`, `l2.sigs`, `l14.sigs`, ... ) → vs-bull/vs-bear/vs-neut/vs-warn 뱃지

클래스 (Alpha Flow 참조, `--sc-*` 로):
- `.vsig.vs-bull` → bg `rgba(173,202,124,0.1)`, border `rgba(173,202,124,0.3)`, color `--sc-good`
- `.vsig.vs-bear` → bg `rgba(207,127,143,0.1)`, border `rgba(207,127,143,0.3)`, color `--sc-bad`
- `.vverdict.vv-bull` → bg `rgba(173,202,124,0.07)`, border `rgba(173,202,124,0.4)`, color `--sc-good`
- `.vverdict.vv-bear` → `--sc-bad` variants
- `.ebox.eb-entry` → `--sc-good` variants
- `.ebox.eb-target` → `--sc-accent` variants (핑크)
- `.ebox.eb-stop` → `--sc-warn` variants

**3-D. `+page.svelte` Feed Entry 확장**

수정 파일: `src/routes/terminal/+page.svelte`

FeedEntry 타입 확장:
```ts
type FeedEntry =
  | { kind: 'query'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking' }
  | { kind: 'scan_table'; results: ScanResult[] }        // 신규: Alpha Flow dense 16-col
  | { kind: 'deep_dive'; snapshot: SignalSnapshot; chartData?: Candle[] }  // 신규: 7-section grid
  | { kind: 'verdict'; snapshot: SignalSnapshot }        // 신규: Alpha Flow vbox
  | { kind: 'actions'; ... };  // 기존 feedback buttons
```

기존 feed entry 제거:
- `kind: 'metrics'`, `kind: 'layers'`, `kind: 'scan'` (심플 리스트), `kind: 'chart_ref'` — 모두 **제거**. Deep Dive 카드 하나에 다 통합됨.

Feed switch 렌더링:
```svelte
{:else if entry.kind === 'scan_table'}
  <ScanTable
    results={entry.results}
    onRowClick={(sym) => { analysisSymbol=sym; fetchSnapshot(sym); showAnalysis=true; }}
    onRowAnalyze={(sym) => { inputText=`${sym.replace('USDT','')} 4H 분석해줘`; handleSend(); }}
  />
{:else if entry.kind === 'deep_dive'}
  <DeepDivePanel
    snapshot={entry.snapshot}
    chartData={entry.chartData}
    variant="inline"
    onOpenSide={() => { analysisSnapshot=entry.snapshot; showAnalysis=true; }}
  />
{:else if entry.kind === 'verdict'}
  <VerdictBox snapshot={entry.snapshot} />
```

SSE handler 재작성:
- `applyAnalysisResult(data, layers)` → 이제 **2개의 feed entry 만 push**:
  1. `{ kind: 'verdict', snapshot }`
  2. `{ kind: 'deep_dive', snapshot, chartData: data.chart }`
- 동시에 `analysisSnapshot = data; showAnalysis = true;` → 우측 슬라이드인에 **동일한 Deep Dive 복제** 표시
- `applyScanResult(data)` → `{ kind: 'scan_table', results: data.results }` 1개 entry + `alphaBuckets` store 업데이트

우측 Analysis 패널 컨테이너:
```svelte
{#if showAnalysis && analysisSnapshot}
  <aside class="analysis-col">
    <DeepDivePanel
      snapshot={analysisSnapshot}
      variant="slide-in"
      onClose={() => showAnalysis = false}
    />
  </aside>
{/if}
```

---

### Sprint 4 — 검증 & Polish

1. `npm run check` (TypeScript/Svelte) 0 errors
2. `npm run build` 통과
3. `npm run gate` (guard:workspace + check:budget + build) 통과
4. 수동 E2E (dev server via preview_start):
   - `/terminal` 진입 → Header 2-row (로고+네비 / 11-cell Market Bar), 좌측 Scanner(280px), 중앙 Chat, 우측 숨김
   - 좌측 `[▶ ALPHA SCAN] Top50` 클릭 → progress bar → 4-col 테이블 채워짐
   - Header Market Bar에 Strong Bull/Bear 버킷 숫자 실시간 갱신
   - 좌측 SOL 행 **클릭** → 우측 Analysis slide-in, 7-section Deep Dive 표시
   - 좌측 SOL 행 **더블클릭** → 중앙에 "SOL 4H 분석해줘" 자동 입력, 인라인 Verdict + Deep Dive 카드 렌더
   - 중앙에 "scan top gainers" 입력 → 인라인 ScanTable (16-col) 렌더
   - ScanTable 필터 pills 작동 (BULL/BEAR/WK/MTF/SQ/LIQ/EXT)
   - ScanTable row 클릭 → 우측 Deep Dive 로드
   - ScanTable row 더블클릭 → 중앙 분석 트리거
   - Deep Dive의 `[→ 우측 패널에서 열기]` 버튼 클릭 → 우측 slide-in 열림 (동일한 snapshot)
   - Verdict 박스의 Entry/C&E/TP2/SL/R:R 값 정확
   - ≤ 1024px 에서 좌측 Scanner 숨김, 우측 Analysis 오버레이 전환
5. 시각 검증:
   - `grep -rn "cg-" src/components/cogochi/` → 0 hits
   - 모든 색상 `--sc-good` (라임), `--sc-bad` (핑크), `--sc-warn` (베이지), `--sc-accent` (핑크) 만 사용
   - Binance 버튼 `#f0b90b` 유지 (브랜드)

---

## 수정·신규 파일 요약

### 신규 — 컴포넌트/스토어
- `src/components/cogochi/AlphaMarketBar.svelte` — 11-cell 글로벌 메트릭 바
- `src/components/cogochi/ScannerPanel.svelte` — 좌측 280px 4-col 스캐너 (v4.2 FINAL)
- `src/components/cogochi/ScanTable.svelte` — 중앙 인라인 16-col dense 테이블
- `src/components/cogochi/VerdictBox.svelte` — 판정 + 신호 + Entry/TP/SL
- `src/lib/stores/alphaBuckets.ts` — Svelte store (Header ↔ Terminal)

### 신규 — 플랜 문서 복제 (Sprint 0)
- `docs/exec-plans/active/alpha-flow-terminal-integration-2026-04-10.md`
- `docs/design-docs/alpha-flow-terminal-uiux.md`

### 수정
- `src/components/layout/Header.svelte` — 2-row 전환, AlphaMarketBar 통합, thermometer fetch, buckets 구독
- `src/components/cogochi/MarketThermometer.svelte` — `--cg-*` → `--sc-*` (deprecated 예정이지만 정리 차원에서 치환)
- `src/components/cogochi/DeepDivePanel.svelte` — 토큰 치환 + 7-section grid 추가 + variant prop + chartData prop (CgChart 인라인 renders)
- `src/routes/terminal/+page.svelte` — 3-panel 전환, ScannerPanel 연결, Feed entry 재작성 (deep_dive/verdict/scan_table), 기존 metrics/layers/scan/chart_ref entry 제거, 기존 chart-panel aside 제거
- `src/routes/cogochi/+layout.svelte` — `<MarketThermometer>` mount 제거 (글로벌 Header로 이동)

### 수정 금지 (엔진 스코프 밖)
- `src/lib/styles/tokens.css`
- `src/lib/engine/cogochi/**`
- `src/routes/api/cogochi/**`
- `src/lib/server/**`

---

## 재사용 자산

- **Scan API**: `POST /api/cogochi/scan` — ScanResult[] (snapshot 풀 포함)
- **Analyze API**: `GET /api/cogochi/analyze?symbol=X&tf=Y` — snapshot + chart + derivatives
- **Thermometer API**: `GET /api/cogochi/thermometer` — F&G, BTC.D, 멤풀, fee, USD/KRW
- **SSE**: `POST /api/cogochi/terminal/message` — 기존 DOUNI FC 파이프라인
- **Types**: `src/lib/engine/cogochi/types.ts` — SignalSnapshot, LAYER_MAX_CONTRIBUTION
- **CgChart**: `src/components/cogochi/CgChart.svelte` — DeepDivePanel inline variant 에서 재사용
- **livePrices store**: `src/lib/stores/livePrices.ts` (Header BTC 가격)
- **scanEngine**: `src/lib/server/scanEngine.ts` — 건드리지 않음

---

## 검증 기준 (Definition of Done)

- [ ] Sprint 1: Header 2-row, Alpha Market Bar 11셀 정상 표시
- [ ] Sprint 1: `grep -rn "cg-" src/components/cogochi/` = 0 hits
- [ ] Sprint 2: `/terminal` 3-panel (좌 280px / 중앙 flex / 우 380px hidden)
- [ ] Sprint 2: 좌측 ScannerPanel 스캔 동작, 4-col 테이블 렌더
- [ ] Sprint 2: 좌측 → 중앙 더블클릭 연동, 좌측 → 우측 클릭 연동
- [ ] Sprint 2: 스캔 완료 시 Header Market Bar 버킷 카운터 실시간 갱신
- [ ] Sprint 3: 중앙 자연어 "SOL 4H 분석" → 인라인 Verdict + Deep Dive (7섹션) 풀폭 렌더
- [ ] Sprint 3: 중앙 "scan top gainers" → 인라인 16-col ScanTable 렌더
- [ ] Sprint 3: Deep Dive 7섹션 모두 표시 (Wyckoff, MTF+CVD, Liq+Flow, BB+ATR, 돌파+섹터, OB+시장온도, 15-Layer)
- [ ] Sprint 3: Verdict 박스 Entry/C&E/TP2/SL/R:R 정확
- [ ] Sprint 3: Deep Dive 인라인과 우측 slide-in 동기화 (동일한 snapshot)
- [ ] Sprint 4: `npm run check` 0 errors
- [ ] Sprint 4: `npm run build` 통과
- [ ] Sprint 4: ≤1024px 좌측 숨김, 우측 오버레이

---

## 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| SignalSnapshot 필드 부족 (wk.spring, wk.utad, bb.bigSqueeze, atr.volState, rl 등) | UI 에서 `—` / graceful fallback. 엔진 변경 금지. Sprint 3 시작 전 `types.ts` 재확인. |
| DeepDivePanel 827줄 → 7섹션 추가로 1100줄 | Sprint 1 토큰 치환만 하고 Sprint 3에서 섹션 추가 (리스크 분리) |
| Header 2-row 전환 → Arena/Lab 등 다른 페이지 레이아웃 충돌 | Header sticky + height 증가 만큼 자동 padding-top. 각 페이지 full-bleed 유지 확인. |
| 좌측 ScannerPanel과 중앙 ScanTable 중복 느낌 | 의도적 분리: 좌측은 "빠른 브라우저", 중앙은 "쿼리 결과 아카이브 (Claude 아티팩트)". 역할 다름. |
| `--cg-*` 다른 곳에서 쓰는지 | `src/components/cogochi/` 범위만 마이그레이션. Arena(`--arena-*`) 영향 없음. 루트 `.cg-shell` 은 Sprint 1 에서 확인. |

---

## 우선순위

1. **Sprint 0 (5분)** — 플랜 3곳 복제
2. **Sprint 1** — 토큰 정리 + Market Bar Header 통합 (시각 효과 즉시, 롤백 안전)
3. **Sprint 2** — 3-panel + 좌측 ScannerPanel (v4.2 FINAL 재구현)
4. **Sprint 3** — Alpha Flow 밀도 (ScanTable + DeepDive 7섹션 + Verdict) + Claude 아티팩트 인라인
5. **Sprint 4** — 검증

각 Sprint 독립 커밋. Sprint 1 완료만으로도 즉시 시각 효과.

---

## 별도 후속 작업 (이 플랜 범위 밖)

- **엔진 정규화 audit**: Alpha Flow HTML L1~L15 계산 → 우리 `engine/cogochi/**` 포팅 (Wyckoff multi-window, Spring/UTAD, BB 50일 big squeeze, volState 5단계, Real liquidation 가중, Sector scoring). 별도 exec-plan.
- **Pattern Card 시스템**: v4.2 FINAL Sprint 3 (PatternSaveModal, html2canvas, localStorage, /patterns 페이지). 이 플랜 완료 후.
- **AutoResearch + LoRA + 카피트레이딩**: v4.2 FINAL Sprint 5. 먼 미래.
- **CRT 스캔라인/retro 오버레이**: Alpha Terminal 분위기 추가 옵션. 디자인 디시전 별도.

---

## 연동 히스토리

- `serene-questing-raccoon.md` (2026-04-08) — 초기 3-panel + Pattern Journal 설계
- `iterative-juggling-owl.md` v4.2 FINAL — Alpha Terminal 참조로 재설계한 3-panel (좌 Scanner 280px + 중앙 Chat + 우 380px Analysis)
- **이 플랜 (snug-noodling-knuth.md, 2026-04-10)** — v4.2 FINAL 실제 구현 + Alpha Flow HTML 밀도 + Claude 아티팩트 인라인 렌더링
