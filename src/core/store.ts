/**
 * 60SEC Single Homepage Slot Inventory & Seed State
 * Model: ONE HOMEPAGE, ONE SCARCE AD SLOT, 60 SECONDS, ONE WINNING BRAND
 */

import {
  Advertisement,
  Auction,
  Bid,
  PaymentRecord,
  AdSchedule,
  AdEvent,
  User,
} from './types.ts';
import { RealtimeEventHub } from './realtime.ts';

export const realtimeHub = new RealtimeEventHub();

export const DEMO_USERS: User[] = [
  {
    id: 'user_advertiser_current',
    name: 'Sarah Chen',
    email: 'sarah@aurorabrand.com',
    role: 'advertiser',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  },
  {
    id: 'user_competing_1',
    name: 'Vikram Malhotra',
    email: 'vikram@shoesdaily.in',
    role: 'advertiser',
    createdAt: new Date('2026-09-02T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
  },
  {
    id: 'user_competing_2',
    name: 'Elena Rostova',
    email: 'elena@technova.io',
    role: 'advertiser',
    createdAt: new Date('2026-09-03T00:00:00Z'),
    updatedAt: new Date('2026-09-03T00:00:00Z'),
  },
  {
    id: 'user_admin_super',
    name: 'Admin Desk',
    email: 'desk@60sec.market',
    role: 'admin',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  },
];

export const INITIAL_ADS: Advertisement[] = [
  {
    id: 'ad_abc_shoes',
    userId: 'system_60sec',
    adType: 'HOUSE',
    isHouseAd: true,
    brandName: 'ABC Shoes',
    title: 'AirStride Ultra — Flat 40% OFF Today',
    mediaUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1600&q=85',
    mediaType: 'image/jpeg',
    websiteUrl: 'https://abcshoes.com',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    createdAt: new Date(Date.now() - 3600 * 1000 * 5),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 4),
  },
  {
    id: 'ad_house_grandmasterchess',
    userId: 'system_60sec',
    adType: 'HOUSE',
    isHouseAd: true,
    brandName: 'GrandmasterChess',
    title: 'BEAT THE GRANDMASTER AI',
    mediaUrl: 'https://www.grandmasterchess.in/og-image.png',
    mediaType: 'image/png',
    websiteUrl: 'https://www.grandmasterchess.in/',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    createdAt: new Date(Date.now() - 3600 * 1000 * 3),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 2),
  },
  {
    id: 'ad_aurora',
    userId: 'user_advertiser_current',
    brandName: 'Aurora Audio',
    title: 'Studio Spatial ANC Wireless Headphones',
    mediaUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1600&q=85',
    mediaType: 'image/jpeg',
    websiteUrl: 'https://auroraaudio.com',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    createdAt: new Date(Date.now() - 3600 * 1000 * 2),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 1),
  },
  {
    id: 'ad_technova',
    userId: 'user_competing_2',
    brandName: 'TechNova Cloud',
    title: 'Zero Latency Global Compute Network',
    mediaUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85',
    mediaType: 'image/jpeg',
    websiteUrl: 'https://technova.io',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    createdAt: new Date(Date.now() - 3600 * 1000 * 8),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 6),
  },
];

const nowMs = Date.now();

// Exactly ONE currently LIVE homepage slot (starts with full 60 seconds remaining):
const liveStart = new Date(Math.floor(nowMs / 1000) * 1000);
const liveEnd = new Date(liveStart.getTime() + 60 * 1000); // exactly 60s total, 60s remaining

// Next sequential slots (Strictly non-overlapping, contiguous queue)
const slot2Start = new Date(liveEnd.getTime());
const slot2End = new Date(slot2Start.getTime() + 60 * 1000);

export const INITIAL_SCHEDULES: AdSchedule[] = [
  {
    id: 'sched_live_001',
    scheduleCode: 'SLOT-001',
    advertisementId: 'ad_abc_shoes',
    auctionId: 'auc_past_1',
    startTime: liveStart,
    endTime: liveEnd,
    durationSeconds: 60,
    status: 'LIVE',
    createdAt: new Date(nowMs - 3600 * 1000),
  },
];

// Exactly ONE active auction for the NEXT 60-second homepage slot:
export const INITIAL_AUCTIONS: Auction[] = [
  {
    id: 'auc_next_homepage_slot',
    advertisementId: 'ad_aurora',
    startingBid: 1.0,
    currentBid: 127.0,
    currentBidderId: 'user_competing_1',
    startTime: new Date(nowMs),
    endTime: new Date(nowMs + 60 * 1000), // exactly 60 seconds remaining
    status: 'ACTIVE',
    createdAt: new Date(nowMs - 120 * 1000),
  },
];

export const INITIAL_BIDS: Bid[] = [
  { id: 'b_1', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_2', amount: 1.0, createdAt: new Date(nowMs - 110 * 1000) },
  { id: 'b_2', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_1', amount: 25.0, createdAt: new Date(nowMs - 90 * 1000) },
  { id: 'b_3', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_2', amount: 50.0, createdAt: new Date(nowMs - 75 * 1000) },
  { id: 'b_4', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_1', amount: 80.0, createdAt: new Date(nowMs - 55 * 1000) },
  { id: 'b_5', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_2', amount: 100.0, createdAt: new Date(nowMs - 35 * 1000) },
  { id: 'b_6', auctionId: 'auc_next_homepage_slot', userId: 'user_competing_1', amount: 127.0, createdAt: new Date(nowMs - 15 * 1000) },
];

export const INITIAL_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay_hist_01',
    auctionId: 'auc_past_1',
    userId: 'user_competing_1',
    amount: 127.0,
    paymentProvider: 'DEMO_MOCK',
    providerPaymentId: 'pay_mock_829141',
    status: 'VERIFIED',
    paidAt: new Date(nowMs - 3600 * 1000),
    createdAt: new Date(nowMs - 3600 * 1000),
  },
];

export const INITIAL_EVENTS: AdEvent[] = [
  { id: 'ev_1', advertisementId: 'ad_abc_shoes', eventType: 'ad_loaded', sessionId: 'sess_1', timestamp: new Date(nowMs - 18 * 1000) },
  { id: 'ev_2', advertisementId: 'ad_abc_shoes', eventType: 'ad_viewable', sessionId: 'sess_1', timestamp: new Date(nowMs - 17 * 1000) },
  { id: 'ev_3', advertisementId: 'ad_abc_shoes', eventType: 'ad_started', sessionId: 'sess_1', timestamp: new Date(nowMs - 18 * 1000) },
];
