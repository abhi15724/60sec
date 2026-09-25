# 60SEC Testing & Evaluation Strategy

This document details the test harness, automated verification suite, and regression gating framework for 60SEC.

---

## 1. Test Automation Philosophy

Because 60SEC manages financial auctions and contiguous real-time broadcast schedules, testing is treated as an active runtime boundary rather than an afterthought.

The test suite in `/harness/evals/` directly executes business logic rules and fails immediately if any invariant is breached.

---

## 2. Evaluation Suite Matrix

| Test Suite File | Governing Spec | Verified Invariants |
|---|---|---|
| `harness/evals/auction/auction.spec.ts` | `auction-rules.md` | - Initial bid ₹1 starting baseline<br>- Strict superiority requirement ($\text{Bid} > \text{Current}$)<br>- Equal bid rejection<br>- Lower bid rejection<br>- Expired auction rejection against UTC clock<br>- Concurrent bid serialization without data loss<br>- Deterministic highest-bidder winner resolution<br>- Zero state mutation on rejected bids |
| `harness/evals/payment/payment.spec.ts` | `payment-rules.md` | - Winning does NOT set paid state<br>- Unverified or client-faked payment cannot activate ad<br>- Exact amount validation (winning bid vs payment amount)<br>- Idempotent webhook handling (duplicate payment callbacks produce single schedule) |
| `harness/evals/scheduling/scheduling.spec.ts` | `scheduling-rules.md` | - Exact 60-second broadcast duration ($\Delta t = 60000\text{ms}$)<br>- Unpaid auction cannot reserve calendar slot<br>- Unapproved advertisement cannot reserve calendar slot<br>- Overlapping slots strictly detected and rejected |
| `harness/evals/security/security.spec.ts` | `security-rules.md` | - Unauthorized user cannot modify another user's ad<br>- Unauthorized user cannot modify or cancel submitted bids<br>- Client cannot self-promote to admin role<br>- Client cannot inject verified payment status or custom schedule |
| `harness/evals/realtime/realtime.spec.ts` | `business-rules.md` | - Bid updates broadcast to public auction subscribers<br>- Real-time `OUTBID` notification delivered only to displaced leader<br>- Real-time closure halts bid ingestion immediately |

---

## 3. Running the Evaluations

### Execute All Evals (Headless Mode)
```bash
npm run test
```

### Watch Mode for Interactive Development
```bash
npx vitest harness/evals
```

### Type Verification
```bash
npm run lint
```

### Production Build Validation
```bash
npm run build
```

---

## 4. Evaluation Gate Protocol

Before merging any code change into main or production:
1. `npm run test` must exit with code 0 (100% passing tests).
2. `npm run lint` must pass with zero TypeScript errors.
3. `npm run build` must compile clean bundles without warnings.
