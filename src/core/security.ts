/**
 * 60SEC Security & Policy Validation Engine
 * Enforces SEC-001 through SEC-007
 */

import { Advertisement, Bid, User } from './types.ts';

export class SecurityError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * SEC-002: Advertisement Ownership Check
 */
export function assertUserCanModifyAd(user: Readonly<User>, ad: Readonly<Advertisement>): void {
  if (user.role === 'admin') {
    return; // Admins can manage any ad
  }

  if (ad.userId !== user.id) {
    throw new SecurityError(
      'UNAUTHORIZED_AD_ACCESS',
      `User '${user.id}' is not authorized to modify advertisement '${ad.id}' owned by '${ad.userId}'.`
    );
  }

  if (ad.status !== 'DRAFT') {
    throw new SecurityError(
      'AD_NOT_MODIFIABLE',
      `Cannot modify advertisement in '${ad.status}' status. Only 'DRAFT' ads can be modified.`
    );
  }
}

/**
 * SEC-003: Bid Tamper Resistance & Immutability
 */
export function assertBidIsImmutable(
  existingBid: Readonly<Bid>,
  attemptedUpdate: Partial<Bid>
): void {
  if (attemptedUpdate.amount !== undefined && attemptedUpdate.amount !== existingBid.amount) {
    throw new SecurityError('BID_IMMUTABLE', 'Existing bids cannot be modified or updated.');
  }
  if (attemptedUpdate.userId !== undefined && attemptedUpdate.userId !== existingBid.userId) {
    throw new SecurityError('BID_IMMUTABLE', 'Bid ownership cannot be altered.');
  }
}

/**
 * SEC-004: Admin Role Access Guard
 */
export function assertAdminAccess(user: Readonly<User>): void {
  if (user.role !== 'admin') {
    throw new SecurityError('FORBIDDEN_ADMIN_ACCESS', 'This operation requires administrator privileges.');
  }
}

/**
 * SEC-006: URL Sanitization & Protocol Validation
 */
export function validateSafeUrl(urlStr: string): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SecurityError('INVALID_URL', 'The provided website URL is malformed.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityError(
      'UNSAFE_URL_PROTOCOL',
      `URL protocol '${parsed.protocol}' is prohibited. Only 'http:' and 'https:' are permitted.`
    );
  }

  return parsed.toString();
}

/**
 * SEC-001: Client Payload Sanitization
 * Strips any client-injected role, approvalStatus, or paymentStatus fields.
 */
export function sanitizeClientAdCreationPayload(
  payload: Record<string, unknown>,
  authenticatedUserId: string
): {
  userId: string;
  brandName: string;
  title: string;
  mediaUrl: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';
  websiteUrl: string;
  status: 'DRAFT';
  approvalStatus: 'PENDING';
} {
  const brandName = String(payload.brandName || '').trim();
  const title = String(payload.title || '').trim();
  const mediaUrl = validateSafeUrl(String(payload.mediaUrl || ''));
  const websiteUrl = validateSafeUrl(String(payload.websiteUrl || ''));
  const mediaType = payload.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';

  const validMediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
  if (!validMediaTypes.includes(mediaType)) {
    throw new SecurityError('INVALID_MEDIA_TYPE', `Media type '${mediaType}' is not supported.`);
  }

  if (brandName.length < 2 || brandName.length > 50) {
    throw new SecurityError('INVALID_BRAND_NAME', 'Brand name must be between 2 and 50 characters.');
  }

  if (title.length < 3 || title.length > 100) {
    throw new SecurityError('INVALID_TITLE', 'Ad title must be between 3 and 100 characters.');
  }

  // Force authoritative values
  return {
    userId: authenticatedUserId,
    brandName,
    title,
    mediaUrl,
    mediaType,
    websiteUrl,
    status: 'DRAFT',
    approvalStatus: 'PENDING',
  };
}
