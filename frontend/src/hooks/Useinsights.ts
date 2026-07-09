import { useEffect, useState } from 'react';

export interface Headline {
    title: string;
    source: string;
    link: string;
    published: string | null;
}

export interface Technicals {
    available: boolean;
    rsi?: number;
    rsi_signal?: string;
    trend?: string;
    momentum?: string;
    last_close?: number;
}

export interface Fundamentals {
    available: boolean;
    pe_ratio?: number | null;
    market_cap?: number | null;
    fifty_two_week_high?: number | null;
    fifty_two_week_low?: number | null;
}

export interface SignalCard {
    symbol: string;
    generated_at: string;
    sentiment_score: number;
    sentiment_label: string;
    technicals: Technicals;
    fundamentals: Fundamentals;
    bullets: string[];
    headlines: Headline[];
    disclaimer: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const POLL_INTERVAL_MS = 60_000; // insights refresh server-side every 15 min; polling every 60s is plenty

/**
 * Polls GET /api/insights/{symbol} for each symbol. Insights are cheap to
 * poll (they're served from an in-memory cache refreshed every 15 min
 * server-side), so unlike useMarketData this doesn't need a websocket.
 */
export function useInsights(symbols: string[]) {
    const [cards, setCards] = useState<Record<string, SignalCard>>({});
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;

        const fetchAll = async () => {
            try {
                const results = await Promise.all(
                    symbols.map((symbol) =>
                        fetch(`${API_BASE}/api/insights/${encodeURIComponent(symbol)}`).then((r) => r.json())
                    )
                );
                if (cancelled) return;

                const next: Record<string, SignalCard> = {};
                for (const card of results) {
                    if (card?.symbol) next[card.symbol] = card;
                }
                setCards((prev) => ({ ...prev, ...next }));
            } catch (err) {
                console.warn('Could not load insights:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchAll();
        const interval = setInterval(fetchAll, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { cards, loading };
}

export default useInsights;