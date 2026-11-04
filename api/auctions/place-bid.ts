import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json, requireMethod, requireUser } from '../_lib/cashfree.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
    const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId : '';
    const advertisementId = typeof req.body?.advertisementId === 'string' ? req.body.advertisementId : '';
    const amount = req.body?.amount;
    if (!auctionId || !advertisementId || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: 'INVALID_BID' });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('place_auction_bid', {
      p_auction_id: auctionId,
      p_bidder_id: user.id,
      p_advertisement_id: advertisementId,
      p_amount: amount,
    });
    if (error) {
      const known = ['AUCTION_NOT_ACTIVE', 'ADVERTISEMENT_NOT_ELIGIBLE', 'BID_TOO_LOW'];
      const message = known.find((code) => error.message.includes(code));
      if (message) return json(res, 409, { error: message });
      throw error;
    }
    return json(res, 200, data);
  } catch (error) {
    console.error('Bid placement failed', (error as Error).message);
    return json(res, 500, { error: 'BID_PLACEMENT_FAILED' });
  }
}
