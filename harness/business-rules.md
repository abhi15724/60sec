# 60SEC Master Business Rules

This document consolidates the overarching business rules (BR-001 to BR-010) that define the product mechanics and core guarantees of **60SEC**.

---

## BR-001: The 60-Second Attention Marketplace
60SEC is an online ad marketplace where advertisers compete in transparent, public auctions to purchase exclusive 60-second broadcast slots. There are no partial slots, no banner carousels, and no concurrent displays. One slot equals one 60-second broadcast.

---

## BR-002: Operating-Day Auction Structure & Pricing
- One operating day contains exactly **12 continuous auction hours**.
- Each auction hour contains exactly **60 individual 60-second ad slots**.
- Therefore each operating day contains exactly **720 sequential ad slots**.
- The first slot of each operating day starts at **₹1**.
- Every subsequent slot on the same operating day starts from the previous slot's closing price.
- The hourly boundary does not reset the price.
- The next operating day resets the starting price to **₹1**.
- A starting price below ₹1 is invalid.

---

## BR-003: Bid Superiority & Minimum Increment
- **Superiority**: A valid bid must strictly exceed the current highest bid:
  $$\text{Bid}_{\text{new}} > \text{Bid}_{\text{current}}$$
- **Minimum Increment**: For the MVP launch:
  $$\text{Minimum Next Bid} = \text{Current Highest Bid} + ₹1$$
- **Example**: If Current Bid = ₹50, the minimum valid bid is ₹51. Submissions of ₹50 or ₹49.99 are strictly rejected with an explicit validation error.
- **First Bid Case**: If no bid has yet been placed on an auction with starting bid ₹1, a bid of ₹1 is valid. Once placed, all subsequent bids must be $\ge \text{current\_bid} + ₹1$.

---

## BR-004: Server-Authoritative Clock & Expiry
- The client system time is considered completely untrusted.
- All auction expirations, countdown computations, and bid timestamp validations are evaluated against authoritative server UTC time (`NOW()`).
- Once the authoritative server time reaches or passes `end_time`, the auction transitions to `CLOSED` or `AWAITING_PAYMENT`. Any in-flight bid timestamped after `end_time` is rejected immediately.

---

## BR-005: Separation of Winning vs. Paid State
- Winning an auction **DOES NOT** confer an automatic right to broadcast.
- The pipeline follows strict unidirectional state transitions:
  $$\text{BID\_PLACED} \rightarrow \text{AUCTION\_WON} \rightarrow \text{PAYMENT\_REQUIRED} \rightarrow \text{PAYMENT\_VERIFIED} \rightarrow \text{SLOT\_SCHEDULED} \rightarrow \text{AD\_LIVE} \rightarrow \text{AD\_COMPLETED}$$
- A winning bidder has a designated payment window (default: 15 minutes). If payment fails or expires, the slot is recycled per platform recovery policies.

---

## BR-006: Invariant Slot Duration = Exactly 60 Seconds
- Every scheduled advertising broadcast must last exactly sixty (60) seconds:
  $$\text{scheduled\_end} - \text{scheduled\_start} = 60 \text{ seconds}$$
- Millisecond tolerances must not cause drift. Timestamps are stored in UTC format (`YYYY-MM-DDTHH:mm:ss.000Z`).

---

## BR-007: Sequential Non-Overlapping Queue
- Broadcast slots are strictly serialized.
- For any two scheduled ad slots $A$ and $B$, where $A$ airs before $B$:
  $$\text{scheduled\_start}_B \ge \text{scheduled\_end}_A$$
- Overlapping broadcasts ($\text{start}_B < \text{end}_A$) are fundamentally illegal and rejected by database exclusion constraints and scheduler checks.

---

## BR-008: Prerequisite Ad Approval
- An ad cannot air on the platform without prior administrative content approval (`approval_status = 'APPROVED'`).
- If an advertiser wins an auction with a pending or rejected ad, the ad must be approved before the slot goes live. In the event of a permanent policy rejection, payment is handled according to platform terms.

---

## BR-009: Authentic Real-Time Telemetry
- No synthetic, randomized, or fabricated impressions or clicks are permitted.
- The platform emits verified event telemetry:
  - `ad_loaded`: Creative asset loaded into memory.
  - `ad_viewable`: Creative reached 50%+ viewport visibility for at least 1 second.
  - `ad_started`: Playback began at authoritative start time.
  - `ad_completed`: Full 60 seconds played without interruption.
  - `ad_clicked`: Genuine human click navigating to the verified advertiser URL.
- Duplicate and rapid-fire requests are throttled and deduplicated by session ID and timestamp.

---

## BR-010: Zero Client Trust & Server Isolation
- The browser is treated solely as a presentation layer.
- The server/database holds exclusive authority to:
  - Validate and accept bids.
  - Declare auction winners.
  - Verify payment signatures.
  - Assign broadcast calendar slots.
  - Track impressions and click redirects.
