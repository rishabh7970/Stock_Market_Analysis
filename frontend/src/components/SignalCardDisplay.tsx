import React from 'react';
import type { SignalCard } from '../hooks/Useinsights';

const sentimentColor = (label: string) => {
    if (label === 'Positive') return 'text-green-500';
    if (label === 'Negative') return 'text-red-500';
    return 'text-slate-400';
};

export const SignalCardDisplay: React.FC<{ card: SignalCard }> = ({ card }) => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Technicals</h3>
            {card.technicals.available ? (
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-500">RSI (14)</span>
                        <span className="font-mono text-slate-100">{card.technicals.rsi}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Signal</span>
                        <span className="font-medium">{card.technicals.rsi_signal}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Trend</span>
                        <span className="text-right">{card.technicals.trend}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Momentum</span>
                        <span>{card.technicals.momentum}</span>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-slate-500">Not enough price history yet.</p>
            )}
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Fundamentals</h3>
            {card.fundamentals.available ? (
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-500">P/E ratio</span>
                        <span className="font-mono text-slate-100">
                            {card.fundamentals.pe_ratio ? card.fundamentals.pe_ratio.toFixed(1) : '—'}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">52w high</span>
                        <span className="font-mono">{card.fundamentals.fifty_two_week_high ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">52w low</span>
                        <span className="font-mono">{card.fundamentals.fifty_two_week_low ?? '—'}</span>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-slate-500">Fundamentals unavailable.</p>
            )}
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">News Sentiment</h3>
            <div className={`text-2xl font-bold mb-1 ${sentimentColor(card.sentiment_label)}`}>
                {card.sentiment_label}
            </div>
            <p className="text-xs text-slate-500">Score: {card.sentiment_score} (from {card.headlines.length} headlines)</p>
        </div>

        <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Summary</h3>
            <ul className="space-y-2 text-sm text-slate-300 list-disc list-inside">
                {card.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                ))}
            </ul>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Recent Headlines</h3>
            {card.headlines.length === 0 ? (
                <p className="text-sm text-slate-500">No recent headlines found.</p>
            ) : (
                <ul className="space-y-3">
                    {card.headlines.map((h, i) => (
                        <li key={i} className="text-sm">
                            <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline">
                                {h.title}
                            </a>
                            <div className="text-xs text-slate-500">{h.source}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    </div>
);

export default SignalCardDisplay;