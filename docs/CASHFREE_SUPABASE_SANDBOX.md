# 60SEC Cashfree + Supabase Sandbox

## Security model

- Supabase Auth identifies the advertiser. API handlers verify the bearer token with Supabase Auth.
- The service-role key is used only in Vercel serverless functions. Never expose it with a `VITE_` prefix.
- Auction amount, currency, winner, and advertisement eligibility are read from Supabase; the browser submits only an auction ID.
- Cashfree Checkout receives a server-created `payment_session_id`.
- A payment is not confirmed from a browser redirect. The verify endpoint fetches the order and payments from Cashfree; the webhook verifies Cashfree's HMAC signature over timestamp + exact raw request body.
- A database RPC locks auction/payment rows, checks winner/amount/currency/ad eligibility, and atomically creates one exactly-60-second slot. Unique constraints and webhook event keys provide idempotency.
- This integration is Sandbox-only. Production is deliberately rejected by the API helper.

## Required Vercel Preview environment variables

Set these in **Preview** only:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET` (secret; server-side only)
- `CASHFREE_ENVIRONMENT=sandbox`
- `APP_URL=https://<your-preview-domain>`

Do not add any of these as `VITE_*` variables. Do not commit secrets.

## Supabase setup

1. Apply `supabase/migrations/202611020001_cashfree_payments.sql` to the Supabase project.
2. Configure Supabase Auth and create real advertiser accounts.
3. Require advertisers to have a verified 10–12 digit phone number in Supabase Auth metadata/phone before starting Cashfree Checkout.
4. Seed approved advertiser rows, active auctions, and accepted bids through a trusted admin process. Do not seed real auctions from browser localStorage.
5. Set the matching Vercel Preview variables and redeploy the Preview deployment.

## API

- `POST /api/auctions/place-bid` — Authorization: Bearer Supabase access token; body: `{ "auctionId": "...", "advertisementId": "...", "amount": 123 }`. A database transaction locks the auction, validates the active window and approved advertiser-owned ad, checks the minimum increment, and records the bid.
- `POST /api/payments/create-order` — Authorization: Bearer Supabase access token; body: `{ "auctionId": "..." }`. Returns order ID and Cashfree payment session ID.
- `POST /api/payments/verify` — Authorization: Bearer Supabase access token; body: `{ "orderId": "..." }`. Fetches order/payment status from Cashfree and confirms through the atomic database function.
- `POST /api/payments/webhook` — Cashfree webhook endpoint. Configure it in Cashfree Sandbox. It requires Vercel to expose the exact raw body as `req.rawBody`; if the deployment runtime does not provide it, configure a raw-body middleware before enabling the webhook.

## Important integration boundary

The current 60SEC UI still uses demo users and localStorage for auction state. Those values are not valid authentication or authoritative auction records. The new API intentionally rejects requests without a real Supabase Auth session and matching database rows. Wire the UI to Supabase Auth, database-backed auctions/bids, and Cashfree JS Checkout only after those real records and credentials exist. Do not re-enable the old mock payment path for live settlement.

## Sandbox acceptance checklist

- Unauthenticated create-order and verify requests return 401.
- A non-winning advertiser cannot create or verify another user's order.
- Amount/currency are read from the locked auction/payment record and checked against Cashfree.
- Duplicate webhook delivery does not create duplicate payments/slots.
- A failed, pending, mismatched, or unsigned payment never reserves a slot.
- A successful payment creates exactly one 60-second slot and transitions the auction to PAID.
