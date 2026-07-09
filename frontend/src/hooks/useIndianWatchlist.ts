import { useEffect, useState, useCallback } from 'react';

export interface WatchlistItem {
    symbol: string;
    name: string;
}

export interface SearchResult {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function useIndianWatchlist() {
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/indian-watchlist`);
            const json: { data: WatchlistItem[] } = await res.json();
            setWatchlist(json.data ?? []);
        } catch (err) {
            console.warn('Could not load watchlist:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadWatchlist = async () => {
            await refresh();
        };

        void loadWatchlist();
    }, [refresh]);

    const addSymbol = useCallback(
        async (symbol: string, name?: string) => {
            try {
                const res = await fetch(`${API_BASE}/api/indian-watchlist`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbol, name }),
                });
                const json: { data: WatchlistItem[] } = await res.json();
                setWatchlist(json.data ?? []);
            } catch (err) {
                console.warn('Could not add symbol to watchlist:', err);
            }
        },
        []
    );

    const removeSymbol = useCallback(async (symbol: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/indian-watchlist/${encodeURIComponent(symbol)}`, {
                method: 'DELETE',
            });
            const json: { data: WatchlistItem[] } = await res.json();
            setWatchlist(json.data ?? []);
        } catch (err) {
            console.warn('Could not remove symbol from watchlist:', err);
        }
    }, []);

    return { watchlist, loading, addSymbol, removeSymbol, refresh };
}

/** Debounced search against the backend's Yahoo Finance search proxy. */
export async function searchStocks(query: string, market?: 'IN'): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const params = new URLSearchParams({ q: query });
    if (market) params.set('market', market);
    try {
        const res = await fetch(`${API_BASE}/api/search?${params.toString()}`);
        const json: { data: SearchResult[] } = await res.json();
        return json.data ?? [];
    } catch (err) {
        console.warn('Search failed:', err);
        return [];
    }
}

export default useIndianWatchlist;