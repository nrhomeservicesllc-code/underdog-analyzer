"""Whale alerts and wallet analysis.

Large trades are public on Polygon, so this is a way to see what big
wallets do. Copying them is a different matter: by the time you see a
trade the price has already moved, and large wallets also hedge, market
make, or trade on other venues, which makes one trade misleading.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class WhaleTrade:
    wallet: str
    name: str
    side: str
    outcome: str
    title: str
    price: float
    size: float
    usd: float
    when: datetime
    slug: str

    @classmethod
    def from_api(cls, t: dict[str, Any]) -> "WhaleTrade":
        price = float(t.get("price") or 0)
        size = float(t.get("size") or 0)
        return cls(
            wallet=t.get("proxyWallet", ""),
            name=t.get("pseudonym") or t.get("name") or "",
            side=t.get("side", ""),
            outcome=t.get("outcome", ""),
            title=t.get("title", ""),
            price=price,
            size=size,
            usd=price * size,
            when=datetime.fromtimestamp(int(t.get("timestamp") or 0), tz=timezone.utc),
            slug=t.get("eventSlug") or t.get("slug") or "",
        )


def whale_trades(raw: list[dict[str, Any]], min_usd: float) -> list[WhaleTrade]:
    trades = [WhaleTrade.from_api(t) for t in raw]
    return sorted((t for t in trades if t.usd >= min_usd), key=lambda t: t.when, reverse=True)


@dataclass
class WalletProfile:
    wallet: str
    trades: int
    volume_usd: float
    buy_share: float
    avg_price: float
    markets: int
    top_markets: list[tuple[str, float]]
    open_positions: int
    unrealized_pnl: float
    realized_pnl: float
    style: str


def profile_wallet(wallet: str, trades: list[dict[str, Any]], positions: list[dict[str, Any]]) -> WalletProfile:
    parsed = [WhaleTrade.from_api(t) for t in trades]
    volume = sum(t.usd for t in parsed)
    buys = sum(1 for t in parsed if t.side.upper() == "BUY")
    per_market: dict[str, float] = defaultdict(float)
    for t in parsed:
        per_market[t.title] += t.usd
    avg_price = (sum(t.price * t.usd for t in parsed) / volume) if volume else 0.0

    unrealized = sum(float(p.get("cashPnl") or 0) for p in positions)
    realized = sum(float(p.get("realizedPnl") or 0) for p in positions)

    if not parsed:
        style = "inactive"
    elif avg_price >= 0.85:
        style = "favorite grinder (buys near-certain outcomes for small returns)"
    elif avg_price <= 0.20:
        style = "longshot hunter (buys cheap outcomes)"
    elif len(per_market) > 50 and 0.35 <= buys / len(parsed) <= 0.65:
        style = "market maker / high-frequency (many markets, both sides)"
    else:
        style = "directional trader"

    return WalletProfile(
        wallet=wallet,
        trades=len(parsed),
        volume_usd=volume,
        buy_share=buys / len(parsed) if parsed else 0.0,
        avg_price=avg_price,
        markets=len(per_market),
        top_markets=sorted(per_market.items(), key=lambda kv: -kv[1])[:5],
        open_positions=len(positions),
        unrealized_pnl=unrealized,
        realized_pnl=realized,
        style=style,
    )
