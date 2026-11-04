import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json } from '../_lib/cashfree.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  try {
    const db=getSupabaseAdmin();
    const {error:ensureError}=await db.rpc('ensure_current_hourly_auctions');
    if (ensureError) throw ensureError;
    const [auctions,slots]=await Promise.all([
      db.from('hourly_auctions').select('id,currency,starting_bid,current_bid,status,starts_at,ends_at,operating_day,auction_hour').in('status',['ACTIVE','UPCOMING']).order('currency').order('starts_at').limit(4),
      db.from('hourly_public_billboard').select('id,auction_id,advertisement_id,bidder_id,currency,amount,queue_position,starts_at,ends_at,status,brand_name,title,media_url,media_type,website_url').order('starts_at',{ascending:true}).limit(100)
    ]);
    if (auctions.error || slots.error) throw auctions.error || slots.error;
    return json(res,200,{auctions:auctions.data||[],slots:slots.data||[]});
  } catch(e) {
    console.error('Hourly marketplace load failed',(e as Error).message);
    return json(res,503,{error:'HOURLY_MARKETPLACE_UNAVAILABLE'});
  }
}
