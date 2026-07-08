"""
Candlestick pattern detection — implemented from scratch in pandas/numpy,
deliberately NOT using TA-Lib.

Why not TA-Lib (the usual library for this)? It wraps a C library that
needs to be compiled or matched to a prebuilt wheel for your exact Python
version — a common source of install failures on Windows, and exactly the
kind of fragile native dependency worth avoiding here. Every pattern below
is just a geometric rule on open/high/low/close, which pandas handles fine
on its own.

IMPORTANT — read before trusting any of this: classical candlestick
patterns have weak, inconsistent empirical support in modern, liquid
markets. Academic backtests of single- and double-candle patterns
frequently fail to find a statistically significant edge once transaction
costs are considered. This module still detects them (they're a real,
widely-taught part of technical analysis, and useful to *see*), but it
does not claim they predict anything. See how forecasting.py uses this:
a small, capped, decaying, fully-disclosed adjustment — never a silent one.

pip install pandas numpy (already installed for other features)
"""

import pandas as pd

# Bias: -1 = bearish, 0 = neutral/indecision, +1 = bullish
# Strength: rough relative confidence, used only to weight the forecast nudge
PATTERN_META = {
    "Doji": {"bias": 0, "strength": 0.3},
    "Dragonfly Doji": {"bias": 1, "strength": 0.5},
    "Gravestone Doji": {"bias": -1, "strength": 0.5},
    "Hammer": {"bias": 1, "strength": 0.7},
    "Hanging Man": {"bias": -1, "strength": 0.6},
    "Inverted Hammer": {"bias": 1, "strength": 0.6},
    "Shooting Star": {"bias": -1, "strength": 0.7},
    "Bullish Marubozu": {"bias": 1, "strength": 0.6},
    "Bearish Marubozu": {"bias": -1, "strength": 0.6},
    "Spinning Top": {"bias": 0, "strength": 0.2},
    "Bullish Engulfing": {"bias": 1, "strength": 0.9},
    "Bearish Engulfing": {"bias": -1, "strength": 0.9},
    "Bullish Harami": {"bias": 1, "strength": 0.5},
    "Bearish Harami": {"bias": -1, "strength": 0.5},
    "Piercing Line": {"bias": 1, "strength": 0.7},
    "Dark Cloud Cover": {"bias": -1, "strength": 0.7},
    "Morning Star": {"bias": 1, "strength": 1.0},
    "Evening Star": {"bias": -1, "strength": 1.0},
    "Three White Soldiers": {"bias": 1, "strength": 1.0},
    "Three Black Crows": {"bias": -1, "strength": 1.0},
}


def _body(o, c):
    return abs(c - o)


def _range(h, l):
    return h - l


def detect_patterns(df: pd.DataFrame) -> list[dict]:
    """Scans a DataFrame with Open/High/Low/Close columns and returns every
    pattern match found, oldest to newest. Each entry: date, pattern name,
    bias, strength. A single date can have multiple entries (e.g. a Doji
    that's also part of an engulfing setup the next day)."""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    body = _body(o, c)
    rng = _range(h, l).replace(0, 1e-9)  # avoid div-by-zero on rare zero-range bars
    upper_wick = h - pd.concat([o, c], axis=1).max(axis=1)
    lower_wick = pd.concat([o, c], axis=1).min(axis=1) - l
    bullish = c > o
    bearish = c < o

    results: list[dict] = []

    def add(mask, name):
        for date in df.index[mask.fillna(False)]:
            meta = PATTERN_META[name]
            results.append({
                "date": str(date.date()),
                "pattern": name,
                "bias": meta["bias"],
                "strength": meta["strength"],
            })

    # ---- Single-candle patterns ----
    is_doji = body <= 0.1 * rng
    add(is_doji & (lower_wick >= 0.6 * rng) & (upper_wick <= 0.15 * rng), "Dragonfly Doji")
    add(is_doji & (upper_wick >= 0.6 * rng) & (lower_wick <= 0.15 * rng), "Gravestone Doji")
    add(is_doji & ~((lower_wick >= 0.6 * rng) | (upper_wick >= 0.6 * rng)), "Doji")

    small_body_top = (body <= 0.35 * rng) & (lower_wick >= 2 * body) & (upper_wick <= 0.15 * rng)
    prior_trend_down = c.shift(1) < c.shift(3)
    prior_trend_up = c.shift(1) > c.shift(3)
    add(small_body_top & prior_trend_down & ~is_doji, "Hammer")
    add(small_body_top & prior_trend_up & ~is_doji, "Hanging Man")

    small_body_bottom = (body <= 0.35 * rng) & (upper_wick >= 2 * body) & (lower_wick <= 0.15 * rng)
    add(small_body_bottom & prior_trend_down & ~is_doji, "Inverted Hammer")
    add(small_body_bottom & prior_trend_up & ~is_doji, "Shooting Star")

    is_marubozu = (body >= 0.9 * rng)
    add(is_marubozu & bullish, "Bullish Marubozu")
    add(is_marubozu & bearish, "Bearish Marubozu")

    is_spinning_top = (body > 0.1 * rng) & (body <= 0.3 * rng) & (upper_wick >= 0.25 * rng) & (lower_wick >= 0.25 * rng)
    add(is_spinning_top, "Spinning Top")

    # ---- Two-candle patterns ----
    prev_o, prev_c = o.shift(1), c.shift(1)
    prev_bearish = prev_c < prev_o
    prev_bullish = prev_c > prev_o

    bullish_engulf = bullish & prev_bearish & (o <= prev_c) & (c >= prev_o)
    bearish_engulf = bearish & prev_bullish & (o >= prev_c) & (c <= prev_o)
    add(bullish_engulf, "Bullish Engulfing")
    add(bearish_engulf, "Bearish Engulfing")

    prev_body = _body(prev_o, prev_c)
    contained = (pd.concat([o, c], axis=1).max(axis=1) <= pd.concat([prev_o, prev_c], axis=1).max(axis=1)) & \
                (pd.concat([o, c], axis=1).min(axis=1) >= pd.concat([prev_o, prev_c], axis=1).min(axis=1))
    bullish_harami = bullish & prev_bearish & contained & (body < 0.6 * prev_body)
    bearish_harami = bearish & prev_bullish & contained & (body < 0.6 * prev_body)
    add(bullish_harami, "Bullish Harami")
    add(bearish_harami, "Bearish Harami")

    prev_mid = (prev_o + prev_c) / 2
    piercing = bullish & prev_bearish & (o < l.shift(1)) & (c > prev_mid) & (c < prev_o)
    dark_cloud = bearish & prev_bullish & (o > h.shift(1)) & (c < prev_mid) & (c > prev_c)
    add(piercing, "Piercing Line")
    add(dark_cloud, "Dark Cloud Cover")

    # ---- Three-candle patterns ----
    c1_o, c1_c = o.shift(2), c.shift(2)
    c2_o, c2_c = o.shift(1), c.shift(1)
    c1_bearish = c1_c < c1_o
    c1_bullish = c1_c > c1_o
    c1_body = _body(c1_o, c1_c)
    c2_body = _body(c2_o, c2_c)
    c1_mid = (c1_o + c1_c) / 2

    morning_star = c1_bearish & (c1_body > 0.4 * rng.shift(2).fillna(rng)) & (c2_body < 0.3 * c1_body) & bullish & (c > c1_mid)
    evening_star = c1_bullish & (c1_body > 0.4 * rng.shift(2).fillna(rng)) & (c2_body < 0.3 * c1_body) & bearish & (c < c1_mid)
    add(morning_star, "Morning Star")
    add(evening_star, "Evening Star")

    # Three White Soldiers: three consecutive bullish candles, each closing higher, each opening within previous body
    cond_3_bullish = bullish & prev_bullish & (c1_bullish)
    higher_closes = (c > prev_c) & (prev_c > c1_c)
    opens_within_prev_body = (o >= pd.concat([prev_o, prev_c], axis=1).min(axis=1)) & (o <= pd.concat([prev_o, prev_c], axis=1).max(axis=1))
    three_white_soldiers = cond_3_bullish & higher_closes & opens_within_prev_body
    add(three_white_soldiers, "Three White Soldiers")

    cond_3_bearish = bearish & prev_bearish & (c1_bearish)
    lower_closes = (c < prev_c) & (prev_c < c1_c)
    opens_within_prev_body_bear = opens_within_prev_body  # same containment check
    three_black_crows = cond_3_bearish & lower_closes & opens_within_prev_body_bear
    add(three_black_crows, "Three Black Crows")

    results.sort(key=lambda r: r["date"])
    return results


def summarize_recent_bias(patterns: list[dict], recent_days: int = 5) -> dict:
    """Aggregates patterns found in the last `recent_days` calendar days of
    the series into a single signed bias score, weighted by strength and
    recency. Used by forecasting.py to nudge the simulation — see the
    caveats there before treating this as meaningful."""
    if not patterns:
        return {"score": 0.0, "recent_patterns": []}

    all_dates = sorted({p["date"] for p in patterns})
    cutoff_dates = set(all_dates[-recent_days:]) if len(all_dates) > recent_days else set(all_dates)
    recent = [p for p in patterns if p["date"] in cutoff_dates]

    if not recent:
        return {"score": 0.0, "recent_patterns": []}

    # More recent dates get slightly more weight than older ones within the window.
    date_rank = {d: i for i, d in enumerate(sorted(cutoff_dates))}
    max_rank = max(date_rank.values()) or 1

    score = 0.0
    for p in recent:
        recency_weight = 0.5 + 0.5 * (date_rank[p["date"]] / max_rank)
        score += p["bias"] * p["strength"] * recency_weight

    return {"score": round(score, 3), "recent_patterns": recent}