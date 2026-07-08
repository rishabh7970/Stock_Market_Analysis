import asyncio
import os
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import requests
import websockets
import yfinance as yf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from app.insights import build_signal_card
from app.agents import run_horizon_analysis
from app.forecasting import forecast_prices
from app.backtesting import backtest_technical_score
from app.candlestick_patterns import detect_patterns, summarize_recent_bias

# Load environment variables (API Keys)
load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")


class WatchlistAddRequest(BaseModel):
    symbol: str
    name: str | None = None

# ============================================================
# US / Crypto stream (Finnhub) — unchanged from before
# ============================================================

# Global set to keep track of active React UI connections
connected_clients = set()

# In-memory cache for 1-minute candlesticks
# Format: { "AAPL": { 1700000000000: {"open": 150, "high": 152, "low": 149, "close": 151, "volume": 100} } }
price_cache = {}


async def fetch_finnhub_data():
    """Connects to Finnhub, subscribes to tickers, and broadcasts to frontend."""
    if not FINNHUB_API_KEY:
        print("WARNING: FINNHUB_API_KEY not found in .env file. Skipping live stream.")
        return

    uri = f"wss://ws.finnhub.io?token={FINNHUB_API_KEY}"

    # Outer loop ensures we automatically reconnect if the connection drops
    while True:
        try:
            async with websockets.connect(uri) as finnhub_ws:
                print("✅ Connected to Finnhub Live Stream!")

                # Subscribe to specific trade events
                await finnhub_ws.send('{"type":"subscribe","symbol":"AAPL"}')
                await finnhub_ws.send('{"type":"subscribe","symbol":"BINANCE:BTCUSDT"}')

                # Inner loop continuously listens for incoming price ticks
                while True:
                    message = await finnhub_ws.recv()

                    # Process and Cache the Data (1-minute candlesticks)
                    try:
                        data = json.loads(message)
                        if data.get("type") == "trade":
                            for trade in data.get("data", []):
                                symbol = trade["s"]
                                price = trade["p"]
                                volume = trade["v"]
                                timestamp_ms = trade["t"]

                                # Round down to the nearest minute (60000 ms)
                                minute_ts = (timestamp_ms // 60000) * 60000

                                if symbol not in price_cache:
                                    price_cache[symbol] = {}

                                if minute_ts not in price_cache[symbol]:
                                    # Create new minute candle
                                    price_cache[symbol][minute_ts] = {
                                        "open": price,
                                        "high": price,
                                        "low": price,
                                        "close": price,
                                        "volume": volume,
                                        "timestamp": minute_ts,
                                    }
                                else:
                                    # Update existing minute candle
                                    candle = price_cache[symbol][minute_ts]
                                    candle["high"] = max(candle["high"], price)
                                    candle["low"] = min(candle["low"], price)
                                    candle["close"] = price
                                    candle["volume"] += volume
                    except json.JSONDecodeError:
                        pass

                    # Broadcast this message to every connected React client
                    dead_clients = set()
                    for client in connected_clients:
                        try:
                            await client.send_text(message)
                        except Exception:
                            dead_clients.add(client)

                    for client in dead_clients:
                        connected_clients.discard(client)

        except Exception as e:
            print(f"⚠️ Finnhub Connection Error: {e}. Reconnecting in 5 seconds...")
            await asyncio.sleep(5)


# ============================================================
# Indian market stream (NSE/BSE via yfinance) — new
#
# There is no free, official real-time NSE/BSE feed. yfinance pulls
# from Yahoo Finance, which is delayed (typically a few minutes) and
# unofficial. It is fine for a dashboard, not for placing trades.
# Genuine real-time NSE/BSE data requires a broker API tied to a live
# trading account (Zerodha Kite Connect, Groww API, ICICI Breeze) —
# swap _fetch_indian_quote() for one of those later if you need that.
# ============================================================

indian_clients = set()
indian_price_cache: dict[str, dict] = {}

# .NS = NSE, .BO = BSE. ^NSEI is the Nifty 50 index.
WATCHLIST_PATH = os.path.join(os.path.dirname(__file__), "indian_watchlist.json")

DEFAULT_WATCHLIST = [
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries"},
    {"symbol": "TCS.NS", "name": "TCS"},
    {"symbol": "INFY.NS", "name": "Infosys"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank"},
    {"symbol": "^NSEI", "name": "Nifty 50"},
]


def _load_watchlist() -> list[dict]:
    if os.path.exists(WATCHLIST_PATH):
        try:
            with open(WATCHLIST_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Failed to load watchlist, using defaults: {e}")
    return [dict(item) for item in DEFAULT_WATCHLIST]


def _save_watchlist(watchlist: list[dict]):
    try:
        with open(WATCHLIST_PATH, "w") as f:
            json.dump(watchlist, f, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to save watchlist: {e}")


# In-memory list, persisted to disk on every change so additions survive a restart.
indian_watchlist: list[dict] = _load_watchlist()

INDIAN_POLL_INTERVAL_SECONDS = 10


# ============================================================
# Investment insights (news + sentiment + technicals + fundamentals)
# — free, self-hosted, no paid APIs. See app/insights.py.
# ============================================================

INSIGHT_SYMBOLS = [
    "AAPL",
    "RELIANCE.NS",
    "TCS.NS",
    "INFY.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
]

INSIGHTS_REFRESH_SECONDS = 15 * 60  # Yahoo doesn't want to be hammered; 15 min is plenty for news/technicals

insights_cache: dict[str, dict] = {}


# ============================================================
# Historical OHLC ranges (via yfinance) — works regardless of whether the
# market is open, and covers both the US/crypto and Indian symbols.
# This is what backs the 7D / 1M / 3M / 1Y range selectors, and also
# supplies a "last known price" fallback when there's no live tick yet.
# ============================================================

RANGE_CONFIG = {
    "1d": {"period": "1d", "interval": "5m"},
    "7d": {"period": "7d", "interval": "30m"},
    "1mo": {"period": "1mo", "interval": "1d"},
    "3mo": {"period": "3mo", "interval": "1d"},
    "1y": {"period": "1y", "interval": "1wk"},
}

# Finnhub and Yahoo Finance use different tickers for the same instrument.
# Indian symbols (e.g. "RELIANCE.NS") are already Yahoo-native, so they
# pass through unchanged.
FINNHUB_TO_YF_SYMBOL = {
    "AAPL": "AAPL",
    "BINANCE:BTCUSDT": "BTC-USD",
}


def _resolve_yf_symbol(symbol: str) -> str:
    return FINNHUB_TO_YF_SYMBOL.get(symbol, symbol)


def _search_yahoo(query: str, market: str | None = None) -> list[dict]:
    """Blocking call — always invoke via asyncio.to_thread.

    Hits Yahoo Finance's public (unofficial, keyless) search endpoint. Set
    market='IN' to keep only NSE/BSE-listed results; leave it unset to get
    everything (used by the Long-Term page's general ticker search)."""
    try:
        resp = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": query, "quotesCount": 10, "newsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for quote in data.get("quotes", []):
            exchange = quote.get("exchange", "")
            if market == "IN" and exchange not in ("NSI", "BSE"):
                continue
            symbol = quote.get("symbol")
            if not symbol:
                continue
            results.append({
                "symbol": symbol,
                "name": quote.get("shortname") or quote.get("longname") or symbol,
                "exchange": exchange,
                "type": quote.get("quoteType", ""),
            })
        return results
    except Exception as e:
        print(f"⚠️ Yahoo search failed for '{query}': {e}")
        return []


def _fetch_range_history(symbol: str, range_key: str) -> list[dict]:
    """Blocking call — always invoke via asyncio.to_thread."""
    config = RANGE_CONFIG.get(range_key, RANGE_CONFIG["1d"])
    yf_symbol = _resolve_yf_symbol(symbol)

    try:
        hist = yf.Ticker(yf_symbol).history(period=config["period"], interval=config["interval"])
        if hist.empty:
            return []

        candles = []
        for ts, row in hist.iterrows():
            volume = row["Volume"]
            candles.append({
                "timestamp": int(ts.timestamp() * 1000),
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": float(volume) if volume == volume else 0.0,  # NaN check without pandas import
            })
        return candles
    except Exception as e:
        print(f"⚠️ Failed to fetch {range_key} history for {yf_symbol}: {e}")
        return []


async def refresh_insights():
    """Rebuilds the signal card for each tracked symbol on a fixed interval.
    Runs the (blocking) news/technical/fundamental fetches in a thread pool
    so the event loop stays responsive."""
    while True:
        for symbol in INSIGHT_SYMBOLS:
            try:
                card = await asyncio.to_thread(build_signal_card, symbol)
                insights_cache[symbol] = card
                print(f"🔎 Refreshed insights for {symbol}")
            except Exception as e:
                print(f"⚠️ Failed to refresh insights for {symbol}: {e}")

        await asyncio.sleep(INSIGHTS_REFRESH_SECONDS)


def _fetch_indian_quote(symbol: str) -> dict | None:
    """Blocking network call — always invoke via asyncio.to_thread."""
    try:
        ticker = yf.Ticker(symbol)
        price = None
        prev_close = None

        try:
            info = ticker.fast_info
            price = info.get("last_price")
            prev_close = info.get("previous_close")
        except Exception:
            pass  # fall through to the history-based fallback below

        if price is None:
            # fast_info can come back empty outside market hours on some
            # symbols. Falling back to the last daily close means the UI
            # still shows a real price instead of going blank.
            hist = ticker.history(period="5d", interval="1d")
            if hist.empty:
                return None
            price = float(hist["Close"].iloc[-1])
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price

        change = (price - prev_close) if prev_close else 0.0
        percent_change = (change / prev_close * 100) if prev_close else 0.0

        return {
            "symbol": symbol,
            "price": round(float(price), 2),
            "change": round(float(change), 2),
            "percent_change": round(float(percent_change), 2),
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
    except Exception as e:
        print(f"⚠️ Failed to fetch Indian quote for {symbol}: {e}")
        return None


async def poll_indian_stocks():
    """Polls Yahoo Finance for each symbol currently in the watchlist and
    broadcasts each quote to connected clients. Reads a fresh snapshot of
    the watchlist each cycle, so symbols added via the API show up on the
    next poll without needing a restart."""
    while True:
        symbols_snapshot = [item["symbol"] for item in indian_watchlist]
        for symbol in symbols_snapshot:
            quote = await asyncio.to_thread(_fetch_indian_quote, symbol)
            if quote is None:
                continue

            indian_price_cache[symbol] = quote

            dead_clients = set()
            for client in indian_clients:
                try:
                    await client.send_json(quote)
                except Exception:
                    dead_clients.add(client)

            for client in dead_clients:
                indian_clients.discard(client)

        await asyncio.sleep(INDIAN_POLL_INTERVAL_SECONDS)


# ============================================================
# Lifespan — starts both background streams
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    finnhub_task = asyncio.create_task(fetch_finnhub_data())
    indian_task = asyncio.create_task(poll_indian_stocks())
    insights_task = asyncio.create_task(refresh_insights())
    yield
    finnhub_task.cancel()
    indian_task.cancel()
    insights_task.cancel()


app = FastAPI(title="AI Multi-Agent Trading API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# HTTP & WebSocket endpoints
# ============================================================

@app.get("/")
async def root():
    return {"message": "AI Trading System Backend is live!"}


@app.get("/api/history/{symbol}")
async def get_candlestick_history(symbol: str, range: str = "1d"):
    """Returns OHLC candles for the given range (1d, 7d, 1mo, 3mo, 1y) via
    yfinance. This always reflects the most recent completed session, so a
    price still shows when the market is closed — it doesn't depend on the
    live Finnhub tick stream having said anything yet."""
    candles = await asyncio.to_thread(_fetch_range_history, symbol, range)
    last_price = candles[-1]["close"] if candles else None
    return {"symbol": symbol, "range": range, "data": candles, "last_price": last_price}


@app.websocket("/api/ws/market-data")
async def websocket_endpoint(websocket: WebSocket):
    """React components connect here for the live US/crypto (Finnhub) stream."""
    await websocket.accept()
    connected_clients.add(websocket)
    print("🟢 React UI Client Connected (US/crypto)!")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        print("🔴 React UI Client Disconnected (US/crypto).")


@app.get("/api/indian-stocks")
async def get_indian_stocks():
    """Returns the most recently polled quote for every tracked NSE/BSE symbol."""
    return {"data": list(indian_price_cache.values())}


@app.get("/api/search")
async def search_stocks(q: str, market: str | None = None):
    """General ticker search via Yahoo Finance (free, keyless). Pass
    market=IN to restrict results to NSE/BSE — used by the Indian Markets
    search bar. Omit it for unrestricted search — used by Long-Term."""
    if not q or len(q.strip()) == 0:
        return {"data": []}
    results = await asyncio.to_thread(_search_yahoo, q.strip(), market)
    return {"data": results}


@app.get("/api/indian-watchlist")
async def get_watchlist():
    """Returns the current dynamic Indian-stocks watchlist."""
    return {"data": indian_watchlist}


@app.post("/api/indian-watchlist")
async def add_to_watchlist(payload: WatchlistAddRequest):
    """Adds a symbol to the watchlist. It'll appear in the next poll cycle
    (within INDIAN_POLL_INTERVAL_SECONDS), but we also fetch it immediately
    here so the UI doesn't have to wait for that."""
    symbol = payload.symbol.strip().upper()
    name = (payload.name or symbol).strip()

    if not any(item["symbol"] == symbol for item in indian_watchlist):
        indian_watchlist.append({"symbol": symbol, "name": name})
        _save_watchlist(indian_watchlist)

        quote = await asyncio.to_thread(_fetch_indian_quote, symbol)
        if quote:
            indian_price_cache[symbol] = quote

    return {"data": indian_watchlist}


@app.delete("/api/indian-watchlist/{symbol}")
async def remove_from_watchlist(symbol: str):
    """Removes a symbol from the watchlist."""
    global indian_watchlist
    symbol = symbol.upper()
    indian_watchlist = [item for item in indian_watchlist if item["symbol"] != symbol]
    _save_watchlist(indian_watchlist)
    indian_price_cache.pop(symbol, None)
    return {"data": indian_watchlist}


@app.websocket("/api/ws/indian-market-data")
async def indian_websocket_endpoint(websocket: WebSocket):
    """React components connect here for the live Indian market stream."""
    await websocket.accept()
    indian_clients.add(websocket)
    print("🟢 React UI Client Connected (Indian markets)!")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        indian_clients.discard(websocket)
        print("🔴 React UI Client Disconnected (Indian markets).")


@app.get("/api/insights")
async def get_all_insights():
    """Returns the latest cached signal card for every tracked symbol."""
    return {"data": list(insights_cache.values())}


@app.get("/api/insights/{symbol}")
async def get_insight(symbol: str):
    """Returns the latest cached signal card for one symbol, computing it on
    the spot if it hasn't been refreshed yet (e.g. right after server start)."""
    card = insights_cache.get(symbol)
    if card is None:
        card = await asyncio.to_thread(build_signal_card, symbol)
        insights_cache[symbol] = card
    return card


@app.get("/api/screener")
async def run_screener(horizon: str = "6mo", symbols: str | None = None):
    """Runs the LangGraph multi-agent horizon analysis across a set of
    symbols and returns them ranked by composite score. Defaults to your
    tracked insight symbols plus whatever's currently in the Indian
    watchlist. Can be slow (one full analysis pass per symbol, plus an
    LLM call each if Ollama is running) — that's expected for a handful
    of symbols run on-demand rather than continuously in the background."""
    if horizon not in ("3mo", "6mo", "1y"):
        return {"error": "horizon must be one of: 3mo, 6mo, 1y"}

    if symbols:
        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    else:
        symbol_list = list(INSIGHT_SYMBOLS) + [item["symbol"] for item in indian_watchlist]
        symbol_list = list(dict.fromkeys(symbol_list))  # de-dupe, keep order

    results = []
    for symbol in symbol_list:
        try:
            result = await asyncio.to_thread(run_horizon_analysis, symbol, horizon)
            results.append(result)
        except Exception as e:
            print(f"⚠️ Screener failed for {symbol}: {e}")

    results.sort(key=lambda r: r["composite_score"], reverse=True)
    return {"horizon": horizon, "data": results}


@app.get("/api/forecast/{symbol}")
async def get_forecast(symbol: str, days: int = 30):
    """ARIMA price projection. Purely statistical — see forecasting.py for
    why this isn't and can't be a prediction."""
    days = max(5, min(days, 365))
    result = await asyncio.to_thread(forecast_prices, symbol, days)
    return result


@app.get("/api/backtest/{symbol}")
async def get_backtest(symbol: str, horizon: str = "6mo"):
    """Walk-forward backtest of the technical scoring methodology. See
    backtesting.py for why fundamentals/sentiment are excluded."""
    result = await asyncio.to_thread(backtest_technical_score, symbol, horizon)
    return result


def _get_patterns(symbol: str, lookback: str = "3mo") -> dict:
    """Blocking call — always invoke via asyncio.to_thread."""
    hist = yf.Ticker(_resolve_yf_symbol(symbol)).history(period=lookback, interval="1d")
    if hist.empty or len(hist) < 5:
        return {"symbol": symbol, "available": False, "reason": "Not enough price history."}

    patterns = detect_patterns(hist)
    summary = summarize_recent_bias(patterns)

    return {
        "symbol": symbol,
        "available": True,
        "patterns": patterns[-40:],  # cap payload size
        "recent_bias_score": summary["score"],
        "recent_patterns": summary["recent_patterns"],
        "disclaimer": (
            "Classical candlestick patterns have weak, inconsistent empirical support in "
            "modern markets. Shown for reference — not a signal to act on by itself."
        ),
    }


@app.get("/api/patterns/{symbol}")
async def get_patterns(symbol: str, lookback: str = "3mo"):
    result = await asyncio.to_thread(_get_patterns, symbol, lookback)
    return result