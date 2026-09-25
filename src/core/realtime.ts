/**
 * 60SEC Realtime Broadcast & Outbid Notification Engine
 */

import { OutbidNotification } from './types.ts';

export type RealtimeEvent =
  | {
      type: 'BID_PLACED';
      auctionId: string;
      currentBid: number;
      minimumNextBid: number;
      anonymizedBidder: string;
      timestamp: Date;
    }
  | {
      type: 'AUCTION_CLOSED';
      auctionId: string;
      winnerId: string | null;
      winningBid: number | null;
      timestamp: Date;
    };

export function anonymizeUserId(userId: string): string {
  if (userId.length <= 4) {
    return 'User***';
  }
  return `${userId.slice(0, 3)}***${userId.slice(-2)}`;
}

export class RealtimeEventHub {
  private publicListeners = new Map<string, Array<(event: RealtimeEvent) => void>>();
  private userListeners = new Map<string, Array<(notification: OutbidNotification) => void>>();

  /**
   * Subscribe to public auction updates (e.g. bid counter changes)
   */
  public subscribeToAuction(auctionId: string, callback: (event: RealtimeEvent) => void): () => void {
    const list = this.publicListeners.get(auctionId) || [];
    list.push(callback);
    this.publicListeners.set(auctionId, list);

    return () => {
      const current = this.publicListeners.get(auctionId) || [];
      this.publicListeners.set(
        auctionId,
        current.filter((cb) => cb !== callback)
      );
    };
  }

  /**
   * Subscribe to private user notifications (e.g. outbid alerts)
   */
  public subscribeToUserNotifications(
    userId: string,
    callback: (notification: OutbidNotification) => void
  ): () => void {
    const list = this.userListeners.get(userId) || [];
    list.push(callback);
    this.userListeners.set(userId, list);

    return () => {
      const current = this.userListeners.get(userId) || [];
      this.userListeners.set(
        userId,
        current.filter((cb) => cb !== callback)
      );
    };
  }

  /**
   * Broadcasts public bid change
   */
  public broadcastBid(
    auctionId: string,
    currentBid: number,
    minimumNextBid: number,
    bidderUserId: string,
    timestamp: Date = new Date()
  ): void {
    const event: RealtimeEvent = {
      type: 'BID_PLACED',
      auctionId,
      currentBid,
      minimumNextBid,
      anonymizedBidder: anonymizeUserId(bidderUserId),
      timestamp,
    };

    const listeners = this.publicListeners.get(auctionId) || [];
    for (const listener of listeners) {
      listener(event);
    }
  }

  /**
   * Emits outbid notification strictly to the displaced user
   */
  public dispatchOutbidNotification(notification: OutbidNotification): void {
    const listeners = this.userListeners.get(notification.displacedUserId) || [];
    for (const listener of listeners) {
      listener(notification);
    }
  }
}
