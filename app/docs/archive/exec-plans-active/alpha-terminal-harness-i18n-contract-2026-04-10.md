# Alpha Terminal Harness — i18n Contract (EN + KO)

Status: draft
Date: 2026-04-10

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md`
- `alpha-terminal-harness-methodology-2026-04-09.md`
- `alpha-terminal-harness-html-dissection-2026-04-10.md`
- `alpha-terminal-harness-boundary-2026-04-10.md`
- `alpha-terminal-harness-i18n-contract-2026-04-10.md` (this file)
- `alpha-terminal-harness-rationale-2026-04-10.md`

Purpose:
- Lock the bilingual (English + Korean) policy before P0 so that no Korean string leaks into the engine code or contract IDs.
- Give the i18n dictionary, slot template format, locale propagation rules, and enforcement gates a single source of truth.
- Guarantee that click UI and LLM narration return identical content in both languages.

---

## 0. Core rules — three sentences

1. **The engine is language-free.** Every contract ID (`raw.*`, `feat.*`, `event.*`, `state.*`, `verdict.*`) is ASCII snake_case. Every number is numeric. No Korean or English prose ever lives in engine code.
2. **The harness is bilingual.** Locale is a first-class slot that flows from UI → tool call → response rendering → LLM narration.
3. **Both locales are byte-equivalent in meaning.** Same engine run, same event IDs, same numbers — only the rendered label text differs. Golden tests enforce this.

Supported locales at launch: `ko`, `en`. Default: `navigator.language` on first visit, then persisted per user.
Extensible later: `ja`, `zh`, etc. Schema accommodates this but ship only 2 first.

---

## 1. The locale axis — where it lives

```
User (browser / chat input)
    │  locale = ko | en                       ← detected or chosen
    ▼
UI layer
    │  pass locale on every request           ← header / query param
    ▼
Tool contract layer (Stage B)
    │  locale ∈ request                       ← tool receives but does not compute with it
    ▼
Engine (Stage A)
    │  IGNORES locale                         ← returns structured IDs + numbers only
    ▼
Rendering / narration
    │  locale chosen                          ← dictionary lookup + template fill
    ├─► Click UI: dictionary + template fill
    └─► LLM (Stage C): system prompt slot + dictionary-backed reason IDs
            ▼
         Answer in user's language
```

The engine produces **one set of outputs** per scan. Both locales render from the same data. No double-compute. No translated duplicates in storage.

---

## 2. What is ALWAYS English (never translated)

| Category | Example | Why |
|---|---|---|
| **Contract IDs** | `event.wyckoff.sos`, `state.acc_phase_c`, `feat.flow.fr_extreme_positive` | code, logs, tests, debug tools |
| **Field / slot names** | `fr_pct`, `oi_change_pct`, `target_bull`, `stop_long` | JSON keys |
| **Ticker symbols** | `BTCUSDT`, `SOLUSDT`, `ETHUSDT` | global convention |
| **Exchange / API names** | `binance.fapi`, `upbit`, `bithumb`, `blockchain.info`, `mempool.space` | literal identifiers |
| **Timeframe codes** | `1m`, `5m`, `1h`, `4h`, `1d` | global convention |
| **Phase codes inside structure state** | `Phase A`, `Phase B`, `Phase C`, `Phase D`, `Phase E` | Wyckoff canonical notation |
| **Severity / direction enums** | `low`, `medium`, `high`, `bull`, `bear`, `neutral`, `warn` | logic enums |
| **Internal system prompt** | the LLM's rules of engagement | English is more reliable for the model |
| **Git commit messages, code comments, file names** | — | team convention |

**Forbidden**: using Korean or a localized string as a key or enum value anywhere in code. No `layer_label: "공포탐욕지수"` in any engine struct.

---

## 3. What MUST be bilingual (dictionary-backed)

Every user-visible string. Specifically:

### 3.1 Market bar labels
- column headings (`공포탐욕지수` / `Fear & Greed`, `BTC 김치프리미엄` / `BTC Kimchi Premium`, …)
- bucket labels (`극단 공포` / `Extreme Fear`, `활발` / `Active`, `혼잡` / `Congested`, …)
- sub-labels (`환율` / `FX rate`, `네트워크 활동` / `Network Activity`, `수수료 낮음` / `Low Fees`, …)

### 3.2 Controls
- `스캔 모드` / `Scan Mode`
- `TOP N` stays English
- `종목 지정` / `Custom Symbols`
- `OI / L·S 기간` / `OI / L·S Period`
- `최소 Alpha Score` / `Min Alpha Score`
- `▶ ALPHA SCAN` / `▶ ALPHA SCAN` (button stays English, UI universal)
- hints: `바이낸스 선물 상장 종목만 분석 가능` / `Only Binance futures-listed symbols supported`
- preset button names stay English (`Top 5`, `L1/L2`, `DeFi`, `AI+Oracle`)
- watchlist: `★ 저장` / `★ Save`, `★ 불러오기` / `★ Load`

### 3.3 Progress / stats bar
- `Ready — ALPHA SCAN을 눌러 분석 시작` / `Ready — press ALPHA SCAN to start`
- `[BTCUSDT,…] — 32/50` is mostly language-free; "of" vs "/" unified as `/`
- stat labels: `Strong Bull`, `Bull`, `Neutral`, `Bear`, `Strong Bear` (English universal), `Scanned` / `분석 완료`, `Wyckoff`, `MTF ★`, `BB 스퀴즈` / `BB Squeeze`, `청산 경보` / `Liquidation Alert`, `Extreme FR`

### 3.4 Filter bar
- `ALL` (universal), `▲ BULLISH`, `▼ BEARISH`, `◈ WYCKOFF`, `★ MTF`, `⚡ BB스퀴즈` / `⚡ BB Squeeze`, `🔥 청산경보` / `🔥 Liq Alert`, `⚡ EXTREME FR`
- placeholder: `Symbol 검색…` / `Search symbol…`

### 3.5 Table columns
- column headers: `Symbol`, `Alpha`, `Wyckoff`, `MTF`, `CVD`, `청산`/`Liq`, `BB`, `ATR`, `돌파`/`Breakout`, `Flow`, `Surge`, `Kimchi`, `FR%`, `OI Δ`, `Price Δ`, `Signals`
- row badges: localized bucket labels via event dictionary

### 3.6 Deep-dive panel
- section titles: `L1 WYCKOFF` (code stays English), `② MTF 컨플루언스` / `② MTF Confluence`, `③ CVD`, `① 실제 강제청산` / `① Actual Liquidations`, `L2 FLOW`, `⑱ BB 스퀴즈` / `⑱ BB Squeeze`, `⑲ ATR 변동성` / `⑲ ATR Volatility`, `⑫ 가격 돌파` / `⑫ Price Breakout`, `④ 섹터 자금 흐름` / `④ Sector Flow`, `L4 호가창` / `L4 Order Book`, `L7+L8 시장온도` / `L7+L8 Market Temperature`, `L6 BTC 온체인` / `L6 BTC On-Chain`, `15 LAYER 점수 요약` / `15-LAYER Score Summary`
- key-value labels: `패턴`/`Pattern`, `Phase`, `이전 추세`/`Prior Trend`, `레인지 폭`/`Range Width`, `레인지`/`Range`, `Climax Vol`, `ST 횟수`/`ST Count`, `Spring/UTAD`, `SOS/SOW`, `C&E 목표가`/`C&E Target`, `CVD 추세`/`CVD Trend`, `흡수 감지`/`Absorption`, `롱 청산 (1H)`/`Long Liq (1H)`, `숏 청산 (1H)`/`Short Liq (1H)`, `총 청산 규모`/`Total Liq`, `Funding Rate`, `OI 변화`/`OI Change`, `L/S Ratio`, `Taker B/S`, `상태`/`State`, `밴드폭`/`Bandwidth`, `가격 위치`/`Price Position`, `상단/하단`/`Upper/Lower`, `ATR`, `ATR %`, `변동성 상태`/`Volatility State`, `ATR 손절(롱)`/`ATR Stop (Long)`, `ATR 목표(롱)`/`ATR Target (Long)`, `7일 레인지 위치`/`7d Range Position`, `30일 레인지 위치`/`30d Range Position`, `7D 고점`/`7d High`, `7D 저점`/`7d Low`, `30D 고점`/`30d High`, `30D 저점`/`30d Low`, `섹터`/`Sector`, `섹터 평균 Alpha`/`Sector Avg Alpha`, `Bid/Ask Ratio`, `공포탐욕`/`Fear & Greed`, `김치프리미엄`/`Kimchi Premium`, `일일 Tx`/`Daily Tx`, `멤풀 대기`/`Mempool Pending`, `수수료`/`Fee`
- TOTAL ALPHA SCORE stays English

### 3.7 Verdict box
- heading: `◈ 종합 방향 판정` / `◈ Composite Verdict`
- bias labels (stay English codes but carry localized descriptions):
  - `STRONG_BULL` → `⚡ STRONG BULL — 강한 상승 편향` / `⚡ STRONG BULL — strong upward bias`
  - `BULL` → `▲ BULL BIAS — 상승 편향` / `▲ BULL BIAS — upward bias`
  - `NEUTRAL` → `◆ NEUTRAL — 방향 불명확` / `◆ NEUTRAL — direction unclear`
  - `BEAR` → `▼ BEAR BIAS — 하락 편향` / `▼ BEAR BIAS — downward bias`
  - `STRONG_BEAR` → `⚡ STRONG BEAR — 강한 하락 편향` / `⚡ STRONG BEAR — strong downward bias`
- suffixes: ` · 숏 스퀴즈 경보` / ` · short squeeze alert`, ` · 롱 청산 경보` / ` · long cascade alert`, ` · MTF 트리플 ★★★` / ` · MTF triple ★★★`, ` · BB 대형 스퀴즈` / ` · BB big squeeze`
- entry box labels: `매수 진입 참고` / `Long Entry Ref`, `숏 진입 참고` / `Short Entry Ref`, `C&E 목표` / `C&E Target`, `ATR 손절 (1.5×)` / `ATR Stop (1.5×)`, `ATR 목표` / `ATR Target`, `R : R`, `Binance 차트` / `Binance Chart`

### 3.8 Event reasons (the biggest pile)
All `sigs.push({t:'…'})` strings in the HTML become dictionary entries. See §7 for the full inventory.

### 3.9 Error messages
- `❌ 종목을 입력하세요.` / `❌ Please enter symbols.`
- `⚠ 다음 종목은 바이낸스 선물 미상장` / `⚠ Not listed on Binance futures`
- `❌ 유효한 종목이 없습니다.` / `❌ No valid symbols.`
- `❌ Binance API 오류` / `❌ Binance API error`
- `⚠ 418/429 — 바이낸스 rate limit` / `⚠ 418/429 — Binance rate limit`
- `분석 대기 중` / `Analysis idle`
- `ALPHA SCAN을 눌러 시작하세요` / `Press ALPHA SCAN to start`
- `필터 조건에 맞는 결과 없음` / `No results match filter`
- `와이코프 구조가 없는 경우 진입 참고가 제공되지 않습니다` / `Entry reference not provided without Wyckoff structure`

---

## 4. Dictionary schema

### 4.1 File layout

```
src/lib/i18n/
├── locales/
│   ├── ko.json
│   └── en.json
├── loader.ts          — loads JSON, validates shape, exposes `t(key, locale, slots)`
└── types.ts           — TypeScript types
```

### 4.2 Shape

```jsonc
// src/lib/i18n/locales/en.json
{
  "market_bar": {
    "fear_greed":          "Fear & Greed",
    "kimchi_btc":          "BTC Kimchi Premium",
    "usd_krw":             "USD / KRW",
    "btc_onchain_tx":      "BTC On-Chain Tx",
    "btc_mempool":         "BTC Mempool (Pending Tx)",
    "onchain_fees":        "On-Chain Fees",
    "strong_bull":         "Strong Bull",
    "bull_bias":           "Bull Bias",
    "neutral":             "Neutral",
    "bear_bias":           "Bear Bias",
    "strong_bear":         "Strong Bear",
    "extreme_fr_alert":    "Extreme FR Alert"
  },

  "bucket.fear_greed": {
    "EXTREME_FEAR":  "Extreme Fear",
    "FEAR":          "Fear",
    "SLIGHT_FEAR":   "Slight Fear",
    "NEUTRAL":       "Neutral",
    "GREED":         "Greed",
    "EXTREME_GREED": "Extreme Greed"
  },

  "bucket.btc_network_activity": {
    "ACTIVE_HIGH":  "Very active — demand ↑",
    "ACTIVE":       "Active",
    "NORMAL":       "Normal",
    "DEPRESSED":    "Depressed"
  },

  "bucket.mempool_congestion": {
    "EXTREME":  "{vsize}MB extreme congestion (demand surge)",
    "HIGH":     "{vsize}MB congested (demand rising)",
    "NORMAL":   "{vsize}MB normal",
    "LOW":      "{vsize}MB clear (low demand)"
  },

  "event.wyckoff.spring":
    "Spring detected — range-low penetration {depth_pct}% with recovery",
  "event.wyckoff.sos":
    "SOS — range-high break with {volume_ratio}× volume",
  "event.flow.fr_extreme_negative":
    "FR extreme negative ({fr_pct}%) — short squeeze setup ⚡",
  "event.flow.fr_extreme_positive":
    "FR extreme positive ({fr_pct}%) — long cascade risk ⚡",
  "event.flow.long_entry_build":
    "OI ↑{oi_pct}% + price ↑ — long entry building",
  "event.cvd.absorption_buy":
    "Absorption detected — price flat with strong one-sided CVD",

  "verdict.bias.STRONG_BULL":  "⚡ STRONG BULL — strong upward bias",
  "verdict.bias.BULL":         "▲ BULL BIAS — upward bias",
  "verdict.bias.NEUTRAL":      "◆ NEUTRAL — direction unclear",
  "verdict.bias.BEAR":         "▼ BEAR BIAS — downward bias",
  "verdict.bias.STRONG_BEAR":  "⚡ STRONG BEAR — strong downward bias",

  "verdict.suffix.short_squeeze":  " · short squeeze alert",
  "verdict.suffix.long_cascade":   " · long cascade alert",
  "verdict.suffix.mtf_triple":     " · MTF triple ★★★",
  "verdict.suffix.bb_big_squeeze": " · BB big squeeze",

  "error.no_symbols":       "❌ Please enter symbols.",
  "error.not_listed":       "⚠ Not listed on Binance futures: {symbols}",
  "error.no_valid_symbols": "❌ No valid symbols.",
  "error.binance_api":      "❌ Binance API error: {message}",
  "error.rate_limit":       "⚠ 418/429 — Binance rate limit. Retry in 2-3 minutes.",

  "empty.idle_title":  "Analysis idle",
  "empty.idle_hint":   "Press ALPHA SCAN to start"
}
```

```jsonc
// src/lib/i18n/locales/ko.json (same keys, Korean strings)
{
  "market_bar": {
    "fear_greed":          "공포탐욕지수",
    "kimchi_btc":          "BTC 김치프리미엄",
    "usd_krw":             "USD / KRW",
    "btc_onchain_tx":      "BTC 온체인 Tx",
    "btc_mempool":         "BTC 멤풀 (대기 Tx)",
    "onchain_fees":        "온체인 수수료",
    "strong_bull":         "Strong Bull",
    "bull_bias":           "Bull Bias",
    "neutral":             "Neutral",
    "bear_bias":           "Bear Bias",
    "strong_bear":         "Strong Bear",
    "extreme_fr_alert":    "Extreme FR Alert"
  },

  "bucket.fear_greed": {
    "EXTREME_FEAR":  "극단 공포",
    "FEAR":          "공포",
    "SLIGHT_FEAR":   "다소 공포",
    "NEUTRAL":       "중립",
    "GREED":         "탐욕",
    "EXTREME_GREED": "극단 탐욕"
  },

  "event.wyckoff.spring":
    "Spring 감지 — 저점 이탈 {depth_pct}% 후 복귀",
  "event.flow.fr_extreme_negative":
    "FR 극단 음수 ({fr_pct}%) — 숏 스퀴즈 대기 ⚡",
  "event.cvd.absorption_buy":
    "흡수 감지 — 가격 횡보 중 강한 일방향 CVD",

  "verdict.bias.STRONG_BULL":  "⚡ STRONG BULL — 강한 상승 편향",
  "verdict.bias.BULL":         "▲ BULL BIAS — 상승 편향",
  "verdict.bias.NEUTRAL":      "◆ NEUTRAL — 방향 불명확",
  "verdict.bias.BEAR":         "▼ BEAR BIAS — 하락 편향",
  "verdict.bias.STRONG_BEAR":  "⚡ STRONG BEAR — 강한 하락 편향",

  "error.no_symbols":       "❌ 종목을 입력하세요.",
  "error.not_listed":       "⚠ 다음 종목은 바이낸스 선물 미상장: {symbols}",
  "error.binance_api":      "❌ Binance API 오류: {message}"
}
```

### 4.3 Slot template format

Simple `{slot_name}` placeholders. No gender, no plural, no pluralization library needed at launch (Korean and our English don't require it for market data).

- `{fr_pct}` → formatted number with `%`
- `{symbols}` → comma-joined ticker list
- `{ts}` → formatted timestamp in user's locale

Number formatting:
- **Locale-aware for display only**. `1,234.56` in both `en-US` and `ko-KR` (same separator convention for finance).
- **Percentages** always `X.XX%` (2 decimals) unless engine specifies otherwise.
- **Large numbers** use `1.2M`, `450K` short form — identical in both locales.
- **Prices** use `fmtP()` rules from the HTML (already language-agnostic).

Dates:
- **ISO in engine** (`2026-04-10T14:02:00Z`).
- **Localized on render**: `14:02 UTC (오늘)` in `ko`, `14:02 UTC (today)` in `en`.

### 4.4 `t()` helper

```ts
// src/lib/i18n/loader.ts
import enDict from './locales/en.json';
import koDict from './locales/ko.json';

type Locale = 'en' | 'ko';
const dicts: Record<Locale, Record<string, unknown>> = { en: enDict, ko: koDict };

export function t(
  key: string,
  locale: Locale,
  slots?: Record<string, string | number>
): string {
  const path = key.split('.');
  let cur: unknown = dicts[locale];
  for (const part of path) cur = (cur as Record<string, unknown>)?.[part];
  if (typeof cur !== 'string') return `[missing:${key}]`;  // see §8 enforcement
  return slots
    ? cur.replace(/\{(\w+)\}/g, (_, k) => String(slots[k] ?? `{${k}}`))
    : cur;
}
```

---

## 5. Engine emits structured events, not prose

**Before** (Alpha Terminal HTML, line 1010):
```js
sigs.push({t:'FR 극단 음수 — 숏 스퀴즈 대기 ⚡', type:'bull'});
```

**After** (Stage A engine):
```ts
events.push({
  id: 'event.flow.fr_extreme_negative',
  direction: 'bull',
  severity: 'high',
  slots: { fr_pct: toFixed(fr, 4) },
  inputs: { funding_rate: fr },     // optional: trace inputs for audit
});
```

**Render** (click UI or LLM narration, locale from request):
```ts
const label = t(ev.id, locale, ev.slots);
// locale=ko → "FR 극단 음수 (-0.0823%) — 숏 스퀴즈 대기 ⚡"
// locale=en → "FR extreme negative (-0.0823%) — short squeeze setup ⚡"
```

**Rule**: engine code NEVER imports `t()`. Only rendering code does.

---

## 6. Locale propagation rules

### 6.1 From UI

- First visit: `navigator.language.startsWith('ko') ? 'ko' : 'en'`.
- Persisted in `localStorage.alpha_locale` after that.
- User can toggle in a small UI control (flag or `KO / EN`).
- Every outgoing tool call includes `locale` in the request body or header (`Accept-Language: ko` + explicit `locale: 'ko'` in JSON).

### 6.2 Through Stage B

- Tool contracts accept `locale` as a metadata parameter but **do not route on it** for computation.
- Responses may include both:
  - raw contract data (language-free)
  - optional `rendered` block populated in the requested locale for UI convenience

```jsonc
// scan.get_symbol_verdict response
{
  "symbol": "BTCUSDT",
  "locale_requested": "ko",
  "verdict": {
    "bias": "BULL",                    // ← contract code, universal
    "confidence": 0.62,
    "structure_state": "state.acc_phase_c",
    "top_reasons": [
      { "id": "event.wyckoff.spring", "slots": { "depth_pct": "0.31" } },
      { "id": "event.cvd.absorption_buy", "slots": {} }
    ],
    "entry_zone": { "low": 64200, "high": 64800 },
    "stop": 62900,
    "targets": [67500, 69200],
    "freshness": { "as_of": "2026-04-10T14:02:00Z", "stale": false }
  },
  "rendered": {
    "bias_label": "▲ BULL BIAS — 상승 편향",     // t('verdict.bias.BULL', 'ko')
    "top_reasons_text": [
      "Spring 감지 — 저점 이탈 0.31% 후 복귀",
      "흡수 감지 — 가격 횡보 중 강한 일방향 CVD"
    ]
  }
}
```

The LLM may use `rendered` for quick narration, or bypass it and render from IDs itself (`t()` on the reason IDs) — both must produce identical text.

### 6.3 Through Stage C (LLM)

The LLM system prompt has a `{{locale}}` slot:

```
You are Alpha Terminal's narrator.
User locale: {{locale}}.
Respond in {{locale}}. If locale=ko, reply in Korean. If locale=en, reply in English.
Every user-visible number must come verbatim from the tool response.
Every reason you cite must use the i18n label in {{locale}} for that event ID.
Technical terms stay in their original form: Wyckoff, CVD, ATR, BB, funding rate, spring, UTAD, SOS, SOW, absorption.
Tickers stay uppercase Latin: BTCUSDT, ETHUSDT.
Never mix languages in one sentence except for the technical terms and tickers above.
```

### 6.4 Multi-turn stickiness

- Locale persists across the conversation until explicitly changed.
- User says "영어로" or "switch to English" → LLM calls a session tool `session.set_locale(en)` and continues.
- Language auto-detect on each turn is **off** by default (too noisy). Only explicit change.

### 6.5 Mixed language in a single utterance

- "BTC funding rate 어때" → detected as `ko` (dominant Korean particles). Reply in Korean, keep "funding rate" as English term (glossary allows it).
- "how's BTC 지금" → detected as `en`. Reply in English.
- Ambiguous? Fall back to session locale.

---

## 7. Reason inventory from the HTML — every string that needs a key

Below is the full list of `sigs.push({t:'…'})` messages in the HTML. Each becomes a dictionary entry with a stable `event.*` or `note.*` ID.

### 7.1 L2 Flow reasons (lines 1010-1037)

| Current KO string | Proposed ID | Slots |
|---|---|---|
| `FR 극단 음수 — 숏 스퀴즈 대기 ⚡` | `event.flow.fr_extreme_negative` | `fr_pct` |
| `FR 음수 — 숏 우세` | `event.flow.fr_negative` | `fr_pct` |
| `FR 약한 음수` | `event.flow.fr_slight_negative` | `fr_pct` |
| `FR 중립` | `event.flow.fr_neutral` | `fr_pct` |
| `FR 양수 — 롱 우세` | `event.flow.fr_positive` | `fr_pct` |
| `FR 높음 — 롱 과열` | `event.flow.fr_hot` | `fr_pct` |
| `FR 극단 양수 — 롱 청산 위험 ⚡` | `event.flow.fr_extreme_positive` | `fr_pct` |
| `OI↑{oi}%+가격↑ — 롱진입` | `event.flow.long_entry_build` | `oi_pct` |
| `OI↑{oi}%+가격↓ — 숏진입` | `event.flow.short_entry_build` | `oi_pct` |
| `OI↓+가격↓ — 롱청산 반등가능` | `event.flow.long_capitulation_bounce` | — |
| `OI↓+가격↑ — 숏청산` | `event.flow.short_capitulation` | — |
| `OI 변화 보통` | `note.flow.oi_neutral` | — |
| `L/S {x} 극단 롱` | `event.flow.ls_extreme_long` | `ls_ratio` |
| `L/S {x} 롱과다` | `event.flow.ls_long_heavy` | `ls_ratio` |
| `L/S {x} 극단 숏 (반등)` | `event.flow.ls_extreme_short` | `ls_ratio` |
| `L/S {x} 숏우세` | `event.flow.ls_short_heavy` | `ls_ratio` |
| `L/S {x} 균형` | `note.flow.ls_balanced` | `ls_ratio` |
| `테이커 {x}× 공격매수` | `event.flow.taker_aggressive_buy` | `taker_ratio` |
| `테이커 {x}× 매수우세` | `event.flow.taker_buy_dominant` | `taker_ratio` |
| `테이커 {x}× 공격매도` | `event.flow.taker_aggressive_sell` | `taker_ratio` |
| `테이커 {x}× 매도우세` | `event.flow.taker_sell_dominant` | `taker_ratio` |
| `테이커 {x}× 균형` | `note.flow.taker_balanced` | `taker_ratio` |

### 7.2 L6 On-chain reasons (lines 1109-1147)

| Current KO string | Proposed ID | Slots |
|---|---|---|
| `BTC Tx {n} — 네트워크 매우 활발` | `event.onchain.tx_very_active` | `n_tx` |
| `BTC Tx {n} — 활발` | `event.onchain.tx_active` | `n_tx` |
| `BTC Tx {n} — 침체` | `event.onchain.tx_depressed` | `n_tx` |
| `BTC Tx {n} — 보통` | `note.onchain.tx_normal` | `n_tx` |
| `평균 Tx {x} BTC — 고래 대규모 이동 감지 ⚠` | `event.onchain.whale_mass_movement` | `avg_tx_btc` |
| `평균 Tx {x} BTC — 고래 활동 증가` | `event.onchain.whale_activity_rising` | `avg_tx_btc` |
| `평균 Tx {x} BTC — 일반 수준` | `note.onchain.avg_tx_normal` | `avg_tx_btc` |
| `평균 Tx {x} BTC — 소액 거래 주도 (개인 축적)` | `event.onchain.retail_accumulation` | `avg_tx_btc` |
| `24H BTC 이동량 {x}M BTC — 대규모 온체인 활동` | `note.onchain.high_24h_volume` | `btc_sent_m` |
| `멤풀 {n} Tx 극도 혼잡 — 수요 폭증` | `event.onchain.mempool_extreme` | `pending_tx` |
| `멤풀 {n} Tx 혼잡 — 수요 증가` | `event.onchain.mempool_high` | `pending_tx` |
| `멤풀 {n} Tx 보통` | `note.onchain.mempool_normal` | `pending_tx` |
| `멤풀 {n} Tx 여유 — 수요 낮음` | `event.onchain.mempool_low` | `pending_tx` |
| `수수료 {n} sat/vB 급등 — 온체인 수요 폭증` | `event.onchain.fee_surge` | `fast_fee` |
| `수수료 {n} sat/vB 높음 — 혼잡` | `event.onchain.fee_high` | `fast_fee` |
| `수수료 {n} sat/vB 보통` | `note.onchain.fee_normal` | `fast_fee` |
| `수수료 {n} sat/vB 낮음 — 활동 적음` | `event.onchain.fee_low` | `fast_fee` |
| `⚠ 고래 대규모 이동 감지 — 가격 방향과 교차 확인 필요` | `note.onchain.whale_cross_check_warning` | — |

### 7.3 L7 Fear & Greed reasons (lines 1168-1174)

| Current KO | Proposed ID |
|---|---|
| `극단 공포 — 역발상 매수 ★` | `event.context.fear_extreme_contrarian` |
| `공포 — 매수 기회` | `event.context.fear` |
| `다소 공포` | `note.context.slight_fear` |
| `중립` | `note.context.neutral` |
| `탐욕 — 주의` | `event.context.greed` |
| `과탐욕 — 조정 가능` | `event.context.greed_high` |
| `극단 탐욕 — 하락 경보 ★` | `event.context.greed_extreme_contrarian` |

### 7.4 L8 Kimchi reasons (lines 1192-1198)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `김치프리미엄 +{x}% — 한국 극과열 ⚠` | `event.context.kimchi_overheat_extreme` | `premium_pct` |
| `김치프리미엄 +{x}% — 과열` | `event.context.kimchi_overheat` | `premium_pct` |
| `김치프리미엄 +{x}%` | `note.context.kimchi_moderate_positive` | `premium_pct` |
| `김치중립 {x}%` | `note.context.kimchi_neutral` | `premium_pct` |
| `김치디스카운트 {x}%` | `note.context.kimchi_discount_mild` | `premium_pct` |
| `김치디스카운트 {x}% — 역발상 매수` | `event.context.kimchi_discount_contrarian` | `premium_pct` |
| `김치디스카운트 {x}% — 강한 역발상 ★` | `event.context.kimchi_discount_strong_contrarian` | `premium_pct` |

### 7.5 L9 Real liquidation reasons (lines 1237-1249)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `숏 강제청산 ${x} — 상방 스퀴즈 진행 중 ⚡` | `event.flow.short_squeeze_active` | `usd` |
| `숏 청산 우세 ${x} ({pct}%)` | `event.flow.short_liq_dominant` | `usd`, `pct` |
| `롱 강제청산 ${x} — 하방 청산 가속 ⚠` | `event.flow.long_cascade_active` | `usd` |
| `롱 청산 우세 ${x} ({pct}%)` | `event.flow.long_liq_dominant` | `usd`, `pct` |
| `청산 균형 (롱${x} / 숏${y})` | `note.flow.liq_balanced` | `long_usd`, `short_usd` |
| `최근 1H 강제청산 없음 — 레버리지 포지션 안정` | `note.flow.liq_none` | — |

### 7.6 L10 MTF reasons (lines 1277-1291)

| Current KO | Proposed ID |
|---|---|
| `1H+4H+1D 모두 Accumulation — 최강 MTF 컨플루언스 ★★★` | `event.mtf.triple_accumulation` |
| `{tfs} Accumulation — 강한 MTF 컨플루언스` | `event.mtf.double_accumulation` |
| `1H+4H+1D 모두 Distribution — 최강 하락 MTF ★★★` | `event.mtf.triple_distribution` |
| `{tfs} Distribution — 강한 MTF 하락` | `event.mtf.double_distribution` |
| `MTF 충돌 — 방향 불명확` | `event.mtf.conflict` |
| `MTF 와이코프 구조 없음` | `note.mtf.none` |
| `{tfs} Accumulation 감지` | `event.mtf.single_accumulation` |
| `{tfs} Distribution 감지` | `event.mtf.single_distribution` |

### 7.7 L11 CVD reasons (lines 1333-1349)

| Current KO | Proposed ID |
|---|---|
| `가격↑ + CVD↑ — 실제 매수 주도 상승 (진짜 수요)` | `event.cvd.price_up_cvd_up` |
| `가격↑ + CVD↓ — 내부적 매도 증가 (가격 상승 신뢰도 낮음)` | `event.cvd.bearish_divergence` |
| `가격↓ + CVD↓ — 실제 매도 주도 하락` | `event.cvd.price_down_cvd_down` |
| `가격↓ + CVD↑ — 하락 중 매수 흡수 (반등 가능성)` | `event.cvd.bullish_divergence` |
| `흡수(Absorption) 감지 — 가격 횡보 중 강한 일방향 체결` | `event.cvd.absorption_flag` |
| `CVD 중립 (추세 {dir})` | `note.cvd.neutral` |

### 7.8 L12 Sector reasons (lines 1367-1376)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `섹터 [{s}] 자금 유입 강함` | `event.sector.strong_inflow` | `sector`, `score` |
| `섹터 [{s}] 약한 자금 유입` | `event.sector.mild_inflow` | `sector`, `score` |
| `섹터 [{s}] 자금 이탈 강함` | `event.sector.strong_outflow` | `sector`, `score` |
| `섹터 [{s}] 약한 자금 이탈` | `event.sector.mild_outflow` | `sector`, `score` |
| `섹터 [{s}] 중립` | `note.sector.neutral` | `sector`, `score` |

### 7.9 L13 Breakout reasons (lines 1414-1426)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `30일 신고가 돌파 ★ ({price} 돌파)` | `event.breakout.confirm_30d_high` | `price` |
| `7일 신고가 돌파 ({price} 돌파)` | `event.breakout.confirm_7d_high` | `price` |
| `30일 고점 근접 {pct}% — 저항 테스트 중` | `event.breakout.near_30d_high` | `pct` |
| `7일 고점 근접 {pct}% — 단기 저항` | `event.breakout.near_7d_high` | `pct` |
| `30일 저점 근접 — 지지선 테스트 중` | `event.breakdown.near_30d_low` | — |
| `7일 저점 근접 — 단기 지지 테스트` | `event.breakdown.near_7d_low` | — |
| `7일 레인지 중간 ({p7}%) / 30일 ({p30}%)` | `note.breakout.range_middle` | `p7`, `p30` |

### 7.10 L14 BB reasons (lines 1466-1479)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `볼린저 대형 스퀴즈 — 50일 최저 밴드폭 ★ 에너지 압축 폭발 임박` | `event.bb.big_squeeze` | — |
| `볼린저 스퀴즈 (밴드폭 {bw}%) — 에너지 압축 중` | `event.bb.squeeze` | `bw_pct` |
| `상단 밴드 돌파 + 밴드 확장 — 강한 상방 모멘텀` | `event.bb.expansion_up` | — |
| `하단 밴드 돌파 + 밴드 확장 — 강한 하방 모멘텀` | `event.bb.expansion_down` | — |
| `BB 상단 근처 ({pos}%) — 단기 과매수 주의` | `event.bb.upper_zone` | `bb_pos` |
| `BB 하단 근처 ({pos}%) — 단기 과매도 가능` | `event.bb.lower_zone` | `bb_pos` |
| `BB 중립 (위치 {pos}%, 밴드폭 {bw}%)` | `note.bb.neutral` | `bb_pos`, `bw_pct` |

### 7.11 L15 ATR reasons (lines 1521-1530)

| Current KO | Proposed ID | Slots |
|---|---|---|
| `변동성 극저 (ATR {x}%) — 폭발 직전 에너지 응축` | `event.atr.ultra_low_vol` | `atr_pct` |
| `변동성 낮음 (ATR {x}%) — 방향성 움직임 임박 가능` | `event.atr.low_vol` | `atr_pct` |
| `변동성 극高 (ATR {x}%) — 고위험 구간, 손절폭 넓음` | `event.atr.extreme_vol` | `atr_pct` |
| `변동성 높음 (ATR {x}%) — 포지션 사이즈 주의` | `event.atr.high_vol` | `atr_pct` |
| `변동성 정상 (ATR {x}%)` | `note.atr.normal` | `atr_pct` |

### 7.12 Wyckoff phase labels (HTML lines 939-955)

The HTML concatenates phase labels like `Phase C — Spring ★ (ST×2)`. The engine emits a structured form, the i18n layer composes it:

```ts
{
  phase: 'C',                      // 'A' | 'B' | 'C' | 'D' | 'E'
  marker: 'spring',                // 'sc' | 'ar' | 'st' | 'spring' | 'sos' | 'bc' | 'ut' | 'utad' | 'sow' | null
  st_count: 2,
  climax_confirmed: true,
  starred: true
}
```

Template:
- `en`: `Phase {phase} — {marker_label}{star} (ST×{st_count})`
- `ko`: `Phase {phase} — {marker_label}{star} (ST {st_count}회)`

`marker_label` dictionary:
- `spring`: `ko: "Spring"`, `en: "Spring"` (technical term preserved)
- `sos`: `ko: "SOS"`, `en: "SOS"`
- `utad`: `ko: "UTAD"`, `en: "UTAD"`
- `sow`: `ko: "SOW"`, `en: "SOW"`
- `sc`: `ko: "SC"`, `en: "SC"` — but with optional long-form pedagogy tooltip: `ko: "Selling Climax"`, `en: "Selling Climax"`

Phases themselves stay in `A`/`B`/`C`/`D`/`E` Latin form in both locales.

---

## 8. Enforcement gates

Locking this down requires four automated checks. Each runs in CI.

### 8.1 Gate: no Korean in engine code

```bash
# lint: reject Korean (Hangul) in engine source
rg -n '[\uac00-\ud7a3]' src/lib/engine/ src/lib/server/scanner.ts \
   src/lib/server/douni/ src/routes/api/cogochi/
# → must return 0 matches (exit 0 only if empty)
```

Add to `npm run lint` or a dedicated `npm run i18n:lint`.

Exception allowlist: test fixtures, comments on public-facing docs. But never inside runtime code paths.

### 8.2 Gate: no hardcoded labels in UI components

```bash
# lint: UI components must go through t(). Block literal strings over N chars.
rg -n '[\uac00-\ud7a3]' src/routes/terminal/ src/routes/cogochi/scanner/ \
   src/components/
```

Exceptions: the locale dictionary files themselves and documentation files.

### 8.3 Gate: every event ID has both locales

```ts
// src/lib/i18n/test/parity.test.ts
import en from '../locales/en.json';
import ko from '../locales/ko.json';
import { flatten } from './flatten';

test('en and ko dictionaries have identical key sets', () => {
  const enKeys = new Set(Object.keys(flatten(en)));
  const koKeys = new Set(Object.keys(flatten(ko)));
  const enOnly = [...enKeys].filter(k => !koKeys.has(k));
  const koOnly = [...koKeys].filter(k => !enKeys.has(k));
  expect(enOnly).toEqual([]);
  expect(koOnly).toEqual([]);
});

test('every known event/feat/state/verdict ID is in both dictionaries', () => {
  const requiredIds = readRegistryIds();  // from src/lib/engine/registry/*
  for (const id of requiredIds) {
    expect(en).toHaveKey(id);
    expect(ko).toHaveKey(id);
  }
});
```

### 8.4 Gate: bilingual golden tests

For a fixed engine output, render both locales and snapshot:

```ts
// src/lib/harness/test/bilingual-golden.test.ts
test('BTCUSDT verdict renders identically in ko and en except label strings', () => {
  const verdict = fixtureVerdict('BTCUSDT-2026-04-10');
  const ko = renderVerdict(verdict, 'ko');
  const en = renderVerdict(verdict, 'en');

  // Same numeric citations
  expect(extractNumbers(ko.top_reasons_text)).toEqual(extractNumbers(en.top_reasons_text));
  // Same event ID order
  expect(ko.reason_ids).toEqual(en.reason_ids);
  // Same freshness flag
  expect(ko.freshness).toEqual(en.freshness);
});
```

### 8.5 Gate: LLM output validator

When Stage C produces a narrated answer, a post-generation check:

1. Extract every numeric token from the LLM reply.
2. Confirm each appears in the tool response payload.
3. Confirm LLM reply language matches requested locale (Hangul regex check for `ko`, ASCII-dominant for `en`).
4. If check fails, regenerate once. If still fails, fall back to template-only rendering (drop LLM, render from dictionary + slots directly).

---

## 9. What stays as a technical term in both locales

A glossary of terms that are preserved verbatim and NOT translated, because translating them would hurt users more than help:

| Term | Rationale |
|---|---|
| Wyckoff, Phase A/B/C/D/E | method name |
| Spring, UTAD, SOS, SOW, SC, BC, AR, ST, LPS, LPSY | Wyckoff events |
| CVD (Cumulative Volume Delta), Absorption | tape terminology |
| Funding Rate (FR), Open Interest (OI), Long/Short Ratio, Taker Buy/Sell | derivatives terminology |
| ATR, Bollinger Bands (BB), Squeeze, Breakout, Breakdown | TA terminology |
| Alpha Score, Bias (Bull/Bear/Neutral/Strong Bull/Strong Bear) | product terminology |
| Kimchi Premium (김프 is informal; full form preserved) | market term |
| Fear & Greed (F&G) | index name |
| R:R (risk-reward) | common notation |
| Binance, Upbit, Bithumb | exchange names |
| USDT, BTC, ETH, SOL, etc. | tickers |
| 1m, 5m, 15m, 1h, 4h, 1d | timeframes |

The Korean dictionary MAY add a parenthetical full form the first time per answer, e.g. "Wyckoff (와이코프)" — but the key stays Latin.

---

## 10. Migration from the HTML — step by step

| Step | Action |
|---|---|
| 1 | Extract every Korean string in `Alpha Flow_by 아카.html` (see §7 inventory). |
| 2 | Assign each to an `event.*` / `note.*` / `verdict.*` / `bucket.*` / `market_bar.*` / `error.*` / `empty.*` key. |
| 3 | Create `src/lib/i18n/locales/ko.json` with the existing Korean strings (converted to slot templates). |
| 4 | Write matching `src/lib/i18n/locales/en.json`. Every key present in both. |
| 5 | Add `src/lib/i18n/loader.ts` with `t(key, locale, slots)`. |
| 6 | Refactor engine code to emit `{id, slots}` objects instead of `{t: '…'}` strings (Stage A purity). |
| 7 | Refactor Stage B response shape to include the optional `rendered` block from §6.2. |
| 8 | Refactor UI renderers (`renderTable`, `openDd`, market bar, stats bar, verdict box) to consume IDs and call `t()`. |
| 9 | Wire Stage C LLM prompt with `{{locale}}` slot and the forbiddens list. |
| 10 | Add all four enforcement gates (§8) to CI. |
| 11 | Write bilingual golden fixtures for 3-5 scenarios (strong bull, bear divergence, neutral range, extreme FR, stale data). |

---

## 11. Open decisions (need lock-in before P0)

1. **Locale auto-detect vs manual toggle only**: default auto-detect from `navigator.language` then persist, OR force the user to pick on first visit? (Worksheet assumes auto + persist.)
2. **English label tone**: mirror the Korean tone exactly (casual trader voice) or use a slightly more professional register? Lock one style guide.
3. **Phase markers pedagogy**: first mention per answer adds `"Wyckoff (와이코프)"` parenthetical? or never? (Worksheet leans "on first mention in pedagogy mode only".)
4. **`rendered` block in tool response**: mandatory or opt-in? Mandatory is convenient for UI, but LLM should render from IDs anyway to enforce grounding. (Worksheet leans opt-in via request flag.)
5. **Number formatting locale**: strictly `en-US` decimal conventions in both, or `ko-KR` conventions for Korean? (Worksheet recommends `en-US` for both to avoid decimal-comma confusion in financial contexts.)
6. **Timezone in freshness strings**: always `UTC` in both locales? Or local time (`Asia/Seoul`) in Korean only? (Worksheet recommends `UTC` in both for auditability, with optional local-time annotation.)
7. **Pedagogy dictionary scope**: do we pre-author definitions for Wyckoff/CVD/ATR terms in both languages, or let the LLM generate term definitions from its own knowledge? (Worksheet leans pre-authored short definitions + LLM can elaborate.)

Lock these before writing `ko.json` / `en.json`, otherwise we'll re-author the dictionary twice.

---

## 12. TL;DR

- Engine speaks no human language. It emits IDs and numbers.
- Harness is bilingual. Dictionary-backed labels, slot templates, locale slot on every call.
- LLM narrates in the user's language but never invents numbers and never translates contract IDs.
- Click UI and LLM reply must render identical content for the same engine state in the same locale.
- Technical terms (Wyckoff, CVD, ATR, funding rate, tickers, timeframes) stay English in both locales.
- Four CI gates enforce: no Hangul in engine, no hardcoded labels in UI, dictionary parity, bilingual golden tests.
- Korean strings in the HTML are the starting inventory; §7 lists them all and assigns each a stable ID.
