# 60SEC Auction System Rules & Contracts

This document codifies the technical specifications and verification invariants governing the auction engine of 60SEC.

---

## 1. Normative Rules Index

| Rule ID | Title | Summary |
|---|---|---|
| **AUCTION-001** | Daily Starting Bid | First slot of each operating day starts at ₹1; later same-day slots inherit the previous closing price. |
| **AUCTION-002** | Bid Superiority Requirement | A new bid amount must be strictly greater than the current leading bid. |
| **AUCTION-003** | Minimum Increment Formula | Next minimum bid = $\text{current\_bid} + 1$ (or starting bid if zero bids placed). |
| **AUCTION-004** | Authoritative Expiry Cutoff | Bids submitted at or after the server's UTC `end_time` are rejected. |
| **AUCTION-005** | Bidder Eligibility | Bidder must be an authenticated user with an active account and valid ad. |
| **AUCTION-006** | Server Clock Authority | All auction timers and statuses are computed server-side; browser time is ignored. |
| **AUCTION-007** | Atomic Concurrency Control | Simultaneous bids on the same auction must be serialized via database row locks (`FOR UPDATE`). |
| **AUCTION-008** | Deterministic Winner Selection | Upon closure, the highest valid accepted bid is declared winner. |
| **AUCTION-009** | State Immutability on Rejection | Any failed or rejected bid must leave auction state 100% unaltered. |
| **AUCTION-010** | Outbid Notification Trigger | When an accepted bid outbids a user, the previous leader must receive a real-time outbid alert. |
| **AUCTION-011** | Privacy & Anonymized Display | Public bid feeds must never expose personal emails or full names; use masked aliases (e.g., `User***92`). |

---

## 2. Detailed Technical Specifications

### AUCTION-001: Operating-Day Price Continuity
- The first slot of every operating day starts at ₹1.
- Every subsequent slot on the same operating day starts at the immediately preceding slot's closing price.
- Hourly session boundaries do not reset the price.
- The first slot of the next operating day resets to ₹1.
- Previous-day closing price must never carry into the next operating day.
- If the previous slot received no bid, its effective closing price is its starting price.

### AUCTION-002 & AUCTION-003: Increment Logic
- Formula:
  ```typescript
  function calculateMinimumNextBid(currentBid: number | null, startingBid: number = 1): number {
    if (currentBid === null || currentBid === 0) {
      return startingBid;
    }
    return Math.floor(currentBid) + 1;
  }
  ```
- Any incoming bid value $X$ where $X < \text{minimum\_next\_bid}$ must return error:
  `{ code: "BID_TOO_LOW", message: "Bid must be at least ₹" + minBid }`.

### AUCTION-004 & AUCTION-006: Expiry & Authoritative Clock
- Server checks `currentTime = new Date()`.
- Condition:
  ```typescript
  if (currentTime.getTime() >= auction.endTime.getTime() || auction.status !== 'ACTIVE') {
    throw new AuctionExpiredError("This auction has closed and is no longer accepting bids.");
  }
  ```
- Client devices running inaccurate or manipulated local clocks cannot prolong or prematurely terminate an auction.

### AUCTION-007: Concurrency & Race Condition Resolution
- When two users submit bids simultaneously (e.g., User A bids ₹100, User B bids ₹101 at the same millisecond):
  1. The database transaction opens with row-level locking:
     `SELECT * FROM auctions WHERE id = :id FOR UPDATE;`
  2. Transaction 1 executes first: sees current bid ₹50. User A bids ₹100. Accepted! Current bid updated to ₹100. Transaction commits.
  3. Transaction 2 unblocks: re-reads fresh state. Current bid is now ₹100. User B bids ₹101. Accepted! Current bid updated to ₹101.
  4. If User B had also bid ₹100, Transaction 2 re-reads current bid as ₹100, determines ₹100 is not $> 100$, rejects User B's bid cleanly with `BID_TOO_LOW`, and rolls back.
- No lost updates or corrupt bid histories can occur.

### AUCTION-008 & AUCTION-009: Closure and Rejection Isolation
- Closure transitions auction status from `ACTIVE` to `CLOSED`.
- If accepted bids exist:
  - `winner_id = highest_bid.user_id`
  - `winning_bid_amount = highest_bid.amount`
  - `status = 'AWAITING_PAYMENT'`
- If zero bids were placed:
  - `status = 'EXPIRED'`
- Any bid that fails validation (due to low amount, closed status, or unauthenticated user) aborts without updating `current_bid`, `current_bidder_id`, or `bids` table count.

---

## 3. Outbid Real-Time Notification (AUCTION-010)
- When `current_bidder_id` is replaced by a new higher bid:
  - An event payload `{ type: "OUTBID", auctionId, previousBid, newBid, minimumNextBid }` is dispatched over Supabase Realtime channel specifically targeting the displaced user.
  - A persistent notification is inserted into the `notifications` table for unread badge counters.
