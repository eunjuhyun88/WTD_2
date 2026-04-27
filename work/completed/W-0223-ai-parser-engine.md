# W-0223 — AI Parser Engine 설계

**Owner**: engine | **Branch**: `feat/A03-ai-parser-engine` | **Issue**: #365

---

## 무엇을 만드는가

`POST /patterns/parse`: 자유 텍스트 트레이딩 메모 → PatternDraftBody JSON.

**사용 시나리오**:
> 사용자 입력: "OI가 급등하면서 가격이 횡보하고 있음. 펀딩은 과열. 숏 스퀴즈 올 것 같음."
> 출력: PatternDraftBody { phase_sequence: ["ACCUMULATION"], key_signals: ["oi_spike_with_dump", "funding_flip"], ... }

---

## API 명세

### Request

`POST /patterns/parse`

```json
{
  "text": "OI가 급등하면서 가격이 횡보중. 펀딩 과열.",
  "symbol": "BTCUSDT"  // optional, 힌트용
}
```

### Response (200)

```json
{
  "phase_sequence": ["ACCUMULATION", "BREAKOUT"],
  "key_signals": ["oi_spike_with_dump", "funding_flip", "sideways_compression"],
  "entry_condition": "breakout_above_high",
  "disqualifiers": ["volume_dryup"],
  "confidence": 0.72,
  "ambiguities": ["btc_corr 불명확"],
  "schema_version": 1
}
```

### Error Responses

| 상태 | 원인 |
|------|------|
| 400 | text 비어있거나 너무 짧음 (< 10자) |
| 422 | Claude 응답 파싱 실패 (2회 재시도 후) |
| 503 | ANTHROPIC_API_KEY 미설정 |

---

## 내부 구조

### 1. ContextAssembler.for_parser()

**파일**: `engine/agents/context.py`

```python
@dataclass
class ParseTextContext:
    system_prompt: str    # ~8K tokens, CACHED
    token_estimate: int   # ~8500

class ContextAssembler:
    def for_parser(self, symbol: str | None = None) -> ParseTextContext:
        system = """
        당신은 암호화폐 선물 트레이딩 패턴 분석 AI입니다.
        
        [허용 phase_sequence 값]
        FAKE_DUMP, ARCH_ZONE, REAL_DUMP, ACCUMULATION, BREAKOUT
        
        [허용 key_signals (일부)]
        oi_spike_with_dump, funding_flip, sideways_compression,
        higher_lows_sequence, bollinger_squeeze, volume_dryup,
        cvd_price_divergence, smart_money_accumulation, ...
        (92개 전체 목록)
        
        [출력 형식] JSON만, 마크다운 금지
        {
          "phase_sequence": [...],
          "key_signals": [...],
          "entry_condition": "...",
          "disqualifiers": [...],
          "confidence": 0.0~1.0,
          "ambiguities": [...]
        }
        """
        return ParseTextContext(system_prompt=system, token_estimate=8500)
```

### 2. Claude 호출 (Prompt Cache 적용)

```python
async def _call_claude(system: str, user_text: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=800,
        system=[{
            "type": "text",
            "text": system,
            "cache_control": {"type": "ephemeral"}  # 핵심: 비용 90% 절감
        }],
        messages=[{"role": "user", "content": user_text}]
    )
    return json.loads(response.content[0].text)
```

### 3. Retry 로직

```python
async def parse_pattern_text(body: ParseRequest) -> PatternDraftBody:
    for attempt in range(3):  # 최대 3회 (초기 1 + 재시도 2)
        try:
            raw = await _call_claude(ctx.system_prompt, user_msg)
            return _validate_draft(raw)
        except (json.JSONDecodeError, ValueError) as e:
            if attempt == 2:
                raise HTTPException(422, f"파싱 실패: {e}")
            # 재시도 시 피드백 추가
            user_msg += f"\n\n이전 응답 오류: {e}. JSON 형식을 정확히 지켜주세요."
```

---

## 비용 계산

| 항목 | 값 |
|------|-----|
| 모델 | Claude Sonnet 4.5 |
| Input (system, CACHED) | ~8,500 tokens → $0.30/M × 0.1 = **$0.00026** |
| Input (user text) | ~300 tokens → $3/M = **$0.0009** |
| Output | ~500 tokens → $15/M = **$0.0075** |
| **1회 총 비용** | **~$0.008** (캐시 히트 기준) |
| 캐시 미적용 비교 | ~$0.04/call (5배 차이) |

---

## 파일별 변경 목록

| 파일 | 변경 |
|------|------|
| `engine/pyproject.toml` | `anthropic>=0.25` 추가 |
| `engine/agents/context.py` | `for_parser()` 완성, `ParseTextContext` 추가 |
| `engine/api/routes/patterns.py` | `POST /patterns/parse` 추가, `ParseRequest` 스키마 |
| `engine/tests/test_parser.py` | mock anthropic 5개 테스트 |

---

## Exit Criteria
- POST `/patterns/parse` → PatternDraftBody 반환
- `cache_control: ephemeral` 적용 확인
- 재시도 2회 이내
- Engine CI pass
