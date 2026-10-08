"""Liquidity-rewards finder.

Polymarket pays daily USDC rewards to resting limit orders that sit within
``rewardsMaxSpread`` cents of the midpoint and are at least
``rewardsMinSize`` shares. The pool is shared with every other maker on
that market, so the useful number is reward per dollar of competing
liquidity, not the headline reward.

Risk: a resting order is filled exactly when the price moves against you
(adverse selection). Rewards only pay if they exceed those losses.
"""
from __future__ import annotations

from dataclasses import dataclass

from .api import Market


@dataclass
class RewardQuote:
    market: Market
    midpoint: float
    bid: float
    ask: float
    min_size: float
    daily_pool: float
    competition: float  # approximate dollars of liquidity sharing the pool

    @property
    def pool_per_1k(self) -> float:
        """Rough daily reward per $1,000 of qualifying liquidity."""
        return self.daily_pool / max(self.competition, 1.0) * 1000


def suggest_quote(market: Market, inside_fraction: float = 0.5, tick: float = 0.01) -> RewardQuote | None:
    """Quote both sides ``inside_fraction`` of the max spread away from mid.

    Orders closer to mid score higher but get filled (and picked off) more.
    """
    if market.rewards_daily_rate <= 0 or market.rewards_max_spread <= 0:
        return None
    if market.best_bid is None or market.best_ask is None:
        return None
    mid = (market.best_bid + market.best_ask) / 2
    # Extreme prices are risky to make markets in and score poorly.
    if not 0.10 <= mid <= 0.90:
        return None
    offset = max(tick, round(market.rewards_max_spread / 100 * inside_fraction / tick) * tick)
    bid = round(round((mid - offset) / tick) * tick, 4)
    ask = round(round((mid + offset) / tick) * tick, 4)
    if bid <= 0 or ask >= 1 or bid >= ask:
        return None
    return RewardQuote(
        market=market,
        midpoint=mid,
        bid=bid,
        ask=ask,
        min_size=market.rewards_min_size,
        daily_pool=market.rewards_daily_rate,
        competition=market.liquidity,
    )


def rank(markets: list[Market], top: int = 20) -> list[RewardQuote]:
    quotes = [q for q in (suggest_quote(m) for m in markets) if q]
    return sorted(quotes, key=lambda q: -q.pool_per_1k)[:top]
