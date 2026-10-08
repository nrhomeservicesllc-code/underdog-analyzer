"""Read-only clients for Polymarket's public APIs (no keys needed).

- Gamma API: market and event metadata, last prices
- CLOB API:  live order books
- Data API:  recent trades (used for whale alerts)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import requests

from .config import CONFIG

_session = requests.Session()
_session.headers["User-Agent"] = "polymarket-desk/1.0"


def _get(url: str, params: dict[str, Any] | None = None) -> Any:
    res = _session.get(url, params=params, timeout=20)
    res.raise_for_status()
    return res.json()


def _json_list(value: Any) -> list:
    """Gamma returns some list fields as JSON-encoded strings."""
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


@dataclass
class Market:
    id: str
    question: str
    slug: str
    outcomes: list[str]
    prices: list[float]
    token_ids: list[str]
    volume_24h: float = 0.0
    liquidity: float = 0.0
    best_bid: float | None = None
    best_ask: float | None = None
    neg_risk: bool = False
    closed: bool = False
    end_date: str = ""
    rewards_min_size: float = 0.0
    rewards_max_spread: float = 0.0  # in cents
    rewards_daily_rate: float = 0.0
    event_id: str = ""
    event_title: str = ""

    @property
    def url(self) -> str:
        return f"https://polymarket.com/market/{self.slug}"

    @classmethod
    def from_gamma(cls, raw: dict[str, Any], event: dict[str, Any] | None = None) -> "Market":
        events = raw.get("events") or []
        ev = event or (events[0] if events else {})
        rewards = raw.get("clobRewards") or []
        daily = sum(float(r.get("rewardsDailyRate") or 0) for r in rewards if isinstance(r, dict))
        return cls(
            id=str(raw.get("id", "")),
            question=raw.get("question", ""),
            slug=raw.get("slug", ""),
            outcomes=[str(o) for o in _json_list(raw.get("outcomes"))],
            prices=[float(p) for p in _json_list(raw.get("outcomePrices"))],
            token_ids=[str(t) for t in _json_list(raw.get("clobTokenIds"))],
            volume_24h=float(raw.get("volume24hr") or 0),
            liquidity=float(raw.get("liquidityNum") or raw.get("liquidity") or 0),
            best_bid=float(raw["bestBid"]) if raw.get("bestBid") is not None else None,
            best_ask=float(raw["bestAsk"]) if raw.get("bestAsk") is not None else None,
            neg_risk=bool(raw.get("negRisk")),
            closed=bool(raw.get("closed")),
            end_date=raw.get("endDate", "") or "",
            rewards_min_size=float(raw.get("rewardsMinSize") or 0),
            rewards_max_spread=float(raw.get("rewardsMaxSpread") or 0),
            rewards_daily_rate=daily,
            event_id=str(ev.get("id", "")),
            event_title=ev.get("title", ""),
        )


@dataclass
class Level:
    price: float
    size: float


@dataclass
class OrderBook:
    token_id: str
    bids: list[Level] = field(default_factory=list)  # best (highest) first
    asks: list[Level] = field(default_factory=list)  # best (lowest) first

    @property
    def best_bid(self) -> float | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> float | None:
        return self.asks[0].price if self.asks else None

    @classmethod
    def from_clob(cls, raw: dict[str, Any]) -> "OrderBook":
        def levels(key: str) -> list[Level]:
            return [Level(float(l["price"]), float(l["size"])) for l in raw.get(key) or []]

        return cls(
            token_id=str(raw.get("asset_id", "")),
            bids=sorted(levels("bids"), key=lambda l: -l.price),
            asks=sorted(levels("asks"), key=lambda l: l.price),
        )


def fetch_markets(limit: int = 500, tag_slug: str | None = None, **filters: Any) -> list[Market]:
    """Active, open markets sorted by 24h volume."""
    out: list[Market] = []
    offset = 0
    page = min(limit, 500)
    while len(out) < limit:
        params: dict[str, Any] = {
            "active": "true", "closed": "false", "limit": page, "offset": offset,
            "order": "volume24hr", "ascending": "false", **filters,
        }
        if tag_slug:
            params["tag_slug"] = tag_slug
        batch = _get(f"{CONFIG.gamma_url}/markets", params)
        if not batch:
            break
        out.extend(Market.from_gamma(m) for m in batch)
        offset += len(batch)
        if len(batch) < page:
            break
    return out[:limit]


def fetch_events(limit: int = 200, tag_slug: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "active": "true", "closed": "false", "limit": limit,
        "order": "volume24hr", "ascending": "false",
    }
    if tag_slug:
        params["tag_slug"] = tag_slug
    return _get(f"{CONFIG.gamma_url}/events", params)


def fetch_market(market_id: str) -> Market:
    return Market.from_gamma(_get(f"{CONFIG.gamma_url}/markets/{market_id}"))


def fetch_book(token_id: str) -> OrderBook:
    return OrderBook.from_clob(_get(f"{CONFIG.clob_url}/book", {"token_id": token_id}))


def fetch_large_trades(min_usd: float, limit: int = 200) -> list[dict[str, Any]]:
    return _get(
        f"{CONFIG.data_url}/trades",
        {"limit": limit, "filterType": "CASH", "filterAmount": min_usd, "takerOnly": "true"},
    )


def fetch_wallet_activity(wallet: str, limit: int = 500) -> list[dict[str, Any]]:
    return _get(f"{CONFIG.data_url}/trades", {"user": wallet, "limit": limit})


def fetch_wallet_positions(wallet: str) -> list[dict[str, Any]]:
    return _get(f"{CONFIG.data_url}/positions", {"user": wallet, "sizeThreshold": 1})
