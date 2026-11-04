create or replace view public.hourly_public_billboard as
select s.id,s.auction_id,s.advertisement_id,s.bidder_id,s.currency,s.amount,
       s.queue_position,s.starts_at,s.ends_at,s.status,
       ad.brand_name,ad.title,ad.media_url,ad.media_type,ad.website_url
from public.hourly_ad_slots s
join public.advertisements ad on ad.id=s.advertisement_id
where s.status in ('SCHEDULED','LIVE')
  and ad.approval_status='APPROVED' and ad.ad_status='ACTIVE';
grant select on public.hourly_public_billboard to anon, authenticated;
