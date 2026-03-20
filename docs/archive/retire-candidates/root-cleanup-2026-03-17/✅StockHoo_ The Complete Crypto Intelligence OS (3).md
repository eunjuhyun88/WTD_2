# **StockHoo 완전 무료 데이터 소스 종합 가이드**

## **1\. 거래소 무료 API (실시간 데이터)**

### **1.1 Binance (세계 최대 거래소)**

**공식 문서**

* API 문서: https://binance-docs.github.io/apidocs/spot/en/  
* WebSocket 문서: https://binance-docs.github.io/apidocs/websocket\_api/en/

**REST API 엔드포인트**

* 서버 시간: https://api.binance.com/api/v3/time  
* 거래소 정보: https://api.binance.com/api/v3/exchangeInfo  
* 호가창: https://api.binance.com/api/v3/depth?symbol=BTCUSDT  
* 최근 체결: https://api.binance.com/api/v3/trades?symbol=BTCUSDT  
* 캔들 데이터: https://api.binance.com/api/v3/klines?symbol=BTCUSDT\&interval=1h  
* 24시간 통계: https://api.binance.com/api/v3/ticker/24hr  
* 현재가: https://api.binance.com/api/v3/ticker/price

**WebSocket 스트림**

* 베이스 URL: wss://stream.binance.com:9443/ws  
* 베이스 URL (백업): wss://stream.binance.com:443/ws  
* 체결 스트림: wss://stream.binance.com:9443/ws/btcusdt@trade  
* 캔들 스트림: wss://stream.binance.com:9443/ws/btcusdt@kline\_1h  
* 호가창 스트림: wss://stream.binance.com:9443/ws/btcusdt@depth

**Binance Futures (파생상품)**

* REST API: https://binance-docs.github.io/apidocs/futures/en/  
* 미결제약정: https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT  
* 펀딩 레이트: https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT  
* 청산 주문: https://fapi.binance.com/fapi/v1/allForceOrders?symbol=BTCUSDT  
* 롱숏 비율: https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT\&period=5m

### **1.2 Bybit**

**공식 문서**

* API v5 문서: https://bybit-exchange.github.io/docs/v5/intro  
* GitHub: https://github.com/bybit-exchange/api-usage-examples

**REST API**

* 서버 시간: https://api.bybit.com/v5/market/time  
* 캔들 데이터: https://api.bybit.com/v5/market/kline?category=spot\&symbol=BTCUSDT\&interval=60  
* 호가창: https://api.bybit.com/v5/market/orderbook?category=spot\&symbol=BTCUSDT  
* 최근 체결: https://api.bybit.com/v5/market/recent-trade?category=spot\&symbol=BTCUSDT  
* 시장 정보: https://api.bybit.com/v5/market/instruments-info?category=spot

**WebSocket**

* Public Topics: wss://stream.bybit.com/v5/public/spot  
* 구독 예시: {"op":"subscribe","args":\["orderbook.50.BTCUSDT"\]}

**파생상품 데이터**

* 펀딩 레이트 히스토리: https://api.bybit.com/v5/market/funding/history?category=linear\&symbol=BTCUSDT  
* 미결제약정: https://api.bybit.com/v5/market/open-interest?category=linear\&symbol=BTCUSDT\&intervalTime=5min  
* 대형 거래: https://api.bybit.com/v5/market/account-ratio?category=linear\&symbol=BTCUSDT\&period=5min

### **1.3 OKX (OKEx)**

**공식 문서**

* API 문서: https://www.okx.com/docs-v5/en/\#overview  
* GitHub: https://github.com/okex/V5-Open-API-SDK

**REST API**

* 시장 데이터: https://www.okx.com/api/v5/market/tickers?instType=SPOT  
* 캔들 데이터: https://www.okx.com/api/v5/market/candles?instId=BTC-USDT  
* 호가창: https://www.okx.com/api/v5/market/books?instId=BTC-USDT  
* 체결 데이터: https://www.okx.com/api/v5/market/trades?instId=BTC-USDT

**WebSocket**

* Public Channel: wss://ws.okx.com:8443/ws/v5/public  
* Business Channel: wss://ws.okx.com:8443/ws/v5/business

### **1.4 KuCoin**

**공식 문서**

* API 문서: https://docs.kucoin.com/  
* SDK: https://github.com/Kucoin/kucoin-python-sdk

**REST API**

* 서버 시간: https://api.kucoin.com/api/v1/timestamp  
* 심볼 목록: https://api.kucoin.com/api/v1/symbols  
* 티커: https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT  
* 캔들: https://api.kucoin.com/api/v1/market/candles?type=1hour\&symbol=BTC-USDT  
* 거래 히스토리: https://api.kucoin.com/api/v1/market/histories?symbol=BTC-USDT

### **1.5 Gate.io**

**공식 문서**

* API v4 문서: https://www.gate.io/docs/developers/apiv4/  
* GitHub: https://github.com/gateio/rest

**REST API**

* 거래쌍 목록: https://api.gateio.ws/api/v4/spot/currency\_pairs  
* 티커: https://api.gateio.ws/api/v4/spot/tickers  
* 호가창: https://api.gateio.ws/api/v4/spot/order\_book?currency\_pair=BTC\_USDT  
* 캔들: https://api.gateio.ws/api/v4/spot/candlesticks?currency\_pair=BTC\_USDT

### **1.6 Kraken**

**공식 문서**

* REST API: https://docs.kraken.com/rest/  
* WebSocket API: https://docs.kraken.com/websockets/

**REST API**

* 서버 시간: https://api.kraken.com/0/public/Time  
* 자산 정보: https://api.kraken.com/0/public/Assets  
* 티커: https://api.kraken.com/0/public/Ticker?pair=XBTUSD  
* OHLC: https://api.kraken.com/0/public/OHLC?pair=XBTUSD  
* 호가창: https://api.kraken.com/0/public/Depth?pair=XBTUSD

## **2\. DEX 데이터 (탈중앙화 거래소)**

### **2.1 Uniswap**

**The Graph Protocol 서브그래프**

* V3 Subgraph: https://thegraph.com/explorer/subgraphs/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV  
* V2 Subgraph: https://thegraph.com/explorer/subgraphs/8eDpUcpwT9tYPXJQvYcXfWxYJvqeoLGaMN2p4Hs6KQXU

**직접 쿼리 예시**

```
https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3
```

### **2.2 PancakeSwap (BSC)**

**The Graph**

* V3: https://thegraph.com/explorer/subgraphs/HcfN3vXfxPLcmNt7KkJC5r5Qy8eNEfYnKohfFsUsQPCk  
* V2: https://thegraph.com/explorer/subgraphs/8eDpUcpwT9tYPXJQvYcXfWxYJvqeoLGaMN2p4Hs6KQXU

### **2.3 SushiSwap**

**Analytics API**

* 문서: https://docs.sushi.com/docs/Developers/Overview  
* Subgraph: https://thegraph.com/explorer/subgraphs/6hXn7djLYyLCvmpRcVjsCjP5MoqSJh2gVgXFu7sHC3yJ

### **2.4 Dexscreener (DEX 통합)**

**무료 API**

* 문서: https://docs.dexscreener.com/api/reference  
* 페어 검색: https://api.dexscreener.com/latest/dex/search?q=WBTC  
* 페어 정보: https://api.dexscreener.com/latest/dex/pairs/bsc/0x0eD7e52944161450477ee417DE9Cd3a859b14fD0  
* 토큰 정보: https://api.dexscreener.com/latest/dex/tokens/0x2170Ed0880ac9A755fd29B2688956BD959F933F8

## **3\. 온체인 데이터**

### **3.1 Etherscan (이더리움)**

**API 문서**

* 공식 문서: https://docs.etherscan.io/  
* API 키 신청: https://etherscan.io/apis (무료 5 calls/sec)

**주요 엔드포인트**

* 계정 잔고: https://api.etherscan.io/api?module=account\&action=balance\&address={address}  
* 거래 목록: https://api.etherscan.io/api?module=account\&action=txlist\&address={address}  
* 토큰 전송: https://api.etherscan.io/api?module=account\&action=tokentx\&address={address}  
* 가스 가격: https://api.etherscan.io/api?module=gastracker\&action=gasoracle

### **3.2 BSCScan (바이낸스 스마트 체인)**

**API 문서**

* 공식: https://docs.bscscan.com/  
* Etherscan과 동일한 API 구조

### **3.3 Polygonscan**

**API 문서**

* 공식: https://docs.polygonscan.com/  
* API: https://api.polygonscan.com/api

### **3.4 Blockchain.com**

**API 문서**

* 공식: https://www.blockchain.com/explorer/api/blockchain\_api

**비트코인 데이터**

* 블록 정보: https://blockchain.info/rawblock/{block\_hash}  
* 주소 정보: https://blockchain.info/rawaddr/{address}  
* 미확인 거래: https://blockchain.info/unconfirmed-transactions?format=json  
* 차트 데이터: https://api.blockchain.info/charts/{chart-type}?timespan=5weeks\&format=json

### **3.5 Blockchair (멀티체인)**

**API 문서**

* 공식: https://blockchair.com/api/docs  
* 무료 한도: 1,440 requests/day

**Universal API**

* BTC: https://api.blockchair.com/bitcoin/stats  
* ETH: https://api.blockchair.com/ethereum/stats  
* 다중 체인 통계: https://api.blockchair.com/stats

### **3.6 Bitquery (GraphQL)**

**문서 및 Playground**

* 문서: https://docs.bitquery.io/  
* GraphQL IDE: https://graphql.bitquery.io/  
* 무료 한도: 10 API points/month

### **3.7 무료 노드 제공자**

**Alchemy**

* 가입: https://www.alchemy.com/  
* 무료: 300M compute units/월  
* 이더리움 메인넷: https://eth-mainnet.g.alchemy.com/v2/your-api-key

**Infura**

* 가입: https://infura.io/  
* 무료: 100K requests/day  
* 이더리움: https://mainnet.infura.io/v3/your-project-id

**QuickNode**

* 가입: https://www.quicknode.com/  
* 무료 트라이얼: 7일

**Ankr**

* 문서: https://www.ankr.com/docs/  
* 퍼블릭 RPC: https://rpc.ankr.com/eth (제한적)

## **4\. 소셜/센티먼트 데이터**

### **4.1 Twitter/X**

**무료 방법**

* Nitter 인스턴스들: https://github.com/zedeus/nitter/wiki/Instances  
* Twitter 고급 검색: https://twitter.com/search-advanced

### **4.2 Reddit**

**공식 API**

* 문서: https://www.reddit.com/dev/api/  
* OAuth 필요하지만 무료

**주요 서브레딧 RSS**

* r/Bitcoin: https://www.reddit.com/r/Bitcoin/.rss  
* r/ethereum: https://www.reddit.com/r/ethereum/.rss  
* r/cryptocurrency: https://www.reddit.com/r/cryptocurrency/.rss

### **4.3 Google Trends**

**Pytrends (비공식)**

* GitHub: https://github.com/GeneralMills/pytrends  
* 문서: https://pypi.org/project/pytrends/

### **4.4 무료 센티먼트 API**

**Alternative.me Crypto Fear & Greed Index**

* API: https://api.alternative.me/fng/  
* 문서: https://alternative.me/crypto/fear-and-greed-index/

**CoinGecko 센티먼트 투표**

* 포함됨: https://api.coingecko.com/api/v3/coins/{id}

## **5\. 가격/시장 데이터 통합**

### **5.1 CoinGecko (최고의 무료 옵션)**

**API 문서**

* 공식: https://www.coingecko.com/en/api/documentation  
* 무료 한도: 50 calls/minute

**주요 엔드포인트**

* 코인 목록: https://api.coingecko.com/api/v3/coins/list  
* 시장 데이터: https://api.coingecko.com/api/v3/coins/markets?vs\_currency=usd\&order=market\_cap\_desc  
* 코인 정보: https://api.coingecko.com/api/v3/coins/{id}  
* OHLC: https://api.coingecko.com/api/v3/coins/{id}/ohlc?vs\_currency=usd\&days=7  
* 거래소 목록: https://api.coingecko.com/api/v3/exchanges  
* 글로벌 데이터: https://api.coingecko.com/api/v3/global

### **5.2 CoinMarketCap**

**API 문서**

* 공식: https://coinmarketcap.com/api/documentation/v1/  
* 무료 가입: https://pro.coinmarketcap.com/signup  
* 무료 한도: 333 credits/day

### **5.3 CoinCap**

**API 문서**

* 공식: https://docs.coincap.io/  
* 완전 무료, 제한 없음

**엔드포인트**

* 자산 목록: https://api.coincap.io/v2/assets  
* 가격 히스토리: https://api.coincap.io/v2/assets/bitcoin/history?interval=d1  
* 거래소: https://api.coincap.io/v2/exchanges  
* 시장: https://api.coincap.io/v2/markets

### **5.4 CryptoCompare**

**API 문서**

* 공식: https://min-api.cryptocompare.com/documentation  
* 무료 한도: 100,000 calls/month

**주요 엔드포인트**

* 가격: https://min-api.cryptocompare.com/data/price?fsym=BTC\&tsyms=USD  
* OHLCV: https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC\&tsym=USD\&limit=30  
* 소셜 통계: https://min-api.cryptocompare.com/data/social/coin/latest?coinId=1182

### **5.5 Messari**

**API 문서**

* 공식: https://messari.io/api/docs  
* 무료 한도: 1,000 requests/day

**엔드포인트**

* 자산 목록: https://data.messari.io/api/v2/assets  
* 메트릭: https://data.messari.io/api/v1/assets/{assetKey}/metrics  
* 뉴스: https://data.messari.io/api/v1/news

## **6\. DeFi 데이터**

### **6.1 DeFiLlama (최고의 DeFi 데이터)**

**API 문서**

* 공식: https://defillama.com/docs/api  
* 완전 무료

**주요 엔드포인트**

* 전체 프로토콜: https://api.llama.fi/protocols  
* TVL 차트: https://api.llama.fi/v2/historicalChainTvl  
* 수익률: https://yields.llama.fi/pools  
* 스테이블코인: https://stablecoins.llama.fi/stablecoins  
* 해킹 데이터: https://api.llama.fi/hacks

### **6.2 DeFi Pulse**

**API**

* 공식: https://docs.defipulse.com/  
* 데이터: https://data.defipulse.com/

### **6.3 Compound**

**직접 API**

* 문서: https://compound.finance/docs  
* API: https://api.compound.finance/api/v2/market

### **6.4 Aave**

**Subgraph**

* V3: https://thegraph.com/explorer/subgraphs/GQFLsKiKmdJHH2HdArzeKCyc3LUYuVZHjVVrEXm7FiYH  
* V2: https://thegraph.com/explorer/subgraphs/84CvqQHYhydNzaHSA8dP35JYFcLQZwYKQTzC4NJV7xN1

### **6.5 Uniswap Analytics**

**Info 사이트 API**

* V3: https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3

## **7\. 뉴스/이벤트 데이터**

### **7.1 CryptoPanic**

**무료 API**

* 문서: https://cryptopanic.com/developers/api/  
* 무료 한도: 제한적  
* 피드: https://cryptopanic.com/api/v1/posts/?auth=your\_auth\_token

### **7.2 CoinTelegraph**

**RSS 피드**

* 메인: https://cointelegraph.com/rss  
* 비트코인: https://cointelegraph.com/tags/bitcoin/rss  
* 이더리움: https://cointelegraph.com/tags/ethereum/rss

### **7.3 CoinDesk**

**RSS 피드**

* 메인: https://www.coindesk.com/arc/outboundfeeds/rss/  
* API 문서: https://www.coindesk.com/api/

### **7.4 The Block**

**RSS**

* 피드: https://www.theblock.co/rss.xml

### **7.5 Decrypt**

**RSS**

* 피드: https://decrypt.co/feed

## **8\. 차트 라이브러리**

### **8.1 TradingView Lightweight Charts**

**오픈소스**

* GitHub: https://github.com/tradingview/lightweight-charts  
* 문서: https://tradingview.github.io/lightweight-charts/  
* 예제: https://tradingview.github.io/lightweight-charts/tutorials/

### **8.2 Chart.js**

**오픈소스**

* 공식: https://www.chartjs.org/  
* GitHub: https://github.com/chartjs/Chart.js  
* 샘플: https://www.chartjs.org/samples/latest/

### **8.3 D3.js**

**오픈소스**

* 공식: https://d3js.org/  
* 예제: https://observablehq.com/@d3/gallery

### **8.4 Apache ECharts**

**오픈소스**

* 공식: https://echarts.apache.org/  
* 예제: https://echarts.apache.org/examples/en/

## **9\. 기타 유용한 무료 도구**

### **9.1 WhaleAlert**

**Limited Free API**

* 문서: https://docs.whale-alert.io/  
* 무료: 10 requests/minute

### **9.2 Glassnode (제한적 무료)**

**Academy API**

* 일부 지표 무료: https://api.glassnode.com/v1/metrics/

### **9.3 IntoTheBlock (제한적 무료)**

**일부 데이터**

* 문서: https://docs.intotheblock.com/

### **9.4 Coin360**

**무료 히트맵 데이터**

* API: 문서화되지 않음, 리버스 엔지니어링 필요

### **9.5 CoinCodex**

**무료 API**

* 문서: https://coincodex.com/page/api  
* 데이터: https://coincodex.com/api/

## **10\. 데이터 수집 자동화 도구**

### **10.1 CCXT (거래소 통합 라이브러리)**

**오픈소스**

* GitHub: https://github.com/ccxt/ccxt  
* 문서: https://docs.ccxt.com/  
* 100+ 거래소 지원

### **10.2 Freqtrade**

**오픈소스 트레이딩 봇**

* GitHub: https://github.com/freqtrade/freqtrade  
* 문서: https://www.freqtrade.io/

### **10.3 Gekko**

**오픈소스**

* GitHub: https://github.com/askmike/gekko  
* 백테스팅 \+ 실시간 데이터

### **10.4 Zenbot**

**오픈소스**

* GitHub: https://github.com/deviavir/zenbot  
* 다중 거래소 지원

## **11\. 데이터 저장/처리**

### **11.1 InfluxDB**

**시계열 데이터베이스**

* 다운로드: https://www.influxdata.com/downloads/  
* 오픈소스 버전 무료

### **11.2 TimescaleDB**

**PostgreSQL 확장**

* 공식: https://www.timescale.com/  
* 오픈소스 무료

### **11.3 Apache Kafka**

**스트리밍 플랫폼**

* 공식: https://kafka.apache.org/  
* 완전 무료

### **11.4 Redis**

**인메모리 데이터베이스**

* 공식: https://redis.io/  
* 오픈소스 무료

## **12\. 백업 데이터 소스**

### **12.1 Alternative Free APIs**

**Nomics (종료 예정)**

* API: https://api.nomics.com/v1/

**LiveCoinWatch**

* 문서: https://livecoinwatch.github.io/lcw-api-docs/  
* 무료 티어 있음

**CoinRanking**

* 문서: https://developers.coinranking.com/api/documentation  
* 무료: 5,000 calls/month

### **12.2 P2P 가격 데이터**

**LocalBitcoins**

* API: https://localbitcoins.com/api-docs/

**Bisq**

* API: https://bisq.markets/api/

## **13\. 웹 스크래핑 (최후 수단)**

### **13.1 도구**

**Puppeteer**

* GitHub: https://github.com/puppeteer/puppeteer

**Playwright**

* GitHub: https://github.com/microsoft/playwright

**Beautiful Soup**

* 문서: https://beautiful-soup-4.readthedocs.io/

### **13.2 프록시 서비스**

**무료 프록시 리스트**

* Free Proxy List: https://free-proxy-list.net/  
* ProxyScrape: https://proxyscrape.com/free-proxy-list

## **14\. 구현 우선순위 (MVP)**

### **Phase 1 (1주차): 핵심 가격 데이터**

1. Binance WebSocket 실시간 연결  
2. CoinGecko API 통합  
3. DeFiLlama TVL 데이터

### **Phase 2 (2주차): 파생상품 데이터**

1. Binance Futures API  
2. Bybit 파생상품 API  
3. 청산 데이터 수집

### **Phase 3 (3주차): 온체인 데이터**

1. Etherscan API 통합  
2. 무료 노드 (Alchemy/Ankr)  
3. 주요 지갑 모니터링

### **Phase 4 (4주차): 소셜/뉴스**

1. Alternative.me Fear & Greed  
2. RSS 피드 통합  
3. Reddit API

# **StockHoo 확장 데이터 레이어 – 누락 영역 완전 보강판**

## **A. 소셜 / 커뮤니티 데이터 (공식 \+ 반공식 혼합)**

### **A1. Twitter / X**

실시간 내러티브·멘션·확산 속도 핵심

**공식**

* Twitter API v2 (유료/제한적 무료)  
  * Stream rules (keyword, cashtag, hashtag)  
  * Tweet volume, author metrics  
* Academic 계정 있으면 히스토리 확보 가능

**무료·반공식 (실무에서 가장 많이 쓰는 방식)**

* Nitter 인스턴스 (공개 트윗 크롤링)  
* 고급 검색 URL 자동화  
* 주요 지표:  
  * mentions\_per\_min  
  * unique\_authors  
  * retweet\_velocity  
  * influencer\_ratio (팔로워 상위 N%)

**StockHoo용 파생 지표**

* narrative\_acceleration\_score  
* meme\_virality\_index  
* price\_candle ↔ tweet\_spike 상관계수

---

### **A2. Telegram**

알트·신규코인 내러티브의 최전선

**공식**

* Telegram Bot API (메시지 수신/전송)  
* MTProto (클라이언트 수준 접근, 합법)

**수집 대상**

* 공식 프로젝트 채널  
* 트레이딩 시그널 그룹  
* 알파/콜 채널

**핵심 피처**

* msg\_count / time  
* unique\_speakers  
* keyword burst (airdrop, listing, partnership 등)  
* admin activity 변화

**신규 코인 탐지**

* “contract / CA / pair / launch” 키워드 급증  
* 메시지 수 증가 \+ 신규 주소 언급 동시 발생

---

### **A3. Discord**

Web3 프로젝트의 실제 활동성 지표

**공식**

* Discord Bot API  
* Gateway 이벤트 (messageCreate, memberUpdate)

**수집 대상**

* Announcement 채널  
* Dev / roadmap 채널  
* Community chat

**지표**

* DAU / MAU  
* message\_velocity  
* dev\_response\_time  
* role\_growth (OG, holder 등)

**신뢰도 점수**

* dev\_activity\_score  
* community\_health\_index

---

### **A4. Reddit**

중장기 내러티브와 리테일 심리

**공식**

* Reddit API (OAuth)

**RSS**

* r/CryptoCurrency  
* r/Bitcoin  
* r/ethtrader  
* r/altcoin

**지표**

* post\_score\_velocity  
* comment\_sentiment  
* subreddit\_specificity\_score

---

### **A5. YouTube / TikTok (보조)**

인플루언서 주도 펌프 탐지

* YouTube Data API (무료 쿼터)  
* TikTok: 공식 API 거의 불가 → 키워드 기반 간접 수집

---

## **B. 신규 코인 생성 & 상장 “전수 스캔” 레이어 (핵심)**

### **B1. 온체인 신규 토큰 생성 감지**

#### **EVM 계열**

* Factory Contract 감시  
  * Uniswap V2/V3 Factory  
  * PancakeSwap Factory  
  * Sushi Factory  
* 이벤트:  
  * PairCreated  
  * Transfer (mint)  
  * OwnershipTransferred

**지표**

* creation\_time  
* creator\_address\_reputation  
* initial\_liquidity  
* LP lock 여부

---

### **B2. Dexscreener**

신규 페어 감지 최강자

**API**

* /latest/dex/pairs  
* /search

**신규 페어 필터**

* age \< 1h / 24h  
* liquidity \> X  
* volume/liquidity ratio  
* price change spike

---

### **B3. DEXTools**

스캠/러그 시그널 보강

* Honeypot flag  
* Tax 변화  
* Owner privileges

---

### **B4. CoinMarketCap / CoinGecko**

중앙화 상장/등록 탐지

**이벤트**

* “Recently Added”  
* Exchange listing  
* Market pair 추가

---

### **B5. CEX 상장 감지 (사전)**

* Binance / Bybit / OKX  
  * Announcement RSS  
  * API symbol list diff  
* 상장 전 징후:  
  * 온체인 입금 주소 생성  
  * 테스트넷 페어 등장

---

## **C. 뉴스 & 이벤트 (공식)**

### **C1. CryptoPanic**

* 뉴스 \+ 소셜 반응 결합  
* impact\_score

### **C2. RSS 통합**

* CoinDesk  
* CoinTelegraph  
* The Block  
* Decrypt

---

## **D. 종합 “코인 생애주기 스캐너” (StockHoo 핵심 기능)**

### **D1. Coin Lifecycle State Machine**

```
[Contract Created]
   ↓
[DEX Pair Created]
   ↓
[Liquidity Added]
   ↓
[Social Spike]
   ↓
[Volume Spike]
   ↓
[CEX Listing]
   ↓
[Distribution / Death]
```

### **D2. 상태별 핵심 데이터**

| 단계 | 데이터 |
| ----- | ----- |
| 생성 | Factory event, creator |
| 초기 | LP, tax, ownership |
| 확산 | Twitter/Telegram spike |
| 펌프 | Volume \+ CVD |
| 성숙 | OI, funding 안정 |
| 종료 | liquidity drain |

---

## **E. StockHoo용 최종 통합 데이터 스키마 (추가분)**

```json
social_metrics: {
  twitter: { mentions_5m, virality },
  telegram: { msg_velocity, ca_mentions },
  discord: { dau, dev_activity }
}

new_coin_signals: {
  contract_created: true,
  dex_pair_created: true,
  age_minutes: 23,
  initial_liquidity: 120000,
  honeypot_risk: "low"
}

lifecycle_state: "early_pump"
```

---

## **F. MVP 우선순위 (보강)**

### **Phase 0 (즉시)**

* Dexscreener 신규 페어 스캔  
* Telegram CA 탐지  
* Twitter 키워드 스파이크

### **Phase 1**

* 온체인 PairCreated 전수 감시  
* Discord dev activity 점수

### **Phase 2**

* CEX 상장 예측 모델  
* Coin Lifecycle Score

---

## **결론**

이 보강으로 StockHoo는:

* **시장 데이터**: 이미 완비  
* **소셜 데이터**: 실시간 내러티브 추적 가능  
* **신규 코인 생성**: 체인·DEX·소셜 전수 감시  
* **차별화 포인트**:  
  → *“가격이 움직이기 전, 왜 움직일지 먼저 감지”*

이제 StockHoo는 \*\*단순 AI 트레이딩 툴이 아니라  
‘코인 탄생부터 죽음까지 추적하는 Crypto Intelligence OS’\*\*가 됩니다.

다음 단계로 원하시면:

* **신규 코인 위험도 스코어링 수식**  
* **러그/스캠 자동 분류 규칙**  
* **실시간 알림 룰셋 (JSON)**  
* **이 전체를 개발자용 API 명세로 변환**

중 무엇부터 할지 지정해 주세요.

