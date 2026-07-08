"""
Backtests the Screener's TECHNICAL scoring methodology against historical
price data. This is deliberately the ONLY component being backtested.

Why not fundamentals or sentiment too? yfinance only exposes CURRENT P/E
and CURRENT news — there's no free way to know what the P/E or news
sentiment actually was two years ago. Scoring a past date using today's
fundamentals/sentiment would be look-ahead bias: using information that
didn't exist at that point in time, which would make the backtest
meaningless or falsely flattering. Technicals (RSI/trend/momentum) are the
one signal that CAN be correctly reconstructed at any historical date,
since they come purely from OHLC price history — so that's what this
measures.

pip install pandas numpy yfinance ta (all already installed for other features)
"""

import numpy as np
import pandas as pd
import yfinance as yf
from ta.momentum import RSIIndicator
from ta.trend import SMAIndicator, MACD

HORIZON_TRADING_DAYS = {"3mo": 63, "6mo": 126, "1y": 252}
STEP_DAYS = 5  # rebalance/sample roughly weekly
MIN_LOOKBACK_BARS = 50  # need this many prior bars before RSI/SMA50/MACD are meaningful


def _technical_score_at(close_slice: pd.Series) -> float | None:
    """Mirrors the scoring logic in agents.py's technical_agent_node,
    applied to a slice of price history ending at a historical date — so
    the backtest measures the same methodology the live screener uses."""
    if len(close_slice) < MIN_LOOKBACK_BARS:
        return None

    score = 50.0

    rsi = RSIIndicator(close=close_slice, window=14).rsi().iloc[-1]
    sma20 = SMAIndicator(close=close_slice, window=20).sma_indicator().iloc[-1]
    sma50_window = min(50, len(close_slice) - 1)
    sma50 = SMAIndicator(close=close_slice, window=sma50_window).sma_indicator().iloc[-1]
    macd_hist = MACD(close=close_slice).macd_diff().iloc[-1]

    if sma20 > sma50:
        score += 25
    else:
        score -= 25

    if macd_hist > 0:
        score += 10
    else:
        score -= 10

    if rsi <= 30:
        score += 15
    elif rsi >= 70:
        score -= 15

    return max(0.0, min(100.0, score))


def _bucket_label(score: float) -> str:
    if score >= 70:
        return "Strong (70+)"
    elif score >= 55:
        return "Moderate (55-69)"
    elif score >= 40:
        return "Mixed (40-54)"
    else:
        return "Weak (<40)"


def backtest_technical_score(symbol: str, horizon: str, lookback: str = "3y") -> dict:
    """Blocking call — always invoke via asyncio.to_thread."""
    if horizon not in HORIZON_TRADING_DAYS:
        return {"symbol": symbol, "available": False, "reason": "Invalid horizon."}

    horizon_days = HORIZON_TRADING_DAYS[horizon]
    hist = yf.Ticker(symbol).history(period=lookback, interval="1d")

    if hist.empty or len(hist) < MIN_LOOKBACK_BARS + horizon_days + STEP_DAYS:
        return {
            "symbol": symbol,
            "available": False,
            "reason": f"Not enough price history for a {horizon} backtest (need roughly {MIN_LOOKBACK_BARS + horizon_days} trading days).",
        }

    close = hist["Close"]
    samples = []

    # Walk forward: score using ONLY data up to each rebalance point, then
    # check the actual return over the following horizon. This is what
    # makes it a real backtest rather than curve-fitting on known outcomes.
    for i in range(MIN_LOOKBACK_BARS, len(close) - horizon_days, STEP_DAYS):
        slice_up_to_now = close.iloc[: i + 1]
        score = _technical_score_at(slice_up_to_now)
        if score is None:
            continue

        price_now = close.iloc[i]
        price_later = close.iloc[i + horizon_days]
        forward_return = (price_later / price_now) - 1

        samples.append({
            "date": str(close.index[i].date()),
            "score": round(score, 1),
            "forward_return": round(float(forward_return) * 100, 2),  # as %
        })

    if len(samples) < 5:
        return {"symbol": symbol, "available": False, "reason": "Not enough sample points generated for a meaningful backtest."}

    scores = np.array([s["score"] for s in samples])
    returns = np.array([s["forward_return"] for s in samples])
    correlation = float(np.corrcoef(scores, returns)[0, 1]) if len(samples) > 1 else 0.0

    buckets: dict[str, list[float]] = {}
    for s in samples:
        label = _bucket_label(s["score"])
        buckets.setdefault(label, []).append(s["forward_return"])

    bucket_summary = []
    for label in ["Strong (70+)", "Moderate (55-69)", "Mixed (40-54)", "Weak (<40)"]:
        rets = buckets.get(label, [])
        if not rets:
            continue
        bucket_summary.append({
            "label": label,
            "count": len(rets),
            "avg_return_pct": round(float(np.mean(rets)), 2),
            "hit_rate_pct": round(float(np.mean([r > 0 for r in rets]) * 100), 1),
        })

    buy_and_hold_return = round(float((close.iloc[-1] / close.iloc[MIN_LOOKBACK_BARS]) - 1) * 100, 2)

    return {
        "symbol": symbol,
        "available": True,
        "horizon": horizon,
        "num_samples": len(samples),
        "correlation_score_vs_return": round(correlation, 3),
        "buckets": bucket_summary,
        "buy_and_hold_return_pct": buy_and_hold_return,
        "samples": samples[-60:],  # cap payload — last 60 points is plenty to eyeball
        "methodology_note": (
            "This backtests only the technical scoring component (RSI/trend/momentum), not "
            "fundamentals or sentiment — those can't be reconstructed at a past date with free "
            "data without look-ahead bias. Sample windows overlap, so points aren't fully "
            "independent — read the correlation as directional, not a precise statistic."
        ),
        "disclaimer": "Past performance of this scoring method is not indicative of future results.",
    }