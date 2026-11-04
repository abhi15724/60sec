import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cashfreeRequest, getSupabaseAdmin, json, requireMethod, requireUser } from '../_lib/cashfree.js';

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
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('place_hourly_bid', {
      p_auction_id: auctionId, p_bidder_id: user.id, p_advertisement_id: advertisementId, p_amount: amount,
    });
    if (error) {
      const code = ['AUCTION_NOT_ACTIVE','ADVERTISEMENT_NOT_ELIGIBLE','BID_TOO_LOW','PAYMENT_PENDING'].find(x => error.message.includes(x));
      if (code) return json(res, 409, { error: code });
      throw error;
    }
    const bidResult = data as { bid_id: string; order_id: string; amount: number; currency: string; minimum_next_bid: number };
    const phone = String(user.phone || user.user_metadata?.phone || '').replace(/\\D/g, '');
    if (!user.email || !/^\\d{10,12}$/.test(phone)) {
      await db.rpc('fail_hourly_cashfree_payment', { p_order_id: bidResult.order_id });
      return json(res, 400, { error: !user.email ? 'VERIFIED_CUSTOMER_EMAIL_REQUIRED' : 'VERIFIED_CUSTOMER_PHONE_REQUIRED' });
    }
    try {
      const origin = process.env.APP_URL || `https://${req.headers.host}`;
      const order = await cashfreeRequest('/orders', {
        method: 'POST',
        headers: { 'x-idempotency-key': bidResult.order_id },
        body: JSON.stringify({
          order_id: bidResult.order_id, order_amount: Number(bidResult.amount), order_currency: bidResult.currency,
          customer_details: { customer_id: user.id, customer_email: user.email, customer_phone: phone },
          order_meta: { return_url: `${origin}/?cashfree_order_id={order_id}`, notify_url: `${origin}/api/payments/webhook` },
          order_note: `60SEC bid ${bidResult.bid_id} — one 60-second ad slot`,
        }),
      });
      const { error: saveError } = await db.from('hourly_payments')
        .update({ payment_session_id: order.payment_session_id })
        .eq('bid_id', bidResult.bid_id);
      if (saveError) throw saveError;
      return json(res, 200, {
        status: 'PAYMENT_REQUIRED', bidId: bidResult.bid_id, orderId: bidResult.order_id,
        paymentSessionId: order.payment_session_id, amount: bidResult.amount, currency: bidResult.currency,
        minimumNextBid: bidResult.minimum_next_bid,
      });
    } catch (orderError) {
      await db.rpc('fail_hourly_cashfree_payment', { p_order_id: bidResult.order_id });
      throw orderError;
    }
  } catch (e) {
    console.error('Hourly bid placement failed', (e as Error).message);
    return json(res, 500, { error: 'BID_PLACEMENT_FAILED' });
  }
}
