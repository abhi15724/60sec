/**
 * 60SEC independent market rules.
 *
 * Bidding pools are denominated independently; currencies are never converted
 * to compare bids. The global broadcast inventory is shared and alternates
 * between markets, so the 720 daily broadcasts are split 360/360.
 */
import type { Auction, MarketCurrency } from './types.ts';
import { SLOTS_PER_OPERATING_DAY } from './auction.ts';

export const MARKET_CURRENCIES: readonly MarketCurrency[] = ['INR', 'USD'] as const;
export const GLOBAL_SLOTS_PER_DAY = SLOTS_PER_OPERATING_DAY;
export const SLOTS_PER_MARKET_PER_DAY = GLOBAL_SLOTS_PER_DAY / MARKET_CURRENCIES.length;

export class MarketError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'MarketError';
  }
}

/** Assign a market from a trusted server-side account decision, never browser locale. */
export function resolveMarketCurrency(billingCountry: string): MarketCurrency {
  const country = billingCountry.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new MarketError('INVALID_BILLING_COUNTRY', 'A verified two-letter billing country is required.');
  }
  return country === 'IN' ? 'INR' : 'USD';
}

/** Global slots are 1-based: odd slots belong to India, even slots to USD. */
export function getMarketForGlobalSlot(globalSlotNumber: number): MarketCurrency {
  if (!Number.isInteger(globalSlotNumber) || globalSlotNumber < 1 || globalSlotNumber > GLOBAL_SLOTS_PER_DAY) {
    throw new MarketError('INVALID_GLOBAL_SLOT', `Global slot must be between 1 and ${GLOBAL_SLOTS_PER_DAY}.`);
  }
  return globalSlotNumber % 2 === 1 ? 'INR' : 'USD';
}

/** Market-local sequence: India 1,2,3... on global 1,3,5; USD 1,2,3... on 2,4,6. */
export function getMarketSlotNumber(globalSlotNumber: number): number {
  getMarketForGlobalSlot(globalSlotNumber); // validate range
  return Math.ceil(globalSlotNumber / 2);
}

/** Return the active auction for one currency only; never fall back to another market. */
export function getActiveMarketAuction(
  auctions: readonly Auction[],
  currency: MarketCurrency
): Auction | null {
  return auctions.find((auction) => auction.status === 'ACTIVE' && auction.currency === currency) ?? null;
}

/** Carry forward a price only from the same currency and same operating day. */
export function getMarketStartingPrice(
  currency: MarketCurrency,
  operatingDay: string | null,
  previousAuction?: Pick<Auction, 'currency' | 'operatingDay' | 'currentBid' | 'startingBid'> | null
): number {
  if (!operatingDay || !previousAuction ||
      previousAuction.currency !== currency ||
      previousAuction.operatingDay !== operatingDay) return 1;
  return Math.max(1, previousAuction.currentBid ?? previousAuction.startingBid);
}

/** Reject a bid routed to an auction belonging to another market. */
export function assertBidMarket(
  auction: Pick<Auction, 'currency'>,
  authenticatedMarket: MarketCurrency
): void {
  if (!auction.currency || auction.currency !== authenticatedMarket) {
    throw new MarketError('MARKET_CURRENCY_MISMATCH', 'You can only bid in your assigned market and currency.');
  }
}

/** Build the global alternating market route for a day's broadcast slots. */
export function buildGlobalMarketRoute(): MarketCurrency[] {
  return Array.from({ length: GLOBAL_SLOTS_PER_DAY }, (_, index) =>
    getMarketForGlobalSlot(index + 1)
  );
}
