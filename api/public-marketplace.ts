import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json, requireMethod } from './_lib/cashfree.js';

// Public, read-only storefront data. Never return bidder identities, owner IDs,
// payment records, private drafts, or authentication data from this endpoint.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  try {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();
    const [auctionResult, slotResult] = await Promise.all([
      db.from('auctions')
        .select('id,currency,starting_bid,current_bid,status,ends_at,slot_number')
        .in('status', ['ACTIVE', 'AWAITING_PAYMENT'])
        .gt('ends_at', now)
        .order('ends_at', { ascending: true })
        .limit(30),
      db.from('ad_slots')
        .select('id,starts_at,ends_at,status,slot_number,advertisements!inner(brand_name,title,media_url,media_type,website_url,approval_status,ad_status,is_house_ad)')
        .in('status', ['LIVE', 'SCHEDULED'])
        .order('starts_at', { ascending: true })
        .limit(30),
    ]);
    if (auctionResult.error) throw auctionResult.error;
    if (slotResult.error) throw slotResult.error;

    const slots = (slotResult.data || []).filter((slot: any) => {
      const ad = Array.isArray(slot.advertisements) ? slot.advertisements[0] : slot.advertisements;
      return ad && ad.approval_status === 'APPROVED' && ad.ad_status === 'ACTIVE';
    }).map((slot: any) => {
      const ad = Array.isArray(slot.advertisements) ? slot.advertisements[0] : slot.advertisements;
      return {
        id: slot.id, startsAt: slot.starts_at, endsAt: slot.ends_at,
        status: slot.status, slotNumber: slot.slot_number,
        ad: { brandName: ad.brand_name, title: ad.title, mediaUrl: ad.media_url,
          mediaType: ad.media_type, websiteUrl: ad.website_url },
      };
    });

    return json(res, 200, {
      auctions: (auctionResult.data || []).map((auction: any) => ({
        id: auction.id, currency: auction.currency, startingBid: auction.starting_bid,
        currentBid: auction.current_bid, status: auction.status,
        endsAt: auction.ends_at, slotNumber: auction.slot_number,
      })),
      slots,
    });
  } catch (error) {
    console.error('PUBLIC_MARKETPLACE_ERROR', error);
    return json(res, 500, { error: 'Unable to load the public marketplace.' });
  }
}
