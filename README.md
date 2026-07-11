# AITradeAgent Pro

A personal, self-hosted stock research platform covering US, crypto, and Indian (NSE/BSE) markets — live prices, AI multi-agent scoring, Monte Carlo forecasting, candlestick pattern recognition, and backtesting. Runs entirely on free, local infrastructure.

**Research tool, not a trading system. Nothing here is financial advice.**

---

## AI & Agents

**Screener (`agents.py`)** — a real [LangGraph](https://github.com/langchain-ai/langgraph) pipeline:
`fetch_data → technical_agent → sentiment_agent → fundamental_agent → risk_manager → narrative_agent`

Each agent scores one signal (0–100). The risk manager combines them with weights that shift by your chosen horizon — short-term leans technical/sentiment, long-term leans fundamental. The narrative agent optionally asks a **local Ollama LLM** to explain the score in plain language — disabled by default (`ENABLE_OLLAMA_NARRATIVE=false`), since running an LLM locally can be resource-heavy. Scoring works fully without it.

The system never outputs "buy X" — only transparent sub-scores, their weights, and an optional plain-language explanation.

**Forecasting (`forecasting.py`)** — Monte Carlo (GBM) simulation, 500 random paths from historical drift/volatility, instead of an ARIMA point forecast (which collapses to a near-straight line). Candlestick patterns detected on recent candles apply a small, capped, decaying nudge to the drift — always shown, never silent.

**Candlestick patterns (`candlestick_patterns.py`)** — 20 classical patterns, implemented in pure pandas (no TA-Lib, avoids a fragile compiled dependency).

**Backtesting (`backtesting.py`)** — walk-forward test of the technical score only. Fundamentals/sentiment are excluded on purpose: `yfinance` only exposes current values, so scoring the past with today's data would be look-ahead bias.

**Insights (`insights.py`)** — news sentiment (VADER), technicals (`ta`), fundamentals (`yfinance`) — the shared data layer everything else builds on.

---

## Other features
Real-time US/crypto (Finnhub) + Indian (yfinance) prices, a unified "Analyze" workspace (search once, see everything via sub-tabs), dynamic watchlist with search/add, live ticker tape, dark trading-terminal UI.

## Tech stack
**Backend:** FastAPI, LangGraph, LangChain-Ollama, yfinance, ta, vaderSentiment, NumPy/Pandas, websockets
**Frontend:** React + TypeScript + Vite, Tailwind CSS

---

## Setup

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate
pip install fastapi uvicorn websockets python-dotenv pydantic requests yfinance vaderSentiment ta pandas numpy langgraph langchain-ollama
uvicorn app.main:app --reload
```

Create `backend/.env`:
```
FINNHUB_API_KEY=your_key_here
ENABLE_OLLAMA_NARRATIVE=false
```

```bash
# Frontend
cd frontend
npm install && npm run dev
```

Ollama (optional, for LLM narratives): install from ollama.com, `ollama pull llama3.2`, then set `ENABLE_OLLAMA_NARRATIVE=true`. Test it standalone first — if it's unstable on its own, don't enable it here.

---

## Disclaimers
Personal, educational project. Not financial advice, not a trading system. Forecasts are simulations, not predictions. Candlestick patterns have weak empirical support. Backtests don't guarantee future results. Verify independently.
