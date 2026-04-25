# Cogochi — Documentation Index v4

**Version**: 4.0 (Virtuals Agent pivot)
**Date**: 2026-04-24
**Status**: Active development — Virtuals launch prep
**Key pivot**: Protocol design (v1-v3) → Virtuals AI Agent launch (v4)

---

## 0. v4 Pivot 요약

**이전**: L1/L2 protocol 설계, VC raise 전략, L2 Router Vault 등
**현재**: Virtuals Protocol 위에 AI Trading Signal Agent로 런칭

**선택 근거**:
- Solo founder 3개월 time constraint
- 영어 X viral 운영 가능
- AIXBT 선례 (trading signal agent 검증된 카테고리)
- Capital Formation 모듈로 팀 지분 + 현금 수령 구조 확보

**Trade-off**:
- Upside: AIXBT peak $500M MC = 잠재 팀 지분 $125M
- Downside: 90% 실패율, 3개월 내 결정됨
- Variance 매우 높음

---

## 1. 이 폴더 안에 뭐가 있나

### Active docs (v4, 현재 사용)

| # | 파일 | 용도 |
|---|------|------|
| 00 | README.md | This file |
| 01 | Research_Dossier.md | 시장 데이터, X content source로 재활용 |
| 08 | Virtuals_Agent_Manifest.md | Agent identity, 차별화, Virtuals 설정 |
| 09 | X_Content_Playbook.md | 30일 pre-launch + launch week X 전략 |
| 10 | Signal_Publishing_Pipeline.md | Cogochi engine → X auto-post 기술 스펙 |

**총 5개 active docs**. v1-v3 대비 대폭 축소.

### Reference (참고용, 지금 직접 사용 안 함)

| # | 파일 | 쓸모 |
|---|------|------|
| 03 | Whitepaper_Lite.md | 엔진 기술 부분만 Agent bio/thread 소스로 |
| 05 | Product_Spec_MVP.md | L1 contract 스펙 (Virtuals pivot 후 사용 안 함, 나중 protocol화 검토 시) |

### Archive (이전 설계, 역사적 참고)

- `archive_v1/`: 초기 Signal Registry 설계
- `archive_v3/`: v3 L1 SaaS + L2 Token 설계 (protocol 방향 포기)

---

## 2. v1 → v4 Evolution

| 영역 | v1 | v2 | v3 | **v4** |
|------|----|----|----|----|
| **정체성** | Signal Registry | Engine Marketplace | L1 SaaS + L2 Protocol | **Virtuals AI Agent** |
| **Token** | Optional | Marketplace token | Conditional TGE | **Virtuals bonding curve** |
| **Raise** | $750k | $1.5M | $400k → $1.5M | **Pre-buy $3-15k + Capital Formation** |
| **Team alloc** | 20% | 15% | 15% | **50% (25% auto + 25% vest)** |
| **Timeline** | 18mo | 18mo | 18mo | **3개월** |
| **Risk level** | Medium | Medium | Medium | **High (variance)** |
| **Primary channel** | VC pitch | VC pitch | Angel + VC | **X viral** |

---

## 3. v4 Roadmap (3개월)

### Phase 1: Build (Week 1-2)

**기술**:
- [ ] Signal Publishing Pipeline 빌드 (문서 10 참조)
- [ ] X Developer API 승인 + keys
- [ ] Discord server + webhooks
- [ ] Dry run test

**브랜딩**:
- [ ] @cogochi_agent X account 생성
- [ ] Avatar + header images
- [ ] Bio + initial 10-30 posts

### Phase 2: Pre-launch Viral (Week 3-4)

**목표**: 2,000+ X followers, 500+ Discord

**실행** (X_Content_Playbook 참조):
- Daily 5-10 posts
- Signal accuracy 증명 시작
- KOL engagement (10명 target)
- Thread 2-3개

### Phase 3: Launch (Week 5)

**Launch Day** (Agent_Manifest 6.1 참조):
- Virtuals에서 agent 등록 + modules 설정
- Pre-buy 실행 (1-5 ETH)
- 24시간 sleep 금지 mode
- FDV milestone 추적

### Phase 4: Sustain (Week 6-12)

**목표**: FDV $2M+ 유지, Capital Formation trigger, 90일 milestones 달성

**Daily**:
- 10+ X posts
- Signal publishing 중단 없음
- Community engagement

**Weekly**:
- Performance thread
- KOL partnership 확장
- Feature release (Terminal, premium tier)

---

## 4. 읽는 순서

### 지금 (Build 시작 전)
1. **Research_Dossier (01)** — 시장 맥락
2. **Agent_Manifest (08)** — 어떤 agent를 만드는지 명확화
3. **X_Content_Playbook (09)** — 어떻게 키울지

### Pipeline 빌드 시
1. **Signal_Publishing_Pipeline (10)** — 기술 스펙
2. **Whitepaper (03)** — Cogochi 엔진 부분만 발췌 (agent bio 소스)

### Pre-launch 2주 전
1. **X_Content_Playbook (09)** — 일별 daily routine 확정
2. **Agent_Manifest (08)** — Virtuals 설정 준비

### Launch Day
1. **Agent_Manifest (08)** — Section 12 cheat sheet
2. **X_Content_Playbook (09)** — Section 4.1 Launch Day schedule

---

## 5. Critical Success Factors

### 5.1 반드시 성공해야 하는 것

1. **X account 2주 내 2,000 followers**
   - 못하면 launch 실패
   - Daily 5-10 posts + KOL engagement 필수

2. **Signal accuracy 공개적 증명**
   - Pre-launch 2주에 live signal 50+ public
   - Win rate 60%+ 유지
   - Loss도 투명하게 공개

3. **Bonding curve 42,425 VIRTUAL 달성**
   - Launch Day + 최대 7일 내
   - 미달 시 agent sunset

4. **FDV $2M 도달 (Capital Formation trigger)**
   - 최대 30일 내
   - 이게 실질 수익 시작점

### 5.2 리스크

- **Timing**: AI agent 카테고리 -86% 냉각 중
- **Competition**: AIXBT 이미 성숙
- **Solo execution**: X 24/7 운영 부담
- **Technical**: X API 정지 / 해킹 가능

---

## 6. Kill Criteria

**Week 1 (pre-launch)**:
- Followers < 200 후 7일 → content strategy 재검토

**Launch Day**:
- Bonding curve 3시간 내 10% 미달 → crisis mode, KOL 긴급 섭외

**Day 7**:
- Bonding curve 미달 → re-launch 또는 pivot 고려

**Day 30**:
- FDV < $500k → 전략 재검토, pivot 검토

**Day 90**:
- FDV < $1M + 성장 없음 → wind down 검토
- 이 경우 기존 Cogochi Pro SaaS 복귀 or 새 프로젝트

---

## 7. What 이 Pivot Means

**Keep** (여전히 valuable):
- Cogochi engine (28 features, 4-stage gate, Hill Climbing)
- Backtest data (3년 분량)
- Cogochi Pro 기존 유저 기반 (있다면)
- Research dossier (시장 맥락)

**Drop** (지금 안 쓰지만 archive):
- L1/L2 protocol 설계
- VC pitch 전략
- 복잡한 tokenomics
- 팀 5명 빌드 계획

**Shift to** (새롭게 집중):
- X content machine
- Agent personality + branding
- Virtuals ecosystem understanding
- Real-time signal publishing infrastructure

---

## 8. Week 1 Action Items (지금 당장)

### Day 1 (Today)

- [ ] 이 문서 (README v4) 읽고 전체 이해
- [ ] 08 Agent Manifest 읽기
- [ ] 09 X Content Playbook 읽기
- [ ] X Developer account apply
- [ ] Cogochi Pro 기존 유저 수 확인 (migration 가능성)

### Day 2

- [ ] @cogochi_agent X 계정 생성
- [ ] Avatar 제작 (Midjourney/DALL-E, $10)
- [ ] Bio 작성 (08 Manifest section 1.2 복사)
- [ ] 첫 5 posts

### Day 3-7

- [ ] 10 Signal_Publishing_Pipeline 기술 문서 따라 pipeline 빌드 시작
- [ ] Daily X posts 3-5개 유지
- [ ] Discord server 생성
- [ ] VIRTUAL 토큰 확보 (200+, ~$150)

---

## 9. 중요 연락처 / Resources

**Virtuals Protocol**:
- Whitepaper: https://whitepaper.virtuals.io
- App: https://app.virtuals.io
- Twitter: @virtuals_io
- Discord: https://discord.gg/virtualsprotocol

**Base chain**:
- Bridge: https://bridge.base.org
- Docs: https://docs.base.org

**Tools**:
- X Developer: https://developer.twitter.com
- Midjourney (avatar): https://midjourney.com
- Buffer (scheduling): https://buffer.com
- CCXT (price feed): https://github.com/ccxt/ccxt

---

## 10. Mental Model

**이 프로젝트는 Cogochi protocol 회사가 아니다**.
**이 프로젝트는 Cogochi agent를 Virtuals에서 유명하게 만드는 것이다**.

Differences:
- **Product** = AI agent (personality + signals), not protocol infrastructure
- **Customer** = X followers + Discord members + $COGOCHI holders, not VCs
- **Revenue** = Capital Formation + trading tax + premium tier, not subscription or fee
- **Success** = FDV + community, not TVL + MRR

이 mindset shift 없으면 v4 실행 실패.

---

## 11. 이 문서 관리

- Update 주기: 매주 Monday review
- v4 사이클 끝나면 (3개월 후) v5 결정:
  - v5a: 성공했다면 → Protocol 확장 (archive_v3 기반)
  - v5b: 실패했다면 → Wind down + Cogochi Pro 복귀

---

## Version Control

| V | Date | Changes |
|---|------|---------|
| 1.0 | 2026-04-23 | Initial protocol index |
| 2.0 | 2026-04-23 | v2 Marketplace pivot |
| 3.0 | 2026-04-23 | v3 L1 SaaS + L2 Token pivot |
| **4.0** | **2026-04-24** | **v4 Virtuals AI Agent pivot — protocol 계획 archive, agent launch 중심** |

---

**End of README v4**
