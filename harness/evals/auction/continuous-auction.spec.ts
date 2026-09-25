/**
 * @file /harness/evals/auction/continuous-auction.spec.ts
 * Evaluation suite for Continuous Auction Lifecycle (closing one auction starts the next)
 */

import { describe, it, expect } from 'vitest';
import { closeAuction, calculateMinimumNextBid, validateAndApplyBid, calculateOperatingDayStartingPrice } from '../../../src/core/auction.ts';
import { assertAtMostOneActiveNextSlotAuction } from '../../../src/core/slot.ts';
import { Auction } from '../../../src/core/types.ts';

describe('CONTINUOUS AUCTION SUCCESSION EVALUATION', () => {
  const t0 = new Date('2026-09-25T10:00:00Z');
  const t1 = new Date('2026-09-25T10:02:00Z');
  const t2 = new Date('2026-09-25T10:04:00Z');

  it('atomically transitions closed auction and starts subsequent active auction preserving SLOT-002 invariant', () => {
    const auction1: Auction = {
      id: 'auc_slot_1',
      advertisementId: 'ad_aurora',
      startingBid: 1.0,
      currentBid: 140.0,
      currentBidderId: 'user_winner_1',
      startTime: t0,
      endTime: t1,
      status: 'ACTIVE',
      createdAt: t0,
    };

    // Initially 1 active auction
    expect(() => assertAtMostOneActiveNextSlotAuction([auction1])).not.toThrow();

    // Closing auction 1 at t1
    const closedAuction1 = closeAuction(auction1, t1);
    expect(closedAuction1.status).toBe('AWAITING_PAYMENT');
    expect(closedAuction1.currentBidderId).toBe('user_winner_1');

    // Starting auction 2 immediately upon auction 1 closure
    const auction2: Auction = {
      id: 'auc_slot_2',
      advertisementId: 'ad_technova',
      startingBid: 1.0,
      currentBid: null,
      currentBidderId: null,
      startTime: t1,
      endTime: t2,
      status: 'ACTIVE',
      createdAt: t1,
    };

    // Verify slot invariant with closed auction and new active auction
    const currentAuctions = [auction2, closedAuction1];
    expect(() => assertAtMostOneActiveNextSlotAuction(currentAuctions)).not.toThrow();

    // Verify auction 2 is open for bidding
    const minBidAuction2 = calculateMinimumNextBid(auction2.currentBid, auction2.startingBid);
    expect(minBidAuction2).toBe(1.0);

    const bidResult = validateAndApplyBid(
      auction2,
      { userId: 'user_new_bidder', amount: 1.0 },
      new Date('2026-09-25T10:02:30Z')
    );
    expect(bidResult.accepted).toBe(true);
    expect(bidResult.updatedAuction.currentBid).toBe(1.0);
    expect(bidResult.updatedAuction.currentBidderId).toBe('user_new_bidder');
  });

  it('handles zero-bid closure by marking expired and starting next auction', () => {
    const auctionWithNoBids: Auction = {
      id: 'auc_no_bids',
      advertisementId: 'ad_aurora',
      startingBid: 1.0,
      currentBid: null,
      currentBidderId: null,
      startTime: t0,
      endTime: t1,
      status: 'ACTIVE',
      createdAt: t0,
    };

    const closed = closeAuction(auctionWithNoBids, t1);
    expect(closed.status).toBe('EXPIRED');

    const nextAuction: Auction = {
      id: 'auc_next_cycle',
      advertisementId: 'ad_abc_shoes',
      startingBid: 1.0,
      currentBid: null,
      currentBidderId: null,
      startTime: t1,
      endTime: t2,
      status: 'ACTIVE',
      createdAt: t1,
    };

    expect(() => assertAtMostOneActiveNextSlotAuction([nextAuction, closed])).not.toThrow();
  });

  it('inherits the ending price from previous auction as starting price for the next auction', () => {
    const previousAuction: Auction = {
      id: 'auc_slot_prev',
      advertisementId: 'ad_aurora',
      startingBid: 1.0,
      currentBid: 175.0,
      currentBidderId: 'user_winner_1',
      startTime: t0,
      endTime: t1,
      status: 'ACTIVE',
      createdAt: t0,
    };

    // Close previous auction at $175
    const closed = closeAuction(previousAuction, t1);
    expect(closed.status).toBe('AWAITING_PAYMENT');
    expect(closed.currentBid).toBe(175.0);

    // Compute next auction starting price from previous auction end
    const nextStartingBid = closed.currentBid ?? closed.startingBid;
    expect(nextStartingBid).toBe(175.0);

    const nextAuction: Auction = {
      id: 'auc_slot_next',
      advertisementId: 'ad_technova',
      startingBid: nextStartingBid,
      currentBid: null,
      currentBidderId: null,
      startTime: t1,
      endTime: t2,
      status: 'ACTIVE',
      createdAt: t1,
    };

    // Before any bids are placed on the new auction:
    // Minimum bid must equal the carried over starting price of $175
    const initialMinBid = calculateMinimumNextBid(nextAuction.currentBid, nextAuction.startingBid);
    expect(initialMinBid).toBe(175.0);

    // Bidding below carried over starting price is rejected
    expect(() =>
      validateAndApplyBid(
        nextAuction,
        { userId: 'user_attempt', amount: 150.0 },
        new Date('2026-09-25T10:02:10Z')
      )
    ).toThrowError(/is below required minimum next bid of \$175/i);

    // Bidding at or above the carried over starting price ($175) is accepted
    const firstBidRes = validateAndApplyBid(
      nextAuction,
      { userId: 'user_first_bidder', amount: 175.0 },
      new Date('2026-09-25T10:02:15Z')
    );
    expect(firstBidRes.accepted).toBe(true);
    expect(firstBidRes.updatedAuction.currentBid).toBe(175.0);

    // Subsequent bid must now increment ($176)
    const secondMinBid = calculateMinimumNextBid(
      firstBidRes.updatedAuction.currentBid,
      firstBidRes.updatedAuction.startingBid
    );
    expect(secondMinBid).toBe(176.0);
  });

  it('continues the closing price across same-day slots but resets at the next operating day', () => {
    const day = '2026-09-25';
    const nextDay = '2026-09-26';
    const previous = {
      operatingDay: day,
      currentBid: 12000,
      startingBid: 1,
    } as Auction;

    expect(calculateOperatingDayStartingPrice(day, previous)).toBe(12000);
    expect(calculateOperatingDayStartingPrice(nextDay, previous)).toBe(1);
    expect(calculateOperatingDayStartingPrice(day, null)).toBe(1);
  });

  it('does not reset price at an hourly boundary on the same operating day', () => {
    const previous = {
      operatingDay: '2026-09-25',
      currentBid: 500,
      startingBid: 250,
    } as Auction;

    expect(calculateOperatingDayStartingPrice('2026-09-25', previous)).toBe(500);
  });

});
