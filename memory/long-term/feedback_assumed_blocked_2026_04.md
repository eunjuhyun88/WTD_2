---
name: don't claim "blocked" without verifying the public surface first
description: Caught assuming Binance klines fetch needed auth. Public API works. User had to point this out.
type: feedback
---

Before declaring a step "blocked on external data" or "blocked on credentials", check whether the data source has a free public API path.

**Why**: During W-0086 session (2026-04-18), assumed H6 multi-symbol benchmark expansion was blocked on online Binance klines fetch. User pushed back: "비슷한걸 여러 바이낸스알파코인에 다 적용해보는건 어때". `engine/data_cache/fetch_binance.py` and `fetch_binance_perp.py` already shipped working public-API fetchers — `fetch_futures_klines_max(sym)` works without auth. Five minutes of inspection would have unblocked the entire H6 axis. The premature "blocked" assessment cost a session-spanning insight (the overfit reframe).

**How to apply**:
- When about to write "blocked on X for separate session", do a 30-second check: does the repo already have a working fetcher / client / wrapper for X? `grep -rn 'requests\|fetch\|httpx\|urlopen' engine/data_cache/` etc.
- Public APIs (Binance spot/futures klines, CoinGecko, ETH gas APIs, etc.) require no auth. Check the URL pattern in any existing fetcher before claiming auth is needed.
- "Blocked on online fetch" is a low-cost claim with high opportunity cost — verify before deferring.
