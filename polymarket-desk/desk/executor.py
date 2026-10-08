"""Order execution: paper (default) and live.

Both executors run through the same risk checks, so a strategy behaves
the same way in paper mode as it will with real money.

Live mode needs every one of these:
  * LIVE_TRADING=1
  * POLY_PRIVATE_KEY (use a dedicated wallet holding only what you can lose)
  * the optional dependency: pip install py-clob-client
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

from .config import CONFIG, Config


class RiskError(Exception):
    pass


@dataclass
class Fill:
    id: str
    token_id: str
    label: str
    side: str
    price: float
    size: float
    ts: float
    mode: str

    @property
    def usd(self) -> float:
        return self.price * self.size


@dataclass
class Ledger:
    path: Path
    fills: list[Fill] = field(default_factory=list)
    settled: dict[str, float] = field(default_factory=dict)  # token_id -> payout per share (0 or 1)

    @classmethod
    def load(cls, path: Path) -> "Ledger":
        if not path.exists():
            return cls(path)
        raw = json.loads(path.read_text())
        return cls(path, [Fill(**f) for f in raw.get("fills", [])], raw.get("settled", {}))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(
            {"fills": [asdict(f) for f in self.fills], "settled": self.settled}, indent=2))

    def positions(self) -> dict[str, dict]:
        pos: dict[str, dict] = {}
        for f in self.fills:
            p = pos.setdefault(f.token_id, {"label": f.label, "shares": 0.0, "cost": 0.0})
            sign = 1 if f.side == "BUY" else -1
            p["shares"] += sign * f.size
            p["cost"] += sign * f.usd
        return pos

    def open_exposure(self) -> float:
        return sum(max(p["cost"], 0) for t, p in self.positions().items() if t not in self.settled)

    def realized_pnl(self) -> float:
        return sum(p["shares"] * self.settled[t] - p["cost"]
                   for t, p in self.positions().items() if t in self.settled)


class Executor:
    mode = "paper"

    def __init__(self, cfg: Config = CONFIG, ledger_path: Path | None = None):
        self.cfg = cfg
        self.ledger = Ledger.load(ledger_path or cfg.data_dir / f"{self.mode}_ledger.json")

    def check_risk(self, orders: list[tuple[str, str, float, float]]) -> None:
        total = sum(price * size for _, _, price, size in orders)
        for _, label, price, size in orders:
            if not 0 < price < 1:
                raise RiskError(f"bad price {price} for {label}")
            if price * size > self.cfg.max_order_usd + 1e-9:
                raise RiskError(f"order ${price * size:.2f} on {label} exceeds MAX_ORDER_USD ${self.cfg.max_order_usd}")
        if self.ledger.open_exposure() + total > self.cfg.max_total_exposure_usd + 1e-9:
            raise RiskError(
                f"exposure would reach ${self.ledger.open_exposure() + total:.2f}, "
                f"above MAX_TOTAL_EXPOSURE_USD ${self.cfg.max_total_exposure_usd}")

    def buy_all(self, orders: list[tuple[str, str, float, float]]) -> list[Fill]:
        """Buy every (token_id, label, limit_price, size) leg, or none of them."""
        self.check_risk(orders)
        fills = [self._send(token, label, price, size) for token, label, price, size in orders]
        self.ledger.fills.extend(fills)
        self.ledger.save()
        return fills

    def _send(self, token_id: str, label: str, price: float, size: float) -> Fill:
        return Fill(uuid.uuid4().hex[:12], token_id, label, "BUY", price, size, time.time(), self.mode)

    def settle(self, resolver: Callable[[str], float | None]) -> int:
        """``resolver(token_id)`` returns the payout per share once a market resolves."""
        n = 0
        for token in self.ledger.positions():
            if token in self.ledger.settled:
                continue
            payout = resolver(token)
            if payout is not None:
                self.ledger.settled[token] = payout
                n += 1
        self.ledger.save()
        return n


class PaperExecutor(Executor):
    mode = "paper"


class LiveExecutor(Executor):
    mode = "live"

    def __init__(self, cfg: Config = CONFIG, ledger_path: Path | None = None):
        if not cfg.live_trading:
            raise RiskError("live trading is off; set LIVE_TRADING=1 to enable it")
        if not cfg.private_key:
            raise RiskError("POLY_PRIVATE_KEY is not set")
        super().__init__(cfg, ledger_path)
        try:
            from py_clob_client.client import ClobClient  # type: ignore
        except ImportError as exc:
            raise RiskError("live trading needs: pip install py-clob-client") from exc
        self.client = ClobClient(
            cfg.clob_url, key=cfg.private_key, chain_id=137,
            signature_type=cfg.signature_type, funder=cfg.funder or None,
        )
        self.client.set_api_creds(self.client.create_or_derive_api_creds())

    def _send(self, token_id: str, label: str, price: float, size: float) -> Fill:
        from py_clob_client.clob_types import OrderArgs, OrderType  # type: ignore
        from py_clob_client.order_builder.constants import BUY  # type: ignore

        signed = self.client.create_order(OrderArgs(price=price, size=round(size, 2), side=BUY, token_id=token_id))
        # Fill-or-kill: either the whole leg fills at the limit price or nothing does.
        res = self.client.post_order(signed, OrderType.FOK)
        if not res or not res.get("success"):
            raise RiskError(f"order rejected for {label}: {res}")
        return Fill(res.get("orderID", uuid.uuid4().hex[:12]), token_id, label, "BUY", price, size, time.time(), self.mode)


def make_executor(cfg: Config = CONFIG) -> Executor:
    return LiveExecutor(cfg) if cfg.live_trading else PaperExecutor(cfg)
