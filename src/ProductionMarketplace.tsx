import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

type Config = { configured: boolean; supabaseUrl: string | null; supabaseAnonKey: string | null; paymentsEnabled: boolean; paymentEnvironment: string };
type Auction = { id: string; currency: 'INR'|'USD'; starting_bid: number; current_bid: number|null; current_bidder_id: string|null; status: string; ends_at: string; advertisement_id: string|null; slot_number: number };
type Ad = { id: string; brand_name: string; title: string; approval_status: string; ad_status: string; is_house_ad: boolean };
type Slot = { id: string; starts_at: string; ends_at: string; status: string; advertisement_id: string; slot_number: number };
declare global { interface Window { Cashfree?: (args: { mode: 'sandbox'|'production' }) => { checkout: (args: { paymentSessionId: string; redirectTarget: '_self' }) => Promise<unknown> } } }

const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export function ProductionMarketplace() {
  const [config, setConfig] = useState<Config|null>(null);
  const [client, setClient] = useState<SupabaseClient|null>(null);
  const [session, setSession] = useState<Session|null>(null);
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [adForm, setAdForm] = useState({brandName:'',title:'',mediaUrl:'',mediaType:'image/jpeg',websiteUrl:''});
  const [showAdForm, setShowAdForm] = useState(false);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedAds, setSelectedAds] = useState<Record<string,string>>({});
  const [bidAmounts, setBidAmounts] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    fetch('/api/public-config').then(r => r.json()).then((c: Config) => {
      if (!alive) return;
      setConfig(c);
      if (c.configured && c.supabaseUrl && c.supabaseAnonKey) {
        const sb = createClient(c.supabaseUrl, c.supabaseAnonKey);
        setClient(sb);
        sb.auth.getSession().then(({data}) => { if (alive) setSession(data.session); });
        const { data: listener } = sb.auth.onAuthStateChange((_event, next) => { if (alive) setSession(next); });
        unsubscribe = () => listener.subscription.unsubscribe();
      }
    }).catch(() => setError('Could not load production configuration.'));
    return () => { alive = false; unsubscribe?.(); };
  }, []);

  const loadData = useCallback(async () => {
    if (!client || !session) return;
    const [a, ownAds, schedule] = await Promise.all([
      client.from('auctions').select('id,currency,starting_bid,current_bid,current_bidder_id,status,ends_at,advertisement_id,slot_number').in('status',['ACTIVE','AWAITING_PAYMENT']).order('ends_at',{ascending:true}).limit(30),
      client.from('advertisements').select('id,brand_name,title,approval_status,ad_status,is_house_ad').order('created_at',{ascending:false}),
      client.from('ad_slots').select('id,starts_at,ends_at,status,advertisement_id,slot_number').in('status',['LIVE','SCHEDULED']).order('starts_at',{ascending:true}).limit(30),
    ]);
    if (a.error || ownAds.error || schedule.error) throw new Error(a.error?.message || ownAds.error?.message || schedule.error?.message || 'Unable to load marketplace');
    setAuctions(a.data || []); setAds(ownAds.data || []); setSlots(schedule.data || []);
  }, [client, session]);

  useEffect(() => {
    if (!client || !session) return;
    loadData().catch(e => setError(e.message));
    const channel = client.channel('live-marketplace')
      .on('postgres_changes',{event:'*',schema:'public',table:'auctions'},()=>loadData().catch(e=>setError(e.message)))
      .on('postgres_changes',{event:'*',schema:'public',table:'bids'},()=>loadData().catch(e=>setError(e.message)))
      .on('postgres_changes',{event:'*',schema:'public',table:'ad_slots'},()=>loadData().catch(e=>setError(e.message)))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [client, session, loadData]);

  const approvedAds = useMemo(() => ads.filter(a => a.approval_status === 'APPROVED' && a.ad_status === 'ACTIVE' && !a.is_house_ad), [ads]);
  const authFetch = async (path: string, body: unknown) => {
    if (!session) throw new Error('Please sign in again.');
    const response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault(); if (!client) return;
    setBusy('auth'); setError(''); setNotice('');
    const {error: authError} = await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}});
    setBusy('');
    if (authError) setError(authError.message); else { setOtpSent(true); setNotice('Check your email for the secure sign-in link.'); }
  };

  const sendPhoneCode = async () => {
    if (!client || !/^\+[1-9]\d{7,14}$/.test(phone.trim())) return setError('Enter a phone number in international format, for example +919876543210.');
    setBusy('phone'); setError('');
    const {error: phoneError} = await client.auth.updateUser({phone:phone.trim()});
    setBusy('');
    if (phoneError) setError(phoneError.message); else { setPhoneOtpSent(true); setNotice('SMS verification code sent.'); }
  };

  const verifyPhoneCode = async () => {
    if (!client || !session || !phoneCode.trim()) return;
    setBusy('phone'); setError('');
    const {error: verifyError} = await client.auth.verifyOtp({phone:phone.trim(),token:phoneCode.trim(),type:'phone_change'});
    setBusy('');
    if (verifyError) setError(verifyError.message);
    else { const {data} = await client.auth.getSession(); setSession(data.session); setPhoneOtpSent(false); setPhoneCode(''); setNotice('Phone number verified.'); }
  };

  const submitAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('ad'); setError(''); setNotice('');
    try {
      await authFetch('/api/advertisements',{...adForm});
      setAdForm({brandName:'',title:'',mediaUrl:'',mediaType:'image/jpeg',websiteUrl:''});
      setShowAdForm(false);
      setNotice('Advertisement submitted for admin review. It cannot be used for bidding until approved and activated.');
      await loadData();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const placeBid = async (auction: Auction) => {
    const advertisementId = selectedAds[auction.id];
    const amount = Number(bidAmounts[auction.id]);
    if (!advertisementId) return setError('Select one of your approved active ads first.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a valid bid amount.');
    setBusy(auction.id); setError(''); setNotice('');
    try {
      const result = await authFetch('/api/auctions/place-bid',{auctionId:auction.id,advertisementId,amount});
      setNotice(`Bid accepted. Minimum next bid: ${result.minimum_next_bid ?? amount+1}.`);
      await loadData();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const pay = async (auction: Auction) => {
    if (!config?.paymentsEnabled) return setError('Payments are disabled by the production safety switch.');
    if (!window.Cashfree) {
      const script = document.createElement('script'); script.src='https://sdk.cashfree.com/js/v3/cashfree.js'; script.async=true;
      document.head.appendChild(script);
      await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(new Error('Cashfree Checkout failed to load'));});
    }
    setBusy(auction.id); setError('');
    try {
      const order = await authFetch('/api/payments/create-order',{auctionId:auction.id});
      const cashfree = window.Cashfree?.({mode:config?.paymentEnvironment === 'production' ? 'production':'sandbox'});
      if (!cashfree) throw new Error('Cashfree SDK is unavailable.');
      await cashfree.checkout({paymentSessionId:order.paymentSessionId,redirectTarget:'_self'});
    } catch(e) { setError((e as Error).message); setBusy(''); }
  };

  useEffect(() => {
    if (!client || !session) return;
    const orderId = new URLSearchParams(window.location.search).get('cashfree_order_id');
    if (!orderId) return;
    authFetch('/api/payments/verify',{orderId}).then(async result => {
      setNotice(`Payment status: ${label(result.status)}`);
      await loadData();
    }).catch(e=>setError((e as Error).message)).finally(()=>{
      const url=new URL(window.location.href); url.searchParams.delete('cashfree_order_id'); window.history.replaceState({},'',url);
    });
  }, [client, session]);

  if (!config) return <main className="min-h-screen grid place-items-center text-slate-600">Loading 60SEC production marketplace…</main>;
  if (!config.configured || !client) return <main className="min-h-screen grid place-items-center p-8"><div className="max-w-lg text-center"><h1 className="text-3xl font-black">60SEC</h1><p className="mt-3 text-slate-600">Production mode requires SUPABASE_URL and SUPABASE_ANON_KEY in the Vercel project environment.</p></div></main>;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="bg-slate-950 text-white px-5 py-5"><div className="max-w-6xl mx-auto flex items-center justify-between gap-4"><div><div className="text-2xl font-black tracking-tight">60SEC</div><div className="text-xs text-slate-300">Live marketplace · server-authoritative</div></div>{session && <div className="flex items-center gap-3 text-sm"><span className="hidden sm:block">{session.user.email}</span><button className="rounded-lg border border-white/30 px-3 py-2" onClick={()=>client.auth.signOut()}>Sign out</button></div>}</div></header>
    <section className="max-w-6xl mx-auto p-5 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Production marketplace</h1><p className="text-sm text-slate-600">Auctions, bids and paid slot reservations are read from Supabase.</p></div><span className="rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-xs font-bold">{config.paymentsEnabled ? `Payments: ${label(config.paymentEnvironment)}` : 'Payments safely disabled'}</span></div>
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">{error}</div>}
      {!session ? <form onSubmit={sendMagicLink} className="max-w-md bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-lg font-bold">Sign in to 60SEC</h2><p className="text-sm text-slate-600">We’ll email you a secure sign-in link. No demo accounts are used in production mode.</p><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className="w-full border rounded-lg px-3 py-3"/><button disabled={busy==='auth'} className="w-full rounded-lg bg-slate-950 text-white font-bold py-3 disabled:opacity-50">{busy==='auth'?'Sending…':'Send sign-in link'}</button>{otpSent && <p className="text-xs text-slate-500">Open the link in this browser to continue.</p>}</form> : <>
        {!session.user.phone && <section className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3"><h2 className="font-bold">Verify your phone before payment</h2><p className="text-sm text-slate-600">Cashfree requires a customer phone number. Verify it with an SMS code; the server uses the verified Supabase phone claim.</p><div className="flex flex-wrap gap-2"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+919876543210" className="flex-1 min-w-56 border rounded-lg p-2"/><button disabled={busy==='phone'} onClick={sendPhoneCode} className="bg-slate-950 text-white rounded-lg px-4 py-2 disabled:opacity-50">{phoneOtpSent?'Resend code':'Send SMS code'}</button></div>{phoneOtpSent && <div className="flex gap-2"><input value={phoneCode} onChange={e=>setPhoneCode(e.target.value)} placeholder="SMS code" className="flex-1 border rounded-lg p-2"/><button disabled={busy==='phone'} onClick={verifyPhoneCode} className="bg-emerald-700 text-white rounded-lg px-4 py-2">Verify phone</button></div>}</section>}
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-lg mb-3">Open auctions</h2>{auctions.length===0?<p className="text-sm text-slate-500">No active or awaiting-payment auctions are currently in the database.</p>:<div className="space-y-4">{auctions.map(auction=><article key={auction.id} className="border rounded-xl p-4 space-y-3"><div className="flex justify-between gap-3"><div><div className="font-bold">{auction.id}</div><div className="text-xs text-slate-500">Slot #{auction.slot_number} · closes {new Date(auction.ends_at).toLocaleString()}</div></div><span className="text-xs font-bold rounded-full bg-slate-100 px-2 py-1 h-fit">{label(auction.status)}</span></div><div className="text-2xl font-black">{money(Number(auction.current_bid ?? auction.starting_bid),auction.currency)}</div>{auction.status==='ACTIVE'?<div className="space-y-2"><select className="w-full border rounded-lg p-2" value={selectedAds[auction.id]||''} onChange={e=>setSelectedAds(s=>({...s,[auction.id]:e.target.value}))}><option value="">Choose approved ad</option>{approvedAds.map(ad=><option key={ad.id} value={ad.id}>{ad.brand_name} — {ad.title}</option>)}</select><input type="number" min={Number(auction.current_bid ?? auction.starting_bid-1)+1} step="1" value={bidAmounts[auction.id]||''} onChange={e=>setBidAmounts(s=>({...s,[auction.id]:e.target.value}))} placeholder={`Minimum ${Number(auction.current_bid ?? auction.starting_bid-1)+1}`} className="w-full border rounded-lg p-2"/><button disabled={!!busy || approvedAds.length===0} onClick={()=>placeBid(auction)} className="w-full bg-slate-950 text-white rounded-lg py-2.5 font-bold disabled:opacity-40">{busy===auction.id?'Submitting…':'Place server-validated bid'}</button>{approvedAds.length===0&&<p className="text-xs text-amber-700">You have no approved active commercial ads. Submit an ad for review before bidding.</p>}</div>:auction.current_bidder_id===session.user.id?<button disabled={!!busy || !config.paymentsEnabled} onClick={()=>pay(auction)} className="w-full rounded-lg bg-emerald-700 text-white py-2.5 font-bold disabled:opacity-40">{config.paymentsEnabled?'Continue to Cashfree Checkout':'Winner payment pending — live payments disabled'}</button>:<p className="text-sm text-slate-500">Awaiting winner payment.</p>}</article>)}</div>}</section>
          <section className="bg-white border rounded-2xl p-5"><div className="flex justify-between items-center mb-3"><h2 className="font-bold text-lg">My advertisements</h2><button onClick={()=>setShowAdForm(v=>!v)} className="rounded-lg bg-slate-950 text-white px-3 py-2 text-xs font-bold">Submit ad</button></div>{showAdForm && <form onSubmit={submitAd} className="mb-4 rounded-xl border bg-slate-50 p-3 space-y-2"><input required value={adForm.brandName} onChange={e=>setAdForm(s=>({...s,brandName:e.target.value}))} placeholder="Brand name" className="w-full border rounded-lg p-2"/><input required value={adForm.title} onChange={e=>setAdForm(s=>({...s,title:e.target.value}))} placeholder="Ad title" className="w-full border rounded-lg p-2"/><input required type="url" value={adForm.mediaUrl} onChange={e=>setAdForm(s=>({...s,mediaUrl:e.target.value}))} placeholder="HTTPS image/video URL" className="w-full border rounded-lg p-2"/><select value={adForm.mediaType} onChange={e=>setAdForm(s=>({...s,mediaType:e.target.value}))} className="w-full border rounded-lg p-2"><option value="image/jpeg">JPEG image</option><option value="image/png">PNG image</option><option value="image/webp">WebP image</option><option value="video/mp4">MP4 video</option><option value="video/webm">WebM video</option></select><input required type="url" value={adForm.websiteUrl} onChange={e=>setAdForm(s=>({...s,websiteUrl:e.target.value}))} placeholder="HTTPS destination URL" className="w-full border rounded-lg p-2"/><button disabled={busy==='ad'} className="w-full rounded-lg bg-emerald-700 text-white py-2 font-bold">Submit for review</button></form>}{ads.length===0?<p className="text-sm text-slate-500">No advertisements are linked to this account yet.</p>:<div className="space-y-2">{ads.map(ad=><div key={ad.id} className="border rounded-xl p-3 flex items-center justify-between gap-3"><div><div className="font-semibold text-sm">{ad.brand_name || 'Untitled ad'}</div><code className="text-[10px] text-slate-400">{ad.id}</code></div><span className="text-xs">{label(ad.approval_status)} · {label(ad.ad_status)}</span></div>)}</div>}<p className="text-xs text-slate-500 mt-4">New ads enter PENDING/DRAFT and require administrator approval and activation before bidding.</p></section>
        </div>
        <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-lg mb-3">Reserved 60-second slots</h2>{slots.length===0?<p className="text-sm text-slate-500">No paid slots have been reserved yet.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="py-2">Slot</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>{slots.map(s=><tr key={s.id} className="border-b last:border-0"><td className="py-2">#{s.slot_number}</td><td>{new Date(s.starts_at).toLocaleString()}</td><td>{new Date(s.ends_at).toLocaleString()}</td><td>{label(s.status)}</td></tr>)}</tbody></table></div>}</section>
      </>}
      <footer className="text-xs text-slate-500">Production data is server-backed. Browser storage is not used as the auction, bid, payment or schedule authority. Payments remain subject to the server-side Cashfree safety gate.</footer>
    </section>
  </main>;
}
