# 구조적 UI/UX 리디자인 — Linear/Perplexity 스타일

## Context

색상/간격/반응형 리팩토링은 완료됨. 이제 **구조적 리디자인**:
- NavBar → Linear 스타일 사이드바 (220px ↔ 48px 토글)
- Home → 임팩트 있는 랜딩
- 카드 시스템 → 일관된 패턴 통일
- 전체 레이아웃 → 프로페셔널 완성도

---

## 1. NavBar 리디자인 — Linear 사이드바

**파일:** `src-svelte/lib/layout/NavBar.svelte` + `src-svelte/App.svelte`

### 현재
- 80px 아이콘 레일, 텍스트 매우 작음 (0.58rem)
- collapse시 44px 미니 레일
- 둥근 모서리 없는 직선 레일 (이전 리팩토링)

### 변경

**확장 상태 (220px):**
```
┌─────────────────────┐
│  🦉 HOOT Protocol   │  ← 브랜드 + 텍스트
│─────────────────────│
│  🔬 Research         │  ← row: 아이콘(20px) + 텍스트(0.82rem)
│  📦 Models           │
│  🌐 Nodes            │
│  💰 Earn             │
│                     │
│  ─────────────────  │
│  « Collapse         │  ← 하단 토글 버튼
└─────────────────────┘
```

**축소 상태 (48px):**
```
┌────┐
│ 🦉 │
│────│
│ 🔬 │  ← 아이콘만, tooltip on hover
│ 📦 │
│ 🌐 │
│ 💰 │
│    │
│ » │  ← 확장 버튼
└────┘
```

**CSS 핵심:**
```css
.desktop-rail {
  width: 220px;                          /* 확장 기본 */
  transition: width 250ms var(--ease-smooth);
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 16px 12px;
}

.desktop-nav.collapsed .desktop-rail {
  width: 48px;
  padding: 12px 4px;
}

.rail-item {
  flex-direction: row;                   /* 세로→가로 */
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  justify-content: flex-start;
  width: 100%;
}

.rail-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.rail-item-label {
  font-size: 0.82rem;                   /* 0.58→0.82 */
  font-weight: 500;
}
```

**App.svelte grid 변경:**
```css
.workspace-shell {
  grid-template-columns: 220px 1fr 0;   /* auto → 220px */
}
.workspace-shell.nav-collapsed {
  grid-template-columns: 48px 1fr 0;    /* auto → 48px */
}
```

**모바일 (≤860px):** 기존 햄버거 드로어 유지 — 변경 없음.

---

## 2. Home 리디자인 — 임팩트 있는 랜딩

### 2-1. GuestHomeSurface

**파일:** `src-svelte/lib/pages/home/GuestHomeSurface.svelte`

**현재:** 560px 좁은 센터 → 소박한 느낌
**변경:** max-width 800px로 확대, 히어로 영역 강화

```
┌──────────────────────────────────────────────┐
│          🦉                                   │
│     HOOT Protocol                             │
│  탈중앙화 AI 연구 인프라                          │
│                                               │
│  ┌─────────────────────────────────── →  ┐    │
│  │ 예: 암호화폐 가격 예측 모델              │    │
│  └──────────────────────────────────────┘    │
│                                               │
│  ┌─── AI 연구 시작 ───┐  ┌─── GPU 수익 ───┐   │  ← 2열 그리드
│  │ 🔬                  │  │ 🌐              │   │
│  │ 주제 입력 → GPU →   │  │ GPU 연결 →      │   │
│  │ 모델 학습            │  │ HOOT 획득       │   │
│  └────────────────────┘  └────────────────┘   │
│                                               │
│  데이터 기여 · 모델 구매                         │
│                                               │
│  ─── Connect wallet ───                       │
│  [Phantom] [Solflare] [Backpack]              │
└──────────────────────────────────────────────┘
```

**변경 사항:**
- `.home-center.guest` max-width: 560px → 720px
- CTA 카드 2열 그리드 (모바일에서 1열)
- 검색바 max-width: 420px → 560px
- 올빼미 크기 0.45 → 0.35 (약간 작게, 프로다운 느낌)

### 2-2. MemberHomeSurface

**현재:** 560px 좁은 센터
**변경:** max-width 720px, 포탈 카드를 2열 + 1열 레이아웃

```
┌──────────────────────────────────────────────┐
│  🦉 Dashboard          [+ New Research]       │
│                                               │
│  262 Nodes · 3 GPU · 12 Models · $12.4M TVL   │
│                                               │
│  ┌── Magnet Studio ──┐  ┌── GPU Network ──┐  │
│  │ 🔬 Running...     │  │ 🌐 Online       │  │
│  │ Data Classifier    │  │ node-seoul-1    │  │
│  └───────────────────┘  └────────────────┘  │
│                                               │
│  ┌── Protocol ────────────────────────────┐  │
│  │ 💰 $12.4M TVL                          │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  [Try Model] [Browse] [Earn with GPU]         │
│                                               │
│  Recent Activity                              │
│  ┌────────────────────────────────────────┐  │
│  │ 14:20  JOB  Data Classifier started    │  │
│  │ 14:15  NET  node-seoul-1 connected     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**변경 사항:**
- `.home-center` max-width: 560px → 720px
- 포탈 카드 상위 2개를 2열 그리드, Protocol은 full-width
- 모바일에서 1열 스택

---

## 3. 카드 시스템 통일

### 현재 문제
- border-radius: 8~20px 혼재
- padding: 12~24px 혼재
- border: `--border` vs `--border-subtle` 혼재
- hover shadow: 다 다름

### 통일 규칙

```css
/* ── Card Tier 1: 주요 카드 (Featured, CTA, Portal) ── */
.card-primary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}
.card-primary:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

/* ── Card Tier 2: 보조 카드 (Type pill, Stat, Small) ── */
.card-secondary {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
}

/* ── Card Tier 3: 인라인 아이템 (Activity, List item) ── */
.card-inline {
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 14px;
}
```

**적용 대상:**
- ModelsHero `.featured-card`: radius 20→16, padding 22→20
- GuestHome `.cta-card`: 이미 16px — 유지
- MemberHome `.portal-card`: radius 14→16, padding 16→20
- ResearchBrowse `.type-pill`: radius 10→12
- EconomicsPage `.panel`: 이미 16px — 유지

---

## 4. 수정 파일 목록

| # | 파일 | 변경 |
|---|------|------|
| 1 | `layout/NavBar.svelte` | 220px↔48px Linear 사이드바, row 레이아웃 |
| 2 | `App.svelte` | grid-template-columns 고정값, transition |
| 3 | `pages/home/GuestHomeSurface.svelte` | max-width 720px, 2열 CTA, 검색바 확대 |
| 4 | `pages/home/MemberHomeSurface.svelte` | max-width 720px, 2열 포탈 카드 |
| 5 | `pages/models/ModelsHero.svelte` | featured-card radius/padding 통일 |
| 6 | `components/research/ResearchBrowse.svelte` | type-pill radius 통일 |
| 7 | `pages/EconomicsPage.svelte` | 카드 패딩 통일 (이미 거의 맞음) |
| 8 | `tokens.css` | `--nav-width: 220px` 추가 |

---

## 5. 검증

1. `preview_start` → 데스크톱 1440×900
   - NavBar 확장/축소 토글 확인
   - Home Guest/Member 레이아웃 확인
   - Models, Research, Protocol, Network 페이지 카드 일관성
2. 모바일 375×812
   - 햄버거 드로어 기존대로 작동
   - CTA 카드 1열 스택
3. 태블릿 768×1024
   - NavBar 숨김 + 햄버거
