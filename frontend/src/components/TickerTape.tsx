import React from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { useIndianMarketData } from '../hooks/useIndianMarketData';

const US_SYMBOLS = ['AAPL', 'BINANCE:BTCUSDT'];
const US_LABELS: Record<string, string> = {
    AAPL: 'AAPL',
    'BINANCE:BTCUSDT': 'BTC',
};

interface TickerItem {
    key: string;
    symbol: string;
    price: number;
    changePct?: number;
    currency: string;
}

/**
 * A continuously scrolling strip of live prices — the one animation in this
 * app that's grounded directly in the subject matter rather than added for
 * decoration. Pauses on hover so you can actually read a number if you want to.
 */
const TickerTape: React.FC = () => {
    const { latestPrice } = useMarketData(US_SYMBOLS);
    const { quotes } = useIndianMarketData();

    const items: TickerItem[] = [
        ...US_SYMBOLS.filter((s) => latestPrice[s] !== undefined).map((s) => ({
            key: s,
            symbol: US_LABELS[s] ?? s,
            price: latestPrice[s],
            currency: '$',
        })),
        ...Object.values(quotes).map((q) => ({
            key: q.symbol,
            symbol: q.symbol.replace('.NS', '').replace('.BO', '').replace('^NSEI', 'NIFTY 50'),
            price: q.price,
            changePct: q.percent_change,
            currency: '₹',
        })),
    ];

    if (items.length === 0) {
        return (
            <div className="bg-slate-900 border-b border-slate-800 h-9 flex items-center px-4">
                <span className="text-xs text-slate-500 font-mono">Waiting for live data…</span>
            </div>
        );
    }

    // Two copies back to back lets the CSS animation loop seamlessly (see theme.css .ticker-track).
    const doubled = [...items, ...items];

    return (
        <div className="bg-slate-900 border-b border-slate-800 h-9 overflow-hidden flex items-center">
            <div className="ticker-track">
                {doubled.map((item, i) => {
                    const isUp = (item.changePct ?? 0) >= 0;
                    return (
                        <div key={`${item.key}-${i}`} className="flex items-center gap-2 px-5 whitespace-nowrap text-xs">
                            <span className="font-mono font-semibold text-slate-400">{item.symbol}</span>
                            <span className="font-mono text-slate-100">
                                {item.currency}{item.price.toFixed(2)}
                            </span>
                            {item.changePct !== undefined && (
                                <span className={`font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                                    {isUp ? '▲' : '▼'} {Math.abs(item.changePct).toFixed(2)}%
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TickerTape;