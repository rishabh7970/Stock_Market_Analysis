import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useMarketData } from './hooks/useMarketData';
import type { ConnectionStatus } from './hooks/useMarketData';
import { useIndianMarketData } from './hooks/useIndianMarketData';
import { useIndianWatchlist } from './hooks/useIndianWatchlist';
import type { SearchResult } from './hooks/useIndianWatchlist';
import { fetchRangedHistory, RANGE_OPTIONS } from './lib/marketApi';
import type { RangeKey } from './lib/marketApi';
import TradingChart from './components/TradingChart';
import type { ChartData } from './components/TradingChart';
import StockSearchBar from './components/StockSearchBar';
import TickerTape from './components/TickerTape';
import AnimatedPrice from './components/AnimatedPrice';
import StockWorkspaceView from './pages/StockWorkspaceView';
import { formatCurrency, getCurrencyMeta } from './lib/marketMeta';

// --- Navbar Component ---
const Navbar: React.FC = () => {
    const location = useLocation();

    const getNavClass = (path: string) => `px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 hover:scale-105 ${
        location.pathname === path
            ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

    return (
        <nav className="bg-slate-900 text-white shadow-lg border-b border-slate-800">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex justify-between h-16">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xl font-bold text-amber-400 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            AITradeAgent Pro
                        </span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <Link to="/" className={getNavClass('/')}>Dashboard</Link>
                        <Link to="/short-term" className={getNavClass('/short-term')}>Short-Term (Live)</Link>
                        <Link to="/indian-markets" className={getNavClass('/indian-markets')}>Indian Markets</Link>
                        <Link to="/analyze" className={getNavClass('/analyze')}>Analyze</Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};

// --- View Components ---

const DashboardView: React.FC = () => {
    const { latestPrice, chartData, status } = useMarketData(TRACKED_SYMBOLS);
    const { quotes, status: indiaStatus } = useIndianMarketData();
    const { watchlist, loading: watchlistLoading, addSymbol, removeSymbol } = useIndianWatchlist();
    const [activeSymbol, setActiveSymbol] = useState(TRACKED_SYMBOLS[0]);

    const indianMovers = Object.values(quotes)
        .sort((a, b) => Math.abs(b.percent_change) - Math.abs(a.percent_change))
        .slice(0, 4);
    const activeChart = chartData[activeSymbol] ?? [];
    const activePrice = latestPrice[activeSymbol];
    const connectedFeeds = [status, indiaStatus].filter((s) => s === 'open').length;

    const handleAdd = (result: SearchResult) => {
        addSymbol(result.symbol, result.name);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem-2.25rem)] animate-fade-in-up">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-slate-950 mb-2">Market Dashboard</h1>
                    <p className="text-slate-600">Live prices, watchlist actions, and quick analysis links.</p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    {connectedFeeds} / 2 feeds live
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="dashboard-card animate-float-in">
                    <div className="text-xs uppercase text-slate-500 mb-2">US stream</div>
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-slate-950">{statusLabel[status]}</span>
                        <span className={`h-3 w-3 rounded-full ${statusColor[status]} ${status === 'open' ? 'animate-pulse' : ''}`} />
                    </div>
                </div>
                <div className="dashboard-card animate-float-in animation-delay-100">
                    <div className="text-xs uppercase text-slate-500 mb-2">Indian market</div>
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-slate-950">{statusLabel[indiaStatus]}</span>
                        <span className={`h-3 w-3 rounded-full ${statusColor[indiaStatus]} ${indiaStatus === 'open' ? 'animate-pulse' : ''}`} />
                    </div>
                </div>
                <div className="dashboard-card animate-float-in animation-delay-200">
                    <div className="text-xs uppercase text-slate-500 mb-2">Watchlist</div>
                    <div className="text-2xl font-bold text-slate-950">{watchlist.length} symbols</div>
                    <div className="text-sm text-slate-500">Search below to add NSE/BSE stocks.</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="dashboard-panel lg:col-span-2 animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-950">Tracked Markets</h2>
                            <p className="text-sm text-slate-500">Switch symbols and jump into full analysis.</p>
                        </div>
                        <div className="flex gap-2">
                            {TRACKED_SYMBOLS.map((symbol) => (
                                <button
                                    key={symbol}
                                    onClick={() => setActiveSymbol(symbol)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
                                        activeSymbol === symbol ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                >
                                    {symbol === 'BINANCE:BTCUSDT' ? 'BTC' : symbol}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        {TRACKED_SYMBOLS.map((symbol) => (
                            <button
                                key={symbol}
                                onClick={() => setActiveSymbol(symbol)}
                                className="metric-card text-left"
                            >
                                <div className="text-xs text-slate-500 mb-1">{symbol === 'BINANCE:BTCUSDT' ? 'Bitcoin' : symbol}</div>
                                <div className="text-2xl font-mono text-slate-950">{formatCurrency(latestPrice[symbol], symbol)}</div>
                                <Link
                                    to={`/analyze?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(symbol)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:text-sky-900"
                                >
                                    Analyze
                                </Link>
                            </button>
                        ))}
                        <div className="metric-card">
                            <div className="text-xs text-slate-500 mb-1">Active agents</div>
                            <div className="text-2xl font-mono text-slate-950">4 / 4</div>
                            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full w-full bg-emerald-500 animate-progress-glow" />
                            </div>
                        </div>
                    </div>

                    <div className="h-[320px]">
                        <TradingChart data={activeChart} symbol={activeSymbol} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                        <span>
                            Latest {activeSymbol === 'BINANCE:BTCUSDT' ? 'BTC' : activeSymbol}: {formatCurrency(activePrice, activeSymbol)}
                        </span>
                        <span>{getCurrencyMeta(activeSymbol).code}</span>
                    </div>
                </section>

                <aside className="space-y-6">
                    <section className="dashboard-panel animate-fade-in-up animation-delay-100">
                        <h2 className="text-xl font-semibold text-slate-950 mb-3">Indian Watchlist</h2>
                        <div className="mb-4">
                            <StockSearchBar market="IN" placeholder="Add NSE/BSE symbol" onAdd={handleAdd} />
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {watchlistLoading && <div className="text-sm text-slate-500">Loading watchlist...</div>}
                            {!watchlistLoading && watchlist.length === 0 && <div className="text-sm text-slate-500">No watchlist items yet.</div>}
                            {watchlist.map((item) => {
                                const quote = quotes[item.symbol];
                                const isUp = (quote?.percent_change ?? 0) >= 0;
                                return (
                                    <div key={item.symbol} className="watch-row">
                                        <Link
                                            to={`/analyze?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}`}
                                            className="min-w-0 flex-1"
                                        >
                                            <div className="font-medium text-slate-900 truncate">{item.name}</div>
                                            <div className="text-xs text-slate-500">{item.symbol}</div>
                                        </Link>
                                        <div className="text-right">
                                            <div className="font-mono text-slate-950">{formatCurrency(quote?.price, item.symbol)}</div>
                                            {quote && (
                                                <div className={`text-xs ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {isUp ? '+' : ''}{quote.percent_change.toFixed(2)}%
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => removeSymbol(item.symbol)} className="remove-button" title="Remove">x</button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="dashboard-panel animate-fade-in-up animation-delay-200">
                        <h2 className="text-xl font-semibold text-slate-950 mb-3">Largest Moves</h2>
                        <div className="space-y-2">
                            {indianMovers.length === 0 && <div className="text-sm text-slate-500">Waiting for Indian quotes...</div>}
                            {indianMovers.map((quote) => {
                                const isUp = quote.percent_change >= 0;
                                return (
                                    <Link
                                        key={quote.symbol}
                                        to={`/analyze?symbol=${encodeURIComponent(quote.symbol)}&name=${encodeURIComponent(quote.symbol)}`}
                                        className="watch-row"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-slate-900 truncate">{quote.symbol}</div>
                                            <div className="text-xs text-slate-500">{formatCurrency(quote.price, quote.symbol)}</div>
                                        </div>
                                        <div className={`font-mono ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {isUp ? '+' : ''}{quote.percent_change.toFixed(2)}%
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
};

// Symbols must match what your backend subscribes to in fetch_finnhub_data()
const TRACKED_SYMBOLS = ['AAPL', 'BINANCE:BTCUSDT'];

const statusLabel: Record<ConnectionStatus, string> = {
    connecting: 'Connecting…',
    open: 'Live',
    closed: 'Disconnected',
    error: 'Connection Error',
};

const statusColor: Record<ConnectionStatus, string> = {
    connecting: 'bg-yellow-500',
    open: 'bg-green-500',
    closed: 'bg-slate-500',
    error: 'bg-red-500',
};

const ShortTermView: React.FC = () => {
    const [activeSymbol, setActiveSymbol] = useState<string>(TRACKED_SYMBOLS[0]);
    const [selectedRange, setSelectedRange] = useState<'live' | RangeKey>('live');
    const [rangeData, setRangeData] = useState<ChartData[]>([]);
    const [rangeLastPrice, setRangeLastPrice] = useState<number | undefined>(undefined);
    const [rangeLoading, setRangeLoading] = useState(false);

    const { latestPrice, chartData, status } = useMarketData(TRACKED_SYMBOLS);

    // Whenever the symbol or a non-live range is selected, fetch fresh OHLC
    // history for that window. "Live" instead uses the ticking websocket data.
    useEffect(() => {
        if (selectedRange === 'live') return;
        let cancelled = false;

        Promise.resolve().then(() => {
            if (!cancelled) setRangeLoading(true);
        });

        fetchRangedHistory(activeSymbol, selectedRange)
            .then(({ points, lastPrice }) => {
                if (cancelled) return;
                setRangeData(points);
                setRangeLastPrice(lastPrice ?? undefined);
            })
            .catch((err) => console.warn('Could not load ranged history:', err))
            .finally(() => {
                if (!cancelled) setRangeLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeSymbol, selectedRange]);

    const isLive = selectedRange === 'live';
    const livePrice = latestPrice[activeSymbol];
    const liveData = chartData[activeSymbol] ?? [];

    // Fall back to the last historical close when there's no live tick yet
    // (e.g. market closed, or the websocket hasn't received anything).
    const displayPrice = isLive ? (livePrice ?? rangeLastPrice) : rangeLastPrice;
    const displayData = isLive ? liveData : rangeData;

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem-2.25rem)] animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-slate-100">Short-Term Trading (1m/5m)</h1>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusColor[status]} ${status === 'open' ? 'animate-pulse' : ''}`} />
                    {statusLabel[status]}
                </div>
            </div>
            <p className="text-slate-400 mb-4">High-frequency AI analysis and live order book.</p>

            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex gap-2">
                    {TRACKED_SYMBOLS.map((symbol) => (
                        <button
                            key={symbol}
                            onClick={() => setActiveSymbol(symbol)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                activeSymbol === symbol
                                    ? 'bg-amber-500 text-slate-900'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {symbol}
                        </button>
                    ))}
                </div>

                <div className="flex gap-1 bg-slate-800 rounded-md p-1">
                    <button
                        onClick={() => setSelectedRange('live')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isLive ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Live
                    </button>
                    {RANGE_OPTIONS.map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setSelectedRange(opt.key)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                selectedRange === opt.key ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end mb-3">
                <Link
                    to={`/analyze?symbol=${encodeURIComponent(activeSymbol)}&name=${encodeURIComponent(activeSymbol)}`}
                    className="text-sm text-amber-400 hover:text-amber-300"
                >
                    Full analysis for {activeSymbol} →
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
                <div className="lg:col-span-2 bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-4 flex flex-col">
                    <div className="text-5xl text-green-400 mb-4">
                        {rangeLoading ? (
                            <span className="font-mono">…</span>
                        ) : (
                            <AnimatedPrice value={displayPrice} currencySymbol="$" />
                        )}
                    </div>
                    <div className="flex-grow w-full relative">
                        <TradingChart data={displayData} />
                    </div>
                </div>

                <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-4 overflow-y-auto">
                    <h3 className="text-lg font-semibold text-slate-300 mb-4 border-b border-slate-700 pb-2">Agent Thought Stream</h3>
                    <div className="space-y-4">
                        <div className="p-3 bg-slate-700/30 rounded border border-slate-600/50">
                            <span className="text-xs text-amber-400 font-bold uppercase">Tech Analyst</span>
                            <p className="text-sm text-slate-300 mt-1">MACD crossover detected on {activeSymbol} 1m chart. Momentum increasing.</p>
                        </div>
                        <div className="p-3 bg-slate-700/30 rounded border border-slate-600/50">
                            <span className="text-xs text-green-400 font-bold uppercase">Risk Manager</span>
                            <p className="text-sm text-green-300 mt-1">Setup approved. Executing market BUY order.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IndianMarketsView: React.FC = () => {
    const { quotes, history, status } = useIndianMarketData();
    const { watchlist, loading: watchlistLoading, addSymbol, removeSymbol } = useIndianWatchlist();

    const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
    const [selectedRange, setSelectedRange] = useState<'live' | RangeKey>('live');
    const [rangeData, setRangeData] = useState<ChartData[]>([]);
    const [rangeLastPrice, setRangeLastPrice] = useState<number | undefined>(undefined);
    const [rangeLoading, setRangeLoading] = useState(false);

    // Once the watchlist loads, default to its first symbol if nothing's selected yet.
    useEffect(() => {
        if (!activeSymbol && watchlist.length > 0) {
            const firstSymbol = watchlist[0].symbol;
            Promise.resolve().then(() => setActiveSymbol(firstSymbol));
        }
    }, [watchlist, activeSymbol]);

    useEffect(() => {
        if (!activeSymbol || selectedRange === 'live') return;
        let cancelled = false;

        Promise.resolve().then(() => {
            if (!cancelled) setRangeLoading(true);
        });

        fetchRangedHistory(activeSymbol, selectedRange)
            .then(({ points, lastPrice }) => {
                if (cancelled) return;
                setRangeData(points);
                setRangeLastPrice(lastPrice ?? undefined);
            })
            .catch((err) => console.warn('Could not load ranged history:', err))
            .finally(() => {
                if (!cancelled) setRangeLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeSymbol, selectedRange]);

    const isLive = selectedRange === 'live';
    const liveQuote = activeSymbol ? quotes[activeSymbol] : undefined;
    const liveHistory = activeSymbol ? history[activeSymbol] ?? [] : [];

    const displayPrice = isLive ? (liveQuote?.price ?? rangeLastPrice) : rangeLastPrice;
    const displayData = isLive ? liveHistory : rangeData;
    const activeName = watchlist.find((w) => w.symbol === activeSymbol)?.name ?? activeSymbol;

    const handleAdd = (result: SearchResult) => {
        addSymbol(result.symbol, result.name);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem-2.25rem)] animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-slate-100">Indian Markets (NSE)</h1>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusColor[status]} ${status === 'open' ? 'animate-pulse' : ''}`} />
                    {statusLabel[status]}
                </div>
            </div>
            <p className="text-slate-400 mb-4">
                Quotes via Yahoo Finance. Shows the last completed session's price when the market is closed.
            </p>

            <div className="mb-6">
                <StockSearchBar market="IN" placeholder="Search NSE/BSE stocks to add (e.g. Tata Motors)" onAdd={handleAdd} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {watchlistLoading && (
                    <div className="col-span-full text-sm text-slate-500">Loading watchlist…</div>
                )}
                {!watchlistLoading && watchlist.length === 0 && (
                    <div className="col-span-full text-sm text-slate-500">No stocks in your watchlist yet — search above to add one.</div>
                )}
                {watchlist.map(({ symbol, name }) => {
                    const quote = quotes[symbol];
                    const isUp = (quote?.change ?? 0) >= 0;
                    return (
                        <div
                            key={symbol}
                            onClick={() => setActiveSymbol(symbol)}
                            className={`relative text-left p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                                activeSymbol === symbol
                                    ? 'bg-amber-500/10 border-amber-500'
                                    : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                            }`}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeSymbol(symbol);
                                    if (activeSymbol === symbol) setActiveSymbol(null);
                                }}
                                className="absolute top-2 right-2 text-slate-400 hover:text-red-500 text-xs leading-none"
                                title="Remove from watchlist"
                            >
                                ✕
                            </button>
                            <div className="text-sm font-semibold text-slate-300 pr-4 truncate">
                                {name}
                            </div>
                            <div className="text-xs text-slate-400 mb-2">{symbol}</div>
                            {quote ? (
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-mono text-slate-100">
                                        ₹{quote.price.toFixed(2)}
                                    </span>
                                    <span className={`text-sm font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                                        {isUp ? '+' : ''}{quote.percent_change.toFixed(2)}%
                                    </span>
                                </div>
                            ) : (
                                <span className="text-sm text-slate-500">Loading…</span>
                            )}
                            <Link
                                to={`/analyze?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block mt-2 text-xs text-amber-500 hover:text-amber-400"
                            >
                                Full analysis →
                            </Link>
                        </div>
                    );
                })}
            </div>

            {activeSymbol && (
                <>
                    <div className="flex justify-end mb-3">
                        <div className="flex gap-1 bg-slate-800 rounded-md p-1">
                            <button
                                onClick={() => setSelectedRange('live')}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                    isLive ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Live
                            </button>
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.key}
                                    onClick={() => setSelectedRange(opt.key)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                        selectedRange === opt.key ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-4 flex-grow flex flex-col">
                        <div className="flex items-baseline gap-3 mb-4">
                            <span className="text-lg font-semibold text-slate-200">{activeName}</span>
                            <span className="text-3xl text-green-400">
                                {rangeLoading ? (
                                    <span className="font-mono">…</span>
                                ) : (
                                    <AnimatedPrice value={displayPrice} currencySymbol="₹" />
                                )}
                            </span>
                        </div>
                        <div className="flex-grow w-full relative">
                            <TradingChart
                                data={displayData}
                                currencySymbol="₹"
                                colors={{ lineColor: '#f97316', areaTopColor: 'rgba(249, 115, 22, 0.4)', areaBottomColor: 'rgba(249, 115, 22, 0)' }}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// --- Main App Component ---
export default function App() {
    return (
        <Router>
            <div className="app-shell min-h-screen bg-slate-50 font-sans selection:bg-amber-500/30">
                <Navbar />
                <TickerTape />

                <main className="transition-all duration-300 h-[calc(100vh-4rem-2.25rem)]">
                    <Routes>
                        <Route path="/" element={<DashboardView />} />
                        <Route path="/short-term" element={<ShortTermView />} />
                        <Route path="/indian-markets" element={<IndianMarketsView />} />
                        <Route path="/analyze" element={<StockWorkspaceView />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}
