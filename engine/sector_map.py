"""
Sector classification aligned with CoinMarketCap categories.

Usage:
    from engine.sector_map import get_sector, SECTOR_MAP, SECTOR_META

    sector = get_sector("AAVE")   # → "LENDING"
    meta   = SECTOR_META["LENDING"]
    # { label: "대출 프로토콜", cmc_category: "DeFi / Lending", risk: "high" }
"""

from __future__ import annotations

# ── 1. RAW TOKEN → SECTOR KEY MAPPING ─────────────────────────────────────
# Priority order: first match wins (top = higher priority)
# Add bare base symbols only (no USDT/BTC suffix)

SECTOR_MAP: dict[str, str] = {
    # ── BITCOIN ─────────────────────────────────────────
    "BTC":  "BTC",
    "WBTC": "BTC", "TBTC": "BTC",

    # ── ETHEREUM ────────────────────────────────────────
    "ETH":  "ETH",
    "WETH": "ETH", "STETH": "LIQUID_STAKING", "RETH": "LIQUID_STAKING",

    # ── LAYER 1 (Smart Contract Platforms) ──────────────
    "SOL":   "LAYER1", "ADA":   "LAYER1", "AVAX":  "LAYER1",
    "DOT":   "LAYER1", "NEAR":  "LAYER1", "APT":   "LAYER1",
    "SUI":   "LAYER1", "SEI":   "LAYER1", "FTM":   "LAYER1",
    "ALGO":  "LAYER1", "EGLD":  "LAYER1", "HBAR":  "LAYER1",
    "ICP":   "LAYER1", "TON":   "LAYER1", "TIA":   "LAYER1",
    "MONAD": "LAYER1", "BERACHAIN": "LAYER1", "ETC": "LAYER1",
    "EOS":   "LAYER1", "XTZ":  "LAYER1", "FLOW":  "LAYER1",
    "ROSE":  "LAYER1", "KAVA":  "LAYER1", "ONE":   "LAYER1",
    "ZIL":   "LAYER1", "VET":  "LAYER1", "KAS":   "LAYER1",
    "BCH":   "LAYER1", "LTC":  "LAYER1",  # UTXO L1

    # ── LAYER 2 (Ethereum Scaling) ──────────────────────
    "ARB":    "LAYER2", "OP":     "LAYER2", "MATIC":  "LAYER2",
    "IMX":    "LAYER2", "MANTA":  "LAYER2", "SCROLL": "LAYER2",
    "STRK":   "LAYER2", "LINEA":  "LAYER2", "BASE":   "LAYER2",
    "METIS":  "LAYER2", "BOBA":   "LAYER2", "LRC":    "LAYER2",
    "SKL":    "LAYER2",

    # ── ZK / ZERO-KNOWLEDGE ─────────────────────────────
    "ZK":    "ZK", "ZKSYNC": "ZK", "PLONK": "ZK",
    "AZTEC": "ZK", "MINA":   "ZK", "DUSK":  "ZK",
    "ALEO":  "ZK", "PSE":    "ZK",

    # ── COSMOS ECOSYSTEM ────────────────────────────────
    "ATOM":  "COSMOS", "OSMO":  "COSMOS", "INJ":   "COSMOS",
    "STARS": "COSMOS", "JUNO":  "COSMOS", "SCRT":  "COSMOS",
    "UMEE":  "COSMOS", "EVMOS": "COSMOS", "AKT":   "COSMOS",
    "ARCH":  "COSMOS", "DYM":   "COSMOS", "CELESTIA": "COSMOS",

    # ── ORACLE ──────────────────────────────────────────
    "LINK":  "ORACLE", "BAND":  "ORACLE", "API3":  "ORACLE",
    "DIA":   "ORACLE", "TRB":   "ORACLE", "UMA":   "ORACLE",
    "GRT":   "ORACLE",  # Graph = indexing/oracle adjacent

    # ── AI & BIG DATA ───────────────────────────────────
    "FET":    "AI", "AGIX":   "AI", "OCEAN":  "AI",
    "TAO":    "AI", "RNDR":   "AI", "NMR":    "AI",
    "WLD":    "AI", "ARKM":   "AI", "VIRTUAL":"AI",
    "AIXBT":  "AI", "GRIFFAIN":"AI","ALT":    "AI",
    "PRIME":  "AI",  # AI gaming adjacent
    "GPU":    "AI", "GENSYN": "AI", "BIT":    "AI",

    # ── DeFi (General / Governance) ─────────────────────
    "MKR":    "DEFI", "SNX":    "DEFI", "BAL":    "DEFI",
    "YFI":    "DEFI", "CVX":    "DEFI", "CRV":    "DEFI",
    "COMP":   "DEFI", "SUSHI":  "DEFI", "1INCH":  "DEFI",
    "ALPHA":  "DEFI", "PERP":   "DEFI",

    # ── DEX (Decentralized Exchanges) ───────────────────
    "UNI":    "DEX", "JUP":    "DEX", "CAKE":   "DEX",
    "DYDX":   "DEX", "GMX":    "DEX", "GNS":    "DEX",
    "KWENTA": "DEX", "DRIFT":  "DEX", "HYPERLIQUID": "DEX",
    "HL":     "DEX",

    # ── LENDING / BORROWING ─────────────────────────────
    "AAVE":   "LENDING", "COMP":  "LENDING", "VEN":   "LENDING",
    "SPARK":  "LENDING", "FLUID": "LENDING", "MORPHO":"LENDING",
    "PENDLE": "LENDING",  # yield trading

    # ── LIQUID STAKING ──────────────────────────────────
    "LDO":    "LIQUID_STAKING", "RPL":   "LIQUID_STAKING",
    "FXS":    "LIQUID_STAKING", "ANKR":  "LIQUID_STAKING",
    "SFRXETH":"LIQUID_STAKING", "CBETH": "LIQUID_STAKING",
    "EIGEN":  "RESTAKING",      "PUFFER":"RESTAKING",
    "ETHER":  "RESTAKING",

    # ── BRIDGES / CROSS-CHAIN ───────────────────────────
    "SYNAPSE":"BRIDGE", "ACROSS": "BRIDGE", "STARGATE":"BRIDGE",
    "MULTI":  "BRIDGE", "NXRA":   "BRIDGE", "ALLBRIDGE":"BRIDGE",
    "HOP":    "BRIDGE", "CELR":   "BRIDGE", "CELER":    "BRIDGE",
    "AXL":    "BRIDGE",

    # ── PAYMENT / REMITTANCE ────────────────────────────
    "XRP":    "PAYMENT", "XLM":   "PAYMENT", "TRX":    "PAYMENT",
    "LTC":    "PAYMENT", "NANO":  "PAYMENT", "XEM":    "PAYMENT",
    "CELO":   "PAYMENT", "DASH":  "PAYMENT", "BCH":    "PAYMENT",

    # ── PRIVACY ─────────────────────────────────────────
    "XMR":   "PRIVACY", "ZEC":   "PRIVACY", "DASH":  "PRIVACY",
    "SCRT":  "PRIVACY", "GRIN":  "PRIVACY", "BEAM":  "PRIVACY",
    "NYM":   "PRIVACY", "OXEN":  "PRIVACY",

    # ── EXCHANGE TOKENS ─────────────────────────────────
    "BNB":   "EXCHANGE", "OKB":   "EXCHANGE", "HT":    "EXCHANGE",
    "KCS":   "EXCHANGE", "GT":    "EXCHANGE", "LEO":   "EXCHANGE",
    "MX":    "EXCHANGE", "CRO":   "EXCHANGE", "WOO":   "EXCHANGE",

    # ── RWA (Real World Assets) ─────────────────────────
    "ONDO":   "RWA", "POLYX": "RWA", "CPOOL": "RWA",
    "MPL":    "RWA", "RIO":   "RWA", "LQTY":  "RWA",
    "TRU":    "RWA", "CENTRIFUGE": "RWA", "CFG": "RWA",
    "GOLDFINCH":"RWA","GFI":  "RWA",

    # ── DePIN (Decentralized Physical Infrastructure) ───
    "HNT":    "DEPIN", "MOBILE":"DEPIN", "IOT":   "DEPIN",
    "FIL":    "DEPIN", "AR":    "DEPIN", "STORJ": "DEPIN",
    "SIACOIN":"DEPIN", "SC":    "DEPIN",
    "DIMO":   "DEPIN", "GEODNET":"DEPIN","WIFI":  "DEPIN",
    "NATIX":  "DEPIN", "POKT":  "DEPIN", "AIOZ":  "DEPIN",

    # ── GAMING / GAMEFI ─────────────────────────────────
    "AXS":    "GAMING", "SAND":  "GAMING", "MANA":  "GAMING",
    "GALA":   "GAMING", "ILV":   "GAMING", "YGG":   "GAMING",
    "PYR":    "GAMING", "GODS":  "GAMING", "SLP":   "GAMING",
    "TLM":    "GAMING", "BEAM":  "GAMING", "RON":   "GAMING",
    "PIXEL":  "GAMING", "MAGIC": "GAMING", "LOOKS": "GAMING",

    # ── METAVERSE ───────────────────────────────────────
    "MANA":   "METAVERSE", "SAND": "METAVERSE", "ENJ":  "METAVERSE",
    "ENJIN":  "METAVERSE", "RFOX": "METAVERSE", "TVK":  "METAVERSE",

    # ── NFT INFRASTRUCTURE ──────────────────────────────
    "BLUR":   "NFT", "X2Y2": "NFT", "LOOKS": "NFT",
    "NFT":    "NFT", "RARI": "NFT", "SUPER": "NFT",

    # ── MEME ────────────────────────────────────────────
    "DOGE":   "MEME", "SHIB":   "MEME", "PEPE":   "MEME",
    "FLOKI":  "MEME", "BONK":   "MEME", "WIF":    "MEME",
    "POPCAT": "MEME", "MOG":    "MEME", "BRETT":  "MEME",
    "TURBO":  "MEME", "NEIRO":  "MEME", "MEME":   "MEME",
    "LADYS":  "MEME", "COQ":    "MEME", "SLERF":  "MEME",
    "BOME":   "MEME", "PONKE":  "MEME", "MYRO":   "MEME",
    "BOOK":   "MEME", "PNUT":   "MEME", "ACT":    "MEME",
    "GOAT":   "MEME", "SPX":    "MEME", "MOODENG":"MEME",
    "FWOG":   "MEME", "BABYDOGE":"MEME","ELON":   "MEME",
    "TRUMP":  "MEME", "MELANIA":"MEME", "HARAMBE":"MEME",

    # ── SOCIAL / CREATOR ────────────────────────────────
    "CRE8R":  "SOCIAL", "RALLY": "SOCIAL", "WHALE": "SOCIAL",
    "MASK":   "SOCIAL", "STEEM": "SOCIAL", "HIVE":  "SOCIAL",
    "DESO":   "SOCIAL", "LENS":  "SOCIAL",

    # ── PREDICTION MARKETS ──────────────────────────────
    "REP":    "PREDICTION", "GNO":  "PREDICTION", "POLY": "PREDICTION",

    # ── IDENTITY / DID ──────────────────────────────────
    "CVC":    "IDENTITY", "IDEX": "IDENTITY", "CIVIC":"IDENTITY",

    # ── STABLECOIN (참조용) ─────────────────────────────
    "USDT":   "STABLECOIN", "USDC":  "STABLECOIN", "BUSD": "STABLECOIN",
    "DAI":    "STABLECOIN", "FRAX":  "STABLECOIN", "TUSD": "STABLECOIN",
    "PYUSD":  "STABLECOIN", "FDUSD": "STABLECOIN",
}

# ── 2. SECTOR METADATA (CMC 카테고리 정렬) ────────────────────────────────

SECTOR_META: dict[str, dict] = {
    "BTC":            {"label": "비트코인",           "cmc": "Bitcoin",                      "risk": "medium"},
    "ETH":            {"label": "이더리움",           "cmc": "Ethereum Ecosystem",            "risk": "medium"},
    "LAYER1":         {"label": "레이어1",            "cmc": "Layer 1",                      "risk": "high"},
    "LAYER2":         {"label": "레이어2",            "cmc": "Layer 2",                      "risk": "high"},
    "ZK":             {"label": "ZK 기술",            "cmc": "Zero Knowledge (ZK)",          "risk": "very_high"},
    "COSMOS":         {"label": "코스모스 생태계",    "cmc": "Cosmos Ecosystem",             "risk": "high"},
    "ORACLE":         {"label": "오라클",             "cmc": "Oracle",                       "risk": "medium"},
    "AI":             {"label": "AI / 빅데이터",      "cmc": "AI & Big Data",                "risk": "very_high"},
    "DEFI":           {"label": "DeFi (종합)",        "cmc": "DeFi",                         "risk": "high"},
    "DEX":            {"label": "탈중앙 거래소",      "cmc": "Decentralized Exchange (DEX)", "risk": "high"},
    "LENDING":        {"label": "대출 프로토콜",      "cmc": "Lending & Borrowing",          "risk": "high"},
    "LIQUID_STAKING": {"label": "유동성 스테이킹",   "cmc": "Liquid Staking",               "risk": "medium"},
    "RESTAKING":      {"label": "리스테이킹",         "cmc": "Restaking",                    "risk": "high"},
    "BRIDGE":         {"label": "크로스체인 브릿지",  "cmc": "Cross-Chain",                  "risk": "very_high"},
    "PAYMENT":        {"label": "결제 / 송금",        "cmc": "Payment",                      "risk": "low"},
    "PRIVACY":        {"label": "프라이버시",         "cmc": "Privacy",                      "risk": "medium"},
    "EXCHANGE":       {"label": "거래소 토큰",        "cmc": "Centralized Exchange (CEX)",   "risk": "medium"},
    "RWA":            {"label": "실물자산 (RWA)",     "cmc": "Real World Assets (RWA)",      "risk": "medium"},
    "DEPIN":          {"label": "DePIN",              "cmc": "DePIN",                        "risk": "very_high"},
    "GAMING":         {"label": "게임 / GameFi",      "cmc": "Gaming",                       "risk": "very_high"},
    "METAVERSE":      {"label": "메타버스",           "cmc": "Metaverse",                    "risk": "very_high"},
    "NFT":            {"label": "NFT 인프라",         "cmc": "NFT & Collectibles",           "risk": "very_high"},
    "MEME":           {"label": "밈 코인",            "cmc": "Meme",                         "risk": "extreme"},
    "SOCIAL":         {"label": "소셜 / 크리에이터",  "cmc": "Social Money",                 "risk": "very_high"},
    "PREDICTION":     {"label": "예측 시장",          "cmc": "Prediction Markets",           "risk": "high"},
    "IDENTITY":       {"label": "신원 / DID",         "cmc": "Identity",                     "risk": "high"},
    "STABLECOIN":     {"label": "스테이블코인",       "cmc": "Stablecoins",                  "risk": "very_low"},
    "OTHER":          {"label": "기타",               "cmc": "Uncategorized",                "risk": "high"},
}

# ── 3. RISK ORDERING (스코어 가중치 참조용) ───────────────────────────────

RISK_MULTIPLIER: dict[str, float] = {
    "very_low":  0.5,
    "low":       0.8,
    "medium":    1.0,
    "high":      1.2,
    "very_high": 1.4,
    "extreme":   1.6,
}

# ── 4. CMC TOP CATEGORY GROUPS (시장 테마 집계용) ────────────────────────

THEME_GROUPS: dict[str, list[str]] = {
    "infrastructure": ["BTC", "ETH", "LAYER1", "LAYER2", "ZK", "COSMOS", "BRIDGE"],
    "defi":           ["DEFI", "DEX", "LENDING", "LIQUID_STAKING", "RESTAKING"],
    "narrative":      ["AI", "DEPIN", "RWA", "GAMING", "METAVERSE", "NFT"],
    "speculation":    ["MEME", "SOCIAL", "PREDICTION"],
    "utility":        ["ORACLE", "PAYMENT", "PRIVACY", "EXCHANGE", "IDENTITY"],
    "stable":         ["STABLECOIN"],
}

# ── 5. LOOKUP HELPERS ─────────────────────────────────────────────────────

# Longest first so "FDUSD" is matched before "USD" fragments
_QUOTE_SUFFIXES = ("FDUSD", "USDT", "USDC", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB")


def base_symbol(symbol: str) -> str:
    """Strip quote-currency suffix and return bare base symbol.

    Examples:
        "BTCUSDT"  → "BTC"
        "ETHBTC"   → "ETH"
        "SOLUSDC"  → "SOL"
        "BTC"      → "BTC"   (no suffix found, returned as-is)
    """
    s = symbol.upper()
    for suffix in _QUOTE_SUFFIXES:
        if s.endswith(suffix) and len(s) > len(suffix):
            return s[: -len(suffix)]
    return s


def get_sector(symbol: str) -> str:
    """Return sector key for a symbol. Strips common quote-currency suffixes."""
    return SECTOR_MAP.get(base_symbol(symbol), "OTHER")


def get_meta(symbol: str) -> dict:
    """Return full sector metadata for a symbol."""
    sector = get_sector(symbol)
    return {"sector": sector, **SECTOR_META.get(sector, SECTOR_META["OTHER"])}


def get_theme(symbol: str) -> str | None:
    """Return broad theme group (infrastructure/defi/narrative/speculation/utility)."""
    sector = get_sector(symbol)
    for theme, sectors in THEME_GROUPS.items():
        if sector in sectors:
            return theme
    return "other"


def sector_risk_multiplier(symbol: str) -> float:
    """Return volatility/risk multiplier for position sizing or score weighting."""
    meta = get_meta(symbol)
    return RISK_MULTIPLIER.get(meta.get("risk", "high"), 1.0)


# ── 6. LIVE FALLBACK — CoinGecko category lookup ─────────────────────────
# Called only when get_sector() returns "OTHER".
# Caches results in-process to avoid repeated API calls.

_cg_cache: dict[str, str] = {}   # base_symbol → sector key

# CoinGecko category name → our sector key (partial match, first wins)
_CG_CATEGORY_MAP: list[tuple[str, str]] = [
    ("artificial intelligence", "AI"),
    ("ai agent",                "AI"),
    ("big data",                "AI"),
    ("layer 2",                 "LAYER2"),
    ("zero knowledge",          "ZK"),
    ("layer 1",                 "LAYER1"),
    ("smart contract",          "LAYER1"),
    ("cosmos ecosystem",        "COSMOS"),
    ("decentralized exchange",  "DEX"),
    ("lending",                 "LENDING"),
    ("liquid staking",          "LIQUID_STAKING"),
    ("restaking",               "RESTAKING"),
    ("decentralized finance",   "DEFI"),
    ("real world assets",       "RWA"),
    ("decentralized physical",  "DEPIN"),
    ("gaming",                  "GAMING"),
    ("metaverse",               "METAVERSE"),
    ("nft",                     "NFT"),
    ("meme",                    "MEME"),
    ("privacy",                 "PRIVACY"),
    ("cross-chain",             "BRIDGE"),
    ("payment",                 "PAYMENT"),
    ("oracle",                  "ORACLE"),
    ("stablecoin",              "STABLECOIN"),
    ("exchange",                "EXCHANGE"),
    ("social",                  "SOCIAL"),
    ("prediction",              "PREDICTION"),
    ("storage",                 "DEPIN"),
]


def _cg_categories_to_sector(categories: list[str]) -> str:
    for cat in categories:
        cat_lower = cat.lower()
        for keyword, sector_key in _CG_CATEGORY_MAP:
            if keyword in cat_lower:
                return sector_key
    return "OTHER"


async def resolve_sector_async(symbol: str) -> str:
    """Async: return sector key, fetching from CoinGecko if not in static map.

    Usage (inside async context):
        sector = await resolve_sector_async("NEWTOKEN")
    """
    sector = get_sector(symbol)
    if sector != "OTHER":
        return sector

    base = base_symbol(symbol)

    if base in _cg_cache:
        return _cg_cache[base]

    try:
        import httpx
        # CoinGecko coin list search (free, no key required)
        async with httpx.AsyncClient(timeout=6.0) as c:
            # Step 1: search by symbol
            r = await c.get(
                "https://api.coingecko.com/api/v3/search",
                params={"query": base},
            )
            r.raise_for_status()
            coins = r.json().get("coins", [])
            if not coins:
                _cg_cache[base] = "OTHER"
                return "OTHER"
            coin_id = coins[0]["id"]

            # Step 2: fetch categories
            r2 = await c.get(
                f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                params={"localization": "false", "tickers": "false",
                        "market_data": "false", "community_data": "false"},
            )
            r2.raise_for_status()
            categories = r2.json().get("categories", [])

            sector = _cg_categories_to_sector(categories)

            # Cache the resolved sector back into SECTOR_MAP for future sync calls
            SECTOR_MAP[base] = sector
            _cg_cache[base]  = sector
            return sector
    except Exception:
        _cg_cache[base] = "OTHER"
        return "OTHER"


def resolve_sector_sync(symbol: str) -> str:
    """Sync wrapper (blocking). Only use from non-async contexts or scripts."""
    sector = get_sector(symbol)
    if sector != "OTHER":
        return sector
    import asyncio
    try:
        return asyncio.run(resolve_sector_async(symbol))
    except RuntimeError:
        # Already inside an event loop — caller should use resolve_sector_async
        return "OTHER"
