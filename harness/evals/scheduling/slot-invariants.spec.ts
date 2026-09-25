/**
 * @file /harness/evals/scheduling/slot-invariants.spec.ts
 * Evaluation suite for Single Homepage 60-Second Slot Invariants (SLOT-001 through SLOT-008)
 */

import { describe, it, expect } from 'vitest';
import {
  assertAtMostOneLiveAd,
  assertAtMostOneActiveNextSlotAuction,
  assertNoSlotOverlap,
  assertExactSixtySeconds,
  assertSequentialSlotPositions,
  assertCannotGoLiveUntilPreviousSlotEnded,
  assertOnlyAuctionWinnerReceivesSlot,
  assertPaymentVerifiedBeforeSchedule,
  SlotInvariantError,
} from '../../../src/core/slot.ts';
import { AdSchedule, Auction, PaymentRecord } from '../../../src/core/types.ts';

describe('HOMEPAGE 60-SECOND SLOT INVARIANTS (SLOT-001 through SLOT-008)', () => {
  const t0 = new Date('2026-09-25T12:00:00.000Z');
  const t1 = new Date('2026-09-25T12:01:00.000Z');
  const t2 = new Date('2026-09-25T12:02:00.000Z');
  const t3 = new Date('2026-09-25T12:03:00.000Z');

  const validSlot1: AdSchedule = {
    id: 's_001',
    scheduleCode: 'AD60-20260925-000001',
    advertisementId: 'ad_alpha',
    auctionId: 'auc_1',
    startTime: t0,
    endTime: t1,
    durationSeconds: 60,
    status: 'LIVE',
    createdAt: new Date(),
  };

  const validSlot2: AdSchedule = {
    id: 's_002',
    scheduleCode: 'AD60-20260925-000002',
    advertisementId: 'ad_beta',
    auctionId: 'auc_2',
    startTime: t1,
    endTime: t2,
    durationSeconds: 60,
    status: 'SCHEDULED',
    createdAt: new Date(),
  };

  it('SLOT-001: enforces at most one LIVE homepage advertisement', () => {
    // Single live ad passes
    expect(() => assertAtMostOneLiveAd([validSlot1, validSlot2])).not.toThrow();

    // Two live ads simultaneously throws error
    const illegalSecondLive: AdSchedule = {
      ...validSlot2,
      status: 'LIVE',
    };
    expect(() => assertAtMostOneLiveAd([validSlot1, illegalSecondLive])).toThrowError(
      SlotInvariantError
    );
  });

  it('SLOT-002: enforces at most one active homepage auction for the next slot', () => {
    const singleAuction: Auction = {
      id: 'auc_next',
      startingBid: 1.0,
      currentBid: 127.0,
      currentBidderId: 'u_1',
      startTime: t0,
      endTime: t1,
      status: 'ACTIVE',
      createdAt: t0,
    };

    expect(() => assertAtMostOneActiveNextSlotAuction([singleAuction])).not.toThrow();

    const secondCompetingActive: Auction = {
      ...singleAuction,
      id: 'auc_illegal_second',
    };

    expect(() =>
      assertAtMostOneActiveNextSlotAuction([singleAuction, secondCompetingActive])
    ).toThrowError(SlotInvariantError);
  });

  it('SLOT-003: prevents overlapping homepage advertising slots', () => {
    // Sequential non-overlapping passes
    expect(() => assertNoSlotOverlap([validSlot1, validSlot2])).not.toThrow();

    // Overlapping slot (starts at 12:00:30 while Slot 1 ends at 12:01:00)
    const overlappingSlot: AdSchedule = {
      ...validSlot2,
      startTime: new Date('2026-09-25T12:00:30.000Z'),
      endTime: new Date('2026-09-25T12:01:30.000Z'),
    };

    expect(() => assertNoSlotOverlap([validSlot1, overlappingSlot])).toThrowError(
      SlotInvariantError
    );
  });

  it('SLOT-004: every homepage advertising slot lasts exactly 60 seconds', () => {
    expect(() => assertExactSixtySeconds({ startTime: t0, endTime: t1 })).not.toThrow();

    // 59 seconds rejected
    const badEnd59 = new Date(t0.getTime() + 59000);
    expect(() => assertExactSixtySeconds({ startTime: t0, endTime: badEnd59 })).toThrowError(
      SlotInvariantError
    );

    // 61 seconds rejected
    const badEnd61 = new Date(t0.getTime() + 61000);
    expect(() => assertExactSixtySeconds({ startTime: t0, endTime: badEnd61 })).toThrowError(
      SlotInvariantError
    );
  });

  it('SLOT-005: paid slot must have a unique sequential position in the homepage schedule', () => {
    const slot3: AdSchedule = {
      ...validSlot2,
      id: 's_003',
      scheduleCode: 'AD60-20260925-000003',
      startTime: t2,
      endTime: t3,
    };

    expect(() => assertSequentialSlotPositions([validSlot1, validSlot2, slot3])).not.toThrow();

    // Out of order / colliding position throws
    const collidingSlot: AdSchedule = {
      ...slot3,
      startTime: new Date('2026-09-25T12:01:30.000Z'),
    };
    expect(() =>
      assertSequentialSlotPositions([validSlot1, validSlot2, collidingSlot])
    ).toThrowError(SlotInvariantError);
  });

  it('SLOT-006: a new advertisement cannot become LIVE until the previous 60-second slot has ended', () => {
    const midwayTimestamp = new Date('2026-09-25T12:00:30.000Z'); // Previous slot ends at 12:01:00

    const prematureLiveSlot: AdSchedule = {
      ...validSlot2,
      status: 'LIVE',
    };

    expect(() =>
      assertCannotGoLiveUntilPreviousSlotEnded(validSlot1, prematureLiveSlot, midwayTimestamp)
    ).toThrowError(SlotInvariantError);

    // After previous ends (12:01:01), it is allowed
    const postEndTimestamp = new Date('2026-09-25T12:01:01.000Z');
    expect(() =>
      assertCannotGoLiveUntilPreviousSlotEnded(validSlot1, prematureLiveSlot, postEndTimestamp)
    ).not.toThrow();
  });

  it('SLOT-007: only the winner of the corresponding auction can receive that slot', () => {
    const auction: Auction = {
      id: 'auc_1',
      startingBid: 1.0,
      currentBid: 127.0,
      currentBidderId: 'winner_alice',
      startTime: t0,
      endTime: t1,
      status: 'AWAITING_PAYMENT',
      createdAt: t0,
    };

    // Correct winner passes
    expect(() => assertOnlyAuctionWinnerReceivesSlot(auction, 'winner_alice')).not.toThrow();

    // Impersonator or unauthorized user rejected
    expect(() => assertOnlyAuctionWinnerReceivesSlot(auction, 'imposter_bob')).toThrowError(
      SlotInvariantError
    );
  });

  it('SLOT-008: payment must be verified before the winner receives the slot', () => {
    const unverifiedPayment: PaymentRecord = {
      id: 'pay_unver',
      auctionId: 'auc_1',
      userId: 'winner_alice',
      amount: 127.0,
      paymentProvider: 'DEMO_MOCK',
      status: 'PENDING',
      createdAt: new Date(),
    };

    expect(() => assertPaymentVerifiedBeforeSchedule(unverifiedPayment)).toThrowError(
      SlotInvariantError
    );

    const verifiedPayment: PaymentRecord = {
      ...unverifiedPayment,
      status: 'VERIFIED',
      paidAt: new Date(),
    };

    expect(() => assertPaymentVerifiedBeforeSchedule(verifiedPayment)).not.toThrow();
  });
});
