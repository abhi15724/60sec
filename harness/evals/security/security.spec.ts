/**
 * @file /harness/evals/security/security.spec.ts
 * Evaluation suite for 60SEC Security & Authorization Rules (SEC-001 through SEC-007)
 */

import { describe, it, expect } from 'vitest';
import {
  assertUserCanModifyAd,
  assertBidIsImmutable,
  assertAdminAccess,
  validateSafeUrl,
  sanitizeClientAdCreationPayload,
  SecurityError,
} from '../../../src/core/security.ts';
import { Advertisement, Bid, User } from '../../../src/core/types.ts';

describe('SECURITY & AUTHORIZATION RULES EVALUATION', () => {
  const aliceUser: User = {
    id: 'user_alice_123',
    name: 'Alice Advertiser',
    email: 'alice@example.com',
    role: 'advertiser',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const bobUser: User = {
    id: 'user_bob_456',
    name: 'Bob Advertiser',
    email: 'bob@example.com',
    role: 'advertiser',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: User = {
    id: 'user_admin_999',
    name: 'Platform Admin',
    email: 'admin@60sec.com',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const aliceAd: Advertisement = {
    id: 'ad_alice_01',
    userId: 'user_alice_123',
    brandName: 'Alice Shoes',
    title: 'Autumn Collection',
    mediaUrl: 'https://cdn.example.com/shoes.jpg',
    mediaType: 'image/jpeg',
    websiteUrl: 'https://aliceshoes.com',
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("SEC-002: unauthorized user Bob cannot modify Alice's advertisement", () => {
    // Bob attempts to modify Alice's ad
    expect(() => assertUserCanModifyAd(bobUser, aliceAd)).toThrowError(
      /is not authorized to modify advertisement/i
    );

    // Alice is permitted to modify her own draft ad
    expect(() => assertUserCanModifyAd(aliceUser, aliceAd)).not.toThrow();

    // Admin is permitted to manage any ad
    expect(() => assertUserCanModifyAd(adminUser, aliceAd)).not.toThrow();
  });

  it('SEC-003: bids are immutable and cannot be tampered with or reassigned', () => {
    const recordedBid: Bid = {
      id: 'bid_rec_1',
      auctionId: 'auc_1',
      userId: 'user_alice_123',
      amount: 150.0,
      createdAt: new Date(),
    };

    // Attempting to change amount from 150 to 50
    expect(() =>
      assertBidIsImmutable(recordedBid, { amount: 50.0 })
    ).toThrowError(/Existing bids cannot be modified or updated/i);

    // Attempting to reassign user
    expect(() =>
      assertBidIsImmutable(recordedBid, { userId: 'user_bob_456' })
    ).toThrowError(/Bid ownership cannot be altered/i);
  });

  it('SEC-004: non-admin cannot perform administrative actions', () => {
    expect(() => assertAdminAccess(aliceUser)).toThrowError(/requires administrator privileges/i);
    expect(() => assertAdminAccess(adminUser)).not.toThrow();
  });

  it('SEC-006: rejects malicious URL protocols (XSS injection attempt)', () => {
    expect(() => validateSafeUrl('javascript:alert("hacked")')).toThrowError(/protocol 'javascript:' is prohibited/i);
    expect(() => validateSafeUrl('data:text/html,<script>alert(1)</script>')).toThrowError(/protocol 'data:' is prohibited/i);
    expect(validateSafeUrl('https://validbrand.com/sale')).toBe('https://validbrand.com/sale');
  });

  it('SEC-001: client-injected role, approvalStatus, or payment values are stripped/overridden', () => {
    const clientPayload = {
      brandName: 'Hacker Brand',
      title: 'Fake Title Promo',
      mediaUrl: 'https://cdn.example.com/promo.mp4',
      mediaType: 'video/mp4',
      websiteUrl: 'https://hackerbrand.com',
      // Injected attack parameters:
      role: 'admin',
      approvalStatus: 'APPROVED',
      status: 'ACTIVE',
    };

    const sanitized = sanitizeClientAdCreationPayload(clientPayload, aliceUser.id);

    expect(sanitized.userId).toBe('user_alice_123');
    expect(sanitized.status).toBe('DRAFT'); // Overridden to DRAFT
    expect(sanitized.approvalStatus).toBe('PENDING'); // Overridden to PENDING
    expect((sanitized as Record<string, unknown>).role).toBeUndefined(); // Role not accepted
  });
});
