---
source: manual
tier: core
updated: "2026-04-26"
---

# Product PRD Master (Live Note)
**Version:** v2.2 (CTO+AI Researcher Edition + feature-implementation-map v3.0 통합)

## Current State

- **Vision**: Cogochi/WTD = "Pattern Research OS" — 트레이더 감각을 PatternObject로 외화 → 12개 백그라운드 잡이 시장 매칭·검증·학습 자동화 → 검증된 패턴은 카피시그널 marketplace로 monetize
- **Mental model**: Forward search tool (복기 저널 X, broadcasting 시그널 X)
- **Persona P0**: "Jin" — 28-38세 크립토 perp 전업/반전업, 자기 수익 패턴 한두 개 이미 앎, 한국·아시아, WTP $29-79/mo
- **Core Loop**: drag/NL/카탈로그 입력 → PatternDraft → 3-layer search → top 10~20 후보 → Watch → 72h Outcome → 5-cat Verdict → Refinement → 카피시그널 (F-60 gate)
- **9 NOT BUILT 이슈 확정**: A-03-eng/app (AI Parser) · A-04-eng/app (Chart Drag) · D-03-eng/app (1-click Watch) · F-02 (Verdict 5-cat) · H-07 (F-60 Gate) · N-05 (Marketplace)
- **수익화 4단계**: SaaS Pro $29 → Team → 카피시그널 알림 → Marketplace revenue share

## Decisions (D1~D15 lock-in 후보)

- **D1 Pricing $29/mo Pro** | **D2 NSM = WVPL per user** | **D3 Persona = Jin** | **D4 Decision HUD 5-card** | **D5 IDE split-pane** (free-form canvas 폐기)
- **D6 L6 1-table 유지** (4-table 분리는 P2) | **D7 L3 file-first 유지** | **D8 5-cat verdict 즉시 P0** | **D9 Wiki = L7 ledger-driven job**
- **D10 DESIGN_V3.1 features 즉시 P1** | **D11 Forward search tool** (복기 X) | **D12 카피시그널 = F-60 gate 후** | **D13 AI Parser P0 입구#1**
- **D14 Chart drag + AI Parser 둘 다 P0** | **D15 Telegram alert → 1-click verdict deep link**

## P0 Roadmap (7주)

- F-0a Chart Drag → PatternDraft (A-04) | F-0b AI Parser (A-03) | F-1 5-cat Verdict (F-02) | F-2 Search Result List | F-3 Telegram→Verdict deep link | F-4 5-card HUD | F-5 IDE split-pane | F-7 메타 자동화

## Q1-Q5 권고

- Q1 missed/too_late **분리** (학습 노이즈 다름)
- Q2 F-60 threshold **0.55** 시작
- Q3 Drag UI **실제 드래그**
- Q4 Parser 입력 **자유 텍스트**
- Q5 Parser 모델 **Sonnet 4.5**

## Next

- D1~D15 + Q1~Q5 사용자 confirm
- spec/PRIORITIES.md 갱신 (F-0b/F-1/F-3 새 P0)
- work/active/CURRENT.md SHA 동기화 + 본 PRD 등록
- A-03-eng / A-04-eng / D-03-eng / F-02 4개 independent 병렬 시작 가능

## See Also

- `feature-impl-map.md` (live-note) — 19 도메인 × 160+ Built / 9 NOT BUILT
- `telegram-refs.md` (live-note) — 4채널 분석 + 13 base signal vocabulary + F-60 메시지 schema
- `dec-2026-04-26-w0220-prd-v2-canonical.md` (decision) — v2 채택 근거

---

## Timeline

- **2026-04-26** | Live note created [Source: manual]
# Product PRD Master (Live Note)

**Tier:** core
**Source:** work/active/W-0220-product-prd-master.md
**Updated:** 2026-04-26
**Version:** v2.2 (CTO+AI Researcher Edition + feature-implementation-map v3.0 통합)

## Current State

- **Vision**: Cogochi/WTD = "Pattern Research OS" — 트레이더 감각을 PatternObject로 외화 → 12개 백그라운드 잡이 시장 매칭·검증·학습 자동화 → 검증된 패턴은 카피시그널 marketplace로 monetize
- **Mental model**: Forward search tool (복기 저널 X, broadcasting 시그널 X)
- **Persona P0**: "Jin" — 28-38세 크립토 perp 전업/반전업, 자기 수익 패턴 한두 개 이미 앎, 한국·아시아, WTP $29-79/mo
- **Core Loop**: drag/NL/카탈로그 입력 → PatternDraft → 3-layer search → top 10~20 후보 → Watch → 72h Outcome → 5-cat Verdict → Refinement → 카피시그널 (F-60 gate)
- **9 NOT BUILT 이슈 확정**: A-03-eng/app (AI Parser) · A-04-eng/app (Chart Drag) · D-03-eng/app (1-click Watch) · F-02 (Verdict 5-cat) · H-07 (F-60 Gate) · N-05 (Marketplace)
- **수익화 4단계**: SaaS Pro $29 → Team → 카피시그널 알림 → Marketplace revenue share

## Decisions (D1~D15 lock-in 후보)

- **D1 Pricing $29/mo Pro** | **D2 NSM = WVPL per user** | **D3 Persona = Jin** | **D4 Decision HUD 5-card** | **D5 IDE split-pane** (free-form canvas 폐기)
- **D6 L6 1-table 유지** (4-table 분리는 P2) | **D7 L3 file-first 유지** | **D8 5-cat verdict 즉시 P0** | **D9 Wiki = L7 ledger-driven job**
- **D10 DESIGN_V3.1 features 즉시 P1** | **D11 Forward search tool** (복기 X) | **D12 카피시그널 = F-60 gate 후** | **D13 AI Parser P0 입구#1**
- **D14 Chart drag + AI Parser 둘 다 P0** | **D15 Telegram alert → 1-click verdict deep link**

## P0 Roadmap (7주)

- F-0a Chart Drag → PatternDraft (A-04) | F-0b AI Parser (A-03) | F-1 5-cat Verdict (F-02) | F-2 Search Result List | F-3 Telegram→Verdict deep link | F-4 5-card HUD | F-5 IDE split-pane | F-7 메타 자동화

## Q1-Q5 권고

- Q1 missed/too_late **분리** (학습 노이즈 다름)
- Q2 F-60 threshold **0.55** 시작
- Q3 Drag UI **실제 드래그**
- Q4 Parser 입력 **자유 텍스트**
- Q5 Parser 모델 **Sonnet 4.5**

## Next

- D1~D15 + Q1~Q5 사용자 confirm
- spec/PRIORITIES.md 갱신 (F-0b/F-1/F-3 새 P0)
- work/active/CURRENT.md SHA 동기화 + 본 PRD 등록
- A-03-eng / A-04-eng / D-03-eng / F-02 4개 independent 병렬 시작 가능

## See Also

- `feature-impl-map.md` (live-note) — 19 도메인 × 160+ Built / 9 NOT BUILT
- `telegram-refs.md` (live-note) — 4채널 분석 + 13 base signal vocabulary + F-60 메시지 schema
- `dec-2026-04-26-w0220-prd-v2-canonical.md` (decision) — v2 채택 근거
