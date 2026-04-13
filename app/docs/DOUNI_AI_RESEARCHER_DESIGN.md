# DOUNI AI Researcher — 최종 설계 문서

> 작성: 2026-04-13 세션
> 상태: Phase 1 구현 완료, Phase 2 대기

---

## 핵심 설계 원칙

### LLM은 선택이 아닌 핵심

```
LLM 없음 = 데이터 터미널 (Bloomberg — 데이터만 표시)
LLM 있음 = AI Researcher (DOUNI — synthesis + insight)
```

AI Researcher의 가치는 **해석(synthesis)**이다. 데이터 표시는 버튼과 다를 게 없다.

→ LLM을 optional로 설계하면 AI researcher가 아닌 데이터 대시보드가 됨.
→ 올바른 접근: **LLM은 핵심, 진입 장벽만 낮추면 됨** (Groq 무료 키, 30초 설정).

### LLM의 역할: 예측이 아닌 번역

```
❌ 잘못된 방식:  LLM에게 "BTC 어때?" 물어봄 → 학습 컷오프 기반 추측 → hallucination
✅ 올바른 방식:  엔진이 신호 계산 → LLM은 계산된 사실을 설명만 함

{ ensemble: 0.72, blocks: [breakout, cvd_bullish], funding: 0.021 }
  → LLM: "breakout + CVD 수렴, funding 과열 구간. 단기 조정 후 재진입 타이밍."
```

**LLM 해석 품질 = f(컨텍스트 품질)**
70B 모델 + 빈약한 컨텍스트 < 7B 모델 + 풍부한 구조화 컨텍스트

---

## 전체 아키텍처

```
유저 입력 (한/영/일 어떤 언어든)
    │
    ▼
[앱] intentClassifier
  → 데이터 fetch (analyze/scan 병렬)
  → douniRuntimeStore 읽기
    │
    ├── TERMINAL → 구조화 UI만 표시 + "AI 설정 필요" 배너
    │
    └── LLM 모드 (HEURISTIC / OLLAMA / API)
          │
          ▼
       [4-Layer Evidence Chain 컨텍스트 조립]
         Layer A: 엔진 팩트 (ensemble, blocks, funding, OI)  — 결정론적
         Layer B: 백테 통계 (승률, 기대값)  — signal_stats.py 조회
         Layer C: Delta (직전 대비 변화만)  — prevSnapshot 비교
         Layer D: 질문 타입 포커스  — "왜?" → 원인만, "위험?" → 리스크만
          │
          ▼
       [시스템 프롬프트] — Static/Dynamic 경계 분리
         STATIC  (캐시 가능): Identity, Constraints, Evidence Chain, Format
         DYNAMIC (매 턴): Language, Memory, SessionSummary, QuestionFocus
          │
          ▼
       [LLM — 번역/종합 역할]
         → hallucination 불가 (팩트 주어짐)
         → 7B 소형 모델로 충분
         → 유저 언어로 자동 응답 (navigator.language)
          │
          ▼
       [TradeMemory 자동 업데이트]
         patterns: 새 백테 통계 누적
         feedback: 유저 교정 감지 → 자동 저장
```

---

## 4-Mode Runtime (Cogochi runtimeStore 패턴)

```typescript
type DouniMode = 'TERMINAL' | 'HEURISTIC' | 'OLLAMA' | 'OPENAI_COMPAT';

interface DouniRuntimeConfig {
  mode: DouniMode;        // 기본: HEURISTIC
  baseUrl: string;        // Ollama: http://127.0.0.1:11434 | Groq: https://api.groq.com/openai/v1
  modelId: string;        // 'qwen2.5:7b' / 'llama-3.1-8b-instant'
  apiKey: string;         // OPENAI_COMPAT만 사용
  temperature: number;    // 기본: 0.2
  timeoutMs: number;      // 기본: 20000
}
// localStorage 'cogochi.douni.runtime.v1' 저장
```

| 모드 | 동작 | 비용 | 설정 |
|------|------|------|------|
| `TERMINAL` | 구조화 UI만, LLM 없음 | 0 | 없음 |
| `HEURISTIC` | 템플릿 합성, LLM 없음 | 0 | 없음 |
| `OLLAMA` | 로컬 AI (Qwen2.5 7B 등) | 0 | Ollama 설치 + URL |
| `OPENAI_COMPAT` | Groq/Gemini/OpenAI 등 | 무료~소액 | API 키 30초 |

**기본값: `HEURISTIC`** — 설정 없이도 의미있는 출력 가능

---

## Evidence Chain 프롬프트 구조

```
[FACTS — 변경 불가, 영어 고정]
Signal: LONG | Ensemble: 0.72 | Confidence: medium

Bullish blocks (3):
  TRIGGER: breakout_above_high — 20일 고점 돌파
  CONFIRMATION: cvd_state_eq — 공격적 매수 지속
  CONFIRMATION: ema_pullback — 20EMA 지지 확인

Bearish blocks (1):
  DISQUALIFIER: volume_below_average — 거래량 평균 이하

[HISTORICAL GROUND TRUTH — signal_stats.py 조회]
  이 조합 (breakout+CVD+ema): 90일 28회, 승률 71%, 기대값 +2.1%
  funding 0.021% 동반 시: 승률 54% (과거 9회)

[DELTA — 직전 대비 변화]
  funding: 0.012% → 0.021% (+75%, 과열 진입)
  ensemble: 0.64 → 0.72 (+수렴)

[LANGUAGE + QUESTION TYPE]
  언어: 한국어
  질문: "왜 올라?" → 원인만 설명. 전체 요약 반복 금지.
```

### Evidence Chain Reasoning Order (시스템 프롬프트에 강제)
1. **SIGNAL** — direction + ensemble strength
2. **EVIDENCE** — top 1-2 blocks/layers that confirm (전부 나열 X)
3. **CONTRADICTION** — conflicts (disqualifiers, opposing signals)
4. **BASE RATE** — win rate if provided (절대 추측 금지)
5. **RISK** — single clearest invalidation condition

---

## 시스템 프롬프트 설계 (Static/Dynamic 분리)

### 정적 섹션 (캐시 가능 — Anthropic prefix cache)
```typescript
getIdentitySection(profile)    // 이름, archetype, 역할
getConstraintsSection()        // "provided data only", "no hallucination"
getEvidenceChainSection()      // 5-step reasoning 강제
getResponseFormatSection()     // "3-5 문장", "실제 숫자 인용"
getToneSection(archetype)      // RIDER/CRUSHER/ORACLE/GUARDIAN 별 포커스
```

### `__DOUNI_DYNAMIC__` 경계

### 동적 섹션 (매 턴 재계산)
```typescript
getLanguageSection(locale)         // "Always respond in Korean."
getQuestionFocusSection(intent)    // "왜?" → 원인만
getMemorySection(memory)           // TradeMemory 주입
getSessionSummarySection(summary)  // compact 후 요약 주입
getSummarizeDataSection()          // Claude Code SUMMARIZE 패턴
```

### 언어 지원
- `navigator.language` → `_localeToLanguageName()` → 자동 언어 지시
- 지원: `ko`, `en`, `ja`, `zh`, `es`, `de`, `fr`, `pt`, `ru`, `vi`, `th` + fallback
- 팩트 패킷은 **영어 고정** (모델 파싱 정확도 유지)
- 응답만 유저 언어로

---

## 컨텍스트 관리 (Claude Code 패턴 적용)

### Auto-compact
```
COMPACT_THRESHOLD = 20턴 → 발동
COMPACT_KEEP_RECENT = 8턴 → 유지
shouldCompactByTokens() → 80K 토큰 초과 시에도 발동

압축 방식: LLM 없이 결정론적
  analyzed: "BTC 4H LONG+46, ETH 1H SHORT-23, SCAN"
  topics:   최근 3개 유저 발화 첫 50자
```

### TradeMemory (MEMORY.md 패턴)
```typescript
interface TradeMemory {
  user:     string[]  // "breakout 진입 선호, 역추세 기피"
  feedback: string[]  // "funding > 0.015% 시 롱 비추 (유저 교정 2회)"
  patterns: string[]  // "BTC breakout+CVD: 90d WR 71% (n=28)"
  market:   string[]  // "BTC $95K 저항 유효, 주간 레인지 $88-95K"
}
MAX_LINES_PER_TYPE = 8
MAX_TOTAL_CHARS    = 4,000
```
- 저장: `localStorage 'cogochi.douni.memory.v1'` + Supabase preferences
- 로드: 세션 시작 시 1회
- 자동 생성: `buildPatternMemoryItem()`, `buildFeedbackMemoryItem()`

### Market Data Clearing
- stale `[Current Analysis]` 섹션 감지 → 자동 제거
- 최신 snapshot만 컨텍스트 유지
- 효과: 분석 10회 누적 ~25K tok → ~3K tok

### 토큰 절감 효과
| 항목 | 이전 | 이후 |
|------|------|------|
| 히스토리 20턴 | ~8K tok | ~2K tok (compact 후) |
| 분석 10회 누적 | ~25K tok | ~3K tok (최신만 유지) |
| 시스템 프롬프트 | 전체 동적 | 정적 섹션 캐시 |

---

## 버그 해결 설계

### 대답 안 하는 버그 (침묵)
```
원인: LLM 호출 실패 → SSE 종료 → 클라이언트 아무것도 못 받음

Fix: fallback 체인 보장
  API 실패
    → HEURISTIC 템플릿 (팩트 기반 문장)
    → raw 숫자 테이블
    → "BTC 신호 계산 완료 — AI 설정 시 해석 제공"
  절대 침묵 없음
```

### 같은 말만 하는 버그 (반복)
```
원인: 동일 snapshot → 동일 context → 동일 LLM 출력

Fix: Delta 감지
  prevSnapshot 저장 (per symbol per tf)
  현재 snapshot과 비교 → 변화 field만 context에 포함

  첫 쿼리:     "BTC 롱 신호 중강도. breakout + CVD bullish."
  동일 쿼리:   "아까랑 비슷한데 funding이 0.015→0.021%. 과열 주의."
  변화 없음:   "직전 대비 유의미한 변화 없음. (앙상블 0.72 유지)"
```

---

## Phase 1 완료 파일 (이번 세션)

| 파일 | 경로 | 역할 |
|------|------|------|
| `douniPersonality.ts` | `app/src/lib/engine/cogochi/douni/` | 섹션 배열 시스템 프롬프트, Evidence Chain, 다국어 |
| `tradeMemory.ts` | `app/src/lib/server/douni/` | 4타입 메모리 시스템 |
| `contextCompact.ts` | `app/src/lib/server/douni/` | Auto-compact + market data clearing |
| `contextBuilder.ts` | `app/src/lib/server/douni/` | 전체 통합 — compact + memory + locale + boundary |

---

## Phase 2 구현 목록 (다음 세션)

### 우선순위 순

| # | 파일 | 역할 | 예상 |
|---|------|------|------|
| 1 | `app/src/lib/stores/douniRuntime.ts` | 4-mode localStorage store | 30분 |
| 2 | `app/src/routes/settings/+page.svelte` | Settings > AI 탭 (모드 선택 + 키 입력 + 테스트) | 45분 |
| 3 | `app/src/routes/terminal/+page.svelte` | `sendCommand()` 4-mode 분기 | 30분 |
| 4 | `app/src/routes/api/cogochi/terminal/message/+server.ts` | `runtimeConfig` body 수신 → LLM 호출 | 45분 |
| 5 | `engine/scoring/signal_stats.py` | 블록 조합 승률 조회 (backtest 재활용) | 60분 |
| 6 | Delta 감지 | prevSnapshot 저장 + diff 계산 | 30분 |
| 7 | Fallback 체인 | 침묵 버그 완전 제거 | 20분 |

### Settings > AI 탭 UI 구조
```
[AI Runtime 설정]
  Mode:      [ HEURISTIC ▾ ]  ← 기본값, 항상 작동
             TERMINAL / HEURISTIC / OLLAMA / API

  Model ID:  [ llama-3.1-8b-instant      ]
  Base URL:  [ https://api.groq.com/openai/v1 ]
  API Key:   [ ●●●●●●●●●●● ]
  Temp:      [ 0.2 ──●────── 1.0 ]

  [ 연결 테스트 ]  ← testRuntimeConnection()
  ● 연결됨 / ✗ 실패
```

---

## 장기 로드맵 (Track A)

### LoRA Fine-tuning (이미 pyproject.toml에 명시됨)
```
유저 거래 기록 (input: 신호 패킷 + output: 승/패)
  ↓
Qwen2.5-7B ORPO fine-tune (backtest 데이터 재활용)
  ↓
이 시스템 신호에 특화된 모델
  → general LLM 대비 해석 품질 비교 불가
```

### signal_stats.py (Phase 2, #5)
```python
# engine/scoring/signal_stats.py
def query_block_combination_stats(
    active_blocks: list[str],
    lookback_days: int = 90,
) -> SignalStats:
    """현재 활성 블록 조합의 과거 통계. backtest 모듈 재활용."""
    # 90일 같은 블록 조합 발화 시점 → walk_one_trade() → 통계
    return SignalStats(
        n_occurrences=28,
        win_rate=0.71,
        expectancy_pct=2.1,
        avg_max_drawdown_before_exit=1.8,
    )
```

---

## 참고: Claude Code 적용 패턴

| Claude Code 패턴 | DOUNI 적용 |
|-----------------|-----------|
| `getLanguageSection(locale)` | `_getLanguageSection(locale)` — 유저 언어 지시 |
| `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | `__DOUNI_DYNAMIC__` — 캐시 경계 마커 |
| `autoCompact.ts` — 160K에서 압축 | `maybeCompactHistory()` — 20턴에서 압축 |
| `SUMMARIZE_TOOL_RESULTS_SECTION` | `_getSummarizeDataSection()` — 중요 숫자 응답에 포함 강제 |
| `clear_tool_uses` | `clearStaleMarketData()` — 이전 시장 데이터 제거 |
| `MEMORY.md` 4타입 | `TradeMemory` (user/feedback/patterns/market) |
| Cogochi `runtimeStore.ts` | `douniRuntime.ts` (TERMINAL/HEURISTIC/OLLAMA/API) |

---

_문서 끝 — 다음 세션은 Phase 2 #1 `douniRuntime.ts`부터 시작_
