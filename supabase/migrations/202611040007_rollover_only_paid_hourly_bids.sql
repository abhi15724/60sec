-- Carry forward only the highest successfully paid amount, never an unpaid checkout reservation.
create or replace function public.ensure_current_hourly_auctions(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  v_ist timestamp;
  v_day date;
  v_hour integer;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer:=0;
  v_currency text;
  v_previous numeric(14,2);
  v_starting numeric(14,2);
  v_previous_auction uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('60sec:hourly-auction-generator',0));
  v_ist:=p_now at time zone 'Asia/Kolkata';
  v_day:=v_ist::date;
  v_hour:=extract(hour from v_ist)::integer;
  v_start:=(v_day::text||' '||lpad(v_hour::text,2,'0')||':00:00')::timestamp at time zone 'Asia/Kolkata';
  v_end:=v_start+interval '1 hour';

  foreach v_currency in array array['INR','USD'] loop
    if v_hour=0 then
      v_starting:=1;
    else
      select id into v_previous_auction from public.hourly_auctions
       where currency=v_currency and operating_day=v_day and auction_hour=v_hour-1;
      select max(amount) into v_previous from public.hourly_payments
       where auction_id=v_previous_auction and status='PAID';
      select starting_bid into v_starting from public.hourly_auctions where id=v_previous_auction;
      v_starting:=coalesce(v_previous,v_starting,1);
    end if;

    insert into public.hourly_auctions(
      currency,operating_day,auction_hour,starts_at,ends_at,starting_bid,current_bid,status
    ) values(
      v_currency,v_day,v_hour,v_start,v_end,v_starting,v_starting,
      case when p_now>=v_start and p_now<v_end then 'ACTIVE' else 'UPCOMING' end
    ) on conflict(currency,operating_day,auction_hour) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;

  update public.hourly_auctions set status='CLOSED'
   where operating_day=v_day and auction_hour<v_hour and status<>'CLOSED';
  update public.hourly_auctions set status='ACTIVE'
   where operating_day=v_day and auction_hour=v_hour and status='UPCOMING' and starts_at<=p_now;
  return v_count;
end;
$$;
revoke all on function public.ensure_current_hourly_auctions(timestamptz) from public,anon,authenticated;
grant execute on function public.ensure_current_hourly_auctions(timestamptz) to service_role;
