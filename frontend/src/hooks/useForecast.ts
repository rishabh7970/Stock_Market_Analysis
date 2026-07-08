import { useState } from 'react';

export interface ForecastPoint {
    date: string;
    price: number;
}

export interface ForecastBandPoint extends ForecastPoint {
    lower: number;
    upper: number;
}

export interface CandlestickPattern {
    date: string;
    pattern: string;
    bias: number;
    strength: number;
}

export interface ForecastResult {
    symbol: string;
    available: boolean;
    reason?: string;
    method?: string;
    horizon_days?: number;
    historical?: ForecastPoint[];
    forecast?: ForecastBandPoint[];
    sample_paths?: ForecastPoint[][];
    annualized_drift_pct?: number;
    annualized_volatility_pct?: number;
    pattern_bias_score?: number;
    pattern_drift_adjustment_day1_pct?: number;
    pattern_decay_days?: number;
    recent_patterns?: CandlestickPattern[];
    disclaimer?: string;
}

const API_BASE = 'http://localhost:8000';

export function useForecast() {
    const [result, setResult] = useState<ForecastResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runForecast = async (symbol: string, days: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/forecast/${encodeURIComponent(symbol)}?days=${days}`);
            const json: ForecastResult = await res.json();
            setResult(json);
        } catch (err) {
            console.warn('Forecast failed:', err);
            setError('Could not run the forecast. Check that the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return { result, loading, error, runForecast };
}

export default useForecast;