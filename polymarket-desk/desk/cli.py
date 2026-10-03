"""Command-line entry point: python -m desk <command>"""
from __future__ import annotations

import argparse
import json
import sys
import time

import requests
from datetime import datetime, timezone

from . import api, arbitrage, backtest, rewards, whales
from .config import CONFIG
from .executor import PaperExecutor, RiskError, make_executor


def _log_opportunities(opps: list[arbitrage.ArbOpportunity]) -> None:
    """Append every sighting to data/arb_log.jsonl so you can see how often
    (and how big) real gaps are before trading them."""
    CONFIG.data_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    with open(CONFIG.data_dir / "arb_log.jsonl", "a") as fh:
        for o in opps:
            fh.write(json.dumps({"ts": now, "kind": o.kind, "title": o.title, "edge": o.edge,
                                 "sets": o.sets, "profit": o.profit}) + "\n")


def _scan_arb(markets: int, tag: str | None) -> list[arbitrage.ArbOpportunity]:
    ms = api.fetch_markets(limit=markets, tag_slug=tag)
    evs = api.fetch_events(limit=min(markets, 200), tag_slug=tag)
    opps = arbitrage.scan(ms, evs, api.fetch_book)
    _log_opportunities(opps)
    return opps


def cmd_arb(a: argparse.Namespace) -> None:
    opps = _scan_arb(a.markets, a.tag)
    if not opps:
        print(f"No arbitrage with edge >= {CONFIG.min_arb_edge:.1%} right now (this is normal).")
        return
    for o in opps:
        print(f"[{o.kind}] {o.title}\n  edge {o.edge:.2%}  sets {o.sets:,.1f}  "
              f"capital ${o.capital:,.2f}  profit ${o.profit:,.2f}\n  {o.url}")
        for leg in o.legs:
            print(f"    buy {leg.outcome:<10} @ <= {leg.price:.3f}  {leg.question[:70]}")


def cmd_rewards(a: argparse.Namespace) -> None:
    quotes = rewards.rank(api.fetch_markets(limit=a.markets, tag_slug=a.tag), top=a.top)
    if not quotes:
        print("No reward markets found.")
        return
    print(f"{'$/day per $1k':>13}  {'pool/day':>8}  {'bid':>5}  {'ask':>5}  {'min sz':>6}  market")
    for q in quotes:
        print(f"{q.pool_per_1k:13.2f}  {q.daily_pool:8.0f}  {q.bid:5.2f}  {q.ask:5.2f}  "
              f"{q.min_size:6.0f}  {q.market.question[:60]}")
    print("\nEstimates only: real payout depends on time in book, distance from mid and competitors.")


def cmd_whales(a: argparse.Namespace) -> None:
    seen: set[str] = set()
    while True:
        for t in reversed(whales.whale_trades(api.fetch_large_trades(a.min_usd), a.min_usd)):
            key = f"{t.wallet}{t.when.timestamp()}{t.title}{t.size}"
            if key in seen:
                continue
            seen.add(key)
            print(f"{t.when:%H:%M:%S} ${t.usd:>10,.0f} {t.side:<4} {t.outcome:<8} @ {t.price:.2f}  "
                  f"{t.title[:55]}  {t.name or t.wallet[:10]}")
        if not a.follow:
            return
        time.sleep(a.interval)


def cmd_wallet(a: argparse.Namespace) -> None:
    p = whales.profile_wallet(a.address, api.fetch_wallet_activity(a.address),
                              api.fetch_wallet_positions(a.address))
    print(f"wallet         {p.wallet}\nstyle          {p.style}\ntrades         {p.trades} "
          f"(last {p.trades} fetched)\nvolume         ${p.volume_usd:,.0f}\nbuy share      {p.buy_share:.0%}\n"
          f"avg price      {p.avg_price:.2f}\nmarkets        {p.markets}\nopen positions {p.open_positions}\n"
          f"unrealized PnL ${p.unrealized_pnl:,.2f}\nrealized PnL   ${p.realized_pnl:,.2f}")
    for title, usd in p.top_markets:
        print(f"  ${usd:>10,.0f}  {title[:70]}")


def cmd_bot(a: argparse.Namespace) -> None:
    ex = make_executor()
    print(f"Arbitrage bot running in {ex.mode.upper()} mode. "
          f"Max ${CONFIG.max_order_usd}/order, ${CONFIG.max_total_exposure_usd} total. Ctrl+C to stop.")
    recent: dict[str, float] = {}  # don't re-buy the same gap every scan (paper fills don't consume liquidity)
    while True:
        try:
            for o in _scan_arb(a.markets, a.tag):
                key = ",".join(l.token_id for l in o.legs)
                if time.time() - recent.get(key, 0) < 600:
                    continue
                per_leg_max = min(CONFIG.max_order_usd / max(l.price, 0.01) for l in o.legs)
                sets = min(o.sets, per_leg_max)
                if sets < 5:  # Polymarket's minimum order size is ~5 shares
                    continue
                try:
                    ex.buy_all([(l.token_id, f"{l.outcome} | {l.question[:50]}", l.price, sets) for l in o.legs])
                    recent[key] = time.time()
                    print(f"{datetime.now():%H:%M:%S} bought {sets:.1f} sets of '{o.title[:50]}' edge {o.edge:.2%}")
                except RiskError as e:
                    print(f"skipped: {e}")
        except Exception as e:  # network hiccups shouldn't kill the loop
            print(f"scan error: {e}", file=sys.stderr)
        if a.once:
            return
        time.sleep(a.interval)


def _resolver(token_id: str) -> float | None:
    raw = api._get(f"{CONFIG.gamma_url}/markets", {"clob_token_ids": token_id})
    if not raw:
        return None
    m = api.Market.from_gamma(raw[0])
    if not m.closed or token_id not in m.token_ids:
        return None
    price = m.prices[m.token_ids.index(token_id)]
    return price if price in (0.0, 1.0) else None


def cmd_positions(a: argparse.Namespace) -> None:
    ex = PaperExecutor() if not CONFIG.live_trading else make_executor()
    if a.settle:
        print(f"settled {ex.settle(_resolver)} position(s)")
    led = ex.ledger
    for token, p in led.positions().items():
        status = f"settled @ {led.settled[token]:.0f}" if token in led.settled else "open"
        print(f"{p['shares']:>9.1f} sh  cost ${p['cost']:>8.2f}  {status:<12} {p['label']}")
    print(f"\nopen exposure ${led.open_exposure():,.2f} | realized PnL ${led.realized_pnl():,.2f}")


def cmd_backtest(a: argparse.Namespace) -> None:
    print(f"Collecting resolved markets ({a.markets}) - this makes many API calls...")
    samples = backtest.collect_samples(a.low, a.high, a.hours, a.markets, a.tag)
    if not samples:
        print("No samples matched that price band.")
        return
    print(backtest.run(samples, stake=a.stake).summary())


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="desk", description="Polymarket trading desk")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp: argparse.ArgumentParser, markets: int = 300) -> None:
        sp.add_argument("--markets", type=int, default=markets, help="how many markets to scan")
        sp.add_argument("--tag", help="only this category, e.g. sports, politics, crypto")

    sp = sub.add_parser("arb", help="scan for arbitrage once"); common(sp); sp.set_defaults(fn=cmd_arb)
    sp = sub.add_parser("rewards", help="rank liquidity-reward markets"); common(sp, 500)
    sp.add_argument("--top", type=int, default=20); sp.set_defaults(fn=cmd_rewards)
    sp = sub.add_parser("whales", help="show large trades")
    sp.add_argument("--min-usd", type=float, default=CONFIG.whale_min_usd)
    sp.add_argument("--follow", action="store_true", help="keep watching")
    sp.add_argument("--interval", type=int, default=30); sp.set_defaults(fn=cmd_whales)
    sp = sub.add_parser("wallet", help="analyze any trader's wallet")
    sp.add_argument("address"); sp.set_defaults(fn=cmd_wallet)
    sp = sub.add_parser("bot", help="run the arbitrage bot (paper unless LIVE_TRADING=1)"); common(sp)
    sp.add_argument("--interval", type=int, default=60)
    sp.add_argument("--once", action="store_true"); sp.set_defaults(fn=cmd_bot)
    sp = sub.add_parser("positions", help="show bot positions and PnL")
    sp.add_argument("--settle", action="store_true", help="settle resolved markets first")
    sp.set_defaults(fn=cmd_positions)
    sp = sub.add_parser("backtest", help="backtest a price-band strategy on resolved markets")
    sp.add_argument("--low", type=float, default=0.90); sp.add_argument("--high", type=float, default=0.98)
    sp.add_argument("--hours", type=float, default=24, help="enter this many hours before close")
    sp.add_argument("--stake", type=float, default=10); common(sp, 200); sp.set_defaults(fn=cmd_backtest)

    a = p.parse_args(argv)
    try:
        a.fn(a)
    except KeyboardInterrupt:
        pass
    except RiskError as e:
        sys.exit(f"stopped: {e}")
    except requests.RequestException as e:
        sys.exit(f"could not reach Polymarket: {e}")


if __name__ == "__main__":
    main()
