# 📊 설계 문서 전체 비교 분석

**목적:** 현재 폴더 vs Downloads/2222 설계 문서들 비교 → 최종 정리 방향 결정

---

## 🔍 현재 폴더의 주요 설계 문서 (20+ 개)

### Group 1: Architecture & System Design (6개)

| 파일 | 위치 | 내용 | 버전 | 상태 |
|---|---|---|---|---|
| `architecture.md` | docs/ | 시스템 아키텍처 | 현재 | ✅ 유지 (docs/live로) |
| `Cogochi_Architecture_v1.docx.md` | _temp_cogochi | 아키텍처 설계 | v1 | ❓ |
| `WTD_Cogochi_Final_Design_v1.md` | _temp_cogochi | 통합 설계 | v1 | ❓ |
| `Cogochi_AI_Researcher_Design_v1.docx.md` | _temp_cogochi | AI 연구자 기술 설계 | v1 | ❓ |
| `pattern-engine-runtime.md` | docs/domains | 패턴 엔진 런타임 | 현재 | ✅ 유지 |
| `engine-pipeline.md` | docs/domains | 엔진 파이프라인 | 현재 | ✅ 유지 |

### Group 2: Pattern & Core Loop (8개)

| 파일 | 위치 | 내용 | 상태 |
|---|---|---|---|
| `core-loop.md` | docs/product | 핵심 루프 정의 | 흡수됨 (archive) |
| `core-loop-system-spec.md` | docs/product | 시스템 스펙 | 흡수됨 (archive) |
| `core-loop-object-contracts.md` | docs/domains | 객체 계약 | ✅ live로 |
| `core-loop-route-contracts.md` | docs/domains | 라우트 계약 | 흡수됨 (archive) |
| `core-loop-state-matrix.md` | docs/product | 상태 매트릭스 | 흡수됨 (archive) |
| `core-loop-surface-wireframes.md` | docs/product | 와이어프레임 | 흡수됨 (archive) |
| `core-loop-agent-execution-blueprint.md` | docs/product | 에이전트 실행 | 흡수됨 (archive) |
| `pattern-engine-runtime.md` | docs/domains | 패턴 엔진 | ✅ live로 |

### Group 3: Product Design & Spec (10개)

| 파일 | 위치 | 내용 | 상태 |
|---|---|---|---|
| `brief.md` | docs/product | 프로덕트 브리프 | ✅ Root (-1_PRODUCT_PRD.md) |
| `research-thesis.md` | docs/product | 연구 논문 | 흡수됨 (archive) |
| `surfaces.md` | docs/product | 서페이스 정의 | 흡수됨 (archive) |
| `business-viability-and-positioning.md` | docs/product | 사업성 분석 | 흡수됨 (archive) |
| `indicator-visual-design.md` | docs/domains | 지표 시각 설계 | ✅ Root + live로 |
| `indicator-visual-design-v2.md` | docs/product | 지표 시각 설계 v2 | 흡수됨 (archive) |
| `flywheel-closure-design.md` | docs/product | 플라이휠 설계 | ✅ live로 |
| `terminal-attention-workspace.md` | docs/product | 터미널 워크스페이스 | 흡수됨 (archive) |
| `verdict-inbox-ux.md` | docs/product | 판정 수신함 UX | 흡수됨 (archive) |
| `competitive-indicator-analysis-2026-04-21.md` | docs/product | 경쟁사 분석 | 흡수됨 (archive) |

### Group 4: Domain-Specific (20+ 개)

| 파일 | 내용 | 상태 |
|---|---|---|
| `contracts.md` | 데이터 계약 | ✅ live로 |
| `autoresearch-ml.md` | ML 파이프라인 | ✅ live로 |
| `multi-agent-execution-control-plane.md` | 에이전트 협업 | ✅ live로 |
| `terminal.md`, `terminal-backend-mapping.md`, `terminal-ai-scan-architecture.md` | 터미널 스펙 | 흡수됨 (archive) |
| `dashboard.md`, `lab.md` | 서페이스 상세 | 흡수됨 (archive) |
| `scanner-alerts.md` | 스캐너 알림 | ✅ live로 |
| `refinement-methodology.md`, `refinement-operator-control-plane.md`, `refinement-policy-and-reporting.md` | 개선 방법론 | ✅ + 흡수 섞임 |
| `pattern-ml.md`, `pattern-draft-query-transformer.md`, `pattern-wiki-compiler.md` | 패턴 ML | 흡수됨 (archive) |
| `coin-screener.md`, `cogochi-market-data-plane.md` | 스크리너/마켓 데이터 | 흡수됨 (archive) |

### Group 5: Archive Cogochi Split (8개)

```
docs/archive/cogochi/
├── 00-preface-and-status-patch.md
├── 01-sections-00-through-07.md
├── 02-section-08-per-surface-spec.md
├── 03-sections-09-10-10a.md
├── 04-section-11-data-contracts.md
├── 05-sections-12-through-15.md
├── 06-section-16-home-landing.md
└── 07-sections-17-through-20-appendix.md
```

상태: 이미 분할됨 (archive에)

---

## 📥 Downloads/2222 의 4개 파일

| 파일 | 내용 | 크기 | 버전 | 평가 |
|---|---|---|---|---|
| **Cogochi_Business_Analysis_v1.docx.md** | 투자자/펀딩 논리 | ? | v1 | 펀딩용 (docs/_business/) |
| **Cogochi_Architecture_v1.docx.md** | 시스템 아키텍처 설계 | ? | v1 | ❓ 현재 docs/architecture.md와 비교 필요 |
| **Cogochi_AI_Researcher_Design_v1.docx.md** | AI 리서처 기술 설계 | ? | v1 | ❓ 현재 docs와 비교 필요 |
| **WTD_Cogochi_Final_Design_v1.md** | 통합 최종 설계 | ? | v1 | ❓ "Final"이므로 정본일 가능성? |

---

## ❓ 핵심 비교 질문

### Q1: Cogochi_Architecture_v1 vs docs/architecture.md

**어느 게 더 최신? 더 상세?**

검증 필요:
```bash
# 파일 크기 비교
ls -lh docs/architecture.md docs/_temp_cogochi/Cogochi_Architecture_v1.docx.md

# 내용 비교
head -50 docs/architecture.md
head -50 docs/_temp_cogochi/Cogochi_Architecture_v1.docx.md
```

**예상:**
- `docs/architecture.md` — 현재 코드 상태 반영
- `Cogochi_Architecture_v1.docx.md` — 과거 설계 문서

**결정:** docs/architecture.md를 live로, v1은 archive/origins로

---

### Q2: WTD_Cogochi_Final_Design_v1 의 위치?

**"Final Design"이므로 정본인가?**

검증:
- 파일 크기: 몇 줄?
- 내용: 통합된 건가 아니면 분할된 건가?
- 시간: docs/product/* 파일들보다 최신인가?

**예상:** Final이지만 여전히 v1. WTD-Cogochi 통합 설계로 보임.

**결정:** origins (정본 원본)로, 9-Doc 대신 이 파일을 reference로 삼을까?

---

### Q3: Cogochi_AI_Researcher_Design_v1 의 위치?

**내용:** AI 리서처 관점의 기술 설계

검증:
- docs에 유사 파일 있나? (autoresearch-ml.md? research-thesis.md?)
- 얼마나 상세?

**결정:** 기술 설계 원본으로 origins로 분류

---

## 📋 최종 정리 방향 제안

### BEFORE (현재 계획: FILE_CLASSIFICATION_PLAN.md)

```
Group A: Root (9-Doc 원본)
  -1_PRODUCT_PRD.md          ← docs/product/brief.md
  00_MASTER_ARCHITECTURE.md  ← docs/architecture.md
  01~07 (7개)

Group B: docs/live/ (12개, 코드 직결)

Group C: docs/_archive/
  ├── origins/ (원본)
  ├── split_prd/ (split Cogochi)
  └── superseded/ (흡수된 도메인)

Group D: docs/_business/ (펀딩용)
```

---

### AFTER (제안: Downloads 4개 통합)

**옵션 A: 현재 계획 유지 + Downloads 4개 추가**

```
Group A: Root (9-Doc 원본)
  ± WTD_Cogochi_Final_Design_v1.md를 reference로 추가할까?

Group C: docs/_archive/origins/
  ├── WTD_Cogochi_Final_Design_v1.md          (정본 원본)
  ├── Cogochi_Architecture_v1.docx.md         (아키텍처 원본)
  ├── Cogochi_AI_Researcher_Design_v1.docx.md (기술 설계 원본)
  └── Cogochi_Business_Analysis_v1.docx.md    (펀딩 분석 원본)

Group D: docs/_business/
  └── Cogochi_Business_Analysis_v1.docx.md (이동 또는 사본)
```

**옵션 B: WTD_Cogochi_Final_Design_v1을 Root에 추가**

만약 "Final Design"이 정말 정본이라면?

```
Root:
  ± 08_WTD_COGOCHI_FINAL_DESIGN.md  (또는 별도 파일)
  ± README_DOWNLOADS_INTEGRATION.md (Downloads 통합 설명)
```

---

## 🎯 지금 해야 할 일

1. **4개 파일 내용 분석**
   - 크기, 줄 수, 최신 여부
   - docs의 현재 파일들과 중복 정도

2. **버전 관계 파악**
   - Cogochi_Architecture_v1 vs docs/architecture.md
   - 어느 게 더 최신인가?
   - 어느 게 코드와 sync되어 있나?

3. **정책 결정**
   - Downloads 4개를 모두 origins에?
   - Business_Analysis를 _business/에도 사본?
   - Final_Design을 Root에 추가할까?

4. **FILE_CLASSIFICATION_PLAN 갱신**

5. **EXECUTE 스크립트 실행**

---

## 💡 다음 단계

**사용자 확인 필요:**

1. **WTD_Cogochi_Final_Design_v1이 정본인가?**
   - 맞으면 → Root에도 추가 가능
   - 아니면 → origins만

2. **Cogochi_Architecture_v1과 docs/architecture.md 관계?**
   - docs/architecture.md를 live로 유지할까?
   - 아니면 v1을 우선할까?

3. **Cogochi_Business_Analysis_v1**
   - _business/에만? 
   - 아니면 다른 위치?

**이것들 정해지면 최종 실행 스크립트 갱신 후 실행하자.**
