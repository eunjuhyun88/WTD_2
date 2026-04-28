---
name: Terminal UX Redesign + AutoResearch Architecture (Sprint 2, PR #20)
description: Chart-first terminal 재설계, COGOCHI_ARCHITECTURE_V2 설계문서, EvidenceStrip, CAPTURE CTA, Pattern Engine rail — PR #20 머지 완료 (2026-04-13)
type: project
---

## PR #20 완료 — Sprint 2 전체 내역

**Why:** 현재 터미널이 VerdictCard(17 evidence mini-chart)로 전체 화면을 채워 차트가 보이지 않음. 아키텍처 문서는 `/terminal = Capture center = 차트+보조지표+Save Setup` 으로 정의. 두 가지가 어긋나 CPO/UX 관점에서 재설계 필요.

**How to apply:** Sprint 3 작업 시 이 설계를 기반으로 AutoResearch 파이프라인 연동.

---

### 아키텍처 설계문서 (2개 신규)

| 파일 | 내용 |
|------|------|
| `app/docs/COGOCHI_ARCHITECTURE_V2.md` | 3-엔진 아키텍처 (AutoResearch+Scanner+Ledger), 7-step Core Loop, Data Models (PatternSeed/PatternObject/PatternProposal/VerdictRecord), API Spec, Memory Wiki 구조 |
| `app/docs/TERMINAL_UX_REDESIGN.md` | CPO/UX 관점 터미널 재설계 스펙: chart-first 원칙, 컴포넌트별 설계, Capture 플로우, 데이터 흐름 |

---

### Terminal UX 변경사항 (Phase 1)

**핵심 원칙 (TERMINAL_UX_REDESIGN.md):**
1. Chart-First — 캔들차트가 항상 중심
2. Capture Pathway Visible — ⚡ CAPTURE 항상 1-click 거리
3. Verdict as Annotation — AI 버딕트가 차트를 대체하지 않음
4. Progressive Disclosure — EvidenceStrip(기본) → 탭(확장)
5. Pattern Phase as Context — 차트 아래 항상 표시

**Before:** VerdictCard(17 mini-charts) 메인 보드 전체 점유, 차트 미노출
**After:**
```
chart-area
├── ChartBoard (캔들 + Volume + OI + 레벨 오버레이)
├── PatternStatusBar (현재 phase 표시)
└── EvidenceStrip (1줄 점수 배지 — Wyck+24 MTF+24 OI+12...)

analysis-rail (380px)
└── compact-verdict (bias / price / WHY / AGAINST / LEVELS)
    └── [Evidence + Detail →] 버튼 → 우측 패널 확장
```

**CommandBar:** ⚡ CAPTURE 버튼 (green) → SaveSetupModal open
**LeftRail:** Pattern Engine 섹션 최상단 (slug / phase / symbol chips)

---

### 신규 컴포넌트

| 컴포넌트 | 역할 |
|---------|------|
| `EvidenceStrip.svelte` | 17 레이어 점수를 1줄 색상 배지로 요약 |
| `SaveSetupModal.svelte` | Phase label + note → PatternSeed POST |

---

### API 프록시 (SvelteKit)

| 엔드포인트 | 역할 |
|-----------|------|
| `GET /api/patterns/states` | sym→slug→phase 매핑 (60s 폴링) |
| `GET /api/patterns/stats` | 패턴별 hit_rate/total 통계 |
| `POST /api/patterns/[slug]/verdict` | 유저 버딩트 (valid/invalid/missed) |
| `POST /api/patterns/scan` | 전체 스캔 트리거 |
| `GET /api/patterns` | candidates + last_scan |

---

### 다음 Sprint 3 우선순위

1. `engine/autoresearch/` — analyze_seed() 파이프라인 (context_fetcher, phase_proposer, similarity)
2. `engine/api/routes/autoresearch.py` — SSE endpoint
3. `PatternProposalCard.svelte` — AutoResearch 결과 표시
4. `/lab` 페이지 — Verdict center (hit/miss 기록)
5. Ledger DB JSON → SQLite 마이그레이션
