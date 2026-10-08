"""Settings, read from environment variables (or a local .env file)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if value[:1] in ('"', "'") and value[0] in value[1:]:
            value = value[1:value.index(value[0], 1)]
        else:
            # Drop trailing "# comment" notes.
            value = "" if value.startswith("#") else re.split(r"\s+#", value, maxsplit=1)[0].strip()
        os.environ.setdefault(key.strip(), value)


_load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


@dataclass(frozen=True)
class Config:
    gamma_url: str = os.environ.get("GAMMA_URL", "https://gamma-api.polymarket.com")
    clob_url: str = os.environ.get("CLOB_URL", "https://clob.polymarket.com")
    data_url: str = os.environ.get("DATA_URL", "https://data-api.polymarket.com")

    # Arbitrage: only report a set whose total cost leaves at least this much
    # profit per $1 payout after fees.
    min_arb_edge: float = _f("MIN_ARB_EDGE", 0.01)
    taker_fee: float = _f("TAKER_FEE", 0.0)

    # Whale alerts: minimum trade size in USDC.
    whale_min_usd: float = _f("WHALE_MIN_USD", 10_000)

    # Risk limits (apply to paper and live trading alike).
    max_order_usd: float = _f("MAX_ORDER_USD", 25)
    max_total_exposure_usd: float = _f("MAX_TOTAL_EXPOSURE_USD", 200)

    # Live trading stays off unless LIVE_TRADING=1 is set explicitly.
    live_trading: bool = os.environ.get("LIVE_TRADING", "0") == "1"
    private_key: str = os.environ.get("POLY_PRIVATE_KEY", "")
    funder: str = os.environ.get("POLY_FUNDER", "")
    signature_type: int = int(os.environ.get("POLY_SIGNATURE_TYPE", "1"))

    data_dir: Path = Path(os.environ.get("DESK_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))


CONFIG = Config()
