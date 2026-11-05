import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from './_lib/cashfree.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const environment = process.env.CASHFREE_ENVIRONMENT || 'sandbox';
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const paymentCredentialsConfigured = Boolean(
    process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const paymentsEnabled = paymentCredentialsConfigured && (
    environment === 'sandbox'
    || (environment === 'production' && process.env.PAYMENTS_LIVE_ENABLED === 'true')
  );
  return json(res, 200, {
    configured,
    supabaseUrl: configured ? process.env.SUPABASE_URL : null,
    supabaseAnonKey: configured ? process.env.SUPABASE_ANON_KEY : null,
    paymentsEnabled,
    paymentEnvironment: environment,
  });
}
