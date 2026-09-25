/**
 * @file /harness/evals/scheduling/scheduling.spec.ts
 * Evaluation suite for 60SEC Scheduling Rules (SCHED-001 through SCHED-007)
 */

import { describe, it, expect } from 'vitest';
import {
  validateSlotDuration,
  hasSlotCollision,
  bookNextScheduledSlot,
  SchedulingError,
} from '../../../src/core/scheduling.ts';
import { AdSchedule, Advertisement, PaymentRecord } from '../../../src/core/types.ts';

describe('SCHEDULING BUSINESS RULES EVALUATION', () => {
  const approvedAd: Advertisement = {
    id: 'ad_valid_01',
    userId: 'user_advertiser_1',
    brandName: 'ABC Shoes',
    title: 'Summer Flash Sale',
    mediaUrl: 'https://images.example.com/banner.webp',
    mediaType: 'image/webp',
    websiteUrl: 'https://abcshoes.com',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    createdAt: new Date('2026-09-25T08:00:00Z'),
    updatedAt: new Date('2026-09-25T08:30:00Z'),
  };

  const verifiedPayment: PaymentRecord = {
    id: 'pay_ver_01',
    auctionId: 'auc_101',
    userId: 'user_advertiser_1',
    amount: 175.0,
    paymentProvider: 'DEMO_MOCK',
    providerPaymentId: 'pay_mock_175',
    status: 'VERIFIED',
    paidAt: new Date('2026-09-25T10:10:00Z'),
    createdAt: new Date('2026-09-25T10:10:00Z'),
  };

  it('SCHED-001: slot duration is strictly 60 seconds', () => {
    const start = new Date('2026-09-25T20:42:00.000Z');
    const validEnd = new Date('2026-09-25T20:43:00.000Z');
    const invalidEnd59 = new Date('2026-09-25T20:42:59.000Z');
    const invalidEnd61 = new Date('2026-09-25T20:43:01.000Z');

    expect(validateSlotDuration(start, validEnd)).toBe(true);
    expect(validateSlotDuration(start, invalidEnd59)).toBe(false);
    expect(validateSlotDuration(start, invalidEnd61)).toBe(false);
  });

  it('SCHED-002: unpaid auction cannot be scheduled', () => {
    const pendingPayment: PaymentRecord = {
      ...verifiedPayment,
      status: 'PENDING',
      paidAt: undefined,
    };

    expect(() =>
      bookNextScheduledSlot({
        advertisement: approvedAd,
        payment: pendingPayment,
        existingSchedules: [],
        serverTime: new Date('2026-09-25T10:15:00Z'),
      })
    ).toThrowError(/Payment status is 'PENDING'. Must be 'VERIFIED'/i);
  });

  it('SCHED-002: unapproved advertisement cannot be scheduled', () => {
    const unapprovedAd: Advertisement = {
      ...approvedAd,
      approvalStatus: 'PENDING',
    };

    expect(() =>
      bookNextScheduledSlot({
        advertisement: unapprovedAd,
        payment: verifiedPayment,
        existingSchedules: [],
        serverTime: new Date('2026-09-25T10:15:00Z'),
      })
    ).toThrowError(/Ad approval status is 'PENDING'. Must be 'APPROVED'/i);
  });

  it('SCHED-003: detects and rejects overlapping broadcast slots', () => {
    const existingSlots: AdSchedule[] = [
      {
        id: 'sched_01',
        scheduleCode: 'AD60-20260925-000001',
        advertisementId: 'ad_prev',
        auctionId: 'auc_prev',
        startTime: new Date('2026-09-25T20:42:00.000Z'),
        endTime: new Date('2026-09-25T20:43:00.000Z'),
        durationSeconds: 60,
        status: 'SCHEDULED',
        createdAt: new Date('2026-09-25T10:00:00Z'),
      },
    ];

    // Overlapping attempt: starts at 20:42:30 (middle of sched_01)
    const overlappingStart = new Date('2026-09-25T20:42:30.000Z');
    const overlappingEnd = new Date('2026-09-25T20:43:30.000Z');
    expect(hasSlotCollision(existingSlots, overlappingStart, overlappingEnd)).toBe(true);

    // Adjacent non-overlapping: starts exactly at 20:43:00.000Z
    const adjacentStart = new Date('2026-09-25T20:43:00.000Z');
    const adjacentEnd = new Date('2026-09-25T20:44:00.000Z');
    expect(hasSlotCollision(existingSlots, adjacentStart, adjacentEnd)).toBe(false);
  });

  it('SCHED-005 & SCHED-006: appends deterministically to queue with unique format code', () => {
    const existingSlot: AdSchedule = {
      id: 'sched_prev',
      scheduleCode: 'AD60-20260925-000001',
      advertisementId: 'ad_prev',
      auctionId: 'auc_prev',
      startTime: new Date('2026-09-25T20:42:00.000Z'),
      endTime: new Date('2026-09-25T20:43:00.000Z'),
      durationSeconds: 60,
      status: 'SCHEDULED',
      createdAt: new Date('2026-09-25T10:00:00Z'),
    };

    const newSlot = bookNextScheduledSlot({
      advertisement: approvedAd,
      payment: verifiedPayment,
      existingSchedules: [existingSlot],
      serverTime: new Date('2026-09-25T20:00:00Z'),
      sequenceNumber: 2,
    });

    expect(newSlot.startTime.toISOString()).toBe('2026-09-25T20:43:00.000Z');
    expect(newSlot.endTime.toISOString()).toBe('2026-09-25T20:44:00.000Z');
    expect(newSlot.durationSeconds).toBe(60);
    expect(newSlot.scheduleCode).toBe('AD60-20260925-000002');
  });
});
