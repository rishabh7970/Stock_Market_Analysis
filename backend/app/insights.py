"""
Investment insights engine — entirely free, no paid APIs.

For each tracked symbol this builds a "signal card": recent news headlines
with a sentiment score (VADER, local lexicon-based, no API), technical
readings (RSI/trend via the `ta` library), and basic fundamentals (P/E,
market cap via yfinance). It deliberately does NOT synthesize these into a
"buy/sell" recommendation — it surfaces the inputs so you can read them
yourself. This is informational analysis, not financial advice.

pip install yfinance vaderSentiment ta --break-system-packages
"""

from datetime import datetime, timezone
from dataclasses import dataclass, asdict

import yfinance as yf
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import SMAIndicator, MACD
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()


@dataclass
class Headline:
    title: str
    source: str
    link: str
    published: str | None


def _fetch_headlines(symbol: str, limit: int = 5) -> list[Headline]:
    """Pulls recent headlines for a symbol. Only title/source/link are kept —
    never article bodies, to respect copyright and keep this lightweight."""
    try:
        raw = yf.Ticker(symbol).news or []
    except Exception as e:
        print(f"⚠️ Failed to fetch news for {symbol}: {e}")
        return []

    headlines: list[Headline] = []
    for item in raw[:limit]:
        content = item.get("content", item)  # yfinance news shape varies by version
        title = content.get("title") or item.get("title")
        if not title:
            continue
        source = (content.get("provider") or {}).get("displayName", "Unknown") if isinstance(content.get("provider"), dict) else content.get("publisher", "Unknown")
        link = (content.get("canonicalUrl") or {}).get("url") if isinstance(content.get("canonicalUrl"), dict) else content.get("link", "")
        published = content.get("pubDate") or content.get("providerPublishTime")
        headlines.append(Headline(title=title, source=str(source), link=str(link), published=str(published) if published else None))

    return headlines


def _sentiment_from_headlines(headlines: list[Headline]) -> tuple[float, str]:
    """Averages VADER compound scores across headline titles. Titles only —
    enough signal for sentiment without needing article text."""
    if not headlines:
        return 0.0, "No recent news"

    scores = [_analyzer.polarity_scores(h.title)["compound"] for h in headlines]
    avg = sum(scores) / len(scores)

    if avg >= 0.25:
        label = "Positive"
    elif avg <= -0.25:
        label = "Negative"
    else:
        label = "Neutral / Mixed"

    return round(avg, 3), label


def _technical_snapshot(symbol: str) -> dict:
    """RSI, moving-average trend, and MACD histogram sign from ~3 months of
    daily closes. All computed locally from data you already have."""
    try:
        hist: pd.DataFrame = yf.Ticker(symbol).history(period="3mo", interval="1d")
        if hist.empty or len(hist) < 20:
            return {"available": False}

        close = hist["Close"]

        rsi_series = RSIIndicator(close=close, window=14).rsi()
        rsi = round(float(rsi_series.iloc[-1]), 1)
        rsi_signal = "Overbought" if rsi >= 70 else "Oversold" if rsi <= 30 else "Neutral"

        sma20 = SMAIndicator(close=close, window=20).sma_indicator().iloc[-1]
        sma50_window = min(50, len(close) - 1)
        sma50 = SMAIndicator(close=close, window=sma50_window).sma_indicator().iloc[-1]
        trend = "Bullish (short MA above long MA)" if sma20 > sma50 else "Bearish (short MA below long MA)"

        macd_ind = MACD(close=close)
        macd_hist = macd_ind.macd_diff().iloc[-1]
        momentum = "Positive momentum" if macd_hist > 0 else "Negative momentum"

        return {
            "available": True,
            "rsi": rsi,
            "rsi_signal": rsi_signal,
            "trend": trend,
            "momentum": momentum,
            "last_close": round(float(close.iloc[-1]), 2),
        }
    except Exception as e:
        print(f"⚠️ Failed to compute technicals for {symbol}: {e}")
        return {"available": False}


def _fundamentals_snapshot(symbol: str) -> dict:
    try:
        info = yf.Ticker(symbol).info or {}
        return {
            "available": True,
            "pe_ratio": info.get("trailingPE"),
            "market_cap": info.get("marketCap"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        }
    except Exception as e:
        print(f"⚠️ Failed to fetch fundamentals for {symbol}: {e}")
        return {"available": False}


def build_signal_card(symbol: str) -> dict:
    """The main entry point — assembles everything into one card for a symbol."""
    headlines = _fetch_headlines(symbol)
    sentiment_score, sentiment_label = _sentiment_from_headlines(headlines)
    technicals = _technical_snapshot(symbol)
    fundamentals = _fundamentals_snapshot(symbol)

    bullets = []
    if technicals.get("available"):
        bullets.append(f"RSI at {technicals['rsi']} → {technicals['rsi_signal']}")
        bullets.append(technicals["trend"])
        bullets.append(technicals["momentum"])
    if fundamentals.get("available") and fundamentals.get("pe_ratio"):
        bullets.append(f"P/E ratio: {round(fundamentals['pe_ratio'], 1)} — compare against sector peers yourself")
    bullets.append(f"News sentiment: {sentiment_label} (from {len(headlines)} recent headlines)")

    return {
        "symbol": symbol,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment_label,
        "technicals": technicals,
        "fundamentals": fundamentals,
        "bullets": bullets,
        "headlines": [asdict(h) for h in headlines],
        "disclaimer": "Informational analysis only, not financial advice. Verify independently before making any investment decision.",
    }