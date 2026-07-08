"""
Monte Carlo (Geometric Brownian Motion) price simulation — free, local,
only needs numpy/pandas/yfinance.

Why this instead of an ARIMA point forecast: ARIMA's mean forecast
collapses to a straight (or gently curved) line a few steps out, because
the autoregressive terms decay to zero influence, leaving only the
deterministic drift term. That's mathematically correct for what ARIMA
computes — but it doesn't look or behave like an actual stock price, which
wiggles randomly around any trend.

GBM Monte Carlo instead simulates many possible random future paths, each
built from the stock's own historical daily volatility. No single path is
"the prediction" — the value is in seeing the *spread* of plausible
outcomes, and none of them are smooth lines, because real returns aren't
smooth either.

Candlestick patterns detected on the most recent candles apply a small,
capped, linearly-decaying nudge to the drift for the first ~15 simulated
days only — never to the whole horizon, since even if these patterns mean
anything, nobody credible claims they mean something 6 months out. The
exact adjustment is always returned in the response, never applied silently.
See candlestick_patterns.py for why these patterns come with real caveats.

IMPORTANT: this still assumes the future behaves statistically like the
past (same average return, same volatility) and has no idea about news,
earnings, or anything else. It's a scenario tool, not a prediction.
"""

import numpy as np
import pandas as pd
import yfinance as yf

from app.candlestick_patterns import detect_patterns, summarize_recent_bias

N_SIMULATIONS = 500
N_SAMPLE_PATHS_TO_RETURN = 12  # individual wiggly paths sent to the frontend for display

# How much a maximal pattern bias score can shift the daily drift, and over
# how many simulated days that influence linearly decays to zero. Kept
# deliberately small — this is a nudge, not a steering wheel.
MAX_PATTERN_DRIFT_PER_DAY = 0.0015  # ~0.15%/day at the very first simulated day, at max bias
PATTERN_DECAY_DAYS = 15
PATTERN_SCORE_CAP = 3.0  # bias scores are clamped to [-3, 3] before scaling


def _pattern_drift_adjustment(bias_score: float, horizon_days: int) -> np.ndarray:
    """Builds a per-day drift adjustment array: strongest on day 1, linearly
    decaying to zero by PATTERN_DECAY_DAYS, then zero for the rest of the
    horizon. Returns an array of length horizon_days."""
    clamped = max(-PATTERN_SCORE_CAP, min(PATTERN_SCORE_CAP, bias_score))
    peak = (clamped / PATTERN_SCORE_CAP) * MAX_PATTERN_DRIFT_PER_DAY

    days = np.arange(1, horizon_days + 1)
    decay = np.clip(1 - (days - 1) / PATTERN_DECAY_DAYS, 0, 1)
    return peak * decay


def forecast_prices(symbol: str, horizon_days: int = 30, lookback: str = "1y") -> dict:
    """Blocking call — always invoke via asyncio.to_thread."""
    hist = yf.Ticker(symbol).history(period=lookback, interval="1d")

    if hist.empty or len(hist) < 60:
        return {"symbol": symbol, "available": False, "reason": "Not enough price history to forecast."}

    close = hist["Close"]
    log_returns = np.diff(np.log(close.values))
    mu = float(np.mean(log_returns))
    sigma = float(np.std(log_returns))
    last_price = float(close.iloc[-1])

    # Detect candlestick patterns on the recent candles and translate them
    # into a small, decaying drift adjustment — see module docstring above.
    patterns = detect_patterns(hist)
    pattern_summary = summarize_recent_bias(patterns)
    bias_score = pattern_summary["score"]
    drift_adjustment = _pattern_drift_adjustment(bias_score, horizon_days)  # shape (horizon_days,)

    rng = np.random.default_rng()
    shocks = rng.standard_normal((N_SIMULATIONS, horizon_days))
    daily_mu = mu + drift_adjustment  # shape (horizon_days,), broadcasts against shocks below
    daily_log_returns = (daily_mu - 0.5 * sigma ** 2) + sigma * shocks
    log_paths = np.cumsum(daily_log_returns, axis=1)
    price_paths = last_price * np.exp(log_paths)  # shape (N_SIMULATIONS, horizon_days)

    last_date = close.index[-1]
    forecast_dates = pd.bdate_range(start=last_date + pd.Timedelta(days=1), periods=horizon_days)
    date_strs = [str(d.date()) for d in forecast_dates]

    median_path = np.median(price_paths, axis=0)
    lower_band = np.percentile(price_paths, 10, axis=0)
    upper_band = np.percentile(price_paths, 90, axis=0)

    forecast = [
        {
            "date": date_strs[i],
            "price": round(float(median_path[i]), 2),
            "lower": round(float(lower_band[i]), 2),
            "upper": round(float(upper_band[i]), 2),
        }
        for i in range(horizon_days)
    ]

    # A handful of individual simulated paths, so the chart shows real
    # wiggly, non-straight trajectories instead of just a smooth median.
    sample_indices = rng.choice(N_SIMULATIONS, size=min(N_SAMPLE_PATHS_TO_RETURN, N_SIMULATIONS), replace=False)
    sample_paths = [
        [
            {"date": date_strs[i], "price": round(float(price_paths[path_idx, i]), 2)}
            for i in range(horizon_days)
        ]
        for path_idx in sample_indices
    ]

    # Trim historical output for the chart payload — the simulation still
    # estimates drift/volatility from the full lookback period.
    historical = [
        {"date": str(idx.date()), "price": round(float(val), 2)}
        for idx, val in close.items()
    ][-180:]

    return {
        "symbol": symbol,
        "available": True,
        "method": "monte_carlo_gbm",
        "horizon_days": horizon_days,
        "historical": historical,
        "forecast": forecast,
        "sample_paths": sample_paths,
        "annualized_drift_pct": round(mu * 252 * 100, 2),
        "annualized_volatility_pct": round(sigma * (252 ** 0.5) * 100, 2),
        "pattern_bias_score": bias_score,
        "pattern_drift_adjustment_day1_pct": round(float(drift_adjustment[0]) * 100, 3) if horizon_days > 0 else 0.0,
        "pattern_decay_days": PATTERN_DECAY_DAYS,
        "recent_patterns": pattern_summary["recent_patterns"],
        "disclaimer": (
            "Monte Carlo simulation from historical volatility only — not a prediction. "
            "Each thin line is one random possible path, not a forecast of what will happen. "
            "Candlestick patterns detected near the most recent candles apply a small, capped "
            "nudge to the drift for roughly the first 15 simulated days only, shown above as "
            "pattern_drift_adjustment_day1_pct — classical patterns have weak empirical support, "
            "so treat this as a disclosed heuristic, not a validated edge. Doesn't account for "
            "news, earnings, or anything outside the price history itself."
        ),
    }