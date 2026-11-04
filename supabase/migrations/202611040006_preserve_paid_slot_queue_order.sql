-- Preserve a monotonically increasing queue position after slots complete.
create or replace function public.confirm_hourly_cashfree_payment(
  p_order_id text, p_provider_payment_id text, p_event_key text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_payment public.hourly_payments%rowtype;
  v_auction public.hourly_auctions%rowtype;
  v_ad public.advertisements%rowtype;
  v_last_end timestamptz;
  v_start timestamptz;
  v_position bigint;
begin
  insert into public.cashfree_webhook_events(event_key,provider_order_id,event_type)
  values(p_event_key,p_order_id,'HOURLY_PAYMENT_SUCCESS')
  on conflict(event_key) do nothing;
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

  perform pg_advisory_xact_lock(hashtextextended('60sec:hourly-paid-slot-queue',0));
  update public.hourly_payments
     set status='PAID',provider_payment_id=p_provider_payment_id,paid_at=now()
   where id=v_payment.id;

  select coalesce(max(queue_position),0)+1 into v_position from public.hourly_ad_slots;
  select max(ends_at) into v_last_end
    from public.hourly_ad_slots
   where status in ('SCHEDULED','LIVE') and ends_at>now();
  v_start:=coalesce(v_last_end,now()+interval '5 minutes');

  insert into public.hourly_ad_slots(
    payment_id,auction_id,advertisement_id,bidder_id,currency,amount,
    queue_position,starts_at,ends_at
  ) values(
    v_payment.id,v_payment.auction_id,v_payment.advertisement_id,v_payment.bidder_id,
    v_payment.currency,v_payment.amount,v_position,v_start,v_start+interval '60 seconds'
  );
  return jsonb_build_object(
    'status','PAID','queue_position',v_position,'starts_at',v_start,'ends_at',v_start+interval '60 seconds'
  );
end;
$$;

revoke all on function public.confirm_hourly_cashfree_payment(text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_hourly_cashfree_payment(text,text,text) to service_role;
