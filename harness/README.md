# 60SEC Harness Engineering & Governance System

Welcome to the **60SEC Harness Engineering System**.

60SEC is a high-velocity, real-time advertising marketplace where brands and advertisers compete through transparent, sequential auctions to secure exclusive **60-second broadcast slots**.

Because advertising slots are strictly linear, non-overlapping, and time-critical, financial and scheduling integrity cannot be compromised. This harness defines the business constraints, algorithmic boundaries, database contracts, security policies, and automated evaluation specifications that govern the entire lifecycle of the 60SEC platform.

---

## 1. Core Platform Architecture

The platform operates on a strict single-direction pipeline:

```text
[ Advertiser Signs Up / Logs In ]
                ↓
[ Create Advertisement (Media, Title, Brand, URL) ]
                ↓
[ Admin Reviews & Approves Advertisement ]
                ↓
[ Live 60-Second Auction (Opening Bid: ₹1) ]
                ↓
[ Real-Time Outbid & Bid Increment Engine (+₹1 min increment) ]
                ↓
[ Authoritative Server Auction Closing ]
                ↓
[ Auction Won (Marked as AUCTION_WON, NOT automatically paid) ]
                ↓
[ Idempotent Server-Side Payment Verification (Razorpay / Gateway) ]
                ↓
[ Sequential Non-Overlapping Slot Scheduler (Strict 60s UTC Slots) ]
                ↓
[ Synchronized Ad Delivery & Live Visual Countdown ]
                ↓
[ Real-Time Ad Event & Viewability Telemetry (ad_loaded, ad_completed, etc.) ]
```

---

## 2. Directory Structure & File Index

The harness repository is organized into normative rulebooks, architectural contracts, and executable test suites:

```text
/harness
├── README.md                   # System overview, mission, and architecture
├── agent-instructions.md       # AI agent development rules & change control protocol
├── business-rules.md           # Master business rules (BR-001 through BR-010)
├── auction-rules.md            # Auction mechanics, bid validation, concurrency, and closures
├── payment-rules.md            # Payment lifecycle, verification, gateway abstraction & idempotency
├── scheduling-rules.md         # Sequential 60s slot booking, UTC alignment, and collision prevention
├── ad-delivery-rules.md        # Broadcast engine, live transitions, telemetry, and click-through
├── security-rules.md           # Row-level security, role-based access, and server-side authorization
├── database-contracts.md       # PostgreSQL / Supabase schema contracts, constraints, and triggers
├── testing-strategy.md         # Verification pipeline, evaluation matrix, and regression guardrails
└── evals/
    ├── auction/
    │   └── auction.spec.ts     # Automated tests for starting bids, increments, expiry, concurrency
    ├── payment/
    │   └── payment.spec.ts     # Automated tests for payment isolation, amounts, and duplicate webhooks
    ├── scheduling/
    │   └── scheduling.spec.ts  # Automated tests for 60-second duration, zero-overlap, and approvals
    ├── security/
    │   └── security.spec.ts    # Automated tests for client tampering, RBAC, and ownership integrity
    └── realtime/
        └── realtime.spec.ts    # Automated tests for real-time bid broadcasts and outbid notifications
```

---

## 3. High-Priority Non-Negotiable Invariants

1. **Launch Starting Bid is strictly ₹1 (`₹1`)**: Every new auction begins at ₹1. The next valid bid is always at least `current_highest_bid + ₹1`.
2. **Client is Untrusted**: The client browser can never dictate the current bid, the leading bidder, the winner, whether payment was successful, or when an advertisement airs. All mutations are validated and locked by the authoritative server/database.
3. **Winning != Paid**: Closing an auction as winner generates an obligation to pay, never an active broadcast. An ad cannot be scheduled until payment is independently verified.
4. **Slot Invariant = Exactly 60 Seconds**: Every scheduled ad slot must satisfy `scheduled_end - scheduled_start == 60 seconds`. No gaps between consecutive back-to-back queue items and absolutely zero overlaps.
5. **Real-Time Synchronicity**: Active auctions and broadcast countdowns synchronize against authoritative UTC timestamps.
