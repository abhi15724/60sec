/**
 * 60SEC Single Homepage Slot Engine & Invariant Enforcers
 * Enforces SLOT-001 through SLOT-008
 */

import { AdSchedule, Auction, PaymentRecord, Advertisement } from './types.ts';

export class SlotInvariantError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SlotInvariantError';
  }
}

/**
 * SLOT-001:
 * There can be at most one LIVE homepage advertisement at any timestamp.
 */
export function assertAtMostOneLiveAd(
  schedules: ReadonlyArray<AdSchedule>,
  timestamp: Date = new Date()
): void {
  const ts = timestamp.getTime();
  const liveSlots = schedules.filter((s) => {
    if (s.status === 'LIVE') return true;
    return s.status === 'SCHEDULED' && s.startTime.getTime() <= ts && s.endTime.getTime() > ts;
  });

  if (liveSlots.length > 1) {
    throw new SlotInvariantError(
      'SLOT_001_MULTIPLE_LIVE_ADS',
      `SLOT-001 Invariant Violation: Found ${liveSlots.length} simultaneously live homepage ads at ${timestamp.toISOString()}. Maximum allowed is 1.`
    );
  }
}

/**
 * SLOT-002:
 * There can be at most one active homepage auction for the next slot.
 */
export function assertAtMostOneActiveNextSlotAuction(
  auctions: ReadonlyArray<Auction>
): void {
  const activeAuctions = auctions.filter((a) => a.status === 'ACTIVE');
  if (activeAuctions.length > 1) {
    throw new SlotInvariantError(
      'SLOT_002_MULTIPLE_ACTIVE_AUCTIONS',
      `SLOT-002 Invariant Violation: Found ${activeAuctions.length} active auctions. Homepage allows strictly 1 active auction for the next slot.`
    );
  }
}

/**
 * SLOT-003:
 * Homepage advertising slots cannot overlap.
 */
export function assertNoSlotOverlap(
  schedules: ReadonlyArray<AdSchedule>
): void {
  const active = schedules
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'LIVE')
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (let i = 0; i < active.length - 1; i++) {
    const current = active[i];
    const next = active[i + 1];

    if (current.endTime.getTime() > next.startTime.getTime()) {
      throw new SlotInvariantError(
        'SLOT_003_OVERLAPPING_SLOTS',
        `SLOT-003 Invariant Violation: Slot ${current.scheduleCode} (${current.endTime.toISOString()}) overlaps with Slot ${next.scheduleCode} (${next.startTime.toISOString()}).`
      );
    }
  }
}

/**
 * SLOT-004:
 * Every homepage advertising slot lasts exactly 60 seconds.
 */
export function assertExactSixtySeconds(
  slot: Pick<AdSchedule, 'startTime' | 'endTime'>
): void {
  const diffMs = slot.endTime.getTime() - slot.startTime.getTime();
  if (diffMs !== 60 * 1000) {
    throw new SlotInvariantError(
      'SLOT_004_INVALID_DURATION',
      `SLOT-004 Invariant Violation: Slot duration is ${diffMs / 1000}s. Every homepage slot must last exactly 60 seconds.`
    );
  }
}

/**
 * SLOT-005:
 * A paid slot must have a unique sequential position in the homepage schedule.
 */
export function assertSequentialSlotPositions(
  schedules: ReadonlyArray<AdSchedule>
): void {
  const sorted = schedules
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'LIVE' || s.status === 'COMPLETED')
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (next.startTime.getTime() < current.endTime.getTime()) {
      throw new SlotInvariantError(
        'SLOT_005_NON_SEQUENTIAL_POSITION',
        `SLOT-005 Invariant Violation: Non-sequential queue ordering between ${current.scheduleCode} and ${next.scheduleCode}.`
      );
    }
  }
}

/**
 * SLOT-006:
 * A new advertisement cannot become LIVE until the previous 60-second slot has ended.
 */
export function assertCannotGoLiveUntilPreviousSlotEnded(
  previousSlot: AdSchedule,
  nextSlot: AdSchedule,
  checkTime: Date = new Date()
): void {
  if (checkTime.getTime() < previousSlot.endTime.getTime()) {
    if (nextSlot.status === 'LIVE') {
      throw new SlotInvariantError(
        'SLOT_006_PREMATURE_LIVE_TRANSITION',
        `SLOT-006 Invariant Violation: Next slot cannot become LIVE while previous slot is still active (ends at ${previousSlot.endTime.toISOString()}).`
      );
    }
  }
}

/**
 * SLOT-007:
 * Only the winner of the corresponding auction can receive that slot.
 */
export function assertOnlyAuctionWinnerReceivesSlot(
  auction: Readonly<Auction>,
  assigneeUserId: string
): void {
  if (!auction.currentBidderId) {
    throw new SlotInvariantError(
      'SLOT_007_NO_AUCTION_WINNER',
      'SLOT-007 Invariant Violation: Cannot assign a slot from an auction with no leading/winning bidder.'
    );
  }
  if (auction.currentBidderId !== assigneeUserId) {
    throw new SlotInvariantError(
      'SLOT_007_UNAUTHORIZED_ASSIGNEE',
      `SLOT-007 Invariant Violation: User '${assigneeUserId}' cannot receive slot won by '${auction.currentBidderId}'.`
    );
  }
}

/**
 * SLOT-008:
 * Payment must be verified before the winner receives the slot.
 */
export function assertPaymentVerifiedBeforeSchedule(
  payment: Readonly<PaymentRecord>
): void {
  if (payment.status !== 'VERIFIED') {
    throw new SlotInvariantError(
      'SLOT_008_UNVERIFIED_PAYMENT',
      `SLOT-008 Invariant Violation: Payment status is '${payment.status}'. Slot cannot be created until payment is VERIFIED.`
    );
  }
  if (!payment.paidAt) {
    throw new SlotInvariantError(
      'SLOT_008_MISSING_PAID_AT',
      'SLOT-008 Invariant Violation: Verified payment missing authoritative paidAt timestamp.'
    );
  }
}
