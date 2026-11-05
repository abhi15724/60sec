-- 60SEC perpetual auction engine: 24/7 hourly cycles, 60 one-minute slot auctions per hour.
-- Safe additive migration. Market-local operating days reset each currency's starting bid.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.auction_market_settings (
  currency text primary key check (currency in ('INR','USD')),
  market_timezone text not null,
  starting_bid numeric(14,2) not null check (starting_bid > 0),
  bid_increment numeric(14,2) not null check (bid_increment > 0),
  inventory_minutes_ahead integer not null default 1440 check (inventory_minutes_ahead between 120 and 2880),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.auction_market_settings(currency,market_timezone,starting_bid,bid_increment)
values ('INR','Asia/Kolkata',1,1),('USD','UTC',1,1)
on conflict (currency) do update
set starting_bid=excluded.starting_bid,bid_increment=excluded.bid_increment,updated_at=now();

create table if not exists public.auction_cycles (
  id text primary key,
  currency text not null references public.auction_market_settings(currency),
  operating_day date not null,
  hour_index smallint not null check (hour_index between 0 and 23),
  market_timezone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'UPCOMING' check (status in ('UPCOMING','ACTIVE','COMPLETED')),
  created_at timestamptz not null default now(),
  unique(currency,operating_day,hour_index),
  check (ends_at - starts_at = interval '1 hour')
);

alter table public.auctions
  add column if not exists cycle_id text references public.auction_cycles(id),
  add column if not exists starts_at timestamptz,
  add column if not exists market_timezone text;

-- Replace the legacy 720-slot constraint and currency-blind daily uniqueness.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid='public.auctions'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%slot_number%'
  loop
    execute format('alter table public.auctions drop constraint %I',r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid='public.auctions'::regclass and contype='u'
      and pg_get_constraintdef(oid) ilike '%operating_day%'
      and pg_get_constraintdef(oid) ilike '%slot_number%'
  loop
    execute format('alter table public.auctions drop constraint %I',r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid='public.ad_slots'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%slot_number%'
  loop
    execute format('alter table public.ad_slots drop constraint %I',r.conname);
  end loop;
end $$;

alter table public.auctions
  add constraint auctions_slot_number_1_1440 check (slot_number between 1 and 1440),
  add constraint auctions_currency_day_slot_unique unique(currency,operating_day,slot_number);

alter table public.ad_slots
  add constraint ad_slots_slot_number_1_1440 check (slot_number between 1 and 1440);

update public.auctions
set market_timezone = case when currency='INR' then 'Asia/Kolkata' else 'UTC' end,
    starts_at = coalesce(starts_at, ends_at - interval '1 minute')
where market_timezone is null or starts_at is null;

create index if not exists auctions_status_starts_at_idx
  on public.auctions(status,starts_at);
create index if not exists auctions_currency_day_slot_idx
  on public.auctions(currency,operating_day,slot_number);
create index if not exists auction_cycles_start_idx
  on public.auction_cycles(starts_at,status);

-- Every row in public.auctions is one 60-second slot auction.
-- Every auction_cycles row is its parent one-hour auction containing 60 slots.
create or replace function public.ensure_auction_inventory(p_minutes_ahead integer default 1440)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  m record;
  i integer;
  v_local_now timestamp;
  v_first_minute timestamp;
  v_local_slot timestamp;
  v_local_hour timestamp;
  v_slot_start timestamptz;
  v_cycle_start timestamptz;
  v_day date;
  v_slot integer;
  v_hour integer;
  v_cycle_id text;
  v_inserted integer := 0;
  v_count integer;
begin
  if p_minutes_ahead < 120 or p_minutes_ahead > 2880 then
    raise exception 'INVALID_INVENTORY_HORIZON';
  end if;

  for m in select * from public.auction_market_settings where enabled order by currency loop
    v_local_now := now() at time zone m.market_timezone;
    v_first_minute := date_trunc('minute',v_local_now);

    for i in 0..p_minutes_ahead-1 loop
      v_local_slot := v_first_minute + make_interval(mins => i);
      v_local_hour := date_trunc('hour',v_local_slot);
      v_day := v_local_slot::date;
      v_hour := extract(hour from v_local_slot)::integer;
      v_slot := v_hour * 60 + extract(minute from v_local_slot)::integer + 1;
      v_cycle_id := m.currency || ':' || to_char(v_day,'YYYYMMDD') || ':' || lpad(v_hour::text,2,'0');
      v_slot_start := v_local_slot at time zone m.market_timezone;
      v_cycle_start := v_local_hour at time zone m.market_timezone;

      insert into public.auction_cycles(id,currency,operating_day,hour_index,market_timezone,starts_at,ends_at,status)
      values (v_cycle_id,m.currency,v_day,v_hour,m.market_timezone,v_cycle_start,
              v_cycle_start + interval '1 hour',
              case when v_cycle_start <= now() and v_cycle_start + interval '1 hour' > now()
                   then 'ACTIVE' else 'UPCOMING' end)
      on conflict (currency,operating_day,hour_index) do nothing;

      insert into public.auctions(
        id,currency,starting_bid,current_bid,current_bidder_id,status,ends_at,
        advertisement_id,operating_day,slot_number,cycle_id,starts_at,market_timezone
      )
      values (
        m.currency || ':' || to_char(v_day,'YYYYMMDD') || ':' || lpad(v_slot::text,4,'0'),
        m.currency,m.starting_bid,null,null,
        case when v_slot_start <= now() and v_slot_start + interval '1 minute' > now()
             then 'ACTIVE' else 'UPCOMING' end,
        v_slot_start + interval '1 minute',null,v_day,v_slot,v_cycle_id,v_slot_start,m.market_timezone
      )
      on conflict (currency,operating_day,slot_number) do nothing;

      get diagnostics v_count = row_count;
      v_inserted := v_inserted + v_count;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

create or replace function public.run_auction_clock()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_created integer;
  v_activated integer;
  v_closed integer;
begin
  v_created := public.ensure_auction_inventory(1440);

  update public.auctions
     set status='ACTIVE'
   where status='UPCOMING' and starts_at <= now() and ends_at > now();
  get diagnostics v_activated = row_count;

  update public.auctions
     set status=case when current_bidder_id is null then 'EXPIRED' else 'AWAITING_PAYMENT' end
   where status='ACTIVE' and ends_at <= now();
  get diagnostics v_closed = row_count;

  update public.auction_cycles
     set status=case
       when starts_at <= now() and ends_at > now() then 'ACTIVE'
       when ends_at <= now() then 'COMPLETED'
       else 'UPCOMING'
     end
   where status <> case
       when starts_at <= now() and ends_at > now() then 'ACTIVE'
       when ends_at <= now() then 'COMPLETED'
       else 'UPCOMING'
     end;

  return jsonb_build_object(
    'created_slots',v_created,
    'activated_slots',v_activated,
    'closed_slots',v_closed,
    'ran_at',now()
  );
end;
$$;

-- Bid amounts use each market's configured increment; the bidding window is the
-- slot's one-minute interval. The parent hourly cycle remains open for 60 slots.
create or replace function public.place_auction_bid(
  p_auction_id text,
  p_bidder_id uuid,
  p_advertisement_id uuid,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auction public.auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_market public.auction_market_settings%rowtype;
  v_minimum numeric(14,2);
begin
  select * into v_auction
    from public.auctions
   where id=p_auction_id
   for update;
  if not found or v_auction.starts_at > now() or v_auction.ends_at <= now()
     or v_auction.status not in ('UPCOMING','ACTIVE') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  select * into v_market from public.auction_market_settings
   where currency=v_auction.currency and enabled;
  if not found then raise exception 'MARKET_DISABLED'; end if;

  select * into v_ad from public.advertisements
   where id=p_advertisement_id
   for update;
  if not found or v_ad.owner_id <> p_bidder_id
     or v_ad.approval_status <> 'APPROVED'
     or v_ad.ad_status <> 'ACTIVE'
     or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;

  v_minimum := coalesce(v_auction.current_bid,v_auction.starting_bid-v_market.bid_increment)
               + v_market.bid_increment;
  if p_amount < v_minimum or round(p_amount,2) <> p_amount then
    raise exception 'BID_TOO_LOW';
  end if;

  insert into public.bids(auction_id,bidder_id,amount)
  values (p_auction_id,p_bidder_id,p_amount);

  update public.auctions
     set current_bid=p_amount,current_bidder_id=p_bidder_id,
         advertisement_id=p_advertisement_id,status='ACTIVE'
   where id=p_auction_id;

  return jsonb_build_object('status','ACCEPTED','minimum_next_bid',p_amount+v_market.bid_increment);
end;
$$;

-- Public visitors must be able to see the published marketplace; sensitive writes
-- remain server-only through authenticated API handlers and service_role.
drop policy if exists "authenticated read auctions" on public.auctions;
drop policy if exists "public read published auctions" on public.auctions;
create policy "public read published auctions" on public.auctions
  for select to anon, authenticated
  using (status in ('UPCOMING','ACTIVE','AWAITING_PAYMENT','PAID'));

drop policy if exists "public read approved advertisements" on public.advertisements;
create policy "public read approved advertisements" on public.advertisements
  for select to anon, authenticated
  using (approval_status='APPROVED' and ad_status='ACTIVE');

drop policy if exists "authenticated read slots" on public.ad_slots;
drop policy if exists "public read scheduled slots" on public.ad_slots;
create policy "public read scheduled slots" on public.ad_slots
  for select to anon, authenticated
  using (status in ('SCHEDULED','LIVE','COMPLETED'));

revoke all on public.cashfree_webhook_events from anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.ensure_auction_inventory(integer) from public, anon, authenticated;
revoke all on function public.run_auction_clock() from public, anon, authenticated;
revoke all on function public.place_auction_bid(text,uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.ensure_auction_inventory(integer) to service_role;
grant execute on function public.run_auction_clock() to service_role;
grant execute on function public.place_auction_bid(text,uuid,uuid,numeric) to service_role;

-- Supabase-managed pg_cron runs inside Postgres; the marketplace does not depend
-- on a browser tab, Vercel request, or a daily manual restart.
select cron.unschedule(jobid)
  from cron.job
 where jobname='60sec-perpetual-auction-clock';

select cron.schedule(
  '60sec-perpetual-auction-clock',
  '* * * * *',
  'select public.run_auction_clock();'
);

-- Prime the rolling 24-hour inventory immediately.
select public.run_auction_clock();
