import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json, verifyCashfreeWebhook } from '../_lib/cashfree';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    if (!verifyCashfreeWebhook(req)) return json(res, 401, { error: 'INVALID_WEBHOOK_SIGNATURE' });
    const raw = (req as VercelRequest & { rawBody?: Buffer }).rawBody;
    const payload = JSON.parse(raw!.toString('utf8'));
    const type = payload?.type;
    const orderId = payload?.data?.order?.order_id;
    const payment = payload?.data?.payment;
    if (type !== 'PAYMENT_SUCCESS_WEBHOOK' || !orderId || !payment?.cf_payment_id
      || payment.payment_status !== 'SUCCESS') {
      return json(res, 200, { received: true, ignored: true });
    }

    const supabase = getSupabaseAdmin();
    const { data: stored, error } = await supabase.from('payments')
      .select('provider_order_id,amount,currency,status')
      .eq('provider_order_id', orderId).maybeSingle();
    if (error) throw error;
    if (!stored) return json(res, 404, { error: 'UNKNOWN_ORDER' });

    // Check amounts/currency against our stored order before the atomic DB transition.
    if (Number(payment.payment_amount) !== Number(stored.amount)
      || payment.payment_currency !== stored.currency) {
      return json(res, 400, { error: 'PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH' });
    }
    const eventKey = `webhook:${orderId}:${payment.cf_payment_id}`;
    const { data: result, error: confirmError } = await supabase.rpc('confirm_cashfree_payment', {
      p_order_id: orderId,
      p_provider_payment_id: String(payment.cf_payment_id),
      p_event_key: eventKey,
    });
    if (confirmError) throw confirmError;
    return json(res, 200, { received: true, status: result?.status || 'PAID' });
  } catch (error) {
    console.error('Cashfree webhook processing failed', (error as Error).message);
    return json(res, 500, { error: 'WEBHOOK_PROCESSING_FAILED' });
  }
}
