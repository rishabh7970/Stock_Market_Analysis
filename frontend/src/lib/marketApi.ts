import type { ChartPoint } from '../hooks/useMarketData';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export type RangeKey = '1d' | '7d' | '1mo' | '3mo' | '1y';

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
    { key: '1d', label: '1D' },
    { key: '7d', label: '7D' },
    { key: '1mo', label: '1M' },
    { key: '3mo', label: '3M' },
    { key: '1y', label: '1Y' },
];

interface HistoryResponse {
    symbol: string;
    range: string;
    data: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];
    last_price: number | null;
}

/**
 * Fetches OHLC candles for a symbol over a given range (1d/7d/1mo/3mo/1y).
 * Backed by yfinance server-side, so this returns real data regardless of
 * whether the market is currently open — including a usable last_price.
 */
export async function fetchRangedHistory(
    symbol: string,
    range: RangeKey
): Promise<{ points: ChartPoint[]; lastPrice: number | null }> {
    const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(symbol)}?range=${range}`);
    const json: HistoryResponse = await res.json();

    const points: ChartPoint[] = (json.data ?? []).map((c) => ({
        time: String(c.timestamp),
        value: c.close,
    }));

    return { points, lastPrice: json.last_price ?? null };
}