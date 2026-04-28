---
name: Orderbook & Flow Reference Repos
description: Reference implementations for Book Panel, Trade Tape, orderbook visualization, futures arbitrage scanner
type: reference
---

레퍼런스 repo 목록 (Book Panel / Trade Tape / Flow 구현 시 참고):

- https://github.com/karpathy/nanoGPT — (context: 왜 이게 여기 있는지 불명확, trading terminal 레퍼런스로 공유됨)
- https://github.com/flowsurface-rs/flowsurface/pull/63 — Rust trading terminal flowsurface PR #63, orderbook/flow visualization 레퍼런스
- https://github.com/jose-donato/crypto-orderbook — JS crypto orderbook 구현
- https://github.com/jose-donato/crypto-futures-arbitrage-scanner — JS crypto futures arbitrage scanner

**How to apply:** Book Panel (priority 4) 및 Trade Tape (priority 5) 구현 시 참고.
flowsurface는 Rust이지만 DOM structure / data model 참고 가능.
crypto-orderbook은 JS라 직접 코드 참고 가능.
