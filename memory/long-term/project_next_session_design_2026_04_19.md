---
name: 다음 세션 설계 (2026-04-19)
description: 온체인 블록 머지 이후 다음 우선순위. P0=Flywheel Phase C(Verdict Inbox), P1=CME OI, P2=SYMBOL_CHAIN_MAP, P3=Redis kline cache.
type: project
originSessionId: 45567dac-e993-4913-8e5b-6b93837dad95
---
## 우선순위

**P0 — W-0088 Phase C: Verdict Inbox**
- Axis 1(Capture) + Axis 2(Outcome) 닫힘. Axis 3(Verdict) 만 열려있음.
- `GET /captures/outcomes` API + app 표면 (terminal badge 또는 inbox)
- 설계문서: `work/active/W-0088-flywheel-closure-capture-wiring.md`
- 파일: `engine/api/routes/captures.py`

**P1 — CME OI (cme_oi placeholder 해소)**
- 분석가 툴킷 마지막 갭
- 옵션 A: CFTC COT weekly report 파싱 (무료, 주간)
- 옵션 B: Coinglass API ($29/월, 실시간)
- 추천: COT 파서 먼저

**P2 — SYMBOL_CHAIN_MAP 확장**
- 현재 8개 (FARTCOIN/WIF/BONK/JUP/RAY/PEPE/SHIB/FLOKI)
- 추가 후보: TRUMP/MELANIA/MOODENG/NEIRO/MOG/POPCAT/BRETT/BANANA

**P3 — Redis Kline Cache (W-0096)**
- 설계 완료: `work/active/W-0096-perf-scalability-phase1-redis.md`
- Blocked on: Redis 인프라 결정 (로컬 dev vs Upstash)

## 세션 시작 체크리스트
1. `git fetch origin && git log --oneline origin/main..HEAD`
2. `GET /observability/flywheel/health` KPI 확인
3. 설계문서: `work/active/W-0097-next-session-design-2026-04-19.md`
