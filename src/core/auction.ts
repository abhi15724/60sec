/**
 * 60SEC Authoritative Auction Engine
 * Enforces AUCTION-001 through AUCTION-011
 */

import { Auction, Bid, OutbidNotification } from './types.ts';
import { getOperatingDayKey as getISTOperatingDayKey } from './scheduling.ts';

export const AUCTION_HOURS_PER_OPERATING_DAY = 12;
export const SLOTS_PER_AUCTION_HOUR = 60;
export const SLOTS_PER_OPERATING_DAY = AUCTION_HOURS_PER_OPERATING_DAY * SLOTS_PER_AUCTION_HOUR;

/** Calendar key used by the demo until the exact operating-day timezone/window is configured. */
export function getOperatingDayKey(date: Date): string | null {
  return getISTOperatingDayKey(date);
}

export function getSlotNumberInOperatingDay(sequenceNumber: number): number {
  return ((sequenceNumber - 1) % SLOTS_PER_OPERATING_DAY) + 1;
}

export function getAuctionHourForSlot(slotNumber: number): number {
  return Math.floor((slotNumber - 1) / SLOTS_PER_AUCTION_HOUR) + 1;
}

export class AuctionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuctionError';
  }
}

/**
 * AUCTION-001 & AUCTION-003:
 * Calculates the next minimum acceptable bid.
 * If zero bids exist, starting bid is $1.
 * Otherwise, minimum next bid = current_highest_bid + $1.
 */
export function calculateMinimumNextBid(currentBid: number | null, startingBid: number = 1.0): number {
  if (startingBid < 1.0) {
    throw new AuctionError('INVALID_STARTING_BID', 'Starting bid cannot be lower than $1');
  }
  if (currentBid === null || currentBid === 0) {
    return startingBid;
  }
  return currentBid + 1.0;
}

/**
 * Returns the starting price for the next slot.
 * First slot of each operating day resets to $1.
 * Subsequent slots in the same operating day inherit the previous closing price,
 * including across hourly session boundaries.
 */
export function calculateOperatingDayStartingPrice(
  operatingDay: string | null,
  previousAuction?: Pick<Auction, 'operatingDay' | 'currentBid' | 'startingBid'> | null
): number {
  if (!operatingDay || !previousAuction || previousAuction.operatingDay !== operatingDay) return 1.0;
  return Math.max(1.0, previousAuction.currentBid ?? previousAuction.startingBid);
}

export interface BidValidationResult {
  accepted: boolean;
  updatedAuction: Auction;
  recordedBid: Bid;
  outbidNotification?: OutbidNotification;
}

/**
 * AUCTION-002, AUCTION-004, AUCTION-005, AUCTION-006, AUCTION-009:
 * Validates and atomically transitions an auction state when a bid is submitted.
 * Throws AuctionError if validation fails, leaving original auction untouched.
 */
export function validateAndApplyBid(
  currentAuction: Readonly<Auction>,
  bidRequest: {
    userId: string;
    amount: number;
    bidId?: string;
  },
  serverTime: Date = new Date()
): BidValidationResult {
  // AUCTION-006: Server time is authoritative
  if (serverTime.getTime() >= currentAuction.endTime.getTime()) {
    throw new AuctionError(
      'AUCTION_EXPIRED',
      `Auction ended at ${currentAuction.endTime.toISOString()}. Bids are no longer accepted.`
    );
  }

  if (currentAuction.status !== 'ACTIVE') {
    throw new AuctionError(
      'AUCTION_NOT_ACTIVE',
      `Cannot bid on auction with status '${currentAuction.status}'. Must be 'ACTIVE'.`
    );
  }

  if (!bidRequest.userId || bidRequest.userId.trim() === '') {
    throw new AuctionError('UNAUTHENTICATED', 'A valid authenticated user ID is required to bid.');
  }

  const minNextBid = calculateMinimumNextBid(currentAuction.currentBid, currentAuction.startingBid);

  // AUCTION-002 & AUCTION-003: Bid must be >= minimumNextBid
  if (bidRequest.amount < minNextBid) {
    if (currentAuction.currentBid !== null && bidRequest.amount <= currentAuction.currentBid) {
      throw new AuctionError(
        'BID_TOO_LOW',
        `Bid $${bidRequest.amount} must be greater than current bid $${currentAuction.currentBid}. Minimum next bid is $${minNextBid}.`
      );
    }
    throw new AuctionError(
      'BID_BELOW_MINIMUM',
      `Bid $${bidRequest.amount} is below required minimum next bid of $${minNextBid}.`
    );
  }

  const previousBidderId = currentAuction.currentBidderId;
  const previousBidAmount = currentAuction.currentBid;

  const recordedBid: Bid = {
    id: bidRequest.bidId || `bid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    auctionId: currentAuction.id,
    userId: bidRequest.userId,
    amount: bidRequest.amount,
    createdAt: new Date(serverTime),
  };

  const updatedAuction: Auction = {
    ...currentAuction,
    currentBid: bidRequest.amount,
    currentBidderId: bidRequest.userId,
  };

  let outbidNotification: OutbidNotification | undefined;

  // AUCTION-010: Outbid trigger
  if (previousBidderId && previousBidderId !== bidRequest.userId && previousBidAmount !== null) {
    outbidNotification = {
      type: 'OUTBID',
      auctionId: currentAuction.id,
      displacedUserId: previousBidderId,
      previousBidAmount,
      newHighestBidAmount: bidRequest.amount,
      minimumNextBid: calculateMinimumNextBid(bidRequest.amount, currentAuction.startingBid),
      timestamp: new Date(serverTime),
    };
  }

  return {
    accepted: true,
    updatedAuction,
    recordedBid,
    outbidNotification,
  };
}

/**
 * AUCTION-007: Atomic Concurrency Resolution Simulator
 * Simulates sequential row-locked database execution (SELECT FOR UPDATE)
 * where incoming concurrent bids are resolved in order.
 */
export function handleConcurrentBids(
  initialAuction: Readonly<Auction>,
  bidRequests: Array<{ userId: string; amount: number }>,
  serverTime: Date = new Date()
): {
  finalAuction: Auction;
  acceptedBids: Bid[];
  rejectedBids: Array<{ userId: string; amount: number; error: string }>;
  notifications: OutbidNotification[];
} {
  let currentAuctionState = { ...initialAuction };
  const acceptedBids: Bid[] = [];
  const rejectedBids: Array<{ userId: string; amount: number; error: string }> = [];
  const notifications: OutbidNotification[] = [];

  for (const req of bidRequests) {
    try {
      const result = validateAndApplyBid(currentAuctionState, req, serverTime);
      currentAuctionState = result.updatedAuction;
      acceptedBids.push(result.recordedBid);
      if (result.outbidNotification) {
        notifications.push(result.outbidNotification);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      rejectedBids.push({ ...req, error: msg });
    }
  }

  return {
    finalAuction: currentAuctionState,
    acceptedBids,
    rejectedBids,
    notifications,
  };
}

/**
 * AUCTION-008: Deterministic Winner Selection upon Closure
 */
export function closeAuction(
  currentAuction: Readonly<Auction>,
  serverTime: Date = new Date()
): Auction {
  if (serverTime.getTime() < currentAuction.endTime.getTime()) {
    throw new AuctionError(
      'AUCTION_STILL_ACTIVE',
      'Cannot close auction before authoritative end time.'
    );
  }

  if (currentAuction.currentBidderId && currentAuction.currentBid !== null) {
    return {
      ...currentAuction,
      status: 'AWAITING_PAYMENT',
    };
  }

  return {
    ...currentAuction,
    status: 'EXPIRED',
  };
}
