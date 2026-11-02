import { describe, expect, it } from 'vitest';
import type { Auction } from './types.ts';
import {
  assertBidMarket,
  buildGlobalMarketRoute,
  getActiveMarketAuction,
  getMarketForGlobalSlot,
  getMarketSlotNumber,
  getMarketStartingPrice,
  resolveMarketCurrency,
  MarketError,
  GLOBAL_SLOTS_PER_DAY,
  SLOTS_PER_MARKET_PER_DAY,
} from './markets.ts';

const auction = (overrides: Partial<Auction> = {}): Auction => ({
  id: 'auction-inr',
  currency: 'INR',
  startingBid: 1,
  currentBid: 120,
  currentBidderId: 'bidder-1',
  startTime: new Date('2026-11-02T03:30:00Z'),
  endTime: new Date('2026-11-02T04:30:00Z'),
  status: 'ACTIVE',
  createdAt: new Date('2026-11-02T03:30:00Z'),
  operatingDay: '2026-11-02',
  ...overrides,
});

describe('independent market rules', () => {
  it('assigns India billing accounts to INR and all other valid countries to USD', () => {
    expect(resolveMarketCurrency('IN')).toBe('INR');
    expect(resolveMarketCurrency('US')).toBe('USD');
    expect(() => resolveMarketCurrency('')).toThrowError(MarketError);
  });

  it('alternates the 720 global slots evenly between markets', () => {
    const route = buildGlobalMarketRoute();
    expect(route).toHaveLength(GLOBAL_SLOTS_PER_DAY);
    expect(route.filter((market) => market === 'INR')).toHaveLength(SLOTS_PER_MARKET_PER_DAY);
    expect(route.filter((market) => market === 'USD')).toHaveLength(SLOTS_PER_MARKET_PER_DAY);
    expect(route.slice(0, 4)).toEqual(['INR', 'USD', 'INR', 'USD']);
  });

  it('maps global slot numbers to independent market-local sequences', () => {
    expect(getMarketForGlobalSlot(1)).toBe('INR');
    expect(getMarketForGlobalSlot(2)).toBe('USD');
    expect(getMarketSlotNumber(1)).toBe(1);
    expect(getMarketSlotNumber(2)).toBe(1);
    expect(getMarketSlotNumber(3)).toBe(2);
    expect(() => getMarketForGlobalSlot(721)).toThrowError(MarketError);
  });

  it('does not mix active auctions across currencies', () => {
    const inr = auction();
    const usd = auction({ id: 'auction-usd', currency: 'USD' });
    expect(getActiveMarketAuction([inr, usd], 'INR')?.id).toBe('auction-inr');
    expect(getActiveMarketAuction([inr, usd], 'USD')?.id).toBe('auction-usd');
  });

  it('carries forward only the same market and operating day', () => {
    expect(getMarketStartingPrice('INR', '2026-11-02', auction())).toBe(120);
    expect(getMarketStartingPrice('USD', '2026-11-02', auction())).toBe(1);
    expect(getMarketStartingPrice('INR', '2026-11-03', auction())).toBe(1);
  });

  it('rejects cross-market bids', () => {
    expect(() => assertBidMarket(auction(), 'USD')).toThrowError(MarketError);
    expect(() => assertBidMarket(auction(), 'INR')).not.toThrow();
  });
});
