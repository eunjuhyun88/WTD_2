# W-0409 — alpha_scan / 유사 AI tool 실제 데이터 배선 또는 제거

> Wave: 6 | Priority: P2 | Effort: M
> Charter: AI Agent 품질 + 보안 (환각 tool 제거 또는 실제 데이터 배선)
> Status: 🔵 분석 완료 / 구현 대기
> Created: 2026-05-05

## Goal

`alpha_scan`(및 유사 tool)은 실제 OI/펀딩 데이터 없이 LLM을 중첩 호출하여 환각된 "분석"을 반환한다. 이를 (a) 실제 Binance Futures 데이터로 교체하거나 (b) 실제 데이터 연결 전까지 TOOL_SCHEMAS에서 제거한다.

## 현재 상태 분석

### 취약점 위치
- `engine/agents/registry.py:228-255` (추정 — 확인 필요)

### 현재 동작 패턴
```python
# 현재 (문제)
async def alpha_scan(symbol: str, ...) -> str:
    prompt = f"Analyze open interest and funding for {symbol}"
    result = await generate_llm_text(prompt)   # 실제 데이터 없이 LLM에 질문
    return result  # 환각 출력
```

### 위험도
| Risk | Severity | 설명 |
|---|---|---|
| 환각 분석 → 사용자 트레이딩 판단 오류 | HIGH | 실제 OI/펀딩 데이터 없이 LLM이 만든 "분석" = 허위 정보 |
| 중첩 LLM 호출 지연 | MED | 200-2000ms 추가 레이턴시, 비용 2배 |
| Prompt injection via tool | MED | tool 내부 LLM은 별도 방어 레이어 없음 |

## 옵션 분석

### Option A — 실제 데이터 배선 (권장, 중기)
**대상 데이터**:
1. **Open Interest**: `GET https://fapi.binance.com/fapi/v1/openInterest?symbol={symbol}` (공개 API, 인증 불필요)
2. **Funding Rate**: `GET https://fapi.binance.com/fapi/v1/fundingRate?symbol={symbol}&limit=10` (공개 API)
3. **OI History**: `GET https://fapi.binance.com/futures/data/openInterestHist?symbol={symbol}&period=5m&limit=48` (공개 API)

**구현 방향**:
```python
async def alpha_scan(symbol: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        oi, funding = await asyncio.gather(
            client.get(f"https://fapi.binance.com/fapi/v1/openInterest?symbol={symbol}"),
            client.get(f"https://fapi.binance.com/fapi/v1/fundingRate?symbol={symbol}&limit=3"),
        )
    oi_data = oi.json()
    funding_data = funding.json()
    # LLM 없이 구조화된 데이터 반환
    return {
        "symbol": symbol,
        "open_interest_usdt": float(oi_data.get("openInterest", 0)),
        "current_funding_rate": float(funding_data[-1].get("fundingRate", 0)) if funding_data else 0,
        "funding_history": [{"time": f["fundingTime"], "rate": f["fundingRate"]} for f in funding_data],
    }
```

**장점**: 실제 데이터 = 신뢰 가능, 중첩 LLM 제거 → 레이턴시 개선, 비용 절감

**단점**: Binance Futures API가 모든 심볼 지원 안 할 수 있음 (spot-only 심볼 예외 처리 필요)

### Option B — Tool 임시 제거 (즉시 적용 가능)
**방식**: `TOOL_SCHEMAS`에서 `alpha_scan` 제거, TOOL_DISPATCHER에서 핸들러 제거

**장점**: 즉시 환각 차단, 구현 5분

**단점**: 기능 손실 — 실제 배선 완료 전까지 tool 없음

**권장**: Option B를 즉시 적용 → Option A로 재등록하는 2-PR 방식

## 구현 계획

### PR1 — 환각 tool 즉시 제거 (Option B 즉시 적용)
- `engine/agents/registry.py`: `alpha_scan` 및 유사 LLM 중첩 tool을 `TOOL_SCHEMAS`에서 제거
- `engine/agents/tools/`: 해당 핸들러 함수를 `_disabled/` 폴더로 이동 (삭제 아님 — 재활용 가능)
- 테스트: tool list에 `alpha_scan` 미포함 확인

### PR2 — 실제 Binance Futures 데이터 배선 (Option A)
- `engine/agents/tools/market_tools.py` 신규 (또는 기존 파일에 추가)
- `get_open_interest(symbol)`: Binance Futures OI 실시간 + 히스토리
- `get_funding_rate(symbol)`: 현재 + 최근 3회 펀딩레이트
- 두 tool을 `TOOL_SCHEMAS`에 재등록 (새 이름 또는 `alpha_scan` 복원)
- 심볼 검증: `USDT` perp contract 아닌 경우 `{"error": "Futures contract not found"}` 반환
- Rate limit: Binance 공개 API는 1200 weight/min — OI+funding 동시 조회는 2 weight

## 재확인 필요 사항

다음 파일을 구현 전 반드시 확인:
1. `engine/agents/registry.py` — `alpha_scan` 등록 위치 및 실제 코드
2. `engine/agents/tools/` — 해당 tool 파일 위치
3. `engine/agents/dispatch.py` (또는 유사) — tool dispatcher 구조

> **주의**: 이 work item 작성 시점에 실제 코드를 grep하지 않았음.
> 구현 전 `grep -r "alpha_scan" engine/` 실행 후 실제 위치 확인 필수.

## Exit Criteria

### PR1
- [ ] `grep -r "alpha_scan" engine/agents/registry.py` → 0 hits
- [ ] tool list API 응답에 `alpha_scan` 미포함
- [ ] 기존 테스트 통과

### PR2
- [ ] `get_open_interest("BTCUSDT")` → `{"symbol": "BTCUSDT", "open_interest_usdt": ...}` (실제 숫자)
- [ ] `get_funding_rate("BTCUSDT")` → `{"current_rate": ..., "history": [...]}` (실제 데이터)
- [ ] `get_open_interest("AAPL")` → `{"error": "..."}` (Futures 미지원 심볼 예외 처리)
- [ ] LLM 중첩 호출 없음 (`generate_llm_text` import 미사용)
- [ ] 레이턴시 < 1000ms (Binance API 단순 fetch)

## 의존성

- PR1: 없음 (즉시 가능)
- PR2: PR1 이후 (또는 병렬 가능), Binance Futures API 접근 가능 환경

## 파일 (예상)

- `engine/agents/registry.py`
- `engine/agents/tools/market_tools.py` (PR2 신규)
- 기존 alpha_scan 핸들러 파일 → `engine/agents/tools/_disabled/`
