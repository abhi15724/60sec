# 60SEC Operating-Day & House-Ad Contract

## Operating day
- Exactly 12 continuous auction hours per operating day.
- Exactly 60 one-minute slots per hour.
- Exactly 720 sequential slots per operating day.
- The exact clock window is configured separately and is not hard-coded here.

## Price continuity
- First slot of an operating day: starting price = $1.
- Same-day next slot: starting price = previous slot closing price.
- Same-day hourly boundary: no price reset.
- First slot of next operating day: starting price = $1.
- Previous operating day price never carries into the next operating day.

## Commercial ad lifecycle
Paid + approved scheduled ad -> LIVE -> 60 seconds -> COMPLETED -> next eligible paid + approved scheduled ad.

## House-ad fallback
- If the next slot has no paid + approved scheduled advertisement, show the configured 60SEC house ad.
- Initial house ad: GrandmasterChess.in.
- House ads do not bid, pay, win auctions, or consume commercial auction state.
- House ads must never replace a paid + approved scheduled ad.
- House-ad analytics are separated from paid advertiser analytics.

## Hard invariants
- One homepage ad live at a time.
- Every live slot is exactly 60 seconds.
- No overlap.
- Server/database is authoritative.
- No fabricated commercial impressions or clicks.
