-- Maintain 24/7 hourly auctions and publish slot lifecycle without Vercel Cron.
-- Supabase-hosted Postgres provides pg_cron; this avoids Vercel Hobby's daily cron limit.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.refresh_hourly_ad_slot_states(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  update public.hourly_ad_slots
     set status='COMPLETED'
   where status in ('SCHEDULED','LIVE') and ends_at<=p_now;
  get diagnostics v_count=row_count;
  update public.hourly_ad_slots
     set status='LIVE'
   where status='SCHEDULED' and starts_at<=p_now and ends_at>p_now;
  return v_count;
end;
$$;

revoke all on function public.refresh_hourly_ad_slot_states(timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_hourly_ad_slot_states(timestamptz) to service_role;

-- Idempotently replace named jobs. They run every minute, all week, all year.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('60sec-hourly-auction-generator','60sec-paid-slot-lifecycle')
  loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule(
    '60sec-hourly-auction-generator',
    '* * * * *',
    'select public.ensure_current_hourly_auctions(now());'
  );
  perform cron.schedule(
    '60sec-paid-slot-lifecycle',
    '* * * * *',
    'select public.refresh_hourly_ad_slot_states(now());'
  );
end;
$$;
