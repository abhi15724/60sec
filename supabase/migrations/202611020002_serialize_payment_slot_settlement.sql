-- Serialize successful payment settlement so concurrent Cashfree webhooks
-- cannot reserve overlapping 60-second ad slots.
--
-- All calls to confirm_cashfree_payment acquire the same transaction-scoped
-- advisory lock before reading the queue tail. The lock is released at commit
-- or rollback, so the next transaction observes the prior committed slot.

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
  if not found or v_auction.status <> 'AWAITING_PAYMENT'
     or v_auction.current_bidder_id <> v_payment.bidder_id
     or v_auction.current_bid <> v_payment.amount
     or v_auction.currency <> v_payment.currency then
    raise exception 'AUCTION_PAYMENT_MISMATCH';
  end if;

  select * into v_ad from public.advertisements
   where id = v_payment.advertisement_id for update;
  if not found or v_ad.owner_id <> v_payment.bidder_id
     or v_ad.approval_status <> 'APPROVED'
     or v_ad.ad_status <> 'ACTIVE'
     or v_ad.is_house_ad then
    raise exception 'ADVERTISEMENT_NOT_ELIGIBLE';
  end if;

  -- One global queue lock across all currencies and operating days.
  -- It must be acquired before reading MAX(ends_at).
  perform pg_advisory_xact_lock(hashtextextended('60sec:ad-slot-settlement-queue', 0));

  update public.payments
     set status='PAID', provider_payment_id=p_provider_payment_id, paid_at=now()
   where id=v_payment.id;

  select coalesce(max(ends_at), now()) into v_slot_start
    from public.ad_slots
   where status in ('SCHEDULED','LIVE');
  if v_slot_start < now() then v_slot_start := now(); end if;

  insert into public.ad_slots(
    auction_id,payment_id,advertisement_id,slot_number,starts_at,ends_at
  )
  values (
    v_auction.id,v_payment.id,v_payment.advertisement_id,v_auction.slot_number,
    v_slot_start,v_slot_start + interval '60 seconds'
  );

  update public.auctions set status='PAID' where id=v_auction.id;
  return jsonb_build_object('status','PAID');
end;
$$;

revoke all on function public.confirm_cashfree_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.confirm_cashfree_payment(text,text,text) to service_role;
