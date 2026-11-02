import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cashfreeRequest, getSupabaseAdmin, json, makeOrderId, requireMethod, requireUser } from '../_lib/cashfree';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
    const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId : '';
    if (!auctionId || auctionId.length > 128) return json(res, 400, { error: 'INVALID_AUCTION_ID' });

    const supabase = getSupabaseAdmin();
    const { data: auction, error: auctionError } = await supabase
      .from('auctions').select('id,currency,current_bid,current_bidder_id,status,advertisement_id,slot_number')
      .eq('id', auctionId).maybeSingle();
    if (auctionError) throw auctionError;
    if (!auction || auction.status !== 'AWAITING_PAYMENT') return json(res, 409, { error: 'AUCTION_NOT_PAYABLE' });
    if (auction.current_bidder_id !== user.id) return json(res, 403, { error: 'NOT_AUCTION_WINNER' });
    if (!auction.advertisement_id || !auction.current_bid || !['INR','USD'].includes(auction.currency)) {
      return json(res, 409, { error: 'AUCTION_MISSING_SETTLEMENT_DATA' });
    }

    const { data: ad, error: adError } = await supabase.from('advertisements')
      .select('id,owner_id,approval_status,ad_status,is_house_ad')
      .eq('id', auction.advertisement_id).maybeSingle();
    if (adError) throw adError;
    if (!ad || ad.owner_id !== user.id || ad.approval_status !== 'APPROVED' || ad.ad_status !== 'ACTIVE' || ad.is_house_ad) {
      return json(res, 409, { error: 'ADVERTISEMENT_NOT_ELIGIBLE' });
    }

    const { data: existing, error: existingError } = await supabase.from('payments')
      .select('provider_order_id,payment_session_id,status')
      .eq('auction_id', auctionId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'PAID') return json(res, 409, { error: 'ALREADY_PAID' });
    if (existing?.payment_session_id) return json(res, 200, {
      orderId: existing.provider_order_id, paymentSessionId: existing.payment_session_id, status: existing.status,
    });

    const customerPhone = String(user.phone || user.user_metadata?.phone || '').replace(/\\D/g, '');
    const customerEmail = user.email;
    if (!customerEmail) return json(res, 400, { error: 'VERIFIED_CUSTOMER_EMAIL_REQUIRED' });
    if (!/^\\d{10,12}$/.test(customerPhone)) {
      return json(res, 400, { error: 'VERIFIED_CUSTOMER_PHONE_REQUIRED' });
    }
    const orderId = makeOrderId(auctionId);
    const amount = Number(auction.current_bid);
    const origin = process.env.APP_URL || `https://${req.headers.host}`;
    const order = await cashfreeRequest('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': orderId },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: auction.currency,
        customer_details: {
          customer_id: user.id,
          customer_email: customerEmail,
          customer_phone: customerPhone
        },
        order_meta: {
          return_url: `${origin}/?cashfree_order_id={order_id}`,
          notify_url: `${origin}/api/payments/webhook`
        },
        order_note: `60SEC auction ${auctionId}`
      }),
    });
    const { error: insertError } = await supabase.from('payments').insert({
      auction_id: auctionId,
      bidder_id: user.id,
      advertisement_id: auction.advertisement_id,
      amount,
      currency: auction.currency,
      provider: 'CASHFREE',
      provider_order_id: orderId,
      payment_session_id: order.payment_session_id,
      status: 'PENDING',
    });
    if (insertError) throw insertError;
    return json(res, 200, { orderId, paymentSessionId: order.payment_session_id, status: 'PENDING' });
  } catch (error) {
    const e = error as Error & { status?: number; details?: unknown };
    console.error('Cashfree create order failed', e.message, e.details || '');
    return json(res, e.status || 500, { error: e.message === 'CASHFREE_API_ERROR' ? 'PAYMENT_PROVIDER_ERROR' : 'ORDER_CREATION_FAILED' });
  }
}
