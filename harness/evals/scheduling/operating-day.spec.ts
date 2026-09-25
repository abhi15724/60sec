import { describe, expect, it } from 'vitest';
import {
  AUCTION_HOURS_PER_OPERATING_DAY,
  SLOTS_PER_AUCTION_HOUR,
  SLOTS_PER_OPERATING_DAY,
  getAuctionHourForSlot,
  validateOperatingDayInventory,
} from '../../../src/core/scheduling.ts';

describe('60SEC operating day inventory', () => {
  it('defines exactly 12 hours, 60 slots/hour, and 720 slots/day', () => {
    expect(AUCTION_HOURS_PER_OPERATING_DAY).toBe(12);
    expect(SLOTS_PER_AUCTION_HOUR).toBe(60);
    expect(SLOTS_PER_OPERATING_DAY).toBe(720);
  });

  it('maps slots to the correct hourly auction', () => {
    expect(getAuctionHourForSlot(1)).toBe(1);
    expect(getAuctionHourForSlot(60)).toBe(1);
    expect(getAuctionHourForSlot(61)).toBe(2);
    expect(getAuctionHourForSlot(720)).toBe(12);
  });

  it('accepts a complete sequential 1..720 operating day', () => {
    expect(validateOperatingDayInventory(Array.from({ length: 720 }, (_, i) => i + 1))).toBe(true);
  });

  it('rejects incomplete or duplicated inventory', () => {
    expect(validateOperatingDayInventory(Array.from({ length: 719 }, (_, i) => i + 1))).toBe(false);
    const duplicate = Array.from({ length: 720 }, (_, i) => i + 1);
    duplicate[719] = 719;
    expect(validateOperatingDayInventory(duplicate)).toBe(false);
  });
});
