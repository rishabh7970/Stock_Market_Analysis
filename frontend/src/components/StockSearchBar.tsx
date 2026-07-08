import React, { useEffect, useRef, useState } from 'react';
import { searchStocks } from '../hooks/useIndianWatchlist';
import type { SearchResult } from '../hooks/useIndianWatchlist';

export interface StockSearchBarProps {
    /** Pass 'IN' to restrict results to NSE/BSE. Omit for unrestricted search. */
    market?: 'IN';
    placeholder?: string;
    /** If provided, each result row gets an "Add" button that calls this. */
    onAdd?: (result: SearchResult) => void;
    /** If provided, clicking a result row itself calls this (e.g. to load analysis). */
    onSelect?: (result: SearchResult) => void;
}

const DEBOUNCE_MS = 350;

const StockSearchBar: React.FC<StockSearchBarProps> = ({ market, placeholder = 'Search stocks...', onAdd, onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!query.trim()) {
            Promise.resolve().then(() => {
                setResults([]);
                setIsOpen(false);
            });
            return;
        }

        let cancelled = false;

        Promise.resolve().then(() => {
            if (!cancelled) setLoading(true);
        });

        const timeout = setTimeout(async () => {
            const found = await searchStocks(query, market);
            if (cancelled) return;
            setResults(found);
            setIsOpen(true);
            setLoading(false);
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [query, market]);

    // Close the dropdown when clicking outside it.
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full max-w-md">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setIsOpen(true)}
                placeholder={placeholder}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            {isOpen && (
                <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {loading && (
                        <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>
                    )}
                    {!loading && results.length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-500">No matches found.</div>
                    )}
                    {!loading &&
                        results.map((result) => (
                            <div
                                key={result.symbol}
                                onClick={() => {
                                    if (onSelect) {
                                        onSelect(result);
                                        setIsOpen(false);
                                        setQuery('');
                                    }
                                }}
                                className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-700 last:border-b-0 ${
                                    onSelect ? 'cursor-pointer hover:bg-slate-700/50' : ''
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-100 truncate">{result.name}</div>
                                    <div className="text-xs text-slate-500">{result.symbol} · {result.exchange}</div>
                                </div>
                                {onAdd && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAdd(result);
                                            setIsOpen(false);
                                            setQuery('');
                                        }}
                                        className="ml-3 flex-shrink-0 px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
                                    >
                                        + Add
                                    </button>
                                )}
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
};

export default StockSearchBar;