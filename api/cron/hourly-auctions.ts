import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json } from '../_lib/cashfree.js';

// Invoke from a trusted Vercel Cron schedule every minute.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) return json(res,401,{error:'UNAUTHORIZED'});
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('ensure_current_hourly_auctions',{p_now:new Date().toISOString()});
    if (error) throw error;
    return json(res,200,{ok:true,created:data,at:new Date().toISOString()});
  } catch (e) {
    console.error('Hourly auction generation failed',(e as Error).message);
    return json(res,500,{error:'AUCTION_GENERATION_FAILED'});
  }
}
