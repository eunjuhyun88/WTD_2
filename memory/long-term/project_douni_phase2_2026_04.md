---
name: DOUNI Phase 2 — Memory System & Agent Improvements
description: 2026-04-13 세션에서 완료한 DOUNI 에이전트 개선 내역 및 현재 상태
type: project
---

## 완료된 작업 (PR #2 — feat/douni-memory-intent-streaming)

### 1. intentClassifier — 동적 티커 감지
- 기존: 하드코딩 `KNOWN_SYMBOLS` Set에 없으면 `convo`로 분류 → 신규 밈코인 miss
- 변경: 4단계 계층 감지
  1. KNOWN_SYMBOLS fast path
  2. `XXXUSDT` / `XXX/USDT` 명시 패턴
  3. 한국어 코인명 (비트코인, 이더리움, 솔라나...)
  4. 미지 티커: COMMON_WORDS 필터 + (≤20자 OR TRADE_CONTEXT 단어)
- `TRUMP 어때?`, `FARTCOIN봐` 등 → `quick_ask` 정상 분류

### 2. llmService — 스트리밍 키 로테이션 통합
- 기존: `streamFromProvider` 내 9줄 if/else 체인으로 provider별 rotate 호출
- 변경: `getStreamConfig` 반환값에 `onRotate: () => void` 콜백 추가
- 429/401 시 `onRotate()` 단일 호출로 대체 — `callOpenAICompatible` 패턴과 일치

### 3. toolExecutor — Phase 2 메모리 구현
세 도구 스텁 → 실제 DB 연결:
- `save_pattern`: `agent_memories` 테이블에 `PLAYBOOK` kind로 저장
- `submit_feedback`: correct→`SUCCESS_CASE`, incorrect→`FAILURE_CASE`, success_score 자동 계산
- `query_memory`: ILIKE 텍스트 검색 + kind 필터, doctrine card 우선 정렬

### 4. coinalyzeAdapter / providerAdapter — TS 타입 수정
- `DataEngineProvider` 인터페이스 `providerAdapter.ts`에 추가
- 반환 shape 수정: `id`→`rawId`, `ts`→`updatedAt`, `values`→`value`, `'5m' as DataCadence` 제거

## 현재 DOUNI 에이전트 상태

### 툴 현황
| 툴 | 상태 | 비고 |
|----|------|------|
| analyze_market | ✅ 완전 구현 | 22개 Binance API 병렬, 15-layer 분석 |
| scan_market | ✅ 완전 구현 | topN / custom 모드 |
| check_social | ✅ 완전 구현 | CoinGecko + trending |
| chart_control | ✅ 완전 구현 | 클라이언트 사이드 액션 |
| save_pattern | ✅ Phase 2 완료 | agent_memories PLAYBOOK |
| submit_feedback | ✅ Phase 2 완료 | SUCCESS/FAILURE_CASE |
| query_memory | ✅ Phase 2 완료 | ILIKE 검색 |

### 인텐트 분류기 (8종)
greeting / quick_ask / deep_analyze / scan / social / chart_ctrl / pattern_save / convo

### LLM 폴백 체인
Cerebras → Groq → Mistral → HF → OpenRouter → Grok → Kimi → Qwen → DeepSeek → Gemini → Ollama

## 다음 가능한 작업

1. **병렬 툴 실행**: LLM이 한 턴에 multiple tool_calls 반환 시 `Promise.all`로 병렬 실행
2. **Hermes식 Telegram 게이트웨이**: Alpha Score 임계값 초과 시 자동 알림
3. **memory scoring 개선**: l2Search의 scoreMemory에 심볼 매칭 실제 구현 (현재 하드코딩 0.5)
4. **Gemini 스트리밍**: 현재 non-streaming 폴백, 실제 스트리밍 구현 가능

## Why
- Hermes-agent 분석에서 wtd-v2에 없는 기능으로 메모리 시스템 식별
- Phase 2 스텁이 이미 있었고 DB 인프라(agent_memories, memoryCardBuilder, l2Search)도 준비돼 있었음
