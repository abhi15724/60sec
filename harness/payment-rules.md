# 60SEC Payment Processing Rules & Gateway Abstraction

This document defines the technical rules, verification flows, and gateway integration boundaries for payments on 60SEC.

---

## 1. Normative Rules Index

| Rule ID | Title | Summary |
|---|---|---|
| **PAYMENT-001** | Winning Is Not Paid | Winning an auction grants eligibility to pay, never an immediate schedule or broadcast. |
| **PAYMENT-002** | Mandatory Server Verification | Payment status is authoritative only when validated server-side via cryptographic signature / webhook. |
| **PAYMENT-003** | Exact Amount Matching | Verified payment amount must match the winning bid amount to the exact rupee. |
| **PAYMENT-004** | Webhook Idempotency | Multiple receipts of the same payment event must execute once and produce identical state. |
| **PAYMENT-005** | No Client-Controlled Status | Any client attempt to set `status = 'PAID'` or pass artificial payment tokens is rejected. |
| **PAYMENT-006** | Payment Window Expiry | Unpaid winning bids expire after the configured window (e.g. 15 minutes) and trigger recovery. |
| **PAYMENT-007** | Secret Key Isolation | Gateway secret keys (Razorpay Key Secret, webhook secrets) must never be bundled into client code. |
| **PAYMENT-008** | Distinct Demo Payment Mode | Development and sandbox modes must explicitly tag records as `DEMO_PAYMENT` with simulated signatures. |

---

## 2. Payment Lifecycle & State Machine

```text
[ AUCTION CLOSED ]
         ↓
Status: AUCTION_WON / PAYMENT_REQUIRED
Payment Window Opened (15 minutes)
         ↓
Advertiser Clicks "Pay Now"
Client invokes Server Action: `POST /api/payments/create-order`
Server creates order with Gateway (Razorpay/Mock) for exact winning amount
Server returns `order_id` and public `key_id` to client
         ↓
Advertiser Completes Checkout via Gateway Modal
Gateway returns `payment_id`, `order_id`, and `signature`
         ↓
Client submits proof to Server: `POST /api/payments/verify`
(OR Gateway sends direct asynchronous Server Webhook)
         ↓
Server verifies HMAC-SHA256 signature using SERVER-ONLY secret:
signature == HMAC_SHA256(order_id + "|" + payment_id, secret)
         ↓
IF Valid AND amount == winning_bid AND payment not already processed:
    Mark payment record: status = 'VERIFIED', paid_at = NOW()
    Mark auction record: status = 'PAID'
    Trigger Scheduler: scheduleAdSlot(advertisement_id, auction_id)
ELSE:
    Reject verification, log security anomaly.
```

---

## 3. Idempotency & Concurrency Guarantees

In payment systems, webhooks and user redirects can arrive concurrently or repeatedly. To enforce **PAYMENT-004**:

1. **Unique Provider Payment Constraint**:
   ```sql
   ALTER TABLE payments ADD CONSTRAINT unique_provider_payment_id UNIQUE (provider_payment_id);
   ```
2. **Idempotent Upsert Logic**:
   - If a payment verification is attempted for a `provider_payment_id` that is already `VERIFIED`:
     - Return HTTP 200 / success.
     - DO NOT call the slot scheduler again.
     - Return the existing `ad_schedule_id`.

---

## 4. Payment Gateway Interface (Abstraction)

To allow seamless transition between local development (Mock/Demo) and production (Razorpay), all payment handlers implement the `PaymentGatewayProvider` contract:

```typescript
export interface PaymentOrder {
  orderId: string;
  auctionId: string;
  userId: string;
  amount: number; // in INR rupees
  currency: 'INR';
  status: 'CREATED' | 'PAID' | 'EXPIRED';
}

export interface PaymentVerificationRequest {
  orderId: string;
  paymentId: string;
  signature: string;
  auctionId: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  orderId: string;
  paymentId: string;
  amountPaid: number;
  provider: 'RAZORPAY' | 'DEMO_MOCK';
  verifiedAt: Date;
  errorMessage?: string;
}

export interface PaymentGatewayProvider {
  createOrder(auctionId: string, userId: string, amount: number): Promise<PaymentOrder>;
  verifyPayment(request: PaymentVerificationRequest): Promise<PaymentVerificationResult>;
}
```

---

## 5. Security Checklist
- [x] No `RAZORPAY_KEY_SECRET` in `VITE_` or client bundles.
- [x] Payment verification checks signature, amount, and currency.
- [x] Database enforces non-null `paid_at` and `provider_payment_id` on verified records.
- [x] Unpaid winning bids do not reserve calendar slots.
