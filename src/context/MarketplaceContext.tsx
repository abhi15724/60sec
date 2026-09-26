/**
 * 60SEC Central Marketplace Context & State Provider
 * Model: ONE HOMEPAGE, ONE SCARCE AD SLOT, 60 SECONDS, ONE WINNING BRAND
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Advertisement,
  Auction,
  Bid,
  PaymentRecord,
  AdSchedule,
  AdEvent,
  User,
  OutbidNotification,
} from '../core/types.ts';
import {
  DEMO_USERS,
  INITIAL_ADS,
  INITIAL_AUCTIONS,
  INITIAL_BIDS,
  INITIAL_SCHEDULES,
  INITIAL_PAYMENTS,
  INITIAL_EVENTS,
  realtimeHub,
} from '../core/store.ts';
import {
  calculateMinimumNextBid,
  validateAndApplyBid,
  closeAuction,
  calculateOperatingDayStartingPrice,
  getOperatingDayKey,
  getSlotNumberInOperatingDay,
  getAuctionHourForSlot,
} from '../core/auction.ts';
import {
  getOperatingDayWindow,
} from '../core/scheduling.ts';
import {
  generateDemoPaymentSignature,
  verifyAuctionPayment,
} from '../core/payment.ts';
import {
  assertAtMostOneLiveAd,
  assertAtMostOneActiveNextSlotAuction,
  assertNoSlotOverlap,
  assertExactSixtySeconds,
} from '../core/slot.ts';
import {
  sanitizeClientAdCreationPayload,
  validateSafeUrl,
} from '../core/security.ts';

interface MarketplaceContextType {
  currentUser: User;
  switchUser: (role: 'advertiser' | 'admin') => void;
  ads: Advertisement[];
  nextSlotAuction: Auction | null;
  awaitingPaymentAuction: Auction | null;
  auctions: Auction[];
  bids: Bid[];
  schedules: AdSchedule[];
  payments: PaymentRecord[];
  events: AdEvent[];
  activeOutbidNotice: OutbidNotification | null;
  auctionTransitionNotice: AuctionTransitionNotice | null;
  dismissOutbidNotice: () => void;
  dismissTransitionNotice: () => void;
  currentLiveSchedule: AdSchedule | null;
  liveRemainingSeconds: number;
  auctionRemainingSeconds: number;

  // Actions
  placeBid: (amount: number, customAdId?: string) => { success: boolean; error?: string };
  simulateCompetingBid: () => void;
  closeActiveAuctionAndStartNext: () => { success: boolean; closedAuction?: Auction; newAuction?: Auction };
  createAdvertisement: (data: {
    brandName: string;
    title: string;
    mediaUrl: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';
    websiteUrl: string;
  }) => { success: boolean; ad?: Advertisement; error?: string };
  makePayment: (auctionId: string) => { success: boolean; schedule?: AdSchedule; error?: string };
  trackAdEvent: (advertisementId: string, eventType: AdEvent['eventType'], scheduleId?: string) => void;
  trackClickAndRedirect: (advertisementId: string, websiteUrl: string, scheduleId?: string) => void;
  getAuctionBids: (auctionId: string) => Bid[];
  getAdById: (adId?: string) => Advertisement | undefined;
  getUserBids: (userId: string) => Array<{ bid: Bid; auction: Auction; isHighest: boolean }>;
}

export interface AuctionTransitionNotice {
  closedAuctionId: string;
  winningBid: number | null;
  winnerName: string | null;
  newAuctionId: string;
  nextStartingBid: number;
  timestamp: Date;
}

const MarketplaceContext = createContext<MarketplaceContextType | null>(null);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(DEMO_USERS[0]); // Sarah Chen (advertiser)
  const [ads, setAds] = useState<Advertisement[]>(INITIAL_ADS);
  const [auctions, setAuctions] = useState<Auction[]>(INITIAL_AUCTIONS);
  const [bids, setBids] = useState<Bid[]>(INITIAL_BIDS);
  const [schedules, setSchedules] = useState<AdSchedule[]>(INITIAL_SCHEDULES);
  const [payments, setPayments] = useState<PaymentRecord[]>(INITIAL_PAYMENTS);
  const [events, setEvents] = useState<AdEvent[]>(INITIAL_EVENTS);
  const [activeOutbidNotice, setActiveOutbidNotice] = useState<OutbidNotification | null>(null);
  const [auctionTransitionNotice, setAuctionTransitionNotice] = useState<AuctionTransitionNotice | null>(null);

  const [currentLiveSchedule, setCurrentLiveSchedule] = useState<AdSchedule | null>(INITIAL_SCHEDULES[0]);
  const [liveRemainingSeconds, setLiveRemainingSeconds] = useState<number>(60);
  const [auctionRemainingSeconds, setAuctionRemainingSeconds] = useState<number>(3600);

  // Switch between advertiser and admin personas
  const switchUser = (role: 'advertiser' | 'admin') => {
    if (role === 'admin') {
      setCurrentUser(DEMO_USERS[3]);
    } else {
      setCurrentUser(DEMO_USERS[0]);
    }
  };

  const dismissOutbidNotice = () => {
    setActiveOutbidNotice(null);
  };

  const dismissTransitionNotice = useCallback(() => {
    setAuctionTransitionNotice(null);
  }, []);

  // Helper getters
  const getAdById = useCallback((adId?: string) => {
    if (!adId) return undefined;
    return ads.find((a) => a.id === adId);
  }, [ads]);

  // Strictly the single active auction open for bidding on the next slot
  const nextSlotAuction = auctions.find((a) => a.status === 'ACTIVE') || auctions[0] || null;

  // The latest won auction awaiting payment (prioritizing current user's won auction)
  const awaitingPaymentAuction =
    auctions.find((a) => a.status === 'AWAITING_PAYMENT' && a.currentBidderId === currentUser.id) ||
    auctions.find((a) => a.status === 'AWAITING_PAYMENT') ||
    null;

  const getAuctionBids = useCallback((auctionId: string) => {
    return bids
      .filter((b) => b.auctionId === auctionId)
      .sort((a, b) => b.amount - a.amount || b.createdAt.getTime() - a.createdAt.getTime());
  }, [bids]);

  const getUserBids = useCallback((userId: string) => {
    const userBidList = bids.filter((b) => b.userId === userId);
    return userBidList.map((bid) => {
      const auction = auctions.find((a) => a.id === bid.auctionId)!;
      const isHighest = auction ? auction.currentBidderId === userId : false;
      return { bid, auction, isHighest };
    });
  }, [bids, auctions]);

  // House ads are fallback inventory only. A paid + approved advertiser schedule always has priority.
  const getHouseAds = useCallback((currentAds: Advertisement[]) => {
    return currentAds.filter((ad) => ad.isHouseAd || ad.adType === 'HOUSE');
  }, []);

  const getNextHouseAd = useCallback((currentAds: Advertisement[], currentSchedules: AdSchedule[]) => {
    const houseAds = getHouseAds(currentAds);
    if (houseAds.length === 0) return undefined;

    const houseIds = new Set(houseAds.map((ad) => ad.id));
    const houseSlotsShown = currentSchedules.filter((schedule) => houseIds.has(schedule.advertisementId)).length;
    return houseAds[houseSlotsShown % houseAds.length];
  }, [getHouseAds]);

  // Factory to start the next auction. It does not assign a house ad to a paid auction.
  const startNextAuction = useCallback((currentAds: Advertisement[], now: Date = new Date(), previousAuction?: Auction | null): Auction => {
    const nextStart = now;
    const nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000); // one-hour auction
    const paidAuctionAds = currentAds.filter(
      (ad) => !(ad.isHouseAd || ad.adType === 'HOUSE') && ad.approvalStatus === 'APPROVED'
    );

    // Same operating day: continue from the previous closing price.
    // New operating day: reset to $1. The same rule applies across Hour 1 → Hour 12.
    const operatingDay = getOperatingDayKey(nextStart);
    const startingBid = calculateOperatingDayStartingPrice(operatingDay, previousAuction);
    const slotNumber = getSlotNumberInOperatingDay(
      previousAuction?.slotNumber ? previousAuction.slotNumber + 1 : 1
    );

    return {
      id: `auc_slot_${nextStart.getTime()}`,
      advertisementId: paidAuctionAds[0]?.id,
      operatingDay,
      auctionHour: getAuctionHourForSlot(slotNumber),
      slotNumber,
      startingBid,
      currentBid: null,
      currentBidderId: null,
      startTime: nextStart,
      endTime: nextEnd,
      status: 'ACTIVE',
      createdAt: nextStart,
    };
  }, []);

  // Explicitly close current active auction and immediately start the other/next auction (60SEC Admin Only)
  const closeActiveAuctionAndStartNext = useCallback(() => {
    if (currentUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only 60SEC administrators can close active auctions early.' };
    }

    const now = new Date();
    let closedResult: Auction | undefined;
    let newResult: Auction | undefined;

    setAuctions((prevAuctions) => {
      const active = prevAuctions.find((a) => a.status === 'ACTIVE');
      // Inherit the active auction's ending price for the new auction
      const newAuction = startNextAuction(ads, now, active);
      newResult = newAuction;

      if (active) {
        // Authoritatively close active auction
        const closed = closeAuction({ ...active, endTime: now }, now);
        closedResult = closed;

        const winner = DEMO_USERS.find((u) => u.id === closed.currentBidderId);
        setAuctionTransitionNotice({
          closedAuctionId: active.id,
          winningBid: closed.currentBid,
          winnerName: winner ? winner.name : (closed.currentBidderId ? 'Verified Advertiser' : null),
          newAuctionId: newAuction.id,
          nextStartingBid: newAuction.startingBid,
          timestamp: now,
        });

        return [newAuction, ...prevAuctions.map((a) => (a.id === active.id ? closed : a))];
      } else {
        return [newAuction, ...prevAuctions];
      }
    });

    return { success: true, closedAuction: closedResult, newAuction: newResult };
  }, [ads, currentUser.role, startNextAuction]);

  // Master Clock & Broadcast Engine Tick (Runs every 1 second)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();
      const operatingWindow = getOperatingDayWindow(now);

      // 1. Advance the single live homepage schedule and update liveRemainingSeconds actively every second
      setSchedules((prevSchedules) => {
        const liveSlot = prevSchedules.find((s) => s.status === 'LIVE');

        if (!operatingWindow) {
          if (liveSlot) {
            const completed = prevSchedules.map((s) =>
              s.id === liveSlot.id ? { ...s, status: 'COMPLETED' as const, endTime: now } : s
            );
            setCurrentLiveSchedule(null);
            setLiveRemainingSeconds(0);
            return completed;
          }
          setCurrentLiveSchedule(null);
          setLiveRemainingSeconds(0);
          return prevSchedules;
        }

        if (liveSlot && nowMs >= liveSlot.endTime.getTime()) {
          // Current 60-second broadcast completed!
          const updated = prevSchedules.map((s) =>
            s.id === liveSlot.id ? { ...s, status: 'COMPLETED' as const } : s
          );

          // Find the next scheduled sequential slot in queue
          const nextSlot = updated.find(
            (s) => s.status === 'SCHEDULED' && s.startTime.getTime() <= nowMs + 1000
          );
          if (nextSlot) {
            const slotStart = now;
            const slotEnd = new Date(slotStart.getTime() + 60 * 1000);
            const activated = updated.map((s) =>
              s.id === nextSlot.id ? { ...s, status: 'LIVE' as const, startTime: slotStart, endTime: slotEnd } : s
            );
            const newLive = activated.find((s) => s.status === 'LIVE') || null;
            setCurrentLiveSchedule(newLive);
            setLiveRemainingSeconds(60);
            return activated;
          } else {
            // Next sequential continuous 60s broadcast slot
            const operatingDay = getOperatingDayKey(now);
            const lastSameDaySlot = updated
              .filter((s) => s.operatingDay === operatingDay && typeof s.slotNumber === 'number')
              .reduce((max, s) => Math.max(max, s.slotNumber || 0), 0);
            const slotSeqNum = lastSameDaySlot + 1;
            const scheduleCode = `SLOT-${String(slotSeqNum).padStart(3, '0')}`;
            // Until a real paid advertiser is scheduled, rotate the two house ads.
            const nextPaidSlot = updated.find((s) => {
              const ad = ads.find((item) => item.id === s.advertisementId);
              return s.status === 'SCHEDULED' && ad && !(ad.isHouseAd || ad.adType === 'HOUSE');
            });
            const nextAd = nextPaidSlot
              ? ads.find((ad) => ad.id === nextPaidSlot.advertisementId)
              : getNextHouseAd(ads, updated);
            const slotStart = now;
            const slotEnd = new Date(slotStart.getTime() + 60 * 1000);

            const autoSlot: AdSchedule = {
              id: `sched_slot_${nowMs}`,
              scheduleCode,
              advertisementId: nextAd?.id || INITIAL_ADS.find((ad) => ad.isHouseAd || ad.adType === 'HOUSE')?.id || INITIAL_ADS[0].id,
              auctionId: `auc_slot_${nowMs}`,
              operatingDay: operatingDay || undefined,
              auctionHour: operatingDay ? getAuctionHourForSlot(slotSeqNum) : undefined,
              slotNumber: operatingDay ? slotSeqNum : undefined,
              startTime: slotStart,
              endTime: slotEnd,
              durationSeconds: 60,
              status: 'LIVE',
              createdAt: slotStart,
            };
            setCurrentLiveSchedule(autoSlot);
            setLiveRemainingSeconds(60);
            return [...updated, autoSlot];
          }
        } else if (liveSlot) {
          const rem = Math.max(0, liveSlot.endTime.getTime() - nowMs);
          const secs = Math.max(0, Math.ceil(rem / 1000));
          setLiveRemainingSeconds(secs);
          setCurrentLiveSchedule(liveSlot);
        } else {
          // Fallback if no live slot exists
          const slotStart = now;
          const slotEnd = new Date(slotStart.getTime() + 60 * 1000);
          const operatingDay = getOperatingDayKey(now);
          const lastSameDaySlot = prevSchedules
            .filter((s) => s.operatingDay === operatingDay && typeof s.slotNumber === 'number')
            .reduce((max, s) => Math.max(max, s.slotNumber || 0), 0);
          const slotSeqNum = lastSameDaySlot + 1;
          const firstSlot: AdSchedule = {
            id: `sched_live_${nowMs}`,
            scheduleCode: `SLOT-${String(slotSeqNum).padStart(3, '0')}`,
            advertisementId: getNextHouseAd(ads, prevSchedules)?.id || INITIAL_ADS.find((ad) => ad.isHouseAd || ad.adType === 'HOUSE')?.id || INITIAL_ADS[0].id,
            auctionId: 'auc_live_001',
            operatingDay: operatingDay || undefined,
            auctionHour: operatingDay ? getAuctionHourForSlot(slotSeqNum) : undefined,
            slotNumber: operatingDay ? slotSeqNum : undefined,
            startTime: slotStart,
            endTime: slotEnd,
            durationSeconds: 60,
            status: 'LIVE',
            createdAt: slotStart,
          };
          setCurrentLiveSchedule(firstSlot);
          setLiveRemainingSeconds(60);
          return [firstSlot, ...prevSchedules];
        }

        return prevSchedules;
      });

      // 2. Check the active next-slot auction expiry & update auctionRemainingSeconds
      setAuctions((prevAuctions) => {
        const active = prevAuctions.find((a) => a.status === 'ACTIVE');

        if (!operatingWindow) {
          if (active) {
            const closed = closeAuction({ ...active, endTime: now }, now);
            return prevAuctions.map((a) => (a.id === active.id ? closed : a));
          }
          setAuctionRemainingSeconds(0);
          return prevAuctions;
        }

        if (active && nowMs >= active.endTime.getTime()) {
          // Authoritatively close active auction, then continue at the previous closing price.
          const closed = closeAuction(active, now);
          const newAuction = startNextAuction(ads, now, active);

          const winner = DEMO_USERS.find((u) => u.id === closed.currentBidderId);
          setAuctionTransitionNotice({
            closedAuctionId: active.id,
            winningBid: closed.currentBid,
            winnerName: winner ? winner.name : (closed.currentBidderId ? 'Verified Advertiser' : null),
            newAuctionId: newAuction.id,
            nextStartingBid: newAuction.startingBid,
            timestamp: now,
          });

          setAuctionRemainingSeconds(3600);
          return [newAuction, ...prevAuctions.map((a) => (a.id === active.id ? closed : a))];
        } else if (active) {
          const rem = Math.max(0, active.endTime.getTime() - nowMs);
          setAuctionRemainingSeconds(Math.max(0, Math.ceil(rem / 1000)));
        } else {
          setAuctionRemainingSeconds(0);
        }

        // If somehow no auction is ACTIVE, start one inheriting from the latest auction!
        const hasActive = prevAuctions.some((a) => a.status === 'ACTIVE');
        if (!hasActive && prevAuctions.length > 0 && operatingWindow) {
          const lastAuction = prevAuctions[0];
          const newAuction = startNextAuction(ads, now, lastAuction);
          setAuctionRemainingSeconds(60);
          return [newAuction, ...prevAuctions];
        }

        return prevAuctions;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ads, startNextAuction, getNextHouseAd]);

  // Automated simulated settlement for competing demo winners after 4 seconds
  useEffect(() => {
    const competitorAwaiting = auctions.find(
      (a) => a.status === 'AWAITING_PAYMENT' && a.currentBidderId && a.currentBidderId !== currentUser.id
    );
    if (!competitorAwaiting) return;

    const timeout = setTimeout(() => {
      makePayment(competitorAwaiting.id);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [auctions, currentUser.id]);

  // Invariant verification on state change
  useEffect(() => {
    try {
      assertAtMostOneLiveAd(schedules);
      assertAtMostOneActiveNextSlotAuction(auctions);
      assertNoSlotOverlap(schedules);
    } catch {
      // Invariant assertion guard
    }
  }, [schedules, auctions]);

  // Telemetry event logging
  const trackAdEvent = useCallback((advertisementId: string, eventType: AdEvent['eventType'], scheduleId?: string) => {
    const newEvent: AdEvent = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      advertisementId,
      scheduleId,
      eventType,
      sessionId: `sess_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date(),
    };
    setEvents((prev) => [...prev, newEvent]);
  }, []);

  // Outbound click tracking
  const trackClickAndRedirect = useCallback((advertisementId: string, websiteUrl: string, scheduleId?: string) => {
    trackAdEvent(advertisementId, 'ad_clicked', scheduleId);
    const safe = validateSafeUrl(websiteUrl);
    window.open(safe, '_blank', 'noopener,noreferrer');
  }, [trackAdEvent]);

  // Place a Bid on the single next-slot auction
  const placeBid = useCallback((amount: number, customAdId?: string) => {
    const activeAuction = auctions.find((a) => a.status === 'ACTIVE');
    if (!activeAuction) {
      return { success: false, error: 'No active auction open for the next 60-second slot.' };
    }

    try {
      const result = validateAndApplyBid(
        activeAuction,
        { userId: currentUser.id, amount },
        new Date()
      );

      // If user provided a specific ad creative for this bid, bind it
      const updatedAuction = customAdId
        ? { ...result.updatedAuction, advertisementId: customAdId }
        : result.updatedAuction;

      setBids((prev) => [result.recordedBid, ...prev]);
      setAuctions((prev) =>
        prev.map((a) => (a.id === activeAuction.id ? updatedAuction : a))
      );

      realtimeHub.broadcastBid(
        activeAuction.id,
        amount,
        calculateMinimumNextBid(amount, activeAuction.startingBid),
        currentUser.id
      );

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to place bid';
      return { success: false, error: message };
    }
  }, [auctions, currentUser]);

  // Simulate a competing bidder outbidding on this single scarce slot
  const simulateCompetingBid = useCallback(() => {
    const activeAuction = auctions.find((a) => a.status === 'ACTIVE');
    if (!activeAuction) return;

    const minNext = calculateMinimumNextBid(activeAuction.currentBid, activeAuction.startingBid);
    const competingAmount = minNext + Math.floor(Math.random() * 12) + 2;
    const competingUser = DEMO_USERS[1]; // Vikram

    try {
      const result = validateAndApplyBid(
        activeAuction,
        { userId: competingUser.id, amount: competingAmount },
        new Date()
      );

      setBids((prev) => [result.recordedBid, ...prev]);
      setAuctions((prev) =>
        prev.map((a) => (a.id === activeAuction.id ? result.updatedAuction : a))
      );

      // If current user was leading, trigger outbid alert
      if (activeAuction.currentBidderId === currentUser.id && result.outbidNotification) {
        setActiveOutbidNotice(result.outbidNotification);
      }
    } catch {
      // ignore
    }
  }, [auctions, currentUser]);

  // Create Advertisement
  const createAdvertisement = useCallback((data: {
    brandName: string;
    title: string;
    mediaUrl: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';
    websiteUrl: string;
  }) => {
    try {
      const sanitized = sanitizeClientAdCreationPayload(data, currentUser.id);
      const newAd: Advertisement = {
        id: `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: sanitized.userId,
        adType: 'COMMERCIAL',
        isHouseAd: false,
        brandName: sanitized.brandName,
        title: sanitized.title,
        mediaUrl: sanitized.mediaUrl,
        mediaType: sanitized.mediaType,
        websiteUrl: sanitized.websiteUrl,
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setAds((prev) => [newAd, ...prev]);
      return { success: true, ad: newAd };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid advertisement submission';
      return { success: false, error: msg };
    }
  }, [currentUser]);

  // Payment Execution & Sequential Non-Overlapping Slot Assignment
  const makePayment = useCallback((auctionId: string) => {
    const auction = auctions.find((a) => a.id === auctionId);
    if (!auction) {
      return { success: false, error: 'Auction not found' };
    }

    if (auction.status !== 'AWAITING_PAYMENT') {
      return { success: false, error: `Auction is in '${auction.status}' status, payment is not required.` };
    }

    const ad = ads.find((a) => a.id === auction.advertisementId);
    if (!ad) {
      return { success: false, error: 'Associated advertisement creative missing.' };
    }

    const orderId = `order_${Date.now()}`;
    const providerPaymentId = `pay_mock_${Date.now()}`;
    const secret = 'prod_mock_gateway_key';
    const signature = generateDemoPaymentSignature(orderId, providerPaymentId, secret);

    try {
      // 1. Verify Payment server-side
      const verifyRes = verifyAuctionPayment(
        auction,
        {
          orderId,
          providerPaymentId,
          signature,
          amountReported: auction.currentBid!,
        },
        secret
      );

      // 2. Determine sequential slot start time:
      // Slots cannot overlap. Start exactly when the latest scheduled/live slot ends!
      let latestEndMs = Date.now();
      for (const s of schedules) {
        if ((s.status === 'SCHEDULED' || s.status === 'LIVE') && s.endTime.getTime() > latestEndMs) {
          latestEndMs = s.endTime.getTime();
        }
      }

      const slotStartTime = new Date(latestEndMs);
      const slotEndTime = new Date(slotStartTime.getTime() + 60 * 1000);
      assertExactSixtySeconds({ startTime: slotStartTime, endTime: slotEndTime });

      const slotSeqNum = schedules.length + 1;
      const scheduleCode = `SLOT-${String(slotSeqNum).padStart(3, '0')}`;

      const newSlot: AdSchedule = {
        id: `sched_${Date.now()}`,
        scheduleCode,
        advertisementId: ad.id,
        auctionId: auction.id,
        startTime: slotStartTime,
        endTime: slotEndTime,
        durationSeconds: 60,
        status: schedules.some((s) => s.status === 'LIVE') ? 'SCHEDULED' : 'LIVE',
        createdAt: new Date(),
      };

      assertNoSlotOverlap([...schedules, newSlot]);

      // Update state
      setPayments((prev) => [verifyRes.paymentRecord, ...prev]);
      setSchedules((prev) => [...prev, newSlot]);

      // Update auction to PAID. If there isn't already an ACTIVE auction running, start one!
      setAuctions((prev) => {
        const updated = prev.map((a) => (a.id === auctionId ? { ...a, status: 'PAID' as const } : a));
        const hasActive = updated.some((a) => a.status === 'ACTIVE');
        if (!hasActive) {
          const payingAuction = prev.find((a) => a.id === auctionId);
          const subsequentAuction = startNextAuction(ads, new Date(), payingAuction);
          return [subsequentAuction, ...updated];
        }
        return updated;
      });

      return { success: true, schedule: newSlot };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment verification failed';
      return { success: false, error: msg };
    }
  }, [auctions, ads, schedules, startNextAuction]);

  return (
    <MarketplaceContext.Provider
      value={{
        currentUser,
        switchUser,
        ads,
        nextSlotAuction,
        awaitingPaymentAuction,
        auctions,
        bids,
        schedules,
        payments,
        events,
        activeOutbidNotice,
        auctionTransitionNotice,
        dismissOutbidNotice,
        dismissTransitionNotice,
        currentLiveSchedule,
        liveRemainingSeconds,
        auctionRemainingSeconds,
        placeBid,
        simulateCompetingBid,
        closeActiveAuctionAndStartNext,
        createAdvertisement,
        makePayment,
        trackAdEvent,
        trackClickAndRedirect,
        getAuctionBids,
        getAdById,
        getUserBids,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
};

export const useMarketplace = () => {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) {
    throw new Error('useMarketplace must be used within MarketplaceProvider');
  }
  return ctx;
};
