import React, { useRef, useState } from 'react';
import { getCurrencyMeta } from '../lib/marketMeta';

export interface ChartData {
    time: string;
    value: number;
}

export interface TradingChartProps {
    data: ChartData[];
    colors?: {
        backgroundColor?: string;
        lineColor?: string;
        areaTopColor?: string;
        areaBottomColor?: string;
    };
    currencySymbol?: string;
    symbol?: string;
    exchange?: string;
}

const formatTime = (time: string): string => {
    const ts = Number(time);
    if (Number.isNaN(ts)) return time;
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const TradingChart: React.FC<TradingChartProps> = ({
    data,
    colors: {
        backgroundColor = 'transparent',
        lineColor = '#0ea5e9',
        areaTopColor = 'rgba(14, 165, 233, 0.28)',
        areaBottomColor = 'rgba(14, 165, 233, 0.0)',
    } = {},
    currencySymbol,
    symbol,
    exchange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const displayCurrency = currencySymbol ?? getCurrencyMeta(symbol, exchange).symbol;

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-500 bg-white/70 rounded-lg border border-slate-200">
                Awaiting live data...
            </div>
        );
    }

    const min = Math.min(...data.map((d) => d.value));
    const max = Math.max(...data.map((d) => d.value));
    const padding = (max - min) * 0.1 || 1;
    const adjustedMin = min - padding;
    const adjustedMax = max + padding;
    const range = adjustedMax - adjustedMin;

    const coords = data.map((d, i) => {
        const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
        const y = range > 0 ? 100 - ((d.value - adjustedMin) / range) * 100 : 50;
        return { x, y, value: d.value, time: d.time };
    });

    const points = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const areaPoints = `0,100 ${points} 100,100`;

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const fraction = (e.clientX - rect.left) / rect.width;
        const index = Math.round(fraction * (coords.length - 1));
        setHoverIndex(Math.min(Math.max(index, 0), coords.length - 1));
    };

    const hovered = hoverIndex !== null ? coords[hoverIndex] : null;
    const tooltipAlign = hovered ? (hovered.x < 15 ? 'left' : hovered.x > 85 ? 'right' : 'center') : 'center';
    const tooltipTransform =
        tooltipAlign === 'left' ? 'translate(0%, -120%)' : tooltipAlign === 'right' ? 'translate(-100%, -120%)' : 'translate(-50%, -120%)';

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            className="chart-shell w-full h-full min-h-[300px] relative rounded-lg overflow-hidden bg-white border border-slate-200 cursor-crosshair"
            style={{ backgroundColor }}
        >
            <svg className="w-full h-full absolute inset-0 transition-all duration-300" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={areaTopColor} />
                        <stop offset="100%" stopColor={areaBottomColor} />
                    </linearGradient>
                </defs>
                <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(148, 163, 184, 0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(148, 163, 184, 0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(148, 163, 184, 0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                <polygon points={areaPoints} fill="url(#areaGradient)" className="transition-all duration-300" />
                <polyline
                    points={points}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="chart-line transition-all duration-300"
                />
                {hovered && (
                    <>
                        <line x1={hovered.x} y1="0" x2={hovered.x} y2="100" stroke="rgba(71, 85, 105, 0.45)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                        <circle cx={hovered.x} cy={hovered.y} r="4" fill={lineColor} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    </>
                )}
            </svg>

            {hovered && (
                <div
                    className="absolute pointer-events-none bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap z-10"
                    style={{ left: `${hovered.x}%`, top: `${hovered.y}%`, transform: tooltipTransform }}
                >
                    <div className="font-mono font-semibold text-slate-950">
                        {displayCurrency}{hovered.value.toFixed(2)}
                    </div>
                    <div className="text-slate-500">{formatTime(hovered.time)}</div>
                </div>
            )}
        </div>
    );
};

export default TradingChart;
