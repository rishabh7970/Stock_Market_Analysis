import React, { useRef, useState } from 'react';
import type { ForecastResult } from '../hooks/useForecast';
import { getCurrencyMeta } from '../lib/marketMeta';

interface ForecastChartProps {
    data: ForecastResult;
    currencySymbol?: string;
    symbol?: string;
    exchange?: string;
}

interface Coord {
    x: number;
    y: number;
    yLower: number;
    yUpper: number;
    value: number;
    lower: number;
    upper: number;
    date: string;
    isForecast: boolean;
}

const ForecastChart: React.FC<ForecastChartProps> = ({ data, currencySymbol, symbol, exchange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const displayCurrency = currencySymbol ?? getCurrencyMeta(symbol, exchange).symbol;

    if (!data.available || !data.historical || !data.forecast) {
        return (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-500 bg-white/70 rounded-lg border border-slate-200 text-center px-6">
                {data.reason || 'Forecast unavailable.'}
            </div>
        );
    }

    const historical = data.historical;
    const forecast = data.forecast;
    const samplePaths = data.sample_paths ?? [];

    const combined = [
        ...historical.map((h) => ({ date: h.date, value: h.price, lower: h.price, upper: h.price, isForecast: false })),
        ...forecast.map((f) => ({ date: f.date, value: f.price, lower: f.lower, upper: f.upper, isForecast: true })),
    ];

    const samplePathValues = samplePaths.flat().map((p) => p.price);
    const allValues = [...combined.flatMap((p) => [p.value, p.lower, p.upper]), ...samplePathValues];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1 || 1;
    const adjustedMin = min - padding;
    const adjustedMax = max + padding;
    const range = adjustedMax - adjustedMin;

    const toY = (v: number) => (range > 0 ? 100 - ((v - adjustedMin) / range) * 100 : 50);
    const toX = (i: number) => (combined.length > 1 ? (i / (combined.length - 1)) * 100 : 50);

    const coords: Coord[] = combined.map((p, i) => ({
        x: toX(i),
        y: toY(p.value),
        yLower: toY(p.lower),
        yUpper: toY(p.upper),
        value: p.value,
        lower: p.lower,
        upper: p.upper,
        date: p.date,
        isForecast: p.isForecast,
    }));

    const histCoords = coords.filter((c) => !c.isForecast);
    const foreCoordsRaw = coords.filter((c) => c.isForecast);
    const bridgePoint = histCoords.length > 0 ? histCoords[histCoords.length - 1] : null;
    const foreCoords = bridgePoint ? [bridgePoint, ...foreCoordsRaw] : foreCoordsRaw;

    const histLine = histCoords.map((c) => `${c.x},${c.y}`).join(' ');
    const medianLine = foreCoords.map((c) => `${c.x},${c.y}`).join(' ');
    const bandTop = foreCoords.map((c) => `${c.x},${c.yUpper}`).join(' ');
    const bandBottom = [...foreCoords].reverse().map((c) => `${c.x},${c.yLower}`).join(' ');
    const bandPolygon = `${bandTop} ${bandBottom}`;

    const forecastXPositions = foreCoordsRaw.map((c) => c.x);
    const samplePathLines = samplePaths.map((path) => {
        const points = path.map((p, i) => `${forecastXPositions[i]},${toY(p.price)}`);
        const bridged = bridgePoint ? [`${bridgePoint.x},${bridgePoint.y}`, ...points] : points;
        return bridged.join(' ');
    });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const fraction = (e.clientX - rect.left) / rect.width;
        const index = Math.round(fraction * (coords.length - 1));
        setHoverIndex(Math.min(Math.max(index, 0), coords.length - 1));
    };

    const hovered = hoverIndex !== null ? coords[hoverIndex] : null;
    const tooltipTransform = hovered
        ? hovered.x < 15
            ? 'translate(0%, -120%)'
            : hovered.x > 85
            ? 'translate(-100%, -120%)'
            : 'translate(-50%, -120%)'
        : 'translate(-50%, -120%)';

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            className="chart-shell w-full h-full min-h-[300px] relative rounded-lg overflow-hidden bg-white border border-slate-200 cursor-crosshair"
        >
            <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(148,163,184,0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(148,163,184,0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(148,163,184,0.35)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />

                <polygon points={bandPolygon} fill="rgba(245, 158, 11, 0.14)" />
                {samplePathLines.map((line, i) => (
                    <polyline key={i} points={line} fill="none" stroke="#f59e0b" strokeWidth="0.6" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                ))}
                <polyline points={histLine} fill="none" stroke="#0ea5e9" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={medianLine} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3,2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />

                {hovered && (
                    <>
                        <line x1={hovered.x} y1="0" x2={hovered.x} y2="100" stroke="rgba(71, 85, 105, 0.45)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                        <circle cx={hovered.x} cy={hovered.y} r="4" fill={hovered.isForecast ? '#f59e0b' : '#0ea5e9'} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
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
                        {hovered.isForecast && ' (median)'}
                    </div>
                    {hovered.isForecast && (
                        <div className="text-slate-500">
                            10th-90th pct: {displayCurrency}{hovered.lower.toFixed(2)} - {displayCurrency}{hovered.upper.toFixed(2)}
                        </div>
                    )}
                    <div className="text-slate-500">{hovered.date}</div>
                </div>
            )}

            <div className="absolute bottom-2 right-2 flex gap-3 text-xs text-slate-500 flex-wrap justify-end max-w-[70%]">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-sky-500 inline-block" /> Actual
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-amber-500 inline-block" style={{ borderTop: '1px dashed #f59e0b' }} /> Median
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-amber-400/50 inline-block" /> Simulated paths
                </span>
            </div>
        </div>
    );
};

export default ForecastChart;
