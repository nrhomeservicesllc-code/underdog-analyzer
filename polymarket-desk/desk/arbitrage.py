"""Arbitrage scanners.

Two kinds of locked-in arbitrage exist on Polymarket:

1. Binary: YES + NO of the same market always pay out exactly $1 together.
   If best_ask(YES) + best_ask(NO) < $1, buying both locks in the difference.

2. Neg-risk (multi-outcome) events: exactly one outcome resolves YES, so a
   full set of YES shares pays exactly $1. If the YES asks add up to less
   than $1, buying one of each locks in the difference.

These gaps are rare, small and closed within seconds by professional bots.
The scanner measures how often they really appear before you commit money.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable

from .api import Level, Market, OrderBook
from .config import CONFIG


@dataclass
class Leg:
    market_id: str
    question: str
    outcome: str
    token_id: str
    price: float  # worst price paid while walking the book (use as limit price)
    size: float


@dataclass
class ArbOpportunity:
    kind: str  # "binary" or "neg_risk"
    title: str
    legs: list[Leg] = field(default_factory=list)
    sets: float = 0.0          # number of complete $1 sets that can be bought
    cost_per_set: float = 0.0  # average cost of one set, including fees
    url: str = ""

    @property
    def edge(self) -> float:
        return 1.0 - self.cost_per_set

    @property
    def profit(self) -> float:
        return self.edge * self.sets

    @property
    def capital(self) -> float:
        return self.cost_per_set * self.sets


def fillable_sets(books: list[list[Level]], min_edge: float, fee: float, max_sets: float = float("inf")) -> tuple[float, float, list[float]]:
    """Walk several ask ladders at once and buy complete sets while each extra
    set still clears ``min_edge``.

    Returns (sets, average cost per set incl. fees, worst price per leg).
    """
    idx = [0] * len(books)
    left = [b[0].size if b else 0.0 for b in books]
    worst = [b[0].price if b else 0.0 for b in books]
    sets = 0.0
    cost = 0.0
    if any(not b for b in books):
        return 0.0, 0.0, worst
    while sets < max_sets:
        prices = [books[i][idx[i]].price for i in range(len(books))]
        marginal = sum(prices) * (1 + fee)
        if 1.0 - marginal < min_edge or marginal >= 1.0:
            break
        step = min(min(left), max_sets - sets)
        if step <= 0:
            break
        sets += step
        cost += marginal * step
        for i in range(len(books)):
            worst[i] = max(worst[i], prices[i])
            left[i] -= step
            if left[i] <= 1e-9:
                idx[i] += 1
                if idx[i] >= len(books[i]):
                    return sets, cost / sets, worst
                left[i] = books[i][idx[i]].size
    return sets, (cost / sets if sets else 0.0), worst


def binary_arb(market: Market, yes: OrderBook, no: OrderBook,
               min_edge: float = CONFIG.min_arb_edge, fee: float = CONFIG.taker_fee) -> ArbOpportunity | None:
    if len(market.token_ids) != 2:
        return None
    sets, avg, worst = fillable_sets([yes.asks, no.asks], min_edge, fee)
    if sets <= 0:
        return None
    return ArbOpportunity(
        kind="binary",
        title=market.question,
        legs=[
            Leg(market.id, market.question, market.outcomes[i] if i < len(market.outcomes) else str(i),
                market.token_ids[i], worst[i], sets)
            for i in range(2)
        ],
        sets=sets,
        cost_per_set=avg,
        url=market.url,
    )


def neg_risk_arb(event_title: str, markets: list[Market], yes_books: list[OrderBook],
                 min_edge: float = CONFIG.min_arb_edge, fee: float = CONFIG.taker_fee) -> ArbOpportunity | None:
    """``markets`` must be every outcome of one neg-risk event; missing even one
    outcome turns the 'arbitrage' into a plain bet."""
    if len(markets) < 2 or len(markets) != len(yes_books):
        return None
    sets, avg, worst = fillable_sets([b.asks for b in yes_books], min_edge, fee)
    if sets <= 0:
        return None
    return ArbOpportunity(
        kind="neg_risk",
        title=event_title,
        legs=[Leg(m.id, m.question, "Yes", m.token_ids[0], worst[i], sets) for i, m in enumerate(markets)],
        sets=sets,
        cost_per_set=avg,
        url=markets[0].url,
    )


def quick_prefilter(market: Market, slack: float = 0.02) -> bool:
    """Cheap check on Gamma's cached prices before spending book requests."""
    if len(market.prices) != 2 or market.best_ask is None:
        return False
    # Gamma's bestAsk is for the first outcome; the second outcome's best ask is
    # 1 - bestBid(first). Their sum is 1 + spread, so only tight books qualify.
    if market.best_bid is None:
        return False
    return market.best_ask + (1 - market.best_bid) < 1 + slack


def scan(markets: Iterable[Market], events: list[dict], get_book: Callable[[str], OrderBook],
         max_book_requests: int = 300) -> list[ArbOpportunity]:
    found: list[ArbOpportunity] = []
    budget = max_book_requests

    for m in markets:
        if budget < 2:
            break
        if m.neg_risk or not quick_prefilter(m):
            continue
        budget -= 2
        opp = binary_arb(m, get_book(m.token_ids[0]), get_book(m.token_ids[1]))
        if opp:
            found.append(opp)

    for ev in events:
        if not ev.get("negRisk"):
            continue
        ms = [Market.from_gamma(raw, ev) for raw in ev.get("markets") or []]
        if not ms or any(m.closed for m in ms):
            continue
        # Skip events whose cached YES prices are clearly above $1 in total.
        if sum(m.best_ask or (m.prices[0] if m.prices else 1) for m in ms) > 1.05:
            continue
        if budget < len(ms):
            break
        budget -= len(ms)
        opp = neg_risk_arb(ev.get("title", ""), ms, [get_book(m.token_ids[0]) for m in ms])
        if opp:
            found.append(opp)

    return sorted(found, key=lambda o: -o.profit)
