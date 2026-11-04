-- Continuous 24x7 IST auction cycle creation and public currency-separated leaderboards.
create or replace function public.ensure_current_hourly_auctions(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_ist timestamp;
  v_day date;
  v_hour integer;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
  v_currency text;
  v_previous numeric(14,2);
  v_starting numeric(14,2);
begin
  perform pg_advisory_xact_lock(hashtextextended('60sec:hourly-auction-generator',0));
  v_ist := p_now at time zone 'Asia/Kolkata';
  v_day := v_ist::date;
  v_hour := extract(hour from v_ist)::integer;
  v_start := (v_day::text || ' ' || lpad(v_hour::text,2,'0') || ':00:00')::timestamp at time zone 'Asia/Kolkata';
  v_end := v_start + interval '1 hour';

  foreach v_currency in array array['INR','USD'] loop
    if v_hour = 0 then
      v_starting := 1;
    else
      select current_bid into v_previous
      from public.hourly_auctions
      where currency=v_currency and operating_day=v_day and auction_hour=v_hour-1
      for update;
      v_starting := coalesce(v_previous,1);
    end if;

    insert into public.hourly_auctions(currency,operating_day,auction_hour,starts_at,ends_at,starting_bid,current_bid,status)
    values (v_currency,v_day,v_hour,v_start,v_end,v_starting,v_starting,
      case when p_now >= v_start and p_now < v_end then 'ACTIVE' else 'UPCOMING' end)
    on conflict(currency,operating_day,auction_hour) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  update public.hourly_auctions
     set status='CLOSED'
   where operating_day=v_day and auction_hour < v_hour and status <> 'CLOSED';
  update public.hourly_auctions
     set status='ACTIVE'
   where operating_day=v_day and auction_hour=v_hour and status='UPCOMING' and starts_at<=p_now;
  return v_count;
end;
$$;

revoke all on function public.ensure_current_hourly_auctions(timestamptz) from public, anon, authenticated;
grant execute on function public.ensure_current_hourly_auctions(timestamptz) to service_role;

create or replace view public.hourly_bid_leaderboard as
select
  a.currency,
  b.bidder_id,
  ad.brand_name,
  ad.title as product_name,
  ad.website_url as product_link,
  max(b.amount) as highest_bid,
  count(*) as bids_placed,
  max(b.created_at) as last_bid_at
from public.hourly_bids b
join public.hourly_auctions a on a.id=b.auction_id
join public.advertisements ad on ad.id=b.advertisement_id
group by a.currency,b.bidder_id,ad.brand_name,ad.title,ad.website_url;

grant select on public.hourly_bid_leaderboard to anon, authenticated;
