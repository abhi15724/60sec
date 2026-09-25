/**
 * @file /harness/evals/auction/auction.spec.ts
 * Evaluation suite for 60SEC Auction Business Rules (AUCTION-001 through AUCTION-011)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMinimumNextBid,
  validateAndApplyBid,
  handleConcurrentBids,
  closeAuction,
  AuctionError,
} from '../../../src/core/auction.ts';
import { Auction } from '../../../src/core/types.ts';

describe('AUCTION BUSINESS RULES EVALUATION', () => {
  const baseAuction: Auction = {
    id: 'auc_test_001',
    advertisementId: 'ad_001',
    startingBid: 1.0,
    currentBid: null,
    currentBidderId: null,
    startTime: new Date('2026-09-25T10:00:00Z'),
    endTime: new Date('2026-09-25T10:05:00Z'),
    status: 'ACTIVE',
    createdAt: new Date('2026-09-25T09:55:00Z'),
  };

  it('AUCTION-001: starting bid is strictly ₹1 and initial minimum next bid is ₹1', () => {
    expect(baseAuction.startingBid).toBe(1.0);
    const initialMinBid = calculateMinimumNextBid(baseAuction.currentBid, baseAuction.startingBid);
    expect(initialMinBid).toBe(1.0);

    // Any attempt to create starting bid < 1 must be rejected
    expect(() => calculateMinimumNextBid(null, 0.5)).toThrowError(AuctionError);
  });

  it('AUCTION-002 & AUCTION-003: accepts valid bid greater than current bid', () => {
    const serverNow = new Date('2026-09-25T10:01:00Z');

    // First bid of ₹1 on new auction
    const res1 = validateAndApplyBid(baseAuction, { userId: 'user_alice', amount: 1.0 }, serverNow);
    expect(res1.accepted).toBe(true);
    expect(res1.updatedAuction.currentBid).toBe(1.0);
    expect(res1.updatedAuction.currentBidderId).toBe('user_alice');

    // Next bid must be >= ₹2
    const nextMin = calculateMinimumNextBid(res1.updatedAuction.currentBid);
    expect(nextMin).toBe(2.0);

    const res2 = validateAndApplyBid(res1.updatedAuction, { userId: 'user_bob', amount: 50.0 }, serverNow);
    expect(res2.accepted).toBe(true);
    expect(res2.updatedAuction.currentBid).toBe(50.0);
    expect(res2.updatedAuction.currentBidderId).toBe('user_bob');
  });

  it('AUCTION-002: rejects equal bid (current = ₹50, incoming = ₹50)', () => {
    const serverNow = new Date('2026-09-25T10:01:00Z');
    const auctionAt50: Auction = {
      ...baseAuction,
      currentBid: 50.0,
      currentBidderId: 'user_alice',
    };

    expect(() =>
      validateAndApplyBid(auctionAt50, { userId: 'user_bob', amount: 50.0 }, serverNow)
    ).toThrowError(/greater than current bid/i);
  });

  it('AUCTION-002: rejects lower bid (current = ₹50, incoming = ₹49)', () => {
    const serverNow = new Date('2026-09-25T10:01:00Z');
    const auctionAt50: Auction = {
      ...baseAuction,
      currentBid: 50.0,
      currentBidderId: 'user_alice',
    };

    expect(() =>
      validateAndApplyBid(auctionAt50, { userId: 'user_bob', amount: 49.0 }, serverNow)
    ).toThrowError(/greater than current bid/i);
  });

  it('AUCTION-004 & AUCTION-006: rejects bids submitted at or after authoritative end time', () => {
    const expiredTime = new Date('2026-09-25T10:05:00Z'); // matches endTime exactly
    expect(() =>
      validateAndApplyBid(baseAuction, { userId: 'user_alice', amount: 10.0 }, expiredTime)
    ).toThrowError(/Auction ended/i);

    const pastExpiredTime = new Date('2026-09-25T10:05:01Z');
    expect(() =>
      validateAndApplyBid(baseAuction, { userId: 'user_alice', amount: 10.0 }, pastExpiredTime)
    ).toThrowError(/Auction ended/i);
  });

  it('AUCTION-007: concurrent bid serialization resolves atomically without data corruption', () => {
    const serverNow = new Date('2026-09-25T10:02:00Z');
    const auctionAt50: Auction = {
      ...baseAuction,
      currentBid: 50.0,
      currentBidderId: 'user_initial',
    };

    // Simulate 3 incoming requests received in sequence by database row lock:
    // Request 1: User A bids 100
    // Request 2: User B bids 100 (competing for same price)
    // Request 3: User C bids 101
    const requests = [
      { userId: 'user_a', amount: 100 },
      { userId: 'user_b', amount: 100 },
      { userId: 'user_c', amount: 101 },
    ];

    const result = handleConcurrentBids(auctionAt50, requests, serverNow);

    expect(result.acceptedBids.length).toBe(2); // user_a (100) and user_c (101)
    expect(result.rejectedBids.length).toBe(1); // user_b (100 is no longer valid once 100 is set)
    expect(result.rejectedBids[0].userId).toBe('user_b');
    expect(result.finalAuction.currentBid).toBe(101);
    expect(result.finalAuction.currentBidderId).toBe('user_c');
  });

  it('AUCTION-008: winner selection closes to AWAITING_PAYMENT with highest valid bidder', () => {
    const auctionAt175: Auction = {
      ...baseAuction,
      currentBid: 175.0,
      currentBidderId: 'user_winner_abc',
    };

    const serverCloseTime = new Date('2026-09-25T10:05:01Z');
    const closed = closeAuction(auctionAt175, serverCloseTime);

    expect(closed.status).toBe('AWAITING_PAYMENT');
    expect(closed.currentBidderId).toBe('user_winner_abc');
    expect(closed.currentBid).toBe(175.0);
  });

  it('AUCTION-009: rejected bid does not mutate auction state', () => {
    const serverNow = new Date('2026-09-25T10:01:00Z');
    const pristineAuction: Readonly<Auction> = Object.freeze({
      ...baseAuction,
      currentBid: 75.0,
      currentBidderId: 'user_current',
    });

    try {
      validateAndApplyBid(pristineAuction, { userId: 'user_malicious', amount: 70.0 }, serverNow);
    } catch {
      // expected error
    }

    expect(pristineAuction.currentBid).toBe(75.0);
    expect(pristineAuction.currentBidderId).toBe('user_current');
  });
});
