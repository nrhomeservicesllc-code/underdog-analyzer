"""Backtester on resolved markets.

Strategy tested: N hours before a market closes, buy the outcome whose price
falls inside [low, high], hold to resolution. Covers "favorite grinding"
(e.g. 0.90-0.98) and "longshot" (e.g. 0.02-0.15) styles.

Results always include fees and are compared with what pure chance at
those prices would give, so a lucky streak doesn't look like an edge.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable

from .api import Market, _get
from .config import CONFIG


@dataclass
class Sample:
    question: str
    outcome: str
    entry: float
    won: bool


@dataclass
class BacktestResult:
    trades: int
    wins: int
    stake_per_trade: float
    pnl: float
    roi: float
    win_rate: float
    breakeven_win_rate: float
    max_drawdown: float
    z_score: float  # how far the win rate is from what the prices imply

    def summary(self) -> str:
        verdict = ("looks like a real edge" if self.z_score > 2
                   else "within noise - not evidence of an edge" if self.z_score > -2
                   else "worse than the prices imply")
        return (
            f"trades {self.trades} | wins {self.wins} ({self.win_rate:.1%}) | "
            f"break-even {self.breakeven_win_rate:.1%}\n"
            f"PnL ${self.pnl:,.2f} on ${self.stake_per_trade:.0f}/trade | ROI {self.roi:.2%} | "
            f"max drawdown ${self.max_drawdown:,.2f}\n"
            f"z-score {self.z_score:+.2f}: {verdict}"
        )


def run(samples: Iterable[Sample], stake: float = 10.0, fee: float = CONFIG.taker_fee) -> BacktestResult:
    samples = list(samples)
    pnl = peak = dd = 0.0
    wins = 0
    expected_wins = var = 0.0
    for s in samples:
        cost = s.entry * (1 + fee)
        shares = stake / cost
        pnl += (shares if s.won else 0.0) - stake
        wins += s.won
        expected_wins += s.entry
        var += s.entry * (1 - s.entry)
        peak = max(peak, pnl)
        dd = max(dd, peak - pnl)
    n = len(samples)
    return BacktestResult(
        trades=n,
        wins=wins,
        stake_per_trade=stake,
        pnl=pnl,
        roi=pnl / (stake * n) if n else 0.0,
        win_rate=wins / n if n else 0.0,
        breakeven_win_rate=(sum(s.entry for s in samples) / n * (1 + fee)) if n else 0.0,
        max_drawdown=dd,
        z_score=(wins - expected_wins) / math.sqrt(var) if var > 0 else 0.0,
    )


def _price_at(token_id: str, ts: int) -> float | None:
    hist = _get(f"{CONFIG.clob_url}/prices-history",
                {"market": token_id, "startTs": ts - 6 * 3600, "endTs": ts, "fidelity": 60})
    points = hist.get("history") or []
    return float(points[-1]["p"]) if points else None


def collect_samples(low: float, high: float, hours_before: float = 24, markets: int = 300,
                    tag_slug: str | None = None) -> list[Sample]:
    from datetime import datetime

    params: dict[str, Any] = {"closed": "true", "limit": markets, "order": "volume", "ascending": "false"}
    if tag_slug:
        params["tag_slug"] = tag_slug
    out: list[Sample] = []
    for raw in _get(f"{CONFIG.gamma_url}/markets", params):
        m = Market.from_gamma(raw)
        if len(m.prices) != 2 or not m.end_date or sorted(m.prices) != [0.0, 1.0]:
            continue  # skip unresolved, voided or multi-outcome markets
        end = int(datetime.fromisoformat(m.end_date.replace("Z", "+00:00")).timestamp())
        ts = end - int(hours_before * 3600)
        for i, token in enumerate(m.token_ids):
            p = _price_at(token, ts)
            if p is not None and low <= p <= high:
                out.append(Sample(m.question, m.outcomes[i], p, m.prices[i] == 1.0))
    return out
