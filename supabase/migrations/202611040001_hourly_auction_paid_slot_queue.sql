-- 60SEC hourly auction + paid one-minute booking model.
-- Additive migration: legacy tables/functions remain intact until the new flow is fully switched over.
create extension if not exists pgcrypto;

create table if not exists public.hourly_auctions (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('INR','USD')),
  operating_day date not null,
  auction_hour smallint not null check (auction_hour between 0 and 23),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starting_bid numeric(14,2) not null check (starting_bid > 0),
  current_bid numeric(14,2) not null check (current_bid > 0),
  status text not null default 'ACTIVE' check (status in ('UPCOMING','ACTIVE','CLOSED')),
  created_at timestamptz not null default now(),
  unique (currency, operating_day, auction_hour),
  check (ends_at = starts_at + interval '1 hour')
);

create table if not exists public.hourly_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.hourly_auctions(id),
  bidder_id uuid not null references auth.users(id),
  advertisement_id uuid not null references public.advertisements(id),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists hourly_bids_auction_rank_idx
  on public.hourly_bids (auction_id, amount desc, created_at asc);

create table if not exists public.hourly_payments (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.hourly_auctions(id),
  bid_id uuid not null unique references public.hourly_bids(id),
  bidder_id uuid not null references auth.users(id),
  advertisement_id uuid not null references public.advertisements(id),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('INR','USD')),
  provider text not null default 'CASHFREE',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  payment_session_id text,
  status text not null default 'PENDING' check (status in ('PENDING','PAID','FAILED','REFUNDED')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.hourly_ad_slots (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.hourly_payments(id),
  auction_id uuid not null references public.hourly_auctions(id),
  advertisement_id uuid not null references public.advertisements(id),
  bidder_id uuid not null references auth.users(id),
  currency text not null check (currency in ('INR','USD')),
  amount numeric(14,2) not null check (amount > 0),
  queue_position bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  unique(queue_position),
  check (ends_at = starts_at + interval '60 seconds')
);
create index if not exists hourly_ad_slots_schedule_idx
  on public.hourly_ad_slots (starts_at, ends_at) where status in ('SCHEDULED','LIVE');

-- Bid threshold and current high are serialized per hourly auction.
create or replace function public.place_hourly_bid(
  p_auction_id uuid, p_bidder_id uuid, p_advertisement_id uuid, p_amount numeric
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_auction public.hourly_auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_bid_id uuid;
  v_minimum numeric(14,2);
begin
  select * into v_auction from public.hourly_auctions where id = p_auction_id for update;
  if not found or v_auction.status <> 'ACTIVE' or v_auction.ends_at <= now() then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  select * into v_ad from public.advertisements where id = p_advertisement_id for update;
  if not found or v_ad.owner_id <> p_bidder_id or v_ad.approval_status <> 'APPROVED'
     or v_ad.ad_status <> 'ACTIVE' or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;
  v_minimum := v_auction.current_bid + 1;
  if p_amount < v_minimum then raise exception 'BID_TOO_LOW'; end if;
  insert into public.hourly_bids(auction_id,bidder_id,advertisement_id,amount)
  values (p_auction_id,p_bidder_id,p_advertisement_id,p_amount) returning id into v_bid_id;
  update public.hourly_auctions set current_bid=p_amount where id=p_auction_id;
  return jsonb_build_object('status','ACCEPTED','bid_id',v_bid_id,'minimum_next_bid',p_amount + 1);
end;
$$;

-- Successful payment is idempotent. Every paid bid receives exactly 60 seconds.
-- The first slot starts five minutes after the first successful confirmation;
-- subsequent slots append directly after the previous scheduled/live slot.
create or replace function public.confirm_hourly_cashfree_payment(
  p_order_id text, p_provider_payment_id text, p_event_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.hourly_payments%rowtype;
  v_auction public.hourly_auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_start timestamptz;
  v_position bigint;
begin
  insert into public.cashfree_webhook_events(event_key,provider_order_id,event_type)
  values (p_event_key,p_order_id,'HOURLY_PAYMENT_SUCCESS')
  on conflict (event_key) do nothing;
  if not found then return jsonb_build_object('status','DUPLICATE'); end if;

  select * into v_payment from public.hourly_payments
   where provider_order_id=p_order_id for update;
  if not found then raise exception 'UNKNOWN_ORDER'; end if;
  if v_payment.status='PAID' then return jsonb_build_object('status','ALREADY_PAID'); end if;

  select * into v_auction from public.hourly_auctions where id=v_payment.auction_id;
  if not found or v_auction.currency<>v_payment.currency then raise exception 'AUCTION_PAYMENT_MISMATCH'; end if;
  select * into v_ad from public.advertisements where id=v_payment.advertisement_id;
  if not found or v_ad.owner_id<>v_payment.bidder_id or v_ad.approval_status<>'APPROVED'
     or v_ad.ad_status<>'ACTIVE' or v_ad.is_house_ad then raise exception 'ADVERTISEMENT_NOT_ELIGIBLE'; end if;

  -- One global queue lock guarantees unique, contiguous start times across concurrent webhooks.
  perform pg_advisory_xact_lock(hashtextextended('60sec:hourly-paid-slot-queue',0));
  update public.hourly_payments
     set status='PAID',provider_payment_id=p_provider_payment_id,paid_at=now()
   where id=v_payment.id;

  select coalesce(max(ends_at), now() + interval '5 minutes'),
         coalesce(max(queue_position),0) + 1
    into v_start,v_position
    from public.hourly_ad_slots where status in ('SCHEDULED','LIVE');
  if v_position=1 then
    v_start := now() + interval '5 minutes';
  elsif v_start < now() then
    v_start := now() + interval '5 minutes';
  end if;

  insert into public.hourly_ad_slots(
    payment_id,auction_id,advertisement_id,bidder_id,currency,amount,
    queue_position,starts_at,ends_at
  ) values (
    v_payment.id,v_payment.auction_id,v_payment.advertisement_id,v_payment.bidder_id,
    v_payment.currency,v_payment.amount,v_position,v_start,v_start + interval '60 seconds'
  );
  return jsonb_build_object('status','PAID','starts_at',v_start,'ends_at',v_start + interval '60 seconds');
end;
$$;

alter table public.hourly_auctions enable row level security;
alter table public.hourly_bids enable row level security;
alter table public.hourly_payments enable row level security;
alter table public.hourly_ad_slots enable row level security;

drop policy if exists "public can view hourly auctions" on public.hourly_auctions;
create policy "public can view hourly auctions" on public.hourly_auctions
 for select to anon, authenticated using (true);
drop policy if exists "public can view paid hourly ad slots" on public.hourly_ad_slots;
create policy "public can view paid hourly ad slots" on public.hourly_ad_slots
 for select to anon, authenticated using (status in ('LIVE','SCHEDULED'));
drop policy if exists "bidders can view own hourly bids" on public.hourly_bids;
create policy "bidders can view own hourly bids" on public.hourly_bids
 for select to authenticated using (bidder_id = auth.uid());
drop policy if exists "bidders can view own hourly payments" on public.hourly_payments;
create policy "bidders can view own hourly payments" on public.hourly_payments
 for select to authenticated using (bidder_id = auth.uid());

grant select on public.hourly_auctions, public.hourly_ad_slots to anon, authenticated;
grant select on public.hourly_bids, public.hourly_payments to authenticated;
revoke all on function public.place_hourly_bid(uuid,uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.place_hourly_bid(uuid,uuid,uuid,numeric) to service_role;
revoke all on function public.confirm_hourly_cashfree_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.confirm_hourly_cashfree_payment(text,text,text) to service_role;
