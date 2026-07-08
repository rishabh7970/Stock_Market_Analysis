export interface CurrencyMeta {
    code: string;
    symbol: string;
    locale: string;
}

const SUFFIX_CURRENCY: Record<string, CurrencyMeta> = {
    '.NS': { code: 'INR', symbol: '₹', locale: 'en-IN' },
    '.BO': { code: 'INR', symbol: '₹', locale: 'en-IN' },
    '.L': { code: 'GBP', symbol: '£', locale: 'en-GB' },
    '.TO': { code: 'CAD', symbol: 'C$', locale: 'en-CA' },
    '.V': { code: 'CAD', symbol: 'C$', locale: 'en-CA' },
    '.AX': { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
    '.PA': { code: 'EUR', symbol: '€', locale: 'fr-FR' },
    '.DE': { code: 'EUR', symbol: '€', locale: 'de-DE' },
    '.F': { code: 'EUR', symbol: '€', locale: 'de-DE' },
    '.MI': { code: 'EUR', symbol: '€', locale: 'it-IT' },
    '.MC': { code: 'EUR', symbol: '€', locale: 'es-ES' },
    '.AS': { code: 'EUR', symbol: '€', locale: 'nl-NL' },
    '.SW': { code: 'CHF', symbol: 'CHF', locale: 'de-CH' },
    '.HK': { code: 'HKD', symbol: 'HK$', locale: 'en-HK' },
    '.T': { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
    '.KS': { code: 'KRW', symbol: '₩', locale: 'ko-KR' },
    '.KQ': { code: 'KRW', symbol: '₩', locale: 'ko-KR' },
    '.SS': { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    '.SZ': { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    '.SI': { code: 'SGD', symbol: 'S$', locale: 'en-SG' },
    '.SA': { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
    '.MX': { code: 'MXN', symbol: 'MX$', locale: 'es-MX' },
};

const DEFAULT_CURRENCY: CurrencyMeta = { code: 'USD', symbol: '$', locale: 'en-US' };

export const getCurrencyMeta = (symbol = '', exchange = ''): CurrencyMeta => {
    const upperSymbol = symbol.toUpperCase();
    const upperExchange = exchange.toUpperCase();

    if (upperSymbol.includes('USDT') || upperSymbol.includes('-USD')) {
        return DEFAULT_CURRENCY;
    }

    if (upperExchange.includes('NSE') || upperExchange.includes('BSE')) {
        return SUFFIX_CURRENCY['.NS'];
    }

    const suffix = Object.keys(SUFFIX_CURRENCY)
        .sort((a, b) => b.length - a.length)
        .find((candidate) => upperSymbol.endsWith(candidate));

    return suffix ? SUFFIX_CURRENCY[suffix] : DEFAULT_CURRENCY;
};

export const formatCurrency = (value: number | undefined, symbol = '', exchange = '') => {
    if (value === undefined || Number.isNaN(value)) return '-';
    const currency = getCurrencyMeta(symbol, exchange);
    return new Intl.NumberFormat(currency.locale, {
        style: 'currency',
        currency: currency.code,
        maximumFractionDigits: currency.code === 'JPY' || currency.code === 'KRW' ? 0 : 2,
    }).format(value);
};
