import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cashfreeRequest, getSupabaseAdmin, json, requireMethod, requireUser } from '../_lib/cashfree.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : '';
    if (!orderId || orderId.length > 64) return json(res, 400, { error: 'INVALID_ORDER_ID' });

    const supabase = getSupabaseAdmin();
    const { data: hourly, error: hourlyError } = await supabase.from('hourly_payments')
      .select('provider_order_id,bidder_id,amount,currency,status')
      .eq('provider_order_id', orderId).maybeSingle();
    if (hourlyError) throw hourlyError;
    const { data: payment, error } = hourly ? { data: hourly, error: null } : await supabase.from('payments')
      .select('provider_order_id,bidder_id,amount,currency,status').eq('provider_order_id', orderId).maybeSingle();
    if (error) throw error;
    if (!payment || payment.bidder_id !== user.id) return json(res, 404, { error: 'ORDER_NOT_FOUND' });

    // Fetch the order and its payments directly from Cashfree; never trust browser-reported status/amount.
    const [order, providerPayments] = await Promise.all([
      cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`),
      cashfreeRequest(`/orders/${encodeURIComponent(orderId)}/payments`),
    ]);
    const successful = Array.isArray(providerPayments)
      ? providerPayments.find((p: any) => p.payment_status === 'SUCCESS')
      : null;
    if (!successful || order.order_status !== 'PAID'
      || Number(order.order_amount) !== Number(payment.amount)
      || order.order_currency !== payment.currency
      || successful.payment_currency !== payment.currency
      || Number(successful.payment_amount) !== Number(payment.amount)) {
      return json(res, 202, { status: 'PENDING_VERIFICATION' });
    }

    const { data: result, error: confirmError } = await supabase.rpc(hourly ? 'confirm_hourly_cashfree_payment' : 'confirm_cashfree_payment', {
      p_order_id: orderId,
      p_provider_payment_id: String(successful.cf_payment_id),
      p_event_key: `verify:${orderId}:${successful.cf_payment_id}`,
    });
    if (confirmError) throw confirmError;
    return json(res, 200, { status: result?.status || 'PAID' });
  } catch (error) {
    console.error('Cashfree verification failed', (error as Error).message);
    return json(res, 500, { error: 'PAYMENT_VERIFICATION_FAILED' });
  }
}
