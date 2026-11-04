import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cashfreeRequest, getSupabaseAdmin, json, requireMethod, requireUser } from '../_lib/cashfree.js';
import { createHash } from 'node:crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
    const bidId = typeof req.body?.bidId === 'string' ? req.body.bidId : '';
    if (!bidId) return json(res, 400, { error: 'INVALID_BID_ID' });
    const db = getSupabaseAdmin();
    const { data: bid, error } = await db.from('hourly_bids')
      .select('id,auction_id,bidder_id,advertisement_id,amount,hourly_auctions(currency)')
      .eq('id', bidId).maybeSingle();
    if (error) throw error;
    if (!bid || bid.bidder_id !== user.id) return json(res, 404, { error: 'BID_NOT_FOUND' });
    const auction = Array.isArray(bid.hourly_auctions) ? bid.hourly_auctions[0] : bid.hourly_auctions;
    const currency = auction?.currency;
    if (!['INR','USD'].includes(currency)) return json(res, 409, { error: 'AUCTION_CURRENCY_INVALID' });
    const { data: ad, error: adError } = await db.from('advertisements')
      .select('id,owner_id,approval_status,ad_status,is_house_ad')
      .eq('id', bid.advertisement_id).maybeSingle();
    if (adError) throw adError;
    if (!ad || ad.owner_id !== user.id || ad.approval_status !== 'APPROVED' || ad.ad_status !== 'ACTIVE' || ad.is_house_ad) {
      return json(res, 409, { error: 'ADVERTISEMENT_NOT_ELIGIBLE' });
    }
    const { data: existing, error: existingError } = await db.from('hourly_payments')
      .select('provider_order_id,payment_session_id,status')
      .eq('bid_id', bidId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'PAID') return json(res, 409, { error: 'BID_ALREADY_PAID' });
    if (existing?.payment_session_id) return json(res, 200, {
      orderId: existing.provider_order_id, paymentSessionId: existing.payment_session_id, status: existing.status,
    });
    const phone = String(user.phone || user.user_metadata?.phone || '').replace(/\D/g, '');
    if (!user.email) return json(res, 400, { error: 'VERIFIED_CUSTOMER_EMAIL_REQUIRED' });
    if (!/^\d{10,12}$/.test(phone)) return json(res, 400, { error: 'VERIFIED_CUSTOMER_PHONE_REQUIRED' });
    const orderId = existing?.provider_order_id || `60h_${createHash('sha256').update(bidId).digest('hex').slice(0,24)}`;
    const origin = process.env.APP_URL || `https://${req.headers.host}`;
    const order = await cashfreeRequest('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': orderId },
      body: JSON.stringify({
        order_id: orderId, order_amount: Number(bid.amount), order_currency: currency,
        customer_details: { customer_id: user.id, customer_email: user.email, customer_phone: phone },
        order_meta: { return_url: `${origin}/?cashfree_order_id={order_id}`, notify_url: `${origin}/api/payments/webhook` },
        order_note: `60SEC hourly bid ${bidId} — one 60-second ad slot`,
      }),
    });
    const row = {
      auction_id: bid.auction_id, bid_id: bid.id, bidder_id: user.id, advertisement_id: bid.advertisement_id,
      amount: Number(bid.amount), currency, provider: 'CASHFREE', provider_order_id: orderId,
      payment_session_id: order.payment_session_id, status: 'PENDING',
    };
    const { error: saveError } = existing
      ? await db.from('hourly_payments').update({ payment_session_id: order.payment_session_id }).eq('bid_id', bidId)
      : await db.from('hourly_payments').insert(row);
    if (saveError) throw saveError;
    return json(res, 200, { orderId, paymentSessionId: order.payment_session_id, status: 'PENDING', amount: Number(bid.amount), currency });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error('Hourly Cashfree order creation failed', err.message);
    return json(res, err.status || 500, { error: 'ORDER_CREATION_FAILED' });
  }
}
