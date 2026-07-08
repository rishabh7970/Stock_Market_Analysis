# AITradeAgent Pro - Stock Market Analysis Dashboard

AITradeAgent Pro is a full-stack stock market analysis platform built with a React + Vite frontend and a FastAPI backend. It combines live market data, Indian market tracking, technical analysis, sentiment analysis, multi-agent scoring, Monte Carlo forecasting, candlestick pattern detection, and walk-forward backtesting into one interactive dashboard.

> This project is for educational and research purposes only. It does not provide financial advice or buy/sell recommendations.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Custom SVG-based chart components
- WebSocket-based live data hooks

### Backend
- Python
- FastAPI
- WebSockets
- yfinance
- Finnhub WebSocket API
- pandas
- numpy
- ta
- vaderSentiment
- LangGraph
- LangChain Ollama
- Ollama local LLM

## Core Features

## 1. Live Market Dashboard

The dashboard tracks live or near-live market data and displays:

- US stock and crypto prices
- Indian NSE/BSE watchlist
- Live connection status
- Largest Indian market movers
- Interactive stock charts
- Quick links to full analysis pages
- Currency-aware price formatting

US and crypto live data comes from Finnhub WebSocket streams. Indian market data comes from Yahoo Finance through `yfinance`, polled periodically because there is no free official real-time NSE/BSE feed.

## 2. Currency-Aware Stock Display

The project includes a currency detection system that automatically formats prices based on the selected stock symbol.

Examples:

- `AAPL` -> USD `$`
- `RELIANCE.NS` -> INR `₹`
- `TCS.BO` -> INR `₹`
- `7203.T` -> JPY `¥`
- `.L` stocks -> GBP `£`
- European market suffixes -> EUR `€`
- Crypto pairs like `BTC-USD` -> USD `$`

This is handled in:

```txt
frontend/src/lib/marketMeta.ts
