#!/usr/bin/env bash
# One-click launcher: creates the environment on first run, then shows a menu.
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "First run: setting up (takes ~1 minute)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
  [ -f .env ] || cp .env.example .env
fi
PY=.venv/bin/python
while true; do
  cat <<'MENU'

  Polymarket Desk
  1) Scan for arbitrage
  2) Best liquidity-reward markets
  3) Watch whale trades (live)
  4) Analyze a wallet
  5) Run paper-trading bot
  6) Show positions / PnL
  7) Backtest favorites (0.90-0.98)
  8) Backtest longshots (0.02-0.15)
  q) Quit
MENU
  read -rp "  Choose: " c
  case "$c" in
    1) $PY -m desk arb ;;
    2) $PY -m desk rewards ;;
    3) $PY -m desk whales --follow ;;
    4) read -rp "  Wallet address: " w; $PY -m desk wallet "$w" ;;
    5) $PY -m desk bot ;;
    6) $PY -m desk positions --settle ;;
    7) $PY -m desk backtest --low 0.90 --high 0.98 ;;
    8) $PY -m desk backtest --low 0.02 --high 0.15 ;;
    q|Q) exit 0 ;;
  esac
done
