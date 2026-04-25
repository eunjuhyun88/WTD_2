# HOOT UX 통합 — 남은 작업 실행 계획

## Context
Phase 1 (store 아키텍처 + shell 정규화)은 다른 에이전트가 완료함 (main에 머지됨).
현재 `claude/great-mclean` 브랜치에서 머지 없이 작업 계속.
유저 지적: "탭/위치/간격/동작 안 하는 것 수정 + 리팩토링 + 최적화"

## 이미 완료된 것 (main에 있음)
- protocolEventStore (26 이벤트 + UI 효과 매핑)
- stageStore → stageGateStore (4단계 preview-first, derived from jobStore/modelPublishStore/nodeStore)
- modalStore + txFlowStore (글로벌 모달 레지스트리)
- walletModalStore + WalletModal.svelte
- FixtureRuntimeModal.svelte
- NavBar → 72px 고정 SidebarRail
- Router 확장 (research-lab, node-sale, pipeline, phase 파라미터)
- App.svelte grid 72px, stage guard 제거

---

## Step 1: UI 버그/간격 수정 [M]

현재 보이는 이슈들:
- NavBar `.rail-link` dead CSS (Vite 경고 5개)
- 사이드바 탭 간격/크기 최적화 (현재 desktop-rail width 72px이지만 내부 아이템 간격이 빡빡)
- dev 서버에서 각 페이지 이동 테스트 → 동작 안 하는 버튼/링크 수정
- Svelte 경고 정리

**수정 파일:**
- `src-svelte/lib/layout/NavBar.svelte` — dead CSS 제거, 간격 조정
- `src-svelte/App.svelte` — 필요 시 grid 미세 조정

**검증:** dev server에서 5개 페이지 모두 클릭 이동 + 스크린샷 확인

---

## Step 2: Studio 기능 구현 [XL]

### 2.1 IDLE 상태 — Research Config Form
- 토픽 입력 → [→] 클릭 → Training Mode 카드 노출
- **목적 기반 레이블**: "데이터 분류기 만들기" / "처음부터 AI 만들기" / "기존 AI 개선하기" / "전문가 AI 만들기"
- Model Size 선택 (300M / 1B / 3B)
- Branches 카운터 (+/-)
- Target Metric 선택
- Execution 모드 (Demo/Network)
- Cost preview grid
- [Start Research →] → researchStart 확인 모달 → txFlowStore

**수정 파일:**
- `src-svelte/lib/pages/ResearchPage.svelte` — BROWSE 상태 확장
- `src-svelte/lib/pages/home/GuestHomeSurface.svelte` — 검색바 연동 수정 필요 시

### 2.2 RUNNING 상태 — 컨트롤 와이어링
- [⏸ Pause] / [■ Stop] 버튼 동작 확인
- Branch Boost/Pause 카테고리 컨트롤
- 자동 전환: complete → 3초 후 TESTING
- Budget 소진/노드 0개/전체 crash 배너

**수정 파일:**
- `src-svelte/lib/components/studio/ResearchRunning.svelte` — 컨트롤 와이어링

### 2.3 COMPLETE 상태 — 결과 화면
- Branch Performance 리더보드
- Top Experiments 리스트
- Playground 인라인
- [Publish Model →] CTA

**수정 파일:**
- `src-svelte/lib/components/studio/ResearchComplete.svelte`

### 2.4 PUBLISH — 4단계 위저드
- Step 1: Model Card Review
- Step 2: VTR Registration → txFlowStore
- Step 3: 처리 중 (VTRDeterministic → ModelNFTMinted)
- Step 4: 완료 (엔드포인트 + API Key)

**수정 파일:**
- `src-svelte/lib/components/studio/StudioPublish.svelte`

---

## Step 3: Home 재설계 [L]

### 3.1 Guest (미연결)
- 중앙 히어로: 🦉 + "HOOT Protocol" + 검색바 (max-width 480px)
- Actor 카드 2×2: Builder / Compute Node / Contributor / Buyer
- 지갑 연결 → WalletModal

### 3.2 Member (연결됨)
- 메트릭 스트립 (NODES, GPUs, MODELS, TVL)
- Stage 진행 탭 (Setup → Training → Model Ready → Published → Earning)
- 중복 CTA 제거 (Stage 탭이 대체)
- Recent Activity

**수정 파일:**
- `src-svelte/lib/pages/home/GuestHomeSurface.svelte`
- `src-svelte/lib/pages/home/MemberHomeSurface.svelte`
- `src-svelte/lib/pages/home/view.ts`

---

## Step 4: Models + Model Detail [L]

### 4.1 Models Hub
- My Created / My Used / Trending 섹션
- 카드 3열, hover → [Deploy]
- 검색 + 카테고리 탭

### 4.2 Model Detail
- 탭 순서: Playground → Benchmark → Model Card → Experiments → API
- VTR 격리 배너
- [Use this model ▾] 드롭다운
- Routing 토글

**수정 파일:**
- `src-svelte/lib/pages/ModelsPage.svelte`
- `src-svelte/lib/pages/models/ModelsCatalog.svelte`
- `src-svelte/lib/pages/ModelDetailPage.svelte`

---

## Step 5: Network + Protocol [L]

### 5.1 Network
- 점진적 탭: 미등록=My GPU만 → 등록 후=+Jobs/Bond → Notary=역할 등록 후
- NodeCard 정리
- Swarms/Feed를 접는 섹션으로

### 5.2 Protocol
- 4탭: Overview / My Activity / Contribute / Operators
- 기존 패널 재배치

**수정 파일:**
- `src-svelte/lib/pages/NetworkView.svelte`
- `src-svelte/lib/pages/network/*`
- `src-svelte/lib/pages/ProtocolPage.svelte`
- `src-svelte/lib/pages/EconomicsPage.svelte`

---

## 검증
- 매 커밋: `npm run build` 통과
- Step 완료: dev server + preview_screenshot로 시각 확인
- 전체 완료: 5개 페이지 모두 데스크탑/모바일 확인
