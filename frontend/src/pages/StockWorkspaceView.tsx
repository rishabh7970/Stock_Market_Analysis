import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import StockSearchBar from '../components/StockSearchBar';
import type { SearchResult } from '../hooks/useIndianWatchlist';
import TradingChart from '../components/TradingChart';
import type { ChartData } from '../components/TradingChart';
import ForecastChart from '../components/ForecastChart';
import SignalCardDisplay from '../components/SignalCardDisplay';
import AnimatedPrice from '../components/AnimatedPrice';
import Skeleton from '../components/Skeleton';
import type { SignalCard } from '../hooks/Useinsights';
import { fetchRangedHistory, RANGE_OPTIONS } from '../lib/marketApi';
import type { RangeKey } from '../lib/marketApi';
import { formatCurrency, getCurrencyMeta } from '../lib/marketMeta';
import { useScreener } from '../hooks/useScreener';
import type { Horizon } from '../hooks/useScreener';
import { useForecast } from '../hooks/useForecast';
import { useBacktest } from '../hooks/useBacktest';
import { useIndianWatchlist } from '../hooks/useIndianWatchlist';

type Tab = 'overview' | 'research' | 'screener' | 'forecast' | 'backtest';

const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'research', label: 'Research' },
    { key: 'screener', label: 'Screener' },
    { key: 'forecast', label: 'Forecast' },
    { key: 'backtest', label: 'Backtest' },
];

const HORIZONS: { key: Horizon; label: string }[] = [
    { key: '3mo', label: '3 Months' },
    { key: '6mo', label: '6 Months' },
    { key: '1y', label: '1 Year' },
];

const QUICK_PICKS: SearchResult[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'Equity' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'Equity' },
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE', type: 'Equity' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE', type: 'Equity' },
    { symbol: '7203.T', name: 'Toyota Motor Corporation', exchange: 'Tokyo', type: 'Equity' },
];

const scoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 55) return 'text-amber-500';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-500';
};

const isIndianSymbol = (symbol: string) => symbol.endsWith('.NS') || symbol.endsWith('.BO');

const StockWorkspaceView: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [selected, setSelected] = useState<SearchResult | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [range, setRange] = useState<RangeKey>('1mo');
    const [chartData, setChartData] = useState<ChartData[]>([]);
    const [lastPrice, setLastPrice] = useState<number | undefined>(undefined);
    const [chartLoading, setChartLoading] = useState(false);
    const [card, setCard] = useState<SignalCard | null>(null);
    const [cardLoading, setCardLoading] = useState(false);

    const { results: screenerResults, loading: screenerLoading, runScreener } = useScreener();
    const [screenerHorizon, setScreenerHorizon] = useState<Horizon>('6mo');
    const { result: forecastResult, loading: forecastLoading, runForecast } = useForecast();
    const [forecastDays, setForecastDays] = useState(30);
    const { result: backtestResult, loading: backtestLoading, runBacktest } = useBacktest();
    const [backtestHorizon, setBacktestHorizon] = useState<Horizon>('6mo');
    const { addSymbol } = useIndianWatchlist();

    const loadChart = (symbol: string, r: RangeKey) => {
        setChartLoading(true);
        fetchRangedHistory(symbol, r)
            .then(({ points, lastPrice: lp }) => {
                setChartData(points);
                setLastPrice(lp ?? undefined);
            })
            .catch((err) => console.warn('Could not load chart:', err))
            .finally(() => setChartLoading(false));
    };

    const loadResearch = (symbol: string) => {
        setCardLoading(true);
        fetch(`http://localhost:8000/api/insights/${encodeURIComponent(symbol)}`)
            .then((r) => r.json())
            .then((json: SignalCard) => setCard(json))
            .catch((err) => console.warn('Could not load research:', err))
            .finally(() => setCardLoading(false));
    };

    const runAll = (result: SearchResult) => {
        loadChart(result.symbol, range);
        loadResearch(result.symbol);
        runScreener(screenerHorizon, [result.symbol]);
        runForecast(result.symbol, forecastDays);
        runBacktest(result.symbol, backtestHorizon);
    };

    const handleSelect = (result: SearchResult) => {
        setSelected(result);
        setActiveTab('overview');
        runAll(result);
    };

    useEffect(() => {
        const symbol = searchParams.get('symbol');
        const name = searchParams.get('name');
        if (symbol) {
            Promise.resolve().then(() => handleSelect({ symbol, name: name || symbol, exchange: '', type: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRangeChange = (r: RangeKey) => {
        setRange(r);
        if (selected) loadChart(selected.symbol, r);
    };

    const selectedSymbol = selected?.symbol ?? '';
    const selectedExchange = selected?.exchange ?? '';
    const currency = getCurrencyMeta(selectedSymbol, selectedExchange);
    const firstPrice = chartData[0]?.value;
    const chartChange = firstPrice !== undefined && lastPrice !== undefined ? lastPrice - firstPrice : undefined;
    const chartChangePct = chartChange !== undefined && firstPrice ? (chartChange / firstPrice) * 100 : undefined;
    const chartHigh = chartData.length ? Math.max(...chartData.map((p) => p.value)) : undefined;
    const chartLow = chartData.length ? Math.min(...chartData.map((p) => p.value)) : undefined;
    const screenerResult = screenerResults[0];
    const maxAbsReturn = backtestResult?.buckets ? Math.max(...backtestResult.buckets.map((b) => Math.abs(b.avg_return_pct)), 1) : 1;

    return (
        <div className="analysis-workspace p-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem-2.25rem)] animate-fade-in-up">
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Stock Analysis</h1>
            <p className="text-slate-400 mb-1">Search once for price, technicals, screener, forecast, and backtest.</p>
            <p className="text-xs text-amber-600 mb-6">Informational only, not financial advice.</p>

            <div className="mb-4">
                <StockSearchBar placeholder="Search any ticker: AAPL, Reliance, TCS..." onSelect={handleSelect} />
            </div>
            <div className="flex gap-2 mb-6 flex-wrap">
                {QUICK_PICKS.map((pick) => (
                    <button key={pick.symbol} onClick={() => handleSelect(pick)} className="px-3 py-1.5 rounded-md bg-white/80 border border-slate-200 text-sm text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-800">
                        {pick.symbol}
                    </button>
                ))}
            </div>

            {!selected && (
                <div className="h-64 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-500 bg-white/50">
                    <p>Search for a stock above to see its full analysis here.</p>
                </div>
            )}

            {selected && (
                <>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div>
                            <span className="text-2xl font-bold text-slate-100 mr-2">{selected.name}</span>
                            <span className="text-slate-400">{selected.symbol}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <AnimatedPrice value={lastPrice} currencySymbol={currency.symbol} className="text-2xl text-green-600" />
                            <button onClick={() => runAll(selected)} className="px-3 py-1.5 rounded-md bg-slate-950 text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800">
                                Refresh
                            </button>
                            {isIndianSymbol(selected.symbol) && (
                                <button onClick={() => addSymbol(selected.symbol, selected.name)} className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700">
                                    Add to watchlist
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                        <div className="metric-card">
                            <div className="text-xs text-slate-500">Currency</div>
                            <div className="text-xl font-mono text-slate-950">{currency.code}</div>
                        </div>
                        <div className="metric-card">
                            <div className="text-xs text-slate-500">Range change</div>
                            <div className={`text-xl font-mono ${chartChange !== undefined && chartChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {chartChange !== undefined ? `${chartChange >= 0 ? '+' : ''}${formatCurrency(chartChange, selected.symbol, selected.exchange)}` : '-'}
                            </div>
                            <div className="text-xs text-slate-500">{chartChangePct !== undefined ? `${chartChangePct >= 0 ? '+' : ''}${chartChangePct.toFixed(2)}%` : '-'}</div>
                        </div>
                        <div className="metric-card">
                            <div className="text-xs text-slate-500">Range high</div>
                            <div className="text-xl font-mono text-slate-950">{formatCurrency(chartHigh, selected.symbol, selected.exchange)}</div>
                        </div>
                        <div className="metric-card">
                            <div className="text-xs text-slate-500">Range low</div>
                            <div className="text-xl font-mono text-slate-950">{formatCurrency(chartLow, selected.symbol, selected.exchange)}</div>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-6 flex-wrap border-b border-slate-800 pb-3">
                        {TABS.map((tab) => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 hover:scale-105 active:scale-95 ${activeTab === tab.key ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div key="overview" className="animate-fade-in-up">
                            <div className="flex justify-end mb-3">
                                <div className="flex gap-1 bg-slate-800 rounded-md p-1">
                                    {RANGE_OPTIONS.map((opt) => (
                                        <button key={opt.key} onClick={() => handleRangeChange(opt.key)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${range === opt.key ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="h-[400px]">{chartLoading ? <Skeleton className="w-full h-full" /> : <TradingChart data={chartData} symbol={selected.symbol} exchange={selected.exchange} />}</div>
                        </div>
                    )}

                    {activeTab === 'research' && (
                        <div key="research" className="animate-fade-in-up">
                            {cardLoading && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
                                </div>
                            )}
                            {!cardLoading && card && <SignalCardDisplay card={card} />}
                        </div>
                    )}

                    {activeTab === 'screener' && (
                        <div key="screener" className="animate-fade-in-up">
                            <div className="flex gap-2 mb-4">
                                {HORIZONS.map((h) => (
                                    <button key={h.key} onClick={() => { setScreenerHorizon(h.key); runScreener(h.key, [selected.symbol]); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${screenerHorizon === h.key ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                        {h.label}
                                    </button>
                                ))}
                            </div>
                            {screenerLoading && <div className="text-slate-500">Running agents...</div>}
                            {!screenerLoading && screenerResult && (
                                <div className="bg-slate-900 rounded-lg border border-slate-800 p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-slate-500">{screenerResult.label}</span>
                                        <span className={`text-3xl font-mono font-bold ${scoreColor(screenerResult.composite_score)}`}>{screenerResult.composite_score}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                        {[
                                            ['Technical', screenerResult.technical_score],
                                            ['Sentiment', screenerResult.sentiment_score],
                                            ['Fundamental', screenerResult.fundamental_score],
                                        ].map(([label, value]) => (
                                            <div key={label} className="text-center">
                                                <div className={`text-lg font-mono font-semibold ${scoreColor(Number(value))}`}>{value}</div>
                                                <div className="text-xs text-slate-500">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {screenerResult.narrative && <p className={`text-sm mb-3 ${screenerResult.narrative_available ? 'text-slate-300' : 'text-slate-500 italic'}`}>{screenerResult.narrative}</p>}
                                    <ul className="space-y-1 text-xs text-slate-500 list-disc list-inside">
                                        {screenerResult.bullets.map((b, i) => <li key={i}>{b}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'forecast' && (
                        <div key="forecast" className="animate-fade-in-up">
                            <div className="flex gap-2 mb-4">
                                {[30, 90, 180].map((d) => (
                                    <button key={d} onClick={() => { setForecastDays(d); runForecast(selected.symbol, d); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${forecastDays === d ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                        {d} Days
                                    </button>
                                ))}
                            </div>
                            {forecastLoading && <div className="text-slate-500 mb-3">Running simulations...</div>}
                            {!forecastLoading && forecastResult && (
                                <>
                                    <div className="h-[400px] mb-6">
                                        <ForecastChart data={forecastResult} symbol={selected.symbol} exchange={selected.exchange} />
                                    </div>
                                    <div className="bg-slate-900 rounded-lg border border-slate-800 p-5">
                                        <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Candlestick Patterns</h3>
                                        {(!forecastResult.recent_patterns || forecastResult.recent_patterns.length === 0) && <p className="text-sm text-slate-500">No notable patterns in the most recent candles.</p>}
                                        <div className="space-y-2">
                                            {forecastResult.recent_patterns?.map((p, i) => (
                                                <div key={i} className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-300">{p.pattern}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.bias > 0 ? 'bg-green-500/10 text-green-500' : p.bias < 0 ? 'bg-red-500/10 text-red-500' : 'bg-slate-100 text-slate-500'}`}>{p.bias > 0 ? 'Bullish' : p.bias < 0 ? 'Bearish' : 'Neutral'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'backtest' && (
                        <div key="backtest" className="animate-fade-in-up">
                            <div className="flex gap-2 mb-4">
                                {HORIZONS.map((h) => (
                                    <button key={h.key} onClick={() => { setBacktestHorizon(h.key); runBacktest(selected.symbol, h.key); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${backtestHorizon === h.key ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                        {h.label}
                                    </button>
                                ))}
                            </div>
                            {backtestLoading && <div className="text-slate-500">Walking forward through history...</div>}
                            {!backtestLoading && backtestResult && !backtestResult.available && <p className="text-slate-500">{backtestResult.reason}</p>}
                            {!backtestLoading && backtestResult?.available && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="metric-card"><div className="text-xs text-slate-500 mb-1">Samples</div><div className="text-xl font-mono text-slate-950">{backtestResult.num_samples}</div></div>
                                        <div className="metric-card"><div className="text-xs text-slate-500 mb-1">Correlation</div><div className="text-xl font-mono text-slate-950">{backtestResult.correlation_score_vs_return}</div></div>
                                        <div className="metric-card col-span-2"><div className="text-xs text-slate-500 mb-1">Buy & hold</div><div className="text-xl font-mono text-slate-950">{backtestResult.buy_and_hold_return_pct}%</div></div>
                                    </div>
                                    <div className="bg-slate-900 rounded-lg border border-slate-800 p-5">
                                        <h3 className="text-sm font-semibold text-slate-500 uppercase mb-4">Avg forward return by score bucket</h3>
                                        <div className="space-y-3">
                                            {backtestResult.buckets?.map((b) => (
                                                <div key={b.label}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-slate-300">{b.label} <span className="text-slate-400">({b.count} samples)</span></span>
                                                        <span className={b.avg_return_pct >= 0 ? 'text-green-500' : 'text-red-500'}>{b.avg_return_pct >= 0 ? '+' : ''}{b.avg_return_pct}% - {b.hit_rate_pct}% hit rate</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                                        <div className={`h-2 rounded-full ${b.avg_return_pct >= 0 ? 'bg-green-500' : 'bg-red-500'} animate-progress-glow`} style={{ width: `${(Math.abs(b.avg_return_pct) / maxAbsReturn) * 100}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">{backtestResult.methodology_note}</p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StockWorkspaceView;
