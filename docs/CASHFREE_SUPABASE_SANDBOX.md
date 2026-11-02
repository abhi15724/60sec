# 60SEC Cashfree + Supabase Payments

## Environments and live-payment safety

- Preview should use Cashfree Sandbox credentials and `CASHFREE_ENVIRONMENT=sandbox`.
- Production uses Cashfree Production credentials and `CASHFREE_ENVIRONMENT=production`.
- Live order creation is additionally blocked unless `PAYMENTS_LIVE_ENABLED=true`. Leave it unset/false until production acceptance checks are complete.
- Do not reuse Sandbox credentials in Production. Keep client secret and Supabase service-role key server-side only.
- Cashfree production API base URL: `https://api.cashfree.com/pg`; Sandbox: `https://sandbox.cashfree.com/pg`.
- Confirm with Cashfree that the merchant account is activated for production and which currencies/cross-border payments are enabled. Do not assume USD processing or settlement is enabled.

## Vercel environment variables

**Preview**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive; server-side only)
- `CASHFREE_CLIENT_ID` (Sandbox)
- `CASHFREE_CLIENT_SECRET` (Sandbox; sensitive)
- `CASHFREE_ENVIRONMENT=sandbox`
- `PAYMENTS_LIVE_ENABLED=false` (or unset)
- `APP_URL=https://<preview-domain>`

**Production**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive; server-side only)
- `CASHFREE_CLIENT_ID` (Production credentials)
- `CASHFREE_CLIENT_SECRET` (Production; sensitive)
- `CASHFREE_ENVIRONMENT=production`
- `PAYMENTS_LIVE_ENABLED=false` until signed-off
- `APP_URL=https://60sec.vercel.app`

Never prefix secrets with `VITE_`; never commit credentials. The code defaults to Sandbox if the environment is omitted and refuses live requests unless the explicit live-payment switch is true.

## Database and identity prerequisites

1. Apply `supabase/migrations/202611020001_cashfree_payments.sql` to the intended Supabase project. Verify the schema and RPCs exist before deploying payment traffic.
2. Configure Supabase Auth and real advertiser accounts.
3. Require verified 10–12 digit phone numbers before Cashfree Checkout.
4. Seed approved advertiser rows, active auctions, and accepted bids through a trusted admin process. Do not seed real auctions from browser localStorage.
5. Ensure Production Vercel variables point to the intended Production Supabase project, not a test project.

## API

- `POST /api/auctions/place-bid` — Supabase bearer token; body: `{ "auctionId": "...", "advertisementId": "...", "amount": 123 }`.
- `POST /api/payments/create-order` — Supabase bearer token; body: `{ "auctionId": "..." }`. Amount, currency, winner and ad eligibility are loaded from Supabase.
- `POST /api/payments/verify` — Supabase bearer token; body: `{ "orderId": "..." }`. Verifies order/payment with Cashfree and confirms through the atomic database function.
- `POST /api/payments/webhook` — Cashfree signed webhook. Configure separate webhook endpoints in Cashfree Sandbox and Production dashboards, both pointing to `/api/payments/webhook` on the corresponding deployment.

Webhook signature verification requires the exact raw request body. Confirm the Vercel function receives the raw bytes unchanged and test a real signed Sandbox webhook before production. Dashboard “test endpoint” requests without Cashfree signature headers are expected to be rejected.

## Integration boundary / known blockers

The current UI still contains demo users and localStorage auction state. Those are not authoritative authentication or auction records. Wire the UI to Supabase Auth, database-backed auctions/bids, and Cashfree JS Checkout before taking payments. Do not enable live payments while the UI still relies on mock settlement.

The create-order handler currently permits INR and USD auction metadata. This does not prove Cashfree has enabled either currency for this merchant, nor does it validate cross-border settlement. Until Cashfree confirms the account's permitted currencies and a complete real-money test is approved, do not enable USD live payments.

The create-order path also needs production-grade idempotency/concurrency review: a provider order is created before the payment row insert, so concurrent retries or database failure can leave an orphaned provider order. Resolve this before turning on live traffic.

## Acceptance checklist before setting PAYMENTS_LIVE_ENABLED=true

- Cashfree Production account activation and credentials confirmed in dashboard.
- Production webhook URL saved with payment success/failure events; signed production delivery verified.
- Production Supabase migration applied and schema/RPCs reviewed.
- Production Supabase Auth login and advertiser ownership checks tested.
- Production Vercel environment variables verified without exposing secrets.
- Unauthenticated and non-winning advertiser requests rejected.
- Amount/currency mismatch, duplicate webhook, failed/pending payment, and replay tests pass.
- Exactly one 60-second slot is created for one confirmed payment.
- Create-order concurrency/idempotency race fixed and tested.
- Cashfree confirms the currencies and settlement methods enabled for this merchant.
- Real-money launch approved by the account owner after low-value controlled verification.
