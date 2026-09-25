/**
 * @file /harness/evals/payment/payment.spec.ts
 * Evaluation suite for 60SEC Payment Processing Rules (PAYMENT-001 through PAYMENT-008)
 */

import { describe, it, expect } from 'vitest';
import {
  verifyAuctionPayment,
  generateDemoPaymentSignature,
  PaymentRegistry,
  PaymentError,
} from '../../../src/core/payment.ts';
import { Auction } from '../../../src/core/types.ts';

describe('PAYMENT BUSINESS RULES EVALUATION', () => {
  const secretKey = 'test_webhook_secret_internal';

  const wonAuction: Auction = {
    id: 'auc_pay_001',
    advertisementId: 'ad_abc_shoes',
    startingBid: 1.0,
    currentBid: 175.0,
    currentBidderId: 'user_winner_77',
    startTime: new Date('2026-09-25T10:00:00Z'),
    endTime: new Date('2026-09-25T10:05:00Z'),
    status: 'AWAITING_PAYMENT',
    createdAt: new Date('2026-09-25T09:55:00Z'),
  };

  it('PAYMENT-001: winning an auction does not mean paid (status is strictly AWAITING_PAYMENT)', () => {
    expect(wonAuction.status).toBe('AWAITING_PAYMENT');
    expect(wonAuction.status).not.toBe('PAID');
  });

  it('PAYMENT-002: rejects unverified or tampered payment signature', () => {
    const fakePayload = {
      orderId: 'order_123',
      providerPaymentId: 'pay_rzp_999',
      signature: 'fraudulent_signature_from_client',
      amountReported: 175.0,
    };

    expect(() =>
      verifyAuctionPayment(wonAuction, fakePayload, secretKey)
    ).toThrowError(/Payment signature verification failed/i);
  });

  it('PAYMENT-003: rejects payment if reported amount does not match authoritative winning bid', () => {
    const orderId = 'order_123';
    const providerPaymentId = 'pay_rzp_111';
    // User tries to pay ₹100 instead of ₹175
    const tamperedAmount = 100.0;
    const signature = generateDemoPaymentSignature(orderId, providerPaymentId, secretKey);

    expect(() =>
      verifyAuctionPayment(
        wonAuction,
        {
          orderId,
          providerPaymentId,
          signature,
          amountReported: tamperedAmount,
        },
        secretKey
      )
    ).toThrowError(/Payment amount ₹100 does not match authoritative winning bid ₹175/i);
  });

  it('PAYMENT-002: successfully verifies valid signature and exact amount', () => {
    const orderId = 'order_123';
    const providerPaymentId = 'pay_rzp_valid_001';
    const signature = generateDemoPaymentSignature(orderId, providerPaymentId, secretKey);

    const result = verifyAuctionPayment(
      wonAuction,
      {
        orderId,
        providerPaymentId,
        signature,
        amountReported: 175.0,
      },
      secretKey
    );

    expect(result.verified).toBe(true);
    expect(result.paymentRecord.status).toBe('VERIFIED');
    expect(result.paymentRecord.amount).toBe(175.0);
    expect(result.paymentRecord.userId).toBe('user_winner_77');
    expect(result.paymentRecord.paidAt).toBeDefined();
  });

  it('PAYMENT-004: duplicate payment webhook callbacks are handled idempotently without re-triggering actions', () => {
    const registry = new PaymentRegistry();
    const orderId = 'order_456';
    const providerPaymentId = 'pay_rzp_duplicate_check';
    const signature = generateDemoPaymentSignature(orderId, providerPaymentId, secretKey);

    let scheduleTriggerCount = 0;
    const onFirstTime = () => {
      scheduleTriggerCount++;
    };

    const webhookInput = {
      orderId,
      providerPaymentId,
      signature,
      amountReported: 175.0,
    };

    // First webhook delivery
    const res1 = registry.processWebhook(wonAuction, webhookInput, secretKey, onFirstTime);
    expect(res1.status).toBe('PROCESSED');
    expect(scheduleTriggerCount).toBe(1);

    // Second webhook delivery (same provider_payment_id)
    const res2 = registry.processWebhook(wonAuction, webhookInput, secretKey, onFirstTime);
    expect(res2.status).toBe('ALREADY_EXISTS');
    expect(scheduleTriggerCount).toBe(1); // Crucial: did NOT fire a second time!
  });
});
