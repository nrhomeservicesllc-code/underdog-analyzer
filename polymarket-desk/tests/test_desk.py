import pytest

from desk import arbitrage, backtest, rewards, whales
from desk.api import Level, Market, OrderBook
from desk.config import Config
from desk.executor import PaperExecutor, RiskError


def book(token, asks, bids=()):
    return OrderBook(token, [Level(p, s) for p, s in bids], [Level(p, s) for p, s in asks])


def market(**kw):
    raw = {
        "id": "1", "question": "Will X happen?", "slug": "x",
        "outcomes": '["Yes", "No"]', "outcomePrices": '["0.48", "0.52"]',
        "clobTokenIds": '["tY", "tN"]', "bestBid": 0.47, "bestAsk": 0.48,
        "liquidityNum": 5000, "rewardsMinSize": 50, "rewardsMaxSpread": 3.5,
        "clobRewards": [{"rewardsDailyRate": 20}],
    }
    raw.update(kw)
    return Market.from_gamma(raw)


def test_gamma_parsing():
    m = market()
    assert m.outcomes == ["Yes", "No"]
    assert m.prices == [0.48, 0.52]
    assert m.token_ids == ["tY", "tN"]
    assert m.rewards_daily_rate == 20


def test_orderbook_sorts_best_first():
    ob = OrderBook.from_clob({"asset_id": "t", "bids": [{"price": "0.4", "size": "1"}, {"price": "0.45", "size": "2"}],
                              "asks": [{"price": "0.6", "size": "1"}, {"price": "0.55", "size": "3"}]})
    assert ob.best_bid == 0.45 and ob.best_ask == 0.55


def test_binary_arb_walks_book_until_edge_gone():
    yes = book("tY", [(0.45, 100), (0.50, 100)])
    no = book("tN", [(0.50, 150)])
    opp = arbitrage.binary_arb(market(), yes, no, min_edge=0.01, fee=0)
    # 100 sets at 0.95 qualify; the next level costs 1.00 and does not.
    assert opp is not None
    assert opp.sets == pytest.approx(100)
    assert opp.edge == pytest.approx(0.05)
    assert opp.profit == pytest.approx(5)
    assert [l.price for l in opp.legs] == [0.45, 0.50]


def test_no_arb_when_sum_at_least_one():
    assert arbitrage.binary_arb(market(), book("tY", [(0.5, 10)]), book("tN", [(0.5, 10)]), 0.0, 0) is None


def test_fees_can_remove_arb():
    yes, no = book("tY", [(0.48, 10)]), book("tN", [(0.50, 10)])
    assert arbitrage.binary_arb(market(), yes, no, 0.01, fee=0) is not None
    assert arbitrage.binary_arb(market(), yes, no, 0.01, fee=0.02) is None


def test_neg_risk_arb_needs_every_outcome():
    ms = [market(id=str(i), clobTokenIds=f'["y{i}", "n{i}"]', negRisk=True) for i in range(3)]
    books = [book(f"y{i}", [(0.30, 20)]) for i in range(3)]
    opp = arbitrage.neg_risk_arb("Who wins?", ms, books, 0.01, 0)
    assert opp and opp.edge == pytest.approx(0.10) and opp.sets == 20
    assert arbitrage.neg_risk_arb("Who wins?", ms, books[:2], 0.01, 0) is None


def test_reward_quote_inside_max_spread():
    q = rewards.suggest_quote(market())
    assert q is not None
    assert q.bid < q.midpoint < q.ask
    assert (q.ask - q.midpoint) * 100 <= 3.5
    assert rewards.suggest_quote(market(bestBid=0.02, bestAsk=0.03)) is None  # extreme price
    assert rewards.suggest_quote(market(clobRewards=[])) is None


def test_whale_filter_and_profile():
    raw = [
        {"proxyWallet": "0xa", "side": "BUY", "price": 0.95, "size": 20000, "title": "A", "outcome": "Yes", "timestamp": 2},
        {"proxyWallet": "0xa", "side": "BUY", "price": 0.92, "size": 100, "title": "B", "outcome": "Yes", "timestamp": 1},
    ]
    big = whales.whale_trades(raw, 10_000)
    assert len(big) == 1 and big[0].usd == pytest.approx(19000)
    p = whales.profile_wallet("0xa", raw, [{"cashPnl": 5, "realizedPnl": 2}])
    assert "favorite" in p.style and p.markets == 2 and p.unrealized_pnl == 5


def test_paper_executor_risk_limits(tmp_path):
    cfg = Config(max_order_usd=10, max_total_exposure_usd=15, data_dir=tmp_path)
    ex = PaperExecutor(cfg, tmp_path / "l.json")
    ex.buy_all([("t1", "A", 0.5, 20)])  # $10
    with pytest.raises(RiskError):
        ex.buy_all([("t2", "B", 0.5, 30)])  # $15 order > $10 max
    with pytest.raises(RiskError):
        ex.buy_all([("t2", "B", 0.5, 12)])  # total exposure $16 > $15
    assert len(ex.ledger.fills) == 1  # rejected orders leave nothing behind

    ex.settle(lambda t: 1.0)
    assert ex.ledger.realized_pnl() == pytest.approx(10)
    assert PaperExecutor(cfg, tmp_path / "l.json").ledger.realized_pnl() == pytest.approx(10)  # persisted


def test_backtest_math():
    samples = [backtest.Sample("q", "Yes", 0.5, True), backtest.Sample("q", "Yes", 0.5, False)]
    r = backtest.run(samples, stake=10, fee=0)
    assert r.pnl == pytest.approx(0) and r.win_rate == 0.5 and r.breakeven_win_rate == 0.5
    assert abs(r.z_score) < 1e-9
    r = backtest.run([backtest.Sample("q", "Yes", 0.9, False)], stake=10, fee=0)
    assert r.pnl == -10 and r.max_drawdown == 10
