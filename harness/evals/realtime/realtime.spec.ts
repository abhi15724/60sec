/**
 * @file /harness/evals/realtime/realtime.spec.ts
 * Evaluation suite for 60SEC Realtime Broadcast and Outbid Notification Invariants
 */

import { describe, it, expect } from 'vitest';
import { RealtimeEventHub, anonymizeUserId, RealtimeEvent } from '../../../src/core/realtime.ts';
import { OutbidNotification } from '../../../src/core/types.ts';

describe('REALTIME BROADCAST & NOTIFICATIONS EVALUATION', () => {
  it('anonymizes bidder IDs for public broadcasts', () => {
    expect(anonymizeUserId('user_alice_9988')).toBe('use***88');
    expect(anonymizeUserId('abc')).toBe('User***');
  });

  it('broadcasts bid events to all active auction subscribers', () => {
    const hub = new RealtimeEventHub();
    const auctionId = 'auc_live_777';

    const receivedEvents: RealtimeEvent[] = [];
    const unsubscribe = hub.subscribeToAuction(auctionId, (evt) => {
      receivedEvents.push(evt);
    });

    hub.broadcastBid(auctionId, 150, 151, 'user_bidder_xyz');

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe('BID_PLACED');
    if (receivedEvents[0].type === 'BID_PLACED') {
      expect(receivedEvents[0].currentBid).toBe(150);
      expect(receivedEvents[0].minimumNextBid).toBe(151);
      expect(receivedEvents[0].anonymizedBidder).toBe('use***yz');
    }

    unsubscribe();
    hub.broadcastBid(auctionId, 175, 176, 'user_bidder_next');
    // Listener was unsubscribed, so no new event
    expect(receivedEvents.length).toBe(1);
  });

  it('dispatches outbid notification strictly to the displaced user', () => {
    const hub = new RealtimeEventHub();

    const aliceNotifications: OutbidNotification[] = [];
    const bobNotifications: OutbidNotification[] = [];

    hub.subscribeToUserNotifications('user_alice_displaced', (notif) => {
      aliceNotifications.push(notif);
    });

    hub.subscribeToUserNotifications('user_bob_other', (notif) => {
      bobNotifications.push(notif);
    });

    const outbidAlert: OutbidNotification = {
      type: 'OUTBID',
      auctionId: 'auc_live_777',
      displacedUserId: 'user_alice_displaced',
      previousBidAmount: 100,
      newHighestBidAmount: 125,
      minimumNextBid: 126,
      timestamp: new Date(),
    };

    hub.dispatchOutbidNotification(outbidAlert);

    // Alice received her notification
    expect(aliceNotifications.length).toBe(1);
    expect(aliceNotifications[0].previousBidAmount).toBe(100);
    expect(aliceNotifications[0].newHighestBidAmount).toBe(125);
    expect(aliceNotifications[0].minimumNextBid).toBe(126);

    // Bob received zero notifications
    expect(bobNotifications.length).toBe(0);
  });
});
