# 📚 최종 문서 폴더 구조 (2026-04-25 완성)

완료된 문서 정리: **106개 파일** → 명확한 계층 구조로 정렬

---

## 🎯 구조 개요

```
/Users/ej/Projects/wtd-v2/
├── 📄 ROOT (12개) — 매일 읽는 정본
│   ├── -1_PRODUCT_PRD.md              (제품 PRD)
│   ├── 00_MASTER_ARCHITECTURE.md      (아키텍처)
│   ├── 00_Master_Reference.md         (마스터 참조 — 프로토콜+리서치+제품)
│   ├── 01_PATTERN_OBJECT_MODEL.md     (패턴 객체 모델)
│   ├── 02_ENGINE_RUNTIME.md           (엔진 런타임)
│   ├── 03_SEARCH_ENGINE.md            (검색/ML 파이프라인)
│   ├── 04_AI_AGENT_LAYER.md           (AI 에이전트)
│   ├── 05_VISUALIZATION_ENGINE.md     (시각화)
│   ├── 06_DATA_CONTRACTS.md           (데이터 계약)
│   ├── 07_IMPLEMENTATION_ROADMAP.md   (구현 로드맵)
│   ├── WTD_Cogochi_Final_Design_v1.md (통합 최종 설계)
│   └── README.md
│
├── docs/live/ (13개) — 코드 직결, 개발 진행 중
│   ├── architecture.md
│   ├── contracts.md
│   ├── core-loop-object-contracts.md
│   ├── app-route-inventory.md
│   ├── indicator-registry.md
│   ├── indicator-visual-design.md
│   ├── scanner-alerts.md
│   ├── autoresearch-ml.md
│   ├── multi-agent-execution-control-plane.md
│   ├── engine-pipeline.md
│   ├── pattern-engine-runtime.md
│   ├── refinement-methodology.md
│   └── flywheel-closure-design.md
│
├── docs/_archive/ (153개) — 역사, 참고, 원본 설계
│   ├── origins/ (109개)
│   │   ├── COGOCHI-20260413-1218.md   (최신 모놀리스)
│   │   ├── COGOCHI-20260413-1212.md
│   │   ├── WTD_Cogochi_Final_Design_v1.md (사본)
│   │   ├── Cogochi_Architecture_v1.docx.md
│   │   ├── Cogochi_AI_Researcher_Design_v1.docx.md
│   │   ├── Cogochi_Business_Analysis_v1.docx.md
│   │   ├── architecture-v1.md, v2-draft.md
│   │   ├── engine-runtime-v1.md
│   │   ├── core-loop-v1.md
│   │   ├── PRD_01~09_*.md (상세 PRD 파일들)
│   │   ├── PRD_05B~05N (11개 경쟁사 분석)
│   │   ├── 00_MASTER_ARCHITECTURE (1), (2) — 중복 제거됨
│   │   ├── 01_PATTERN_OBJECT_MODEL (1), (2) — 중복 제거됨
│   │   └── ... (40개 추가 레거시 파일들)
│   │
│   ├── split_prd/ (7개)
│   │   ├── core-loop.md
│   │   ├── core-loop-system-spec.md
│   │   ├── core-loop-agent-execution-blueprint.md
│   │   ├── core-loop-state-matrix.md
│   │   ├── core-loop-surface-wireframes.md
│   │   ├── surfaces.md
│   │   └── research-thesis.md
│   │
│   └── superseded_domains/ (30개)
│       ├── terminal*.md (3개)
│       ├── dashboard.md, lab.md
│       ├── chatops-pattern-review-surface.md
│       ├── refinement-*.md (3개)
│       ├── pattern-*.md (4개)
│       ├── engine-performance-benchmark-lab.md
│       ├── competitive-indicator-analysis-2026-04-21.md
│       ├── business-viability-and-positioning.md
│       ├── pages/ (6개 서페이스 문서)
│       └── ... (기타 10개)
│
├── docs/_business/ (비어있음, 예약됨)
│   └── (펀딩, 마케팅, 프로토콜 관련 — 추가 예정)
│
├── docs/_scratch/ (비어있음, 예약됨)
│   └── (임시, 세션 기반 파일들)
│
├── docs/decisions/ (12개) — ADR 유지
│   ├── ADR-000-operating-system-baseline.md
│   ├── ADR-001-engine-is-canonical.md
│   └── ... (10개 추가)
│
├── docs/runbooks/ (17개) — 운영 가이드 유지
│   ├── release-checklist.md
│   ├── cloud-scheduler-setup.md (새로 추가)
│   └── ... (15개 추가)
│
└── docs/generated/ (3개) — 자동 생성 (유지)
    └── research/*.json, *.md
```

---

## 📊 최종 통계

| 위치 | 개수 | 용도 |
|---|---|---|
| **Root** | 12 | 매일 읽는 정본 |
| **docs/live/** | 13 | 코드 직결, 개발 중 |
| **docs/_archive/origins/** | 109 | 원본 설계 & 모놀리스 |
| **docs/_archive/split_prd/** | 7 | 분할 PRD & 섹션 |
| **docs/_archive/superseded/** | 30 | 레거시 도메인 & 제품 문서 |
| **docs/_business/** | 0 | 예약됨 (펀딩/마케팅) |
| **docs/_scratch/** | 0 | 예약됨 (임시) |
| **docs/decisions/** | 12 | ADR (유지) |
| **docs/runbooks/** | 17 | 운영 가이드 (유지) |
| **docs/generated/** | 3 | 자동 생성 (유지) |
| **합계** | **252** | |

---

## ✅ 정리 작업 내역

### 제거됨 (폴더 정리)
- ❌ docs/product/ (모든 파일 이동)
- ❌ docs/domains/ (모든 파일 이동)
- ❌ docs/archive/ (모든 파일 이동)
- ❌ docs/research/ (모든 파일 이동)

### 중복 제거
- 45개 파일의 `(1)`, `(2)`, `(3)` 접미사 제거
- 최신 버전만 유지 (origins/ 폴더에 전체 버전 보관)

### 새로 생성
- `docs/_business/` (예약됨)
- `docs/_scratch/` (예약됨)
- Root 11개 파일 + WTD_Final_Design

### 통합 설계 문서
- `00_Master_Reference.md` — 프로토콜(03) + 리서치(01) + 제품 표면 합본
- `WTD_Cogochi_Final_Design_v1.md` — AI Researcher + CTO 관점 통합 설계

---

## 🔑 주요 파일 설명

### Root 정본 (매일 읽음)
1. **-1_PRODUCT_PRD.md** — 제품 정의, 기능 우선순위
2. **00_MASTER_ARCHITECTURE.md** — 시스템 아키텍처, 3-surface 모델
3. **00_Master_Reference.md** — 메타 인덱스 (프로토콜+리서치+제품)
4. **01_PATTERN_OBJECT_MODEL.md** — 패턴 저장/조회 데이터 모델
5. **02_ENGINE_RUNTIME.md** — 엔진 런타임, 29개 building blocks
6. **03_SEARCH_ENGINE.md** — 검색 파이프라인, ML 유사 패턴 찾기
7. **04_AI_AGENT_LAYER.md** — 다중 에이전트 협력 제어 평면
8. **05_VISUALIZATION_ENGINE.md** — 10개 archetype 지표 설계
9. **06_DATA_CONTRACTS.md** — 데이터 계약, API 응답 스키마
10. **07_IMPLEMENTATION_ROADMAP.md** — 구현 로드맵
11. **WTD_Cogochi_Final_Design_v1.md** — Scan→Chat→Judge→Train→Deploy 플로우

### Code-Coupled 문서 (docs/live)
- 코드 변경 시 함께 업데이트되는 계약 & 런타임 문서
- 13개 파일이 app/, engine/ 코드와 직접 연결

### 원본 설계 (docs/_archive/origins)
- **COGOCHI-20260413-1218.md** — 최신 모놀리스 (134KB)
- **COGOCHI-20260413-1212.md** — 이전 버전
- **Cogochi_*.docx.md** — 다양한 관점의 설계 (Architecture, AI Researcher, Business)
- **PRD_01~09** — 상세 PRD 분류
- **PRD_05B~05N** — 11개 경쟁사 분석 (Bybit, TradingView, Coinalyze 등)

### 분할 PRD (docs/_archive/split_prd)
- 원본 Cogochi 모놀리스의 섹션 별 분할본
- 7개 파일로 논리적 영역 정리

### 레거시 도메인 (docs/_archive/superseded)
- Terminal, Dashboard, Lab 등 서페이스별 구 설계
- Refinement, Pattern ML, Evaluation 등 기술 영역
- 경쟁사 분석, 사업성 분석

---

## 🚀 읽기 순서 권장

### 신규 팀원
1. `README.md` (프로젝트 개요)
2. `-1_PRODUCT_PRD.md` (제품이란 무엇인가)
3. `00_MASTER_ARCHITECTURE.md` (어떻게 만드는가)
4. `00_Master_Reference.md` (프로토콜은 무엇인가)

### 엔지니어
1. `00_MASTER_ARCHITECTURE.md`
2. `docs/live/` 내 관련 파일
3. `docs/decisions/` ADR
4. 필요시 `docs/_archive/origins/` 원본 설계

### 제품/비즈니스
1. `-1_PRODUCT_PRD.md`
2. `00_Master_Reference.md` (프로토콜 섹션)
3. `docs/_archive/origins/Cogochi_Business_Analysis_v1.docx.md`
4. `docs/_archive/split_prd/` (상세 기능 명세)

### 투자자/파트너
1. `00_Master_Reference.md`
2. `docs/_archive/origins/Cogochi_Business_Analysis_v1.docx.md`
3. `docs/_archive/origins/vc_deep_dive_report.md`
4. `docs/_archive/origins/02_Pitch_Deck.md`

---

## 🔄 유지보수

- **Root 파일 추가**: 매일 참조할 정도의 높은 우선순위만
- **docs/live 추가**: 코드와 동시에 변경되는 문서
- **docs/_archive/** 활용: 결정/설계 이력 보존
- **docs/_business/**, **docs/_scratch/**: 필요시 활성화

---

## ✨ 최종 특징

✅ **명확성**: 11-12개의 핵심 문서 + 계층화된 아카이브
✅ **추적성**: 모든 원본 설계 & 버전 보존
✅ **효율성**: 레거시 폴더 정리로 탐색 용이
✅ **확장성**: _business, _scratch 예약 영역
✅ **통합성**: 마스터 참조 문서로 전체 맥락 파악

