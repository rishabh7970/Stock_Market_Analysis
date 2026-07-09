import { useEffect, useRef, useState } from 'react';

// ---- Types ----

export interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number; // ms epoch, rounded to the minute
}

export interface ChartPoint {
    time: string;
    value: number;
}

interface FinnhubTrade {
    s: string; // symbol
    p: number; // price
    v: number; // volume
    t: number; // timestamp ms
}

interface FinnhubTradeMessage {
    type: 'trade' | 'ping';
    data?: FinnhubTrade[];
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

// ---- Config ----

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = `${API_BASE.replace(/^http/, 'ws')}/api/ws/market-data`;
const THROTTLE_MS = 500; // per Day 7 of the build plan
const MAX_POINTS_PER_SYMBOL = 120; // keep the chart light

// ---- Hook ----

/**
 * Subscribes to one or more symbols and returns:
 *  - latestPrice: the most recent trade price per symbol
 *  - chartData: a rolling window of {time, value} points per symbol, safe to
 *    feed straight into <TradingChart data={chartData['AAPL']} />
 *  - status: websocket connection status, useful for an "Awaiting Live Data" state
 *
 * History is seeded once from GET /api/history/{symbol} (the 1‑minute
 * candlestick cache your backend already builds), then every subsequent
 * trade tick is merged in live. Updates are batched and flushed at most
 * once every 500ms so a fast tick stream can't flood React with renders.
 */
export function useMarketData(symbols: string[]) {
    const [latestPrice, setLatestPrice] = useState<Record<string, number>>({});
    const [chartData, setChartData] = useState<Record<string, ChartPoint[]>>({});
    const [status, setStatus] = useState<ConnectionStatus>('connecting');

    // Buffers written to on every websocket message, flushed on a timer.
    // Refs so the flush interval doesn't need to be recreated every tick.
    const priceBuffer = useRef<Record<string, number>>({});
    const pointBuffer = useRef<Record<string, ChartPoint[]>>({});
    const wsRef = useRef<WebSocket | null>(null);

    // --- 1. Seed history for each symbol on mount ---
    useEffect(() => {
        let cancelled = false;

        symbols.forEach(async (symbol) => {
            try {
                const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(symbol)}`);
                const json: { data: Candle[] } = await res.json();
                if (cancelled || !json.data?.length) return;

                const points: ChartPoint[] = json.data
                    .slice(-MAX_POINTS_PER_SYMBOL)
                    .map((c) => ({ time: String(c.timestamp), value: c.close }));

                setChartData((prev) => ({ ...prev, [symbol]: points }));
                setLatestPrice((prev) => ({
                    ...prev,
                    [symbol]: points[points.length - 1]?.value ?? prev[symbol],
                }));
            } catch (err) {
                // Backend may not be running yet, or symbol has no history cached.
                console.warn(`Could not load history for ${symbol}:`, err);
            }
        });

        return () => {
            cancelled = true;
        };
        // symbols is expected to be a stable array (e.g. defined outside the component)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- 2. Open the websocket to the FastAPI passthrough ---
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => setStatus('open');
        ws.onclose = () => setStatus('closed');
        ws.onerror = () => setStatus('error');

        ws.onmessage = (event) => {
            let msg: FinnhubTradeMessage;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (msg.type !== 'trade' || !msg.data) return;

            for (const trade of msg.data) {
                if (!symbols.includes(trade.s)) continue;

                priceBuffer.current[trade.s] = trade.p;

                const bucket = pointBuffer.current[trade.s] ?? [];
                bucket.push({ time: String(trade.t), value: trade.p });
                pointBuffer.current[trade.s] = bucket;
            }
        };

        return () => {
            ws.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- 3. Flush buffered ticks into state at most every 500ms ---
    useEffect(() => {
        const interval = setInterval(() => {
            const bufferedPrices = priceBuffer.current;
            const bufferedPoints = pointBuffer.current;

            if (Object.keys(bufferedPrices).length === 0 && Object.keys(bufferedPoints).length === 0) {
                return; // nothing new since last flush, skip the render
            }

            priceBuffer.current = {};
            pointBuffer.current = {};

            setLatestPrice((prev) => ({ ...prev, ...bufferedPrices }));

            setChartData((prev) => {
                const next = { ...prev };
                for (const [symbol, newPoints] of Object.entries(bufferedPoints)) {
                    const merged = [...(next[symbol] ?? []), ...newPoints];
                    next[symbol] = merged.slice(-MAX_POINTS_PER_SYMBOL);
                }
                return next;
            });
        }, THROTTLE_MS);

        return () => clearInterval(interval);
    }, []);

    const isConnected = status === 'open';

    return { latestPrice, chartData, status, isConnected };
}

export default useMarketData;