# W-0097 P1 — CME OI via CFTC Commitments of Traders 파서

## Goal

`engine/data_cache/fetch_exchange_oi.py` 의 `cme_oi = 0.0` placeholder 를 CFTC COT(Commitments of Traders) 주간 보고서에서 가져온 실데이터로 교체할 수 있게 한다. 분석가 툴킷 커버리지 100% 마지막 갭을 닫는다.

## Owner

engine / data_cache

## Why

CME OI 는 기관 포지션 프록시 중 가장 중요한 지표다. 이제까지는 Coinglass 유료 API 없이 무료로 받을 방법이 없다고 주석 처리돼 있었지만, CFTC 는 `publicreporting.cftc.gov` Socrata REST API 를 통해 TFF 보고서를 무료로 공개한다. 주간 cadence 는 단점이지만, `forward-fill` 로 hourly grid 에 브로드캐스팅하면 perp OI 와 같이 쓸 수 있다.

## Scope (본 커밋)

### 새 모듈: `engine/data_cache/fetch_cme_cot.py`

세 계층으로 분리 — 각 계층이 독립적으로 테스트 가능:

```python
parse_cot_rows(rows)           → pd.DataFrame       # 순수 파서
fetch_cot_latest(http_getter)  → pd.DataFrame|None  # Socrata 호출
resolve_cme_oi_for_symbol(...) → pd.Series          # 주간→시간 ffill
```

- **Socrata endpoint**: `https://publicreporting.cftc.gov/resource/gpe5-46if.json`
- **Commodity → 심볼 매핑** (`SYMBOL_TO_COT_COMMODITIES`):
  - `BTCUSDT` ← `BITCOIN` (5 BTC/계약) + `MICRO BITCOIN` (0.1 BTC/계약)
  - `ETHUSDT` ← `ETHER` (50 ETH/계약) + `MICRO ETHER` (0.1 ETH/계약)
- **Multiplier 변환**: 보고된 `open_interest_all` (계약 수) 를 base-asset 단위로 환산. 호출자는 spot price 로 USD notional 변환 가능.
- **Dedup 정책**: 같은 (date, commodity) 중복 시 마지막 값 유지 (CFTC 리비전 반영)
- **Symbol scope**: BTC/ETH 이외 심볼은 zero 시리즈 반환 (기존 placeholder 시맨틱 보존)

### 통합: `fetch_exchange_oi.py` 환경변수 flag

```python
if os.environ.get("CME_OI_ENABLED", "").lower() in ("1", "true", "yes"):
    df["cme_oi"] = resolve_cme_oi_for_symbol(symbol, df.index, fetch_cot_latest())
else:
    df["cme_oi"] = 0.0  # placeholder — 기존 동작
```

- **기본값 off**. 프로덕션에서 Socrata endpoint 검증 후 명시적으로 켬.
- 예외 시 0 fallback (가용성 우선).

### 변경된 파일

- `engine/data_cache/fetch_cme_cot.py` — 신규 (241 lines)
- `engine/data_cache/fetch_exchange_oi.py` — CME_OI_ENABLED flag 분기 + 모듈 docstring 업데이트
- `engine/tests/test_fetch_cme_cot.py` — 22개 신규 테스트

## Non-Goals

- Live 호출 검증 (endpoint 실제 스키마 확인) — 프로덕션 smoke test 로 분리
- `fetch_cme_cot` 를 registry 에 신규 스코프로 등록
- CME contract-count → USD notional 환산 (호출 쪽에서 spot price 로 곱함)
- Coinglass 통합

## Facts

- CFTC TFF 보고서 cadence: 매주 금요일 3:30 PM ET, 이전 화요일 settlement 기준.
- CME BTC 선물 multiplier: 5 BTC/계약, MICRO BTC: 0.1 BTC/계약.
- Socrata endpoint: `publicreporting.cftc.gov/resource/gpe5-46if.json`.
- Forward-fill 규칙: 보고일 `t_r` 이후 hourly bar `t_bar >= t_r` 에서 같은 값 유지. 첫 보고일 이전은 0.

## Test Evidence

- `tests/test_fetch_cme_cot.py` — 22 passed
  - parser 8개: 알려진 commodity 필터, UTC 인덱스, dedup, case-insensitive, 누락 필드, 문자열 OI, 빈 입력, 정렬
  - fetcher 4개: URL/param 조립, None 전파, 빈 응답, 커스텀 endpoint
  - resolver 10개: unsupported 심볼→0, 빈 COT→0, None COT→0, 과거 바→0 & 보고 이후 forward-fill, micro+full 합산, 다음 주 교체, ETH 매핑, 심볼 격리, 인덱스 보존, 매핑 커버리지
- `tests/test_fetch_cme_cot.py + test_fetch_exchange_oi.py` — 28 passed (회귀 없음, flag off)

## Exit Criteria

- [x] `parse_cot_rows` pure 파서 (네트워크 독립)
- [x] `fetch_cot_latest` 가 injectable http_getter 로 Socrata API 호출 가능
- [x] `resolve_cme_oi_for_symbol` 가 weekly → hourly forward-fill 을 올바르게 수행
- [x] BTCUSDT/ETHUSDT 에만 적용, 다른 심볼은 zero 유지
- [x] 기존 `fetch_exchange_oi` 테스트 그린 (flag off 시 기존 동작)
- [x] `CME_OI_ENABLED` 환경변수로 프로덕션에서 opt-in 가능

## Next Steps

- Staging 에서 `CME_OI_ENABLED=1` 로 live 호출 검증 → 실제 응답 스키마 확인
- `fetch_cme_cot` 를 registry 에 cross-symbol scope 로 등록 (심볼당 호출 불필요, 공용 캐시)
- CME OI 변화율을 building block 으로 승격 (`cme_oi_buildup`, `cme_oi_drawdown`)
- ETHER 행이 있는 주가 불규칙 → 빈 주 fallback 문서화
