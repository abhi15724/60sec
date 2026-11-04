-- Reserve the ascending price and payment attempt atomically.
-- One unpaid bid at a time per currency/hour prevents a bidder from being
-- displaced while checkout is pending and prevents unpaid bids inflating price.
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
  v_order_id text;
begin
  select * into v_auction from public.hourly_auctions where id=p_auction_id for update;
  if not found or v_auction.status<>'ACTIVE' or v_auction.ends_at<=now() then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  if exists (
    select 1 from public.hourly_payments
    where auction_id=p_auction_id and status='PENDING'
  ) then raise exception 'PAYMENT_PENDING'; end if;

  select * into v_ad from public.advertisements where id=p_advertisement_id for update;
  if not found or v_ad.owner_id<>p_bidder_id or v_ad.approval_status<>'APPROVED'
     or v_ad.ad_status<>'ACTIVE' or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;

  v_minimum:=v_auction.current_bid+1;
  if p_amount<v_minimum then raise exception 'BID_TOO_LOW'; end if;

  insert into public.hourly_bids(auction_id,bidder_id,advertisement_id,amount)
  values(p_auction_id,p_bidder_id,p_advertisement_id,p_amount)
  returning id into v_bid_id;

  v_order_id:='60h_'||substr(replace(v_bid_id::text,'-',''),1,24);
  insert into public.hourly_payments(
    auction_id,bid_id,bidder_id,advertisement_id,amount,currency,
    provider,provider_order_id,status
  ) values (
    p_auction_id,v_bid_id,p_bidder_id,p_advertisement_id,p_amount,v_auction.currency,
    'CASHFREE',v_order_id,'PENDING'
  );

  update public.hourly_auctions set current_bid=p_amount where id=p_auction_id;
  return jsonb_build_object(
    'status','PAYMENT_REQUIRED','bid_id',v_bid_id,'order_id',v_order_id,
    'amount',p_amount,'currency',v_auction.currency,'minimum_next_bid',p_amount+1
  );
end;
$$;

-- A failed attempt releases the auction price back to the last paid amount,
-- allowing the next bidder to continue from the correct price.
create or replace function public.fail_hourly_cashfree_payment(p_order_id text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_payment public.hourly_payments%rowtype;
  v_paid_max numeric(14,2);
begin
  select * into v_payment from public.hourly_payments
   where provider_order_id=p_order_id for update;
  if not found then raise exception 'UNKNOWN_ORDER'; end if;
  if v_payment.status='PAID' then return jsonb_build_object('status','ALREADY_PAID'); end if;
  update public.hourly_payments set status='FAILED' where id=v_payment.id;
  select greatest(a.starting_bid,coalesce(max(p.amount),a.starting_bid))
    into v_paid_max
    from public.hourly_auctions a
    left join public.hourly_payments p on p.auction_id=a.id and p.status='PAID'
   where a.id=v_payment.auction_id
   group by a.starting_bid;
  update public.hourly_auctions set current_bid=v_paid_max where id=v_payment.auction_id;
  return jsonb_build_object('status','FAILED','current_bid',v_paid_max);
end;
$$;

revoke all on function public.place_hourly_bid(uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.place_hourly_bid(uuid,uuid,uuid,numeric) to service_role;
revoke all on function public.fail_hourly_cashfree_payment(text) from public,anon,authenticated;
grant execute on function public.fail_hourly_cashfree_payment(text) to service_role;
