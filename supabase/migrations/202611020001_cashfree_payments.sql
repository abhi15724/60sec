-- 60SEC authoritative auction, payment and slot settlement schema.
-- Apply with: supabase db push (or paste into Supabase SQL editor).
create extension if not exists pgcrypto;

create table if not exists public.auctions (
  id text primary key,
  currency text not null check (currency in ('INR','USD')),
  starting_bid numeric(14,2) not null check (starting_bid > 0),
  current_bid numeric(14,2),
  current_bidder_id uuid references auth.users(id),
  status text not null check (status in ('UPCOMING','ACTIVE','AWAITING_PAYMENT','PAID','EXPIRED','CANCELLED')),
  ends_at timestamptz not null,
  advertisement_id uuid,
  operating_day date not null,
  slot_number integer not null check (slot_number between 1 and 720),
  created_at timestamptz not null default now(),
  check (current_bid is null or current_bid >= starting_bid),
  unique (operating_day, slot_number)
);

create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING','APPROVED','REJECTED')),
  ad_status text not null default 'DRAFT' check (ad_status in ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
  is_house_ad boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.auctions
  drop constraint if exists auctions_advertisement_id_fkey;
alter table public.auctions
  add constraint auctions_advertisement_id_fkey
  foreign key (advertisement_id) references public.advertisements(id);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null references public.auctions(id),
  bidder_id uuid not null references auth.users(id),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists bids_auction_amount_idx on public.bids(auction_id, amount desc, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null references public.auctions(id),
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
  paid_at timestamptz,
  unique (auction_id)
);

create table if not exists public.ad_slots (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null unique references public.auctions(id),
  payment_id uuid not null unique references public.payments(id),
  advertisement_id uuid not null references public.advertisements(id),
  slot_number integer not null check (slot_number between 1 and 720),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  check (ends_at - starts_at = interval '60 seconds')
);

create table if not exists public.cashfree_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  provider_order_id text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.advertisements enable row level security;
alter table public.payments enable row level security;
alter table public.ad_slots enable row level security;
alter table public.cashfree_webhook_events enable row level security;

-- Authenticated users can read auction/bid data; all writes are server-side only.
create policy "authenticated read auctions" on public.auctions for select to authenticated using (true);
create policy "authenticated read bids" on public.bids for select to authenticated using (true);
create policy "owners read own ads" on public.advertisements for select to authenticated using (owner_id = auth.uid());
create policy "owners read own payments" on public.payments for select to authenticated using (bidder_id = auth.uid());
create policy "authenticated read slots" on public.ad_slots for select to authenticated using (true);
-- No client insert/update/delete policies. Service-role API handlers perform privileged writes.

create or replace function public.confirm_cashfree_payment(
  p_order_id text,
  p_provider_payment_id text,
  p_event_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_auction public.auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_slot_start timestamptz;
begin
  insert into public.cashfree_webhook_events(event_key, provider_order_id, event_type)
  values (p_event_key, p_order_id, 'PAYMENT_SUCCESS')
  on conflict (event_key) do nothing;
  if not found then
    return jsonb_build_object('status','DUPLICATE');
  end if;

  select * into v_payment from public.payments
   where provider_order_id = p_order_id for update;
  if not found then raise exception 'UNKNOWN_ORDER'; end if;
  if v_payment.status = 'PAID' then
    return jsonb_build_object('status','ALREADY_PAID');
  end if;

  select * into v_auction from public.auctions
   where id = v_payment.auction_id for update;
  if v_auction.status <> 'AWAITING_PAYMENT'
     or v_auction.current_bidder_id <> v_payment.bidder_id
     or v_auction.current_bid <> v_payment.amount
     or v_auction.currency <> v_payment.currency then
    raise exception 'AUCTION_PAYMENT_MISMATCH';
  end if;

  select * into v_ad from public.advertisements
   where id = v_payment.advertisement_id for update;
  if v_ad.owner_id <> v_payment.bidder_id
     or v_ad.approval_status <> 'APPROVED'
     or v_ad.ad_status <> 'ACTIVE'
     or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;

  update public.payments
     set status='PAID', provider_payment_id=p_provider_payment_id, paid_at=now()
   where id=v_payment.id;

  -- Sequential queue: place after the latest reserved slot, never overlap.
  select coalesce(max(ends_at), now()) into v_slot_start from public.ad_slots
   where status in ('SCHEDULED','LIVE');
  if v_slot_start < now() then v_slot_start := now(); end if;

  insert into public.ad_slots(auction_id,payment_id,advertisement_id,slot_number,starts_at,ends_at)
  values (v_auction.id,v_payment.id,v_payment.advertisement_id,v_auction.slot_number,
          v_slot_start,v_slot_start + interval '60 seconds');

  update public.auctions set status='PAID' where id=v_auction.id;
  return jsonb_build_object('status','PAID');
end;
$$;

revoke all on function public.confirm_cashfree_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.confirm_cashfree_payment(text,text,text) to service_role;

-- Bid placement is also server-authoritative. Clients cannot update auction totals directly.
create or replace function public.place_auction_bid(
  p_auction_id text,
  p_bidder_id uuid,
  p_advertisement_id uuid,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction public.auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_minimum numeric(14,2);
begin
  select * into v_auction from public.auctions where id=p_auction_id for update;
  if not found or v_auction.status <> 'ACTIVE' or v_auction.ends_at <= now() then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  select * into v_ad from public.advertisements where id=p_advertisement_id for update;
  if not found or v_ad.owner_id <> p_bidder_id or v_ad.approval_status <> 'APPROVED'
     or v_ad.ad_status <> 'ACTIVE' or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;
  v_minimum := coalesce(v_auction.current_bid, v_auction.starting_bid - 1) + 1;
  if p_amount < v_minimum then raise exception 'BID_TOO_LOW'; end if;
  insert into public.bids(auction_id,bidder_id,amount) values (p_auction_id,p_bidder_id,p_amount);
  update public.auctions set current_bid=p_amount,current_bidder_id=p_bidder_id,
    advertisement_id=p_advertisement_id where id=p_auction_id;
  return jsonb_build_object('status','ACCEPTED','minimum_next_bid',p_amount + 1);
end;
$$;
revoke all on function public.place_auction_bid(text,uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.place_auction_bid(text,uuid,uuid,numeric) to service_role;
