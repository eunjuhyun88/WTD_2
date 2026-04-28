# 파일 분류 목록 (84 files)

**작성:** 2026-04-25
**용도:** 너가 직접 폴더 옮기는 데 쓸 목록
**기준:** 9-Doc 정본 채택 후 각 파일의 운명

---

## 그룹 A — Root에 유지 (10개) ✅

이미 정본. 그대로 둠.

```
NOW.md                              ← 매일 봄
-1_PRODUCT_PRD.md                   ← 결정용
00_MASTER_ARCHITECTURE.md
01_PATTERN_OBJECT_MODEL.md
02_ENGINE_RUNTIME.md
03_SEARCH_ENGINE.md
04_AI_AGENT_LAYER.md
05_VISUALIZATION_ENGINE.md
06_DATA_CONTRACTS.md
07_IMPLEMENTATION_ROADMAP.md
```

**액션:** 없음

---

## 그룹 B — `live/` 폴더 (12개) 🟢

코드와 직결. 변경 시 같이 갱신되는 살아있는 문서. **Slice 1~12 진행 중에도 계속 참조**.

```
live/
├── contracts.md                       ← Slice 1에서 직접 참조 (canonical type homes)
├── app-route-inventory.md             ← Slice 1 113 routes 분류 근거
├── architecture.md                    ← 현재 코드 architecture 113줄 짧은 요약
├── README.md                          ← 폴더 설명용 (덮어쓰기 권장)
│
├── core-loop-object-contracts.md      ← Slice 1, 5에서 참조 (object 계약)
├── core-loop-route-contracts.md       ← Slice 1에서 참조 (route 계약)
│
├── indicator-registry.md              ← 코드 1:1 매핑된 indicator 정의
├── indicator-visual-design.md         ← Slice 7에서 참조 (visual spec)
│
├── flywheel-closure-design.md         ← Slice 4, 8 구현 근거
├── multi-agent-execution-control-plane.md  ← agent 협업 프로토콜 (control plane)
├── refinement-operator-control-plane.md    ← Slice 8 refinement
└── refinement-policy-and-reporting.md      ← Slice 8 정책
```

**액션:** `mkdir live && mv [위 12개] live/`

---

## 그룹 C — `_archive/v6_v7_origin/` (8개) 📦

이미 9-Doc에 흡수된 v6/v7/WTD 원본 통합 문서들. 충돌 검증 시 가끔 참조.

```
_archive/v6_v7_origin/
├── COGOCHI_v6_UNIFIED_DESIGN.md
├── cogochi-unified-design.md
├── cogochi-unified-design__1_.md
├── cogochi-unified-design__2_.md
├── cogochi-v7.md
├── WTD_Cogochi_Final_Design_v1.md
├── WTD-architecture.md
└── WTD-flow-and-structure.md
```

**액션:** `mkdir -p _archive/v6_v7_origin && mv [위 8개] _archive/v6_v7_origin/`

---

## 그룹 D — `_archive/split_drafts/` (16개) 📦

PRD가 split으로 나뉘어 있던 중간 단계. 이제 9-Doc에 흡수됨. README.md(legacy doc map)이 안내.

```
_archive/split_drafts/
├── 00-preface-and-status-patch.md
├── 00_FINAL_ORGANIZATION_REPORT_20260411.md
├── 00_home.md                 ← 9-Doc -1 §8 + 05에 흡수
├── 01-sections-00-through-07.md
├── 01_terminal.md             ← 9-Doc 05에 흡수
├── 02-section-08-per-surface-spec.md
├── 02_lab.md                  ← 9-Doc 05에 흡수
├── 03-sections-09-10-10a.md
├── 03_dashboard.md            ← 9-Doc 05에 흡수
├── 04-section-11-data-contracts.md
├── 04_shared_components.md    ← 9-Doc 05에 흡수
├── 05-sections-12-through-15.md
├── 05_scanner_alerts.md       ← 9-Doc 02 + 06에 흡수
├── 06-section-16-home-landing.md
├── 06_autoresearch_ml.md      ← 9-Doc 04에 흡수
├── 07-sections-17-through-20-appendix.md
├── legacy-doc-map.md          ← split copies map
└── COGOCHI_기능명세서_v1.txt
```

**액션:** `mkdir -p _archive/split_drafts && mv [위 18개] _archive/split_drafts/`

---

## 그룹 E — `_archive/superseded/` (15개) 📦

9-Doc에 직접 흡수되어 정본 자격 상실. 일부는 `live/`의 `core-loop-object-contracts.md` / `core-loop-route-contracts.md`만 살림.

```
_archive/superseded/
├── core-loop.md                       ← 06 §10에 흡수
├── core-loop-system-spec.md           ← 02, 06에 흡수
├── core-loop-agent-execution-blueprint.md  ← 04에 흡수
├── core-loop-state-matrix.md          ← 02 §2에 흡수
├── core-loop-surface-wireframes.md    ← 05에 흡수
│
├── architecture-v2-draft.md           ← 00, 02에 흡수 (현재 상태는 architecture.md 사용)
├── pattern-engine-runtime.md          ← 02에 흡수
├── pattern-ml.md                      ← 04 §8에 흡수
│
├── dashboard.md                       ← 9-Doc -1 §8.1, 05에 흡수
├── lab.md                             ← 9-Doc -1 §8.1, 05에 흡수
├── terminal.md                        ← 9-Doc -1 §8.1, 05에 흡수
├── surfaces.md                        ← 9-Doc -1 §8.1에 흡수
│
├── terminal-attention-workspace.md    ← 05 §8 workspace에 흡수
├── terminal-backend-mapping.md        ← 06에 흡수
├── terminal-html-backend-parity.md    ← deprecated migration plan
├── verdict-inbox-ux.md                ← 05 §7~§8에 흡수
│
├── engine-pipeline.md                 ← 02에 흡수 (63줄짜리 stub)
├── scanner-alerts.md                  ← 02 §3 + 06에 흡수
├── autoresearch-ml.md                 ← 04에 흡수
├── refinement-methodology.md          ← 07 §2 Slice 8에 흡수
│
├── multi-timeframe-autoresearch-search.md  ← 03 §11 Slice 11에 흡수
├── coin-screener.md                   ← 별개 product spec, 9-Doc 범위 밖
├── evaluation.md                      ← 02 §4 ledger에 흡수 (44줄)
├── brief.md                           ← -1 §1에 흡수 (34줄)
├── research-thesis.md                 ← -1 §7에 흡수 (18줄)
├── business-viability-and-positioning.md  ← -1 §4~§5에 흡수
└── competitive-indicator-analysis-2026-04-21.md  ← -1 §6에 흡수
```

**액션:** `mkdir -p _archive/superseded && mv [위 27개] _archive/superseded/`

⚠️ **주의: `coin-screener.md` (713줄)는 별개 product**일 수 있음. 옮기기 전에 첫 50줄 보고 결정. 별도 product면 `_business/`로.

---

## 그룹 F — `_business/` (13개) 💼

온체인/펀딩/마케팅 트랙. Day-1 코딩과 무관. **별도 트랙**으로 보관.

```
_business/
├── 01_Research_Dossier.md             ← VC 리서치
├── 02_Pitch_Deck.md                   ← 펀딩용
├── 03_Whitepaper_Lite.md              ← 프로토콜 백서
├── 03_Whitepaper_Lite__1_.md          ← 백서 v2
├── 04_Tokenomics.md                   ← 토큰 경제
├── 05_Product_Spec_MVP.md             ← MVP spec (프로토콜)
├── 05b_L2_Router_Vault_Spec.md        ← L2 vault
├── 08_Virtuals_Agent_Manifest.md      ← Virtuals pivot
├── 09_X_Content_Playbook.md           ← Twitter 마케팅
├── 10_Signal_Publishing_Pipeline.md   ← Signal publishing
├── Cogochi_YC_S26_Application_v2.md   ← YC 신청서
├── deep-research-report.md            ← YC corp AI 시장 분석
└── vc_deep_dive_report.md             ← Top 5 VC 테제 분석
```

**액션:** `mkdir _business && mv [위 13개] _business/`

---

## 그룹 G — `_scratch/` 또는 삭제 (4개) 🗑️

작업용 임시 파일. 안 봄.

```
_scratch/
├── pure-brewing-umbrella.md           ← 형사고소 제출세트 (개인 용무, 22줄)
├── quirky-honking-barto.md            ← UI 리디자인 250줄
├── serene-doodling-spindle.md         ← Full Stack Build Plan 596줄
└── indicator-viz-system-plan-2026-04-22.md  ← 작업 plan, 05에 흡수됨
```

**액션 1 (안전):** `mkdir _scratch && mv [위 4개] _scratch/`
**액션 2 (단호):** `rm [위 4개]` — 9-Doc에 다 흡수됨

`pure-brewing-umbrella.md`는 **개인 법무 문서**라 Cogochi 프로젝트와 무관. 다른 곳으로 옮기거나 삭제 권장.

---

## 분류 요약

| 그룹 | 위치 | 개수 | 의미 |
|---|---|---|---|
| A | root | 10 | 정본 (매일 봄) |
| B | `live/` | 12 | 코드 직결 (수시 참조) |
| C | `_archive/v6_v7_origin/` | 8 | 흡수된 통합 원본 |
| D | `_archive/split_drafts/` | 18 | 흡수된 split PRD |
| E | `_archive/superseded/` | 27 | 흡수된 도메인 문서 |
| F | `_business/` | 13 | 펀딩/마케팅 별도 track |
| G | `_scratch/` | 4 | 임시/개인 |
| **계** | | **92** | (84 + 9-Doc 9 + NOW + 일부 중복) |

---

## 실행 명령 (순서대로)

프로젝트 폴더에서 (=`/mnt/project/`에 해당하는 실제 위치):

```bash
# 1. 폴더 생성
mkdir -p live _archive/v6_v7_origin _archive/split_drafts _archive/superseded _business _scratch

# 2. 그룹 B → live/
mv contracts.md app-route-inventory.md architecture.md \
   core-loop-object-contracts.md core-loop-route-contracts.md \
   indicator-registry.md indicator-visual-design.md \
   flywheel-closure-design.md multi-agent-execution-control-plane.md \
   refinement-operator-control-plane.md refinement-policy-and-reporting.md \
   live/

# 3. 그룹 C → _archive/v6_v7_origin/
mv COGOCHI_v6_UNIFIED_DESIGN.md cogochi-unified-design*.md cogochi-v7.md \
   WTD_Cogochi_Final_Design_v1.md WTD-architecture.md WTD-flow-and-structure.md \
   _archive/v6_v7_origin/

# 4. 그룹 D → _archive/split_drafts/
mv 00-preface-and-status-patch.md 00_FINAL_ORGANIZATION_REPORT_20260411.md \
   00_home.md 01-sections-*.md 01_terminal.md \
   02-section-*.md 02_lab.md \
   03-sections-*.md 03_dashboard.md \
   04-section-*.md 04_shared_components.md \
   05-sections-*.md 05_scanner_alerts.md \
   06-section-*.md 06_autoresearch_ml.md \
   07-sections-*.md \
   legacy-doc-map.md COGOCHI_기능명세서_v1.txt \
   _archive/split_drafts/

# 5. 그룹 E → _archive/superseded/
mv core-loop.md core-loop-system-spec.md core-loop-agent-execution-blueprint.md \
   core-loop-state-matrix.md core-loop-surface-wireframes.md \
   architecture-v2-draft.md pattern-engine-runtime.md pattern-ml.md \
   dashboard.md lab.md terminal.md surfaces.md \
   terminal-attention-workspace.md terminal-backend-mapping.md \
   terminal-html-backend-parity.md verdict-inbox-ux.md \
   engine-pipeline.md scanner-alerts.md autoresearch-ml.md \
   refinement-methodology.md multi-timeframe-autoresearch-search.md \
   coin-screener.md evaluation.md \
   brief.md research-thesis.md business-viability-and-positioning.md \
   competitive-indicator-analysis-2026-04-21.md \
   _archive/superseded/

# 6. 그룹 F → _business/
mv 01_Research_Dossier.md 02_Pitch_Deck.md \
   03_Whitepaper_Lite.md 03_Whitepaper_Lite__1_.md \
   04_Tokenomics.md 05_Product_Spec_MVP.md 05b_L2_Router_Vault_Spec.md \
   08_Virtuals_Agent_Manifest.md 09_X_Content_Playbook.md \
   10_Signal_Publishing_Pipeline.md \
   Cogochi_YC_S26_Application_v2.md deep-research-report.md vc_deep_dive_report.md \
   _business/

# 7. 그룹 G → _scratch/
mv pure-brewing-umbrella.md quirky-honking-barto.md \
   serene-doodling-spindle.md indicator-viz-system-plan-2026-04-22.md \
   _scratch/

# 8. README.md 갱신
echo "# Cogochi Design v3
- 매일: NOW.md
- 결정: -1_PRODUCT_PRD.md
- 엔지니어링: 00~07 (도메인별)
- live/: 코드 직결 (Slice 진행 중 참조)
- _archive/: 흡수된 옛 문서
- _business/: 펀딩/마케팅 별도 track
- _scratch/: 임시
" > README.md
```

---

## 시간 소요 예상

- 명령 복붙 실행: **5분**
- 검증 (실수로 정본 옮겼는지 확인): **10분**
- README 갱신: **5분**
- **총 20분**

30분 안에 끝남.

---

## 정리 후 폴더 구조

```
project/
├── NOW.md
├── README.md
├── -1_PRODUCT_PRD.md
├── 00_MASTER_ARCHITECTURE.md
├── 01_PATTERN_OBJECT_MODEL.md
├── 02_ENGINE_RUNTIME.md
├── 03_SEARCH_ENGINE.md
├── 04_AI_AGENT_LAYER.md
├── 05_VISUALIZATION_ENGINE.md
├── 06_DATA_CONTRACTS.md
├── 07_IMPLEMENTATION_ROADMAP.md
├── live/                       (12 files)
├── _archive/
│   ├── v6_v7_origin/           (8 files)
│   ├── split_drafts/           (18 files)
│   └── superseded/             (27 files)
├── _business/                  (13 files)
└── _scratch/                   (4 files)
```

루트에 보이는 건 **11개 파일 + 4개 폴더**. 매일 코딩할 땐 NOW.md만.

---

## 주의 사항

1. **`coin-screener.md` 옮기기 전 확인.** 713줄짜리. Cogochi 본체가 아니라 별개 product spec일 수 있음. 그러면 `_business/`로.

2. **`pure-brewing-umbrella.md`는 개인 법무 문서.** Cogochi와 무관. 별도 폴더 또는 삭제 권장.

3. **혹시 헷갈리면 `_archive/`로.** 삭제는 나중에. 한번 archive로 보내고, 1달 후에도 안 봤으면 그때 삭제.

4. **`live/` 그룹은 코딩하면서 갱신.** Slice별로 어떤 게 직결되는지 변할 수 있음. README에 "최근 갱신: YYYY-MM-DD" 적어두기.
