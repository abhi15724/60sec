import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, json, requireMethod, requireUser } from '../_lib/cashfree';

const allowedMediaTypes = new Set(['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
function safeHttpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
    const { brandName, title, mediaUrl, mediaType, websiteUrl } = req.body || {};
    if (typeof brandName !== 'string' || !brandName.trim() || brandName.length > 120
      || typeof title !== 'string' || !title.trim() || title.length > 180
      || !safeHttpsUrl(mediaUrl) || !safeHttpsUrl(websiteUrl)
      || typeof mediaType !== 'string' || !allowedMediaTypes.has(mediaType)) {
      return json(res, 400, { error: 'INVALID_ADVERTISEMENT' });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('advertisements').insert({
      owner_id: user.id,
      brand_name: brandName.trim(),
      title: title.trim(),
      media_url: mediaUrl,
      media_type: mediaType,
      website_url: websiteUrl,
      approval_status: 'PENDING',
      ad_status: 'DRAFT',
      is_house_ad: false,
    }).select('id,brand_name,title,approval_status,ad_status').single();
    if (error) throw error;
    return json(res, 201, { advertisement: data });
  } catch (error) {
    console.error('Advertisement submission failed', (error as Error).message);
    return json(res, 500, { error: 'ADVERTISEMENT_SUBMISSION_FAILED' });
  }
}
