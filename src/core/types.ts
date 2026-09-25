/**
 * 60SEC Core Domain Types & Contracts
 */

export type UserRole = 'advertiser' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type AdApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AdStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface Advertisement {
  id: string;
  userId: string;
  brandName: string;
  title: string;
  mediaUrl: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';
  websiteUrl: string;
  status: AdStatus;
  approvalStatus: AdApprovalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AuctionStatus =
  | 'UPCOMING'
  | 'ACTIVE'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Auction {
  id: string;
  advertisementId?: string;
  startingBid: number; // strictly >= 1.00
  currentBid: number | null;
  currentBidderId: string | null;
  startTime: Date;
  endTime: Date;
  status: AuctionStatus;
  createdAt: Date;
}

export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;
  createdAt: Date;
}

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'REFUNDED';
export type PaymentProvider = 'RAZORPAY' | 'DEMO_MOCK';

export interface PaymentRecord {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;
  paymentProvider: PaymentProvider;
  providerPaymentId?: string;
  status: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
}

export type ScheduleStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface AdSchedule {
  id: string;
  scheduleCode: string;
  advertisementId: string;
  auctionId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: 60;
  status: ScheduleStatus;
  createdAt: Date;
}

export type AdEventType =
  | 'ad_loaded'
  | 'ad_viewable'
  | 'ad_started'
  | 'ad_completed'
  | 'ad_clicked';

export interface AdEvent {
  id: string;
  advertisementId: string;
  scheduleId?: string;
  eventType: AdEventType;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface OutbidNotification {
  type: 'OUTBID';
  auctionId: string;
  displacedUserId: string;
  previousBidAmount: number;
  newHighestBidAmount: number;
  minimumNextBid: number;
  timestamp: Date;
}
