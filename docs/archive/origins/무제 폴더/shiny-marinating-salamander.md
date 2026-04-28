# Cogochi UX/UI + GTM 설계

## Context

Claude Code 소스에서 추출한 8개 시스템(DNA 생성, Bones/Soul, 리액션, Dream Task, MessageQueue, 애니메이션, Cost Tracker, Feature Flag)이 코고치에 엔진 레벨로 통합 완료(`cogochi.ts` 오케스트레이터). 이제 이 시스템들을 **유저가 직접 체감할 수 있는 UX**로 표면화해야 함.

---

## 유저 저니 4개 Flow

### Flow 1: 첫 방문 (Acquisition)
```
Landing(/) → 지갑연결 → DNA Reveal(신규 풀스크린) → Create 4단계 → Agent HQ
```

**핵심 신규 작업:**
1. **DNA Reveal 오버레이** (신규 컴포넌트)
   - 풀스크린 터미널 타이핑 → AgentDNAPreview 카드 등장
   - Shiny(1%) 시 골드 파티클 폭발
   - `src/components/shared/DNARevealOverlay.svelte`

2. **Create 위자드 개선** (`/create` 수정)
   - Step1: `recommendAgents()` → "DNA MATCH" 태그 표시
   - Step2: `personalizeAgent()` → 스탯 증감(+/-) 표시
   - Step2: 에이전트 첫 리액션 말풍선 미리보기
   - Step4: `costTracker` → "예상 배틀 비용: ~$0.01" 칩

### Flow 2: 데일리 루프 (Retention)
```
앱오픈 → 에이전트 리액션(밤새 시장 반응) → 빠른배틀 → 결과 리뷰
```

**핵심 신규 작업:**
3. **Agent HQ 컴패니언 존** (`/agent` 수정)
   - 140px 스프라이트 + idle 애니메이션 (500ms 틱)
   - 탭하면 pet → 하트 파티클
   - 말풍선 (10초 표시, 3초 페이드)
   - Dream 상태 표시 (잠금/준비/진행/완료)
   - `src/components/agent/CompanionZone.svelte`

4. **마켓 옵저버 UI** (Header에 반영)
   - 에이전트 미니 말풍선을 Header에 표시
   - 급등/급락 시 알림 배지
   - `src/components/layout/AgentChip.svelte`

### Flow 3: 딥 세션 (Engagement)
```
Terminal 훈련 → Arena 배틀 → Dream 리뷰 → 성장 확인
```

**핵심 신규 작업:**
5. **Dream Task 오버레이** (신규 컴포넌트)
   - 수면 애니메이션 (SLEEP_SEQUENCE)
   - 프로그레스 바 (collecting→analyzing→integrating→done)
   - 인사이트 카드 하나씩 등장
   - `src/components/agent/DreamOverlay.svelte`

6. **배틀 리액션 통합** (`/arena-war` 수정)
   - 배틀 중 excited 애니메이션
   - 승/패 시 성격별 리액션
   - 연승 시 streak 리액션
   - `onBattleComplete()` 호출 연결

### Flow 4: 소셜/바이럴 (Growth)
```
DNA 카드 공유 → 친구 방문 → 비교 → 도전
```

**핵심 신규 작업:**
7. **DNA 카드 공유** (AgentDNAPreview 확장)
   - "Share" 버튼 → html2canvas → 이미지 다운/공유
   - 딥링크 삽입: `cogochi.app/creator/{userId}`

8. **비용 대시보드** (Agent HQ 내 탭)
   - 세션별/모델별 비용 차트
   - "커피 한 모금보다 싸다" 게이미피케이션 메시지

---

## 수정할 파일 목록

| 파일 | 작업 | 신규/수정 |
|------|------|-----------|
| `src/components/shared/DNARevealOverlay.svelte` | DNA 풀스크린 공개 애니메이션 | 🆕 신규 |
| `src/components/agent/CompanionZone.svelte` | 펫 인터랙션 + 말풍선 + Dream 상태 | 🆕 신규 |
| `src/components/agent/DreamOverlay.svelte` | Dream Task 시각화 | 🆕 신규 |
| `src/components/layout/AgentChip.svelte` | Header 미니 리액션 칩 | 🆕 신규 |
| `src/components/agent/CostDashboard.svelte` | 비용 추적 대시보드 | 🆕 신규 |
| `src/routes/+layout.svelte` | cogochi 오케스트레이터 초기화 | ✏️ 수정 |
| `src/routes/+page.svelte` | DNA 프리뷰 티저 + 리액션 | ✏️ 수정 |
| `src/routes/create/+page.svelte` | DNA Bridge 연동 + 추천 + 비용칩 | ✏️ 수정 |
| `src/routes/agent/+page.svelte` | CompanionZone + DreamOverlay 삽입 | ✏️ 수정 |
| `src/routes/arena-war/+page.svelte` | onBattleComplete() 연결 | ✏️ 수정 |
| `src/components/layout/Header.svelte` | AgentChip 삽입 | ✏️ 수정 |

---

## GTM 퍼널

| 단계 | 전환율 목표 | 시스템 활용 |
|------|------------|------------|
| Awareness → Interest | 30% 지갑 연결 | `previewBones()` 즉시 클라이언트 DNA 계산 |
| Interest → Activation | 60% 에이전트 생성 | `recommendAgents()` + 첫 리액션 |
| Activation → D1 Retention | 40% 재방문 | 마켓 옵저버 + "에이전트가 보고싶어해요" 푸시 |
| D1 → D7 Retention | 25% | Dream Task 인사이트 + 배틀 스트릭 |
| D7 → Revenue | 5% 유료전환 | Pro: 무제한 배틀 + Dream + 프리미엄 모델 |

---

## 수익 구조

- **Free**: 3배틀/일, BTC만, gpt-4o-mini, Dream 1회/일
- **Pro $9.99/월**: 무제한, 멀티심볼, Claude Sonnet, Dream 무제한
- **Whale $49.99/월**: Opus, 스웜모드, 에이전트 렌탈, 카피트레이드

---

## 검증 방법

1. `npm run dev` → 홈에서 지갑 연결 → DNA Reveal 애니메이션 확인
2. Create 위자드 4단계 → DNA MATCH 태그 + 스탯 증감 확인
3. Agent HQ → 펫 탭 → 하트 파티클 + 말풍선 확인
4. Arena 배틀 → `onBattleComplete()` → 리액션 + Dream 경험 축적 확인
5. Dream Task 수동 트리거 → 오버레이 → 인사이트 카드 확인
6. 모바일(375px) → 반응형 레이아웃 확인
