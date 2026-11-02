/** Market-aware currency rules for 60SEC auctions. */
export type MarketCurrency = 'INR' | 'USD';

/** India is identified by the browser's Indian locale or IST timezone. */
export function getPreferredCurrency(
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): MarketCurrency {
  return locale.toLowerCase().endsWith('-in') || timeZone === 'Asia/Kolkata' ? 'INR' : 'USD';
}

export function formatMarketCurrency(amount: number | null | undefined, currency: MarketCurrency = getPreferredCurrency()): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function getCurrencySymbol(currency: MarketCurrency = getPreferredCurrency()): string {
  return currency === 'INR' ? '₹' : '$';
}
