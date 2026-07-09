import { useEffect, useRef, useState } from 'react';
import type { ChartPoint, ConnectionStatus } from './useMarketData';

export interface IndianQuote {
    symbol: string;
    price: number;
    change: number;
    percent_change: number;
    timestamp: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/api/ws/indian-market-data';
const MAX_POINTS_PER_SYMBOL = 120;

/**
 * Subscribes to the Indian market stream (NSE/BSE via yfinance on the
 * backend). Unlike useMarketData, there's no tick-level trade data or a
 * candlestick history endpoint to seed from — each symbol gets a fresh LTP
 * quote roughly every 10s, so the chart history simply accumulates from
 * whatever quotes have streamed in since the page loaded.
 */
export function useIndianMarketData() {
    const [quotes, setQuotes] = useState<Record<string, IndianQuote>>({});
    const [history, setHistory] = useState<Record<string, ChartPoint[]>>({});
    const [status, setStatus] = useState<ConnectionStatus>('connecting');
    const wsRef = useRef<WebSocket | null>(null);

    // Seed with whatever the backend already has cached, so the page isn't
    // empty for the first ~10s while waiting on the next poll cycle.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/indian-stocks`);
                const json: { data: IndianQuote[] } = await res.json();
                if (cancelled || !json.data?.length) return;

                const nextQuotes: Record<string, IndianQuote> = {};
                const nextHistory: Record<string, ChartPoint[]> = {};
                for (const quote of json.data) {
                    nextQuotes[quote.symbol] = quote;
                    nextHistory[quote.symbol] = [{ time: String(quote.timestamp), value: quote.price }];
                }
                setQuotes((prev) => ({ ...prev, ...nextQuotes }));
                setHistory((prev) => ({ ...prev, ...nextHistory }));
            } catch (err) {
                console.warn('Could not load initial Indian market snapshot:', err);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => setStatus('open');
        ws.onclose = () => setStatus('closed');
        ws.onerror = () => setStatus('error');

        ws.onmessage = (event) => {
            let quote: IndianQuote;
            try {
                quote = JSON.parse(event.data);
            } catch {
                return;
            }
            if (!quote.symbol) return;

            setQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
            setHistory((prev) => {
                const merged = [...(prev[quote.symbol] ?? []), { time: String(quote.timestamp), value: quote.price }];
                return { ...prev, [quote.symbol]: merged.slice(-MAX_POINTS_PER_SYMBOL) };
            });
        };

        return () => {
            ws.close();
        };
    }, []);

    return { quotes, history, status };
}

export default useIndianMarketData;