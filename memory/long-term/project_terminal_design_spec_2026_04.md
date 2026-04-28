---
name: terminal_design_spec_2026_04
description: Terminal Bloomberg cockpit UI spec 완성 — §8.1-I/J/K 설계문서, Answer-First architecture, Source-Native Evidence system (2026-04-13)
type: project
---

## Terminal UI 설계 완료 상태 (2026-04-13)

COGOCHI.md § 8.1 계열에 다음 섹션이 추가/업데이트됨:

### § 8.1-I: Adaptive Analysis Workspace
- Bloomberg panel system + TradingView chart depth + Claude command layer
- 4가지 운영 모드: Focus / Compare / Monitor / Custom
- 패널 타입 9종: Chart · Signal · AI Thesis · News-Catalyst · Risk-Position · Orderflow · Macro-Breadth · Log-Tape · Watchlist
- 패널 공통 구조: `[Symbol][TF][Signal State] → Price/Vol/OI → Chart → Indicators → AI note → Action row`
- Bloomberg 슬롯 A–F (Focus 모드 기본 배치)
- Edit UX: 드래그/리사이즈/교체/추가/제거, 프리셋 4종
- 차트 요구사항: 7 TF, 오버레이, 지표, 드로잉, 이벤트 레이어, 비교 오버레이
- 분석 깊이 3단계: Mini / Standard / Deep
- 컴포넌트 계층: `BoardShell > BoardToolbar > WorkspaceGrid > PanelFrame > {패널들} + PresetManager`
- 구현 순서: WorkspaceGrid → ChartPanel → Focus → 2×2 → Edit mode → overlays → preset → mobile

### § 8.1-J: Unified UI System Spec
- **기준:** Apple 정돈 + Bloomberg 정보 위계 + Perplexity 결론-근거-출처
- **색 의미 고정:** green(positive) / red(risk) / amber(warning) / blue(info) / violet(AI only)
- **글로벌 네비게이션:** 상단 헤더 = 현재 화면 조작, 하단 = 앱 이동. 중복 금지.
- **Mobile Bottom Nav:** Home · Terminal · Dashboard · Passport · More(sheet)
- **페이지 타입:** Standard Shell vs Workspace Shell (Terminal)
- **데스크톱 비율:** Left Rail ~19% / Main Board ~56% / Right Detail Panel ~25%
- **AssetInsightCard 구조:** CardHeader + PriceStrip + MiniChart/MainChart + FlowMetricsRow + SetupSummary + ActionBar
- **Right Detail Panel 5탭:** Summary / Entry / Risk / Catalysts / Metrics
- **클릭→탭 매핑 고정:** 카드body→Summary, Entry버튼→Entry, Risk태그→Risk, 뉴스→Catalysts, OI/Funding/CVD→Metrics
- **구현 순서:** tokens → typography → header/nav → terminal shell → command bar → main board → insight card → right panel → evidence system → mobile → dashboard/passport/lab

### § 8.1-K: Source-Native Evidence System
- **Answer-First Architecture:** Conclusion → Why → Evidence → Sources → Deep Dive (강제 순서)
- **불변 규칙 6개:** 결론만/근거만 금지, 출처 항상 visible + clickable, 동일 구조, 시각 위계 강제
- **컴포넌트:**
  - `VerdictHeader`: direction · label · confidence · freshness · **Sources N 인라인 배지** (클릭→CitationDrawer)
  - `ActionStrip`: 동사 지침 3개 이내 + invalidation level
  - `EvidenceCard`: metric · value · delta · interpretation · source count (클릭→Metrics탭 점프)
  - `EvidenceGrid`: 2×2 또는 3×2
  - `WhyPanel`: 해석 2–4줄
  - `CounterEvidenceBlock`: 찬성/반대 2-col (Perplexity 신뢰 보강)
  - `SourcePill`: label · category · freshness
  - `SourceRow`: 항상 visible, 스크롤 뒤 숨김 금지
  - `CitationDrawer`: source name · type · updated · symbol · TF · raw values · method · link
  - `FreshnessBadge`: Live/Recent/Delayed/Stale (소스별 독립)
  - `MetricPanel`: 상세 차트 + raw + z-score + calculation note
- **소스 카테고리 4종:** Market Data(blue) / Derived Metrics(amber) / News(gray) / AI Inference(violet)
- **Chart as Evidence Canvas:** entry zone · invalidation · liquidation cluster · news marker · AI signal — 각 마커 클릭 → 우측패널 해당 탭 직접 라우팅
- **구현 순서:** SourcePill → FreshnessBadge → SourceRow → EvidenceCard → EvidenceGrid → VerdictHeader → ActionStrip → WhyPanel → CounterEvidenceBlock → CitationDrawer → MetricPanel

### § 10A: Cogochi Agent Architecture
- Chatbot → Agent 전환: PERCEIVE+ACT만 있는 현재 → THINK/PLAN/OBSERVE/REFLECT 추가
- ReAct Core Loop, Orchestrator + Market/Risk/Macro sub-agents
- Tool Library: monolithic `analyze()` → 10개 atomic tools
- Memory 4레이어: Working / Episodic(Supabase) / Semantic(vector) / Procedural
- Monitor Agent: 30초 루프, OI spike/Funding 극단치/Volume spike/Liquidation cascade 감지
- Phase 1(1~2주): tool 분리 + planning layer, Phase 2: memory + monitor, Phase 3: multi-agent

### § 8.1-L: Terminal Agent UI
- Agent Status Bar (Monitoring N assets · alerts)
- Agent Feed (Left Rail): 자율 감지 이벤트 스트림
- Reasoning Chain (Right Panel): plan steps 실시간 표시, 완료 후 5탭으로 전환
- Intent Dock (Bottom): Goal 입력 + quick goal chips

### § 8.1-M: Terminal P0/P1 Fix Spec (CTO 진단)
**P0 버그 (코드 미구현):**
1. `buildAssetFromAnalysis()` 가짜 숫자 — RSI로 변동률 추정, 24h/24 계산 → null 처리로 교체
2. `setActiveTimeframe()` 미호출 — TF 버튼 클릭 시 store 업데이트 안 됨 → API 재호출 없음
3. worktree 빌드/서버 분리 — worktree 경로에서만 dev 서버 실행

**P1 (빈 패널):** Entry/Risk 탭 placeholder, Metrics 탭 비어 있음, Left Rail "Loading movers..." 항상

**데이터 갭:** 92개 feature 중 6~7개만 UI 도달 (86개 버려짐). DEPTH/AGG_TRADES/FORCE_ORDERS/Onchain UI 없음.

**Why:** 사용자가 Bloomberg/퀀트/거래소 운영자 관점으로 터미널 설계를 정의함. "AI answer UI + quant terminal UI + source transparency"를 합쳐야 한다는 방향.

**How to apply:** 새 에이전트가 terminal 관련 작업 시, §8.1-I/J/K/L/M + §10A가 현재 COGOCHI.md의 product truth임. **P0 버그 먼저 수정**: buildAssetFromAnalysis 가짜숫자 제거 → setActiveTimeframe 호출 추가 → Right Panel 탭 실제 데이터 연결. 코드 파일: `app/src/routes/terminal/+page.svelte`.
