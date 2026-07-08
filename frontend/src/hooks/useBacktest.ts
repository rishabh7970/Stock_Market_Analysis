import { useState } from 'react';

export interface BacktestSample {
    date: string;
    score: number;
    forward_return: number;
}

export interface BacktestBucket {
    label: string;
    count: number;
    avg_return_pct: number;
    hit_rate_pct: number;
}

export interface BacktestResult {
    symbol: string;
    available: boolean;
    reason?: string;
    horizon?: string;
    num_samples?: number;
    correlation_score_vs_return?: number;
    buckets?: BacktestBucket[];
    buy_and_hold_return_pct?: number;
    samples?: BacktestSample[];
    methodology_note?: string;
    disclaimer?: string;
}

const API_BASE = 'http://localhost:8000';

export function useBacktest() {
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runBacktest = async (symbol: string, horizon: '3mo' | '6mo' | '1y') => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/backtest/${encodeURIComponent(symbol)}?horizon=${horizon}`);
            const json: BacktestResult = await res.json();
            setResult(json);
        } catch (err) {
            console.warn('Backtest failed:', err);
            setError('Could not run the backtest. Check that the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return { result, loading, error, runBacktest };
}

export default useBacktest;