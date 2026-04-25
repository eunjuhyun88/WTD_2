# 📁 문서 정리 계획: 86개 파일 분류

**현재:** docs/ 안에 흩어짐 (product/, domains/, decisions/, runbooks/, archive/, research/, generated/)  
**목표:** Root 11개 + 4 폴더로 정리

---

## 📊 분류 결과

### Group A: ROOT (10개) — 매일 봄

```
NOW.md                           (새로 만들어야 함)
README.md                        (갱신)
-1_PRODUCT_PRD.md               ← docs/product/brief.md → 리네임
00_MASTER_ARCHITECTURE.md        ← docs/architecture.md
01_PATTERN_OBJECT_MODEL.md       ← docs/domains/core-loop-object-contracts.md
02_ENGINE_RUNTIME.md             ← docs/domains/pattern-engine-runtime.md
03_SEARCH_ENGINE.md              ← docs/domains/autoresearch-ml.md
04_AI_AGENT_LAYER.md             ← docs/domains/multi-agent-execution-control-plane.md
05_VISUALIZATION_ENGINE.md       ← docs/domains/indicator-visual-design.md
06_DATA_CONTRACTS.md             ← docs/domains/contracts.md
07_IMPLEMENTATION_ROADMAP.md     ← docs/runbooks/release-checklist.md
```

**액션:** Copy these 10 files from docs/ to root, rename accordingly

---

### Group B: docs/live/ (12개) — 코드 직결, Slice 진행 중 갱신

```
docs/live/
├── contracts.md                    ← docs/domains/contracts.md (원본 복사)
├── app-route-inventory.md          ← docs/domains/app-route-inventory.md
├── architecture.md                 ← docs/architecture.md (원본 복사)
├── indicator-registry.md           ← docs/domains/indicator-registry.md
├── indicator-visual-design.md      ← docs/domains/indicator-visual-design.md (원본 복사)
├── scanner-alerts.md               ← docs/domains/scanner-alerts.md
├── autoresearch-ml.md              ← docs/domains/autoresearch-ml.md (원본 복사)
├── flywheel-closure-design.md      ← docs/domains/flywheel-closure-design.md 또는 docs/product/flywheel-closure-design.md
├── refinement-methodology.md       ← docs/domains/refinement-methodology.md
├── engine-pipeline.md              ← docs/domains/engine-pipeline.md
├── pattern-engine-runtime.md       ← docs/domains/pattern-engine-runtime.md
└── multi-agent-execution-control-plane.md  ← docs/domains/multi-agent-execution-control-plane.md (원본 복사)
```

**액션:** 
```bash
mkdir -p docs/live
# 이 12개 파일을 docs/live/로 mv (domains/, product/ 에서)
```

---

### Group C: docs/_archive/ (53개) — 흡수된 원본, 옛 도메인 문서

#### C-1: 원본 v6/v7/WTD (11개) → docs/_archive/origins/

```
_archive/origins/
├── Cogochi_Architecture_v1.docx.md           ← Downloads/2222/
├── Cogochi_AI_Researcher_Design_v1.docx.md  ← Downloads/2222/
├── WTD_Cogochi_Final_Design_v1.md            ← Downloads/2222/
├── COGOCHI_pattern_engine_docx.md
├── COGOCHI_기능명세서_v1.txt
└── (기타 5개 예상)
```

#### C-2: 분할/드래프트 PRD (18개) → docs/_archive/split_prd/

```
_archive/split_prd/
├── docs/archive/cogochi/00-preface-and-status-patch.md
├── docs/archive/cogochi/01-sections-00-through-07.md
├── docs/archive/cogochi/02-section-08-per-surface-spec.md
├── docs/archive/cogochi/03-sections-09-10-10a.md
├── docs/archive/cogochi/04-section-11-data-contracts.md
├── docs/archive/cogochi/05-sections-12-through-15.md
├── docs/archive/cogochi/06-section-16-home-landing.md
├── docs/archive/cogochi/07-sections-17-through-20-appendix.md
├── docs/product/core-loop.md
├── docs/product/core-loop-system-spec.md
├── docs/product/core-loop-agent-execution-blueprint.md
├── docs/product/core-loop-object-contracts.md (사본 → live/)
├── docs/product/core-loop-route-contracts.md
├── docs/product/core-loop-state-matrix.md
├── docs/product/core-loop-surface-wireframes.md
├── docs/archive/surfaces.md
├── docs/product/surfaces.md
└── docs/product/research-thesis.md
```

#### C-3: 흡수된 도메인 문서 (27개) → docs/_archive/superseded_domains/

```
_archive/superseded_domains/
├── docs/domains/chatops-pattern-review-surface.md
├── docs/domains/cogochi-market-data-plane.md
├── docs/domains/coin-screener.md (⚠️ 주의: 검증 필요)
├── docs/domains/canonical-indicator-materialization.md
├── docs/domains/core-loop-route-contracts.md
├── docs/domains/dashboard.md
├── docs/domains/evaluation.md
├── docs/domains/engine-performance-benchmark-lab.md
├── docs/domains/engine-strengthening-methodology.md
├── docs/domains/lab.md
├── docs/domains/multi-timeframe-autoresearch-search.md
├── docs/domains/pattern-draft-query-transformer.md
├── docs/domains/pattern-ml.md
├── docs/domains/pattern-wiki-compiler.md
├── docs/domains/refinement-operator-control-plane.md
├── docs/domains/refinement-policy-and-reporting.md
├── docs/domains/terminal-ai-scan-architecture.md
├── docs/domains/terminal-backend-mapping.md
├── docs/domains/terminal-html-backend-parity.md
├── docs/domains/terminal.md
├── docs/product/business-viability-and-positioning.md
├── docs/product/competitive-indicator-analysis-2026-04-21.md
├── docs/product/indicator-visual-design-v2.md
├── docs/product/pages/* (5개)
├── docs/product/terminal-attention-workspace.md
├── docs/product/verdict-inbox-ux.md
└── docs/archive/legacy-doc-map.md
```

---

### Group D: docs/_business/ (13개) — 펀딩/마케팅 별도 트랙

```
_business/
├── (예상 Downloads에서)
├── Cogochi_YC_S26_application.md
├── Tokenomics.md
├── Product_spec_MVP.md
├── L2_Router_Vault_Spec.md
├── Virtuals_agent_manifest.md
├── X_content_playbook.md
├── Signal_publishing_pipeline.md
├── Pitch_deck.md
├── Whitepaper_lite.md
└── (기타 펀딩/마케팅 docs)
```

---

### Group E: docs/_scratch/ (4개) — 임시/개인

```
_scratch/
├── pure-brewing-umbrella.md      (⚠️ 개인 법무 문서 → 별도 보관 또는 삭제)
├── (기타 임시 파일)
```

---

### Group F: docs/decisions/ (9개) — ADR 유지

```
docs/decisions/
├── ADR-000-operating-system-baseline.md
├── ADR-001-engine-is-canonical.md
├── ... (8개 전체 유지)
```

유지. 아키텍처 결정은 이력이 중요.

---

### Group G: docs/runbooks/ (17개) — 실행 가이드 유지

```
docs/runbooks/
├── DEPLOYMENT-CHECKLIST.md
├── README.md
├── app-dev.md
├── cloud-run-app-deploy.md
├── ... (전체 17개 유지)
```

유지. 배포/운영에 필수.

---

## 📋 실행 명령어

### Step 1: Root 폴더 준비

```bash
cd /Users/ej/Projects/wtd-v2

# Group A 파일들을 root로 복사 + 리네임
cp docs/product/brief.md -1_PRODUCT_PRD.md
cp docs/architecture.md 00_MASTER_ARCHITECTURE.md
cp docs/domains/core-loop-object-contracts.md 01_PATTERN_OBJECT_MODEL.md
cp docs/domains/pattern-engine-runtime.md 02_ENGINE_RUNTIME.md
cp docs/domains/autoresearch-ml.md 03_SEARCH_ENGINE.md
cp docs/domains/multi-agent-execution-control-plane.md 04_AI_AGENT_LAYER.md
cp docs/domains/indicator-visual-design.md 05_VISUALIZATION_ENGINE.md
cp docs/domains/contracts.md 06_DATA_CONTRACTS.md
cp docs/runbooks/release-checklist.md 07_IMPLEMENTATION_ROADMAP.md

# NOW.md는 아직 구조 미정 (별도)
# README.md는 갱신 필요 (별도)
```

### Step 2: docs/live/ 생성

```bash
mkdir -p docs/live

# 12개 파일 move
mv docs/domains/contracts.md docs/live/
mv docs/domains/app-route-inventory.md docs/live/
mv docs/architecture.md docs/live/
mv docs/domains/indicator-registry.md docs/live/
mv docs/domains/indicator-visual-design.md docs/live/
mv docs/domains/scanner-alerts.md docs/live/
mv docs/domains/autoresearch-ml.md docs/live/
mv docs/domains/flywheel-closure-design.md docs/live/ 2>/dev/null || mv docs/product/flywheel-closure-design.md docs/live/
mv docs/domains/refinement-methodology.md docs/live/
mv docs/domains/engine-pipeline.md docs/live/
mv docs/domains/pattern-engine-runtime.md docs/live/
mv docs/domains/multi-agent-execution-control-plane.md docs/live/
```

### Step 3: docs/_archive/ 정리

```bash
# 폴더 생성
mkdir -p docs/_archive/origins
mkdir -p docs/_archive/split_prd
mkdir -p docs/_archive/superseded_domains

# C-1: 원본들 → origins (수동: Downloads에서 옮기거나 이미 있는 것들)
# C-2: Split PRD
mv docs/archive/cogochi/* docs/_archive/split_prd/
mv docs/product/core-loop*.md docs/_archive/split_prd/
mv docs/product/surfaces.md docs/_archive/split_prd/
mv docs/product/research-thesis.md docs/_archive/split_prd/
mv docs/archive/surfaces.md docs/_archive/split_prd/

# C-3: Superseded domains
mv docs/domains/chatops-pattern-review-surface.md docs/_archive/superseded_domains/
mv docs/domains/cogochi-market-data-plane.md docs/_archive/superseded_domains/
# ... (나머지 27개)
mv docs/product/business-viability-and-positioning.md docs/_archive/superseded_domains/
mv docs/product/competitive-indicator-analysis-2026-04-21.md docs/_archive/superseded_domains/
mv docs/product/indicator-visual-design-v2.md docs/_archive/superseded_domains/
mv docs/product/pages docs/_archive/superseded_domains/
mv docs/product/terminal-attention-workspace.md docs/_archive/superseded_domains/
mv docs/product/verdict-inbox-ux.md docs/_archive/superseded_domains/
mv docs/archive/legacy-doc-map.md docs/_archive/superseded_domains/
```

### Step 4: docs/_business/ 생성

```bash
mkdir -p docs/_business

# 펀딩/마케팅 docs (예상 Downloads + 현재 docs에 있는 것들)
# → 수동으로 해야 함 (어떤 파일이 펀딩/마케팅인지 확실하지 않음)
```

### Step 5: docs/_scratch/ 생성

```bash
mkdir -p docs/_scratch

# 임시 파일들 (예상)
# → 수동으로 해당 파일들 옮기기
```

---

## ⚠️ 주의사항

1. **coin-screener.md** — 713줄. 전체 product인지 단일 feature인지 확인 필요
   ```bash
   head -50 docs/domains/coin-screener.md
   ```

2. **pure-brewing-umbrella.md** — Cogochi와 무관한 개인 법무 문서. 별도 보관 또는 삭제

3. **flywheel-closure-design.md** — docs/domains/와 docs/product/ 모두에 존재. 하나만 유지

4. **중복 제거 후 검증**
   ```bash
   find docs/ -type f -name "*.md" | wc -l  # 정리 전
   # ... 정리 ...
   find docs/ -type f -name "*.md" | wc -l  # 정리 후 (86 → 80 정도 예상)
   ```

---

## 🎯 정리 후 구조

```
/Users/ej/Projects/wtd-v2/
├── README.md                      ← 갱신: "폴더 구조 가이드"
├── NOW.md                         ← 신규: "이번 주 작업"
├── -1_PRODUCT_PRD.md              ← brief.md 사본, 리네임
├── 00_MASTER_ARCHITECTURE.md
├── 01_PATTERN_OBJECT_MODEL.md
├── 02_ENGINE_RUNTIME.md
├── 03_SEARCH_ENGINE.md
├── 04_AI_AGENT_LAYER.md
├── 05_VISUALIZATION_ENGINE.md
├── 06_DATA_CONTRACTS.md
├── 07_IMPLEMENTATION_ROADMAP.md
│
├── docs/
│   ├── live/                      ← 새 폴더: 12개 (코드 직결)
│   ├── decisions/                 ← 기존: ADR 9개 (유지)
│   ├── runbooks/                  ← 기존: 가이드 17개 (유지)
│   ├── _archive/                  ← 재구성: 53개
│   │   ├── origins/               ← v6/v7/WTD 원본
│   │   ├── split_prd/             ← 흡수된 PRD
│   │   └── superseded_domains/    ← 흡수된 도메인
│   ├── _business/                 ← 새 폴더: 13개 (펀딩/마케팅)
│   ├── _scratch/                  ← 새 폴더: 4개 (임시)
│   ├── generated/                 ← 기존: 자동 생성 (유지)
│   └── README.md
│
├── engine/
├── app/
└── scripts/
```

---

## 📝 다음 단계

1. **사용자 확인:** 이 분류가 맞나? 수정할 거 있나?
2. **실행:** Step 1-5 명령어 실행
3. **검증:** 파일 개수 확인, 중복 제거 확인
4. **README 작성:** 새 폴더 구조 설명
5. **NOW.md 작성:** 이번 주 작업 (별도)

---

## 🔍 검증 체크리스트

- [ ] Root에 11개 파일 (README + NOW + -1 ~ 07)
- [ ] docs/live/ 12개 (코드 직결)
- [ ] docs/_archive/ 53개 (원본 + split + superseded)
- [ ] docs/_business/ 13개 (펀딩/마케팅)
- [ ] docs/_scratch/ 4개 (임시)
- [ ] docs/decisions/ 9개 (유지)
- [ ] docs/runbooks/ 17개 (유지)
- [ ] 중복 파일 없음 (mv로 move 완료)
- [ ] 삭제 금지 (git에만 남김)

