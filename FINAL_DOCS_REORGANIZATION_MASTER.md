# 📁 최종 문서 정리 전략 — _temp_cogochi 106개 + 기존 docs 통합

**현황:**
- `docs/_temp_cogochi/`: 106개 파일 (최신, 정본)
- `docs/`: 기존 분산된 파일들 (구식)

**목표:**
- 정본: Root 11개 (9-Doc + 마스터)
- live: 12개 (코드 직결)
- _archive: 60+ (설계/PRD/원본)
- _business: 6개 (펀딩/마케팅)
- _scratch: 11개 (임시)
- 기존 docs: 아예 새로 rebuild

---

## 🎯 최종 구조

### ROOT (11개) — 매일 보는 정본

```
-1_PRODUCT_PRD.md                        ← 프로덕트 brief
00_MASTER_ARCHITECTURE.md                ← 아키텍처 정본
00_Master_Reference.md                   ← 마스터 참조 (프로토콜+리서치+앱 합본)
01_PATTERN_OBJECT_MODEL.md               ← 패턴 객체 모델
02_ENGINE_RUNTIME.md                     ← 엔진 런타임
03_SEARCH_ENGINE.md                      ← 검색 엔진
04_AI_AGENT_LAYER.md                     ← AI 에이전트
05_VISUALIZATION_ENGINE.md               ← 시각화
06_DATA_CONTRACTS.md                     ← 데이터 계약
07_IMPLEMENTATION_ROADMAP.md             ← 구현 로드맵
WTD_Cogochi_Final_Design_v1.md           ← 최종 통합 설계 (참고용)
```

### docs/live/ (12개) — 코드 직결, 개발 중 갱신

```
(기존 docs/live/ 구조 유지)
- contracts.md
- app-route-inventory.md
- architecture.md
- ... (12개 총)
```

### docs/_archive/ (60+개)

#### origins/ — 원본 설계/모놀리스

```
_archive/origins/
├── COGOCHI-20260413-1218.md               (최신 모놀리스, 134KB)
├── COGOCHI-20260413-1212.md               (전 버전)
├── Cogochi_Architecture_v1.docx.md        (아키텍처)
├── Cogochi_AI_Researcher_Design_v1.docx.md (기술 설계)
├── Cogochi_Business_Analysis_v1.docx.md   (비즈니스)
├── COGOCHI_기능명세서_v1.md               (기능명세)
├── architecture-v1.md (67KB)              (구 아키텍처)
├── architecture-v2-draft.md (34KB)        (구 아키텍처 v2)
├── engine-runtime-v1.md (82KB)            (구 런타임)
├── core-loop-v1.md (61KB)                 (구 코어루프)
├── product-prd-v1.md (54KB)               (구 PRD)
├── cogochi-v7.md (42KB)                   (구 설계 v7)
└── cogochi_pattern_engine.docx.md         (구 엔진 명세)
```

#### split_prd/ — 상세 PRD

```
_archive/split_prd/
├── PRD_01_USER_PERSONA.md
├── PRD_02_USER_SCENARIOS.md
├── PRD_03_FEATURE_PRIORITY.md
├── PRD_04_SUCCESS_METRICS.md
├── PRD_05_COMPETITIVE_ANALYSIS.md
├── PRD_05B_COMPETITIVE_DEEP_DIVE.md
├── PRD_05C~05N (경쟁사 11개 상세)
├── PRD_06_LAUNCH_PLAN.md
├── PRD_07_ONBOARDING_FLOW.md
├── PRD_08_PRICING_VALIDATION.md
├── PRD_09_INTEGRATION_SPEC.md
└── deep-research-report.md
```

#### superseded_domains/ — 흡수된 도메인 (기존 docs/)

```
_archive/superseded_domains/
├── (기존 docs/domains/* 파일들 이동)
├── (기존 docs/product/* 파일들 이동)
└── (기존 docs/archive/* 파일들 이동)
```

### docs/_business/ (6개) — 펀딩/마케팅/온체인

```
_business/
├── 00_Master_Reference.md (프로토콜 부분 참고)
├── 01_Research_Dossier.md (리서치)
├── 03_Whitepaper_Lite.md (프로토콜)
├── 04_Tokenomics.md (토크노믹스)
├── 05b_L2_Router_Vault_Spec.md (온체인)
├── 08_Virtuals_Agent_Manifest.md
├── 09_X_Content_Playbook.md
├── 10_Signal_Publishing_Pipeline.md
└── vc_deep_dive_report.md + vc_moat_report.md
```

### docs/_scratch/ (11개) — 임시/세션

```
_scratch/
├── CLAUDE_1.md
├── H1_PARALLEL_VERIFICATION_PLAN.md
├── curious-stargazing-squirrel.md
├── ... (에이전트 세션 파일들)
└── (임시 파일들)
```

### docs/decisions/ — 유지 (9개)

```
(기존 ADR 유지)
```

### docs/runbooks/ — 유지 (17개)

```
(기존 runbook 유지)
```

---

## 🔧 정리 단계

### Step 1: 중복 제거

```bash
# (1), (2) 파일들 → 최신 버전만 유지
# 예: 00_MASTER_ARCHITECTURE (1), (2) 제거
#    → 00_MASTER_ARCHITECTURE.md만 유지
```

### Step 2: Root로 파일 이동

```bash
_temp_cogochi/에서:
  -1_PRODUCT_PRD.md                       → root/
  00_MASTER_ARCHITECTURE.md               → root/
  00_Master_Reference.md                  → root/
  01_PATTERN_OBJECT_MODEL.md              → root/
  02_ENGINE_RUNTIME.md                    → root/
  03_SEARCH_ENGINE.md                     → root/
  04_AI_AGENT_LAYER.md                    → root/
  05_VISUALIZATION_ENGINE.md              → root/
  06_DATA_CONTRACTS.md                    → root/
  07_IMPLEMENTATION_ROADMAP.md            → root/
  WTD_Cogochi_Final_Design_v1.md          → root/ (참고용)
```

### Step 3: docs/_archive/ 재구성

```bash
# origins/: 큰 설계 파일들 (13개)
# split_prd/: PRD 상세 (21개)
# superseded_domains/: 기존 docs/* 통합 (30+개)
```

### Step 4: docs/_business/ 생성

```bash
# 펀딩/마케팅/온체인 관련 (9개)
```

### Step 5: docs/_scratch/ 생성

```bash
# 임시 세션 파일들 (11개)
```

### Step 6: 기존 docs/ → archive로 이동

```bash
# docs/product/* → _archive/superseded_domains/
# docs/domains/* → _archive/superseded_domains/
# docs/archive/* → _archive/superseded_domains/
# docs/research/* → _archive/superseded_domains/
```

---

## 📊 최종 파일 분포

| 위치 | 개수 | 용도 |
|---|---|---|
| Root | 11 | 매일 읽는 정본 |
| docs/live/ | 12 | 코드 직결 (유지) |
| docs/_archive/ | 60+ | 역사/참고 |
| docs/_business/ | 9 | 펀딩/마케팅 |
| docs/_scratch/ | 11 | 임시/세션 |
| docs/decisions/ | 9 | ADR (유지) |
| docs/runbooks/ | 17 | 가이드 (유지) |
| **총합** | **129** | |

---

## ⚠️ 주의사항

1. **README 파일들 (3개)** → 삭제 또는 단일 파일로 통합
2. **COGOCHI_기능명세서** → 중복 제거 (docx, txt, md 중 md만 유지)
3. **00_Master_Reference.md** → Root에 두기 (마스터 참조용)
4. **기존 docs/ 파일들** → 완전히 새로운 구조로 rebuild

---

## 🚀 실행 커맨드 (단계별)

### 1단계: 백업
```bash
cd /Users/ej/Projects/wtd-v2
tar -czf docs_backup_20260425.tar.gz docs/
```

### 2단계: _temp_cogochi에서 정본 선별
```bash
cd docs/_temp_cogochi

# 중복 제거
rm -f "00_MASTER_ARCHITECTURE (1).md" "00_MASTER_ARCHITECTURE (2).md"
rm -f "01_PATTERN_OBJECT_MODEL (1).md" "01_PATTERN_OBJECT_MODEL (2).md"
# ... (모든 (1)(2) 파일 제거)

# README 통합
cat README*.md > ../README_CONSOLIDATED.md
rm -f README*.md
```

### 3단계: Root로 파일 이동
```bash
# (위 Step 2 실행)
```

### 4단계: 폴더 구조 생성
```bash
mkdir -p docs/_archive/{origins,split_prd,superseded_domains}
mkdir -p docs/_business
mkdir -p docs/_scratch
```

### 5단계: 파일 분류
```bash
# origins/
mv docs/_temp_cogochi/COGOCHI-*.md docs/_archive/origins/
mv docs/_temp_cogochi/architecture-*.md docs/_archive/origins/
# ... (계속)

# split_prd/
mv docs/_temp_cogochi/PRD_*.md docs/_archive/split_prd/
# ... (계속)

# _business/
mv docs/_temp_cogochi/*Tokenomics*.md docs/_business/
# ... (계속)

# _scratch/
mv docs/_temp_cogochi/*curious*.md docs/_scratch/
# ... (계속)
```

### 6단계: 기존 docs/* 정리
```bash
mv docs/product/* docs/_archive/superseded_domains/
mv docs/domains/* docs/_archive/superseded_domains/
mv docs/archive/* docs/_archive/superseded_domains/
```

---

## ✅ 검증 체크리스트

- [ ] Root: 11개 파일 (정본)
- [ ] docs/live/: 12개 파일 (코드 직결)
- [ ] _archive/origins/: 13개 (설계 원본)
- [ ] _archive/split_prd/: 21개 (PRD)
- [ ] _archive/superseded/: 30+개 (기존 docs)
- [ ] _business/: 9개 (펀딩)
- [ ] _scratch/: 11개 (임시)
- [ ] 중복 파일 없음
- [ ] 삭제 금지 (git에만 남김)
- [ ] README 통합됨

---

## 💡 다음 단계

1. 이 계획 검토 (뭔가 빠진 게 있나?)
2. 자동 실행 스크립트 생성
3. 실행 (20-30분)
4. 검증
5. Commit + PR

**사용자 확인:**
1. 이 구조가 맞나?
2. 빠진 파일 카테고리가 있나?
3. Root의 11개 파일이 맞나? (WTD_Final_Design 추가할까?)
