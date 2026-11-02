import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const apiVersion = '2023-08-01';

export function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string) {
  if (req.method !== method) {
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  return true;
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(req: VercelRequest) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user;
}

/**
 * Production payments require an explicit kill-switch opt-in in Vercel.
 * Keep CASHFREE_ENVIRONMENT=sandbox for Preview and set production only
 * after production credentials and the live webhook have been configured.
 */
export function cashfreeBaseUrl() {
  const environment = process.env.CASHFREE_ENVIRONMENT || 'sandbox';
  if (environment === 'sandbox') return 'https://sandbox.cashfree.com/pg';
  if (environment === 'production') {
    if (process.env.PAYMENTS_LIVE_ENABLED !== 'true') {
      throw new Error('Live Cashfree payments are disabled; set PAYMENTS_LIVE_ENABLED=true only after production readiness checks');
    }
    return 'https://api.cashfree.com/pg';
  }
  throw new Error('CASHFREE_ENVIRONMENT must be sandbox or production');
}

export async function cashfreeRequest(path: string, init: RequestInit = {}) {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Cashfree credentials are not configured');
  const response = await fetch(`${cashfreeBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': apiVersion,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('CASHFREE_API_ERROR') as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload as Record<string, any>;
}

export function verifyCashfreeWebhook(req: VercelRequest, raw: Buffer) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  if (typeof signature !== 'string' || typeof timestamp !== 'string') return false;
  if (!Buffer.isBuffer(raw)) return false;
  const expected = createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET || '')
    .update(timestamp + raw.toString('utf8'))
    .digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeOrderId(auctionId: string) {
  // Stable per auction: retries and concurrent requests must address one provider order.
  const digest = createHash('sha256').update(auctionId).digest('hex').slice(0, 24);
  return `60s_${digest}`;
}
