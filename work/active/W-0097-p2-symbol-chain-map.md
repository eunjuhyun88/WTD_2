# W-0097 P2 — SYMBOL_CHAIN_MAP 확장 + 검증 게이트

## Goal

`engine/data_cache/fetch_okx_smart_money.SYMBOL_CHAIN_MAP` 에 검증된 심볼을 추가해 whale-accumulation 신호 탐지 커버리지를 확장한다. 앞으로 심볼을 추가할 때 포맷 오류가 CI 게이트에 걸리도록 검증 helper 를 같이 도입한다.

## Why

map 의 잘못된 컨트랙트 주소는 크래시가 아닌 "silent empty response" 로 드러나 디버깅이 어렵다. 형식 수준의 regression gate 가 있으면 "Solana 주소 32-44자", "Ethereum 주소 0x+40hex" 같은 사고를 코드 리뷰 전에 검출할 수 있다.

## Scope

### 신규 심볼 (2)

| Symbol | Chain | Address | 출처 |
|--------|-------|---------|------|
| `TRUMPUSDT`  | 501 (Solana) | `6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN` | Coinbase Assets X post |
| `POPCATUSDT` | 501 (Solana) | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` | Coinbase Assets X post |

설계문서에 있던 나머지 후보(MELANIA/MOODENG/NEIRO/MOG/BRETT/BANANA)는 공개 신뢰 소스에서 단일 확정 주소를 확인하지 못했으므로 **이번 슬라이스에서 제외**. 주소 확정 후 별도 슬라이스로 추가 권장.

### 검증 helper

```python
validate_symbol_chain_map(mapping=None) -> list[str]
```

- `None` 이면 built-in `SYMBOL_CHAIN_MAP` 을 검증.
- 반환: 위반 엔트리마다 한 줄 에러 메시지. 빈 리스트 = OK.
- 규칙:
  - value 는 2-tuple
  - chain_index ∈ {"", "1", "501"}  (`SUPPORTED_CHAIN_INDICES`)
  - `""` chain 은 address 도 `""` (CEX-native)
  - Ethereum ("1"): `0x` + 40 hex (42 chars)
  - Solana ("501"): 32-44 chars
  - on-chain chain 에서 address 누락 금지

**Import-time assert 대신 helper 로 유지한 이유**: 주소 포맷이 바뀌거나 새 체인이 추가될 때 서비스가 부팅되지 않는 실패보다 CI 에서 걸리는 실패가 안전하다.

### 변경된 파일

- `engine/data_cache/fetch_okx_smart_money.py` — +2 심볼, `SUPPORTED_CHAIN_INDICES`, `validate_symbol_chain_map()`, 추가 가이드 주석
- `engine/tests/test_symbol_chain_map.py` — 11개 신규 테스트

## Non-Goals

- 나머지 6개 심볼 추가 (주소 공식 확인 후 별도 슬라이스)
- 외부 JSON 파일 기반 map 로드 (스코프 외)
- OKX API 응답 포맷 변경 대응

## Test Evidence

- `tests/test_symbol_chain_map.py` — 11 passed
  - built-in map 유효성 / SUPPORTED_CHAIN_INDICES 커버 /
    CEX-native 규칙 / TRUMP+POPCAT 등록 확인 /
    validator 의 6가지 에러 케이스
- `tests/test_symbol_chain_map.py + test_confirmations_smart_money_accumulation.py` — 19 passed

## Exit Criteria

- [x] `TRUMPUSDT`, `POPCATUSDT` 가 `SYMBOL_CHAIN_MAP` 에 등록
- [x] `validate_symbol_chain_map()` helper + 11개 테스트
- [x] 전체 map 이 검증 통과 (`errors == []`)
- [x] 기존 smart_money_accumulation 회귀 green

## Next Steps

- MELANIA/MOODENG/NEIRO/MOG/BRETT/BANANA 주소 확정 → 추가 PR
- 매달 CoinGecko/Etherscan 에서 `SYMBOL_CHAIN_MAP` 자동 동기화 스크립트 (optional)
