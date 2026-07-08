import React from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { getCurrencyMeta } from '../lib/marketMeta';

interface AnimatedPriceProps {
    value?: number;
    currencySymbol?: string;
    symbol?: string;
    exchange?: string;
    className?: string;
    loadingText?: string;
}

const AnimatedPrice: React.FC<AnimatedPriceProps> = ({
    value,
    currencySymbol,
    symbol,
    exchange,
    className = '',
    loadingText = '-',
}) => {
    const animated = useCountUp(value);
    const displayCurrency = currencySymbol ?? getCurrencyMeta(symbol, exchange).symbol;

    return (
        <span className={`font-mono ${className}`}>
            {animated !== undefined ? `${displayCurrency}${animated.toFixed(2)}` : loadingText}
        </span>
    );
};

export default AnimatedPrice;
