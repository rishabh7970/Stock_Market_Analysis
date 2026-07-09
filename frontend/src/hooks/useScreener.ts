import { useState } from 'react';

export type Horizon = '3mo' | '6mo' | '1y';

export interface ScreenerResult {
    symbol: string;
    horizon: string;
    technical_score: number;
    sentiment_score: number;
    fundamental_score: number;
    composite_score: number;
    label: string;
    narrative: string | null;
    narrative_available: boolean;
    bullets: string[];
    disclaimer: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Runs the backend's LangGraph multi-agent horizon analysis. This can take
 * a while (a full analysis pass per symbol, plus an LLM call per symbol if
 * Ollama is running) — it's meant to be triggered on demand, not polled.
 */
export function useScreener() {
    const [results, setResults] = useState<ScreenerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runScreener = async (horizon: Horizon, symbols?: string[]) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ horizon });
            if (symbols && symbols.length > 0) params.set('symbols', symbols.join(','));

            const res = await fetch(`${API_BASE}/api/screener?${params.toString()}`);
            const json: { data: ScreenerResult[] } = await res.json();
            setResults(json.data ?? []);
        } catch (err) {
            console.warn('Screener failed:', err);
            setError('Could not run the screener. Check that the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return { results, loading, error, runScreener };
}

export default useScreener;