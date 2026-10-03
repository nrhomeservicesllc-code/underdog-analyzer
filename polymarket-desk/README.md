# Polymarket Trading Desk

A self-contained Polymarket toolkit you run from your own computer:

| Area | Command | What it does |
|---|---|---|
| Arbitrage | `arb`, `bot` | Finds YES+NO sets and multi-outcome sets priced under $1, and can buy them automatically |
| Liquidity rewards | `rewards` | Ranks markets by daily reward pool per $1k of competing liquidity and suggests bid/ask quotes |
| Whale alerts | `whales --follow` | Streams trades over $10k (configurable) as they happen |
| Trader analysis | `wallet 0x...` | Profiles any wallet: style, volume, top markets, PnL |
| Backtesting | `backtest` | Tests a price-band strategy on resolved markets, with fees and a luck check (z-score) |
| Paper / live trading | `bot`, `positions` | Paper trading by default, live only when you turn it on, with the same risk limits in both |

Everything reads Polymarket's public APIs, so you need no account or keys
until you decide to trade live.

---

## Setup (5 minutes)

You need Python 3.10+.

```bash
cd polymarket-desk
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # optional: edit limits
```

Check it works:

```bash
python -m desk arb
python -m desk rewards --top 10
python -m desk whales
```

> Polymarket blocks some countries (including the US for trading on the
> international site). The read-only commands work from anywhere the API
> is reachable. Check that trading is legal for you before going live.

---

## Commands

```bash
# Arbitrage
python -m desk arb                         # one scan, all categories
python -m desk arb --tag sports            # one category
python -m desk bot                         # scan every 60s and paper-trade gaps
python -m desk bot --once                  # single pass
python -m desk positions --settle          # settle resolved markets, show PnL

# Liquidity rewards
python -m desk rewards --top 20

# Whales and traders
python -m desk whales --min-usd 25000 --follow
python -m desk wallet 0xYourTargetWalletAddress

# Backtesting (many API calls; takes a few minutes)
python -m desk backtest --low 0.90 --high 0.98 --hours 24     # favorites
python -m desk backtest --low 0.02 --high 0.15 --hours 24     # longshots
python -m desk backtest --tag sports --markets 400
```

Every arbitrage sighting is logged to `data/arb_log.jsonl`. Let `bot` run in
paper mode for a few days, then look at that file: it shows how often real
gaps appear, how big they are, and how much you could actually have
deployed.

---

## Going live (read all of this first)

1. Run in paper mode for at least a week. Only go live if `positions` shows a
   profit after fees.
2. Make a new wallet just for this. Fund it only with money you can afford
   to lose. Never use your main wallet's key.
3. Install the trading client: `pip install py-clob-client`
4. In `.env`, set:
   ```
   LIVE_TRADING=1
   POLY_PRIVATE_KEY=0x...      # the new wallet's key
   POLY_FUNDER=0x...           # your Polymarket deposit/proxy address
   POLY_SIGNATURE_TYPE=1       # 1 email login, 2 browser wallet, 0 plain EOA
   MAX_ORDER_USD=10
   MAX_TOTAL_EXPOSURE_USD=50
   ```
5. Start small: `python -m desk bot --once`

Live orders are fill-or-kill at your limit price. An arbitrage set has 2+
legs sent one after another, so if prices move between them, one leg can
fill and the next get rejected. That leaves you with an ordinary one-sided
bet. `MAX_ORDER_USD` caps how much that can cost you.

---

## What to realistically expect

- **Arbitrage** is real but rare and tiny. Professional bots close gaps in
  milliseconds from servers next to Polymarket. From a home computer you
  will mostly see gaps that are already gone. The log tells you the truth.
- **Liquidity rewards** pay real money, but your orders get filled exactly
  when the price moves against you. Rewards have to beat those losses.
- **Whale copying**: by the time you see a trade, the price has moved.
  Whales also hedge elsewhere, so a single trade can mislead.
- **Backtests**: a z-score under 2 means the result is consistent with luck.
  Most simple strategies land there.

None of this is guaranteed income, and you can lose what you put in.

---

## The 10 repositories from the original list

I couldn't download or audit these from the environment this desk was built
in, so treat them as unreviewed. Many "free Polymarket/crypto bot" repos
exist to steal private keys. Before running any of them:

- Read the code, especially anything that reads `PRIVATE_KEY`, makes
  network calls, or runs on install (`postinstall`, `setup.py`).
- Be suspicious of obfuscated code, base64 blobs, binary files, or
  "download this tool" steps.
- Never give a third-party bot your main wallet. Use a new, nearly empty one.

| Repo | Category | Notes |
|---|---|---|
| [recogardtech/AutoPilotPM](https://github.com/recogardtech/AutoPilotPM) | Bots | Unknown author, big claims ("118 strategies"). Audit before use. |
| [HarrierOnChain/Prediction-Markets-Trading-Bot-Toolkits](https://github.com/HarrierOnChain/Prediction-Markets-Trading-Bot-Toolkits) | Bots | Unknown author. Audit before use. |
| [lihanyu81/polymarket_lp_tool](https://github.com/lihanyu81/polymarket_lp_tool) | Bots / rewards | Same idea as `desk rewards`. Audit before giving it a key. |
| [yangyuan-zhen/PolyWeather](https://github.com/yangyuan-zhen/PolyWeather) | Bots / weather | Weather-market data. Safe if used read-only. |
| [SII-WANGZJ/Polymarket_data](https://github.com/SII-WANGZJ/Polymarket_data) | Data | Large trade dataset; useful for deeper backtests. Needs no key. |
| [evan-kolberg/prediction-market-backtesting](https://github.com/evan-kolberg/prediction-market-backtesting) | Testing | Backtester. Needs no key. |
| [ent0n29/polybot](https://github.com/ent0n29/polybot) | Analysis | Trader analyzer; compare with `desk wallet`. |
| [caiovicentino/polymarket-mcp-server](https://github.com/caiovicentino/polymarket-mcp-server) | AI | Connects Claude to Polymarket. Keep it read-only unless audited. |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | AI | Established, widely used agent framework. |
| [aarora4/Awesome-Prediction-Market-Tools](https://github.com/aarora4/Awesome-Prediction-Market-Tools) | Resources | A link list; vet each tool on it separately. |

---

## Tests

```bash
pip install pytest
python -m pytest -q
```
