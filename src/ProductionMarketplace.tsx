import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

type Config = { configured: boolean; supabaseUrl: string | null; supabaseAnonKey: string | null; paymentsEnabled: boolean; paymentEnvironment: string };
type Auction = { id: string; currency: 'INR'|'USD'; starting_bid: number; current_bid: number; current_bidder_id: string|null; status: string; starts_at: string; ends_at: string; advertisement_id: string|null; slot_number: number };
type Ad = { id: string; brand_name: string; title: string; approval_status: string; ad_status: string; is_house_ad: boolean; media_url?: string; media_type?: string; website_url?: string };
type Slot = { id: string; starts_at: string; ends_at: string; status: string; advertisement_id: string; queue_position: number; brand_name: string; title: string; media_url: string; media_type: string; website_url: string };
declare global { interface Window { Cashfree?: (args: { mode: 'sandbox'|'production' }) => { checkout: (args: { paymentSessionId: string; redirectTarget: '_self' }) => Promise<unknown> } } }

const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export function ProductionMarketplace() {
  const [config, setConfig] = useState<Config|null>(null);
  const [client, setClient] = useState<SupabaseClient|null>(null);
  const [session, setSession] = useState<Session|null>(null);
  const [email, setEmail] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin'|'signup'>('signin');
  const [pendingBid, setPendingBid] = useState<{auctionId:string; advertisementId:string; amount:number}|null>(null);
  const [now, setNow] = useState(Date.now());
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

  useEffect(() => { const timer=window.setInterval(()=>setNow(Date.now()),1000); return ()=>window.clearInterval(timer); }, []);

  const loadData = useCallback(async () => {
    if (!client) return;
    const [marketResponse, ownAds] = await Promise.all([
      fetch('/api/hourly-auctions/current').then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load hourly auctions');
        return payload;
      }),
      client.from('advertisements').select('id,brand_name,title,approval_status,ad_status,is_house_ad,media_url,media_type,website_url').eq('approval_status','APPROVED').eq('ad_status','ACTIVE').order('created_at',{ascending:false}),
    ]);
    if (ownAds.error) throw new Error(ownAds.error.message);
    setAuctions((marketResponse.auctions || []).map((a: any) => ({
      ...a, current_bidder_id: null, advertisement_id: null, slot_number: a.auction_hour + 1,
    })));
    setSlots(marketResponse.slots || []);
    setAds(ownAds.data || []);
  }, [client, session]);

  useEffect(() => {
    if (!client) return;
    loadData().catch(e => setError(e.message));
    const channel = client.channel('live-marketplace')
      .on('postgres_changes',{event:'*',schema:'public',table:'auctions'},()=>loadData().catch(e=>setError(e.message)))
      .on('postgres_changes',{event:'*',schema:'public',table:'bids'},()=>loadData().catch(e=>setError(e.message)))
      .on('postgres_changes',{event:'*',schema:'public',table:'ad_slots'},()=>loadData().catch(e=>setError(e.message)))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [client, session, loadData]);

  const approvedAds = useMemo(() => ads.filter(a => a.approval_status === 'APPROVED' && a.ad_status === 'ACTIVE' && !a.is_house_ad), [ads]);
  const liveSlot = slots.find(s => ['LIVE','SCHEDULED'].includes(s.status) && new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now);
  const houseAds = ads.filter(a => a.is_house_ad && a.approval_status === 'APPROVED' && a.ad_status === 'ACTIVE');
  const fallbackIndex = houseAds.length ? Math.floor(now / 60000) % houseAds.length : 0;
  const liveAd = (liveSlot ? liveSlot : undefined) || houseAds[fallbackIndex];
  const liveSeconds = liveSlot ? Math.max(0,Math.ceil((new Date(liveSlot.ends_at).getTime()-now)/1000)) : 60 - Math.floor((now / 1000) % 60);
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
    const {error: authError} = await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin, shouldCreateUser:authMode === 'signup'}});
    setBusy('');
    if (authError) setError(authError.message); else { setOtpSent(true); setNotice(authMode === 'signup' ? 'Check your email to complete your 60SEC account registration.' : 'Check your email for the secure sign-in link.'); }
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
    if (!advertisementId) return setError('Select an approved advertisement first.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a valid bid amount.');
    if (!session) { setPendingBid({auctionId:auction.id,advertisementId,amount}); setAuthMode('signin'); setAuthOpen(true); return; }
    setBusy(auction.id); setError(''); setNotice('');
    try {
      if (!config?.paymentsEnabled) throw new Error('Payments are disabled by the production safety switch.');
      const result = await authFetch('/api/hourly-auctions/place-bid',{auctionId:auction.id,advertisementId,amount});
      if (!window.Cashfree) {
        const script = document.createElement('script'); script.src='https://sdk.cashfree.com/js/v3/cashfree.js'; script.async=true;
        document.head.appendChild(script);
        await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(new Error('Cashfree Checkout failed to load'));});
      }
      const cashfree = window.Cashfree?.({mode:config.paymentEnvironment === 'production' ? 'production':'sandbox'});
      if (!cashfree) throw new Error('Cashfree SDK is unavailable.');
      setNotice(`Bid accepted at ${money(amount,auction.currency)}. Complete payment to secure your 60-second slot.`);
      await cashfree.checkout({paymentSessionId:result.paymentSessionId,redirectTarget:'_self'});
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

  return <main className="min-h-screen bg-white text-slate-950">
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto h-16 flex items-center justify-between gap-4">
        <button onClick={()=>{setAuthOpen(false);window.scrollTo({top:0,behavior:'smooth'});}} className="flex items-center gap-2 text-left">
          <span className="h-9 w-9 rounded-xl bg-slate-950 text-white grid place-items-center font-black">60</span>
          <span className="text-xl font-black tracking-tight">60SEC</span>
        </button>
        <nav className="hidden md:flex items-center gap-1 text-sm font-semibold text-slate-600">
          <a href="#how-it-works" className="px-3 py-2 rounded-lg hover:bg-slate-50">How It Works</a>
          <a href="#advertise" className="px-3 py-2 rounded-lg hover:bg-slate-50">Advertise</a>
          {session && <a href="#my-bids" className="px-3 py-2 rounded-lg hover:bg-slate-50">My Bids</a>}
        </nav>
        <div className="flex items-center gap-2">
          {session ? <><span className="hidden sm:block text-xs text-slate-500">{session.user.email}</span><button className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" onClick={()=>client.auth.signOut()}>Sign out</button></> : <>
            <button onClick={()=>{setAuthMode('signin');setAuthOpen(true);}} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Sign In</button>
            <button onClick={()=>{setAuthMode('signup');setAuthOpen(true);}} className="rounded-xl bg-slate-950 text-white px-4 py-2 text-sm font-bold hover:bg-slate-800">Sign Up</button>
          </>}
        </div>
      </div>
    </header>
    <section className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">60SEC · The live advertising billboard</h1><p className="text-sm text-slate-600">Watch the live ad, follow the auction and bid for upcoming 60-second slots.</p></div><span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 text-xs font-bold">LIVE MARKETPLACE</span></div>
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">{error}</div>}
      <>
      <section className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"/> On air now</div><span className="font-mono text-sm text-slate-500">{liveSlot ? `SLOT ${String(liveSlot.queue_position).padStart(3,'0')}` : liveAd?.is_house_ad ? 'HOUSE AD' : 'BILLBOARD READY'}</span></div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-2xl">
          {liveAd ? <><div className="relative aspect-video bg-black">{liveAd.media_type?.startsWith('video/') ? <video src={liveAd.media_url} autoPlay muted playsInline className="h-full w-full object-contain"/> : <img src={liveAd.media_url} alt={liveAd.title} className="h-full w-full object-contain"/>}<div className="absolute right-4 top-4 rounded-xl bg-black/80 px-4 py-2 font-mono text-2xl font-black text-rose-400">00:{String(liveSeconds).padStart(2,'0')}</div></div><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="text-xs font-black uppercase tracking-widest text-amber-400">{liveAd.brand_name}</div><h2 className="mt-1 text-2xl font-black">{liveAd.title}</h2></div><a href={liveAd.website_url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-5 py-3 font-black text-slate-950">Visit advertiser website ↗</a></div></> : <div className="p-10 text-center sm:p-16"><div className="text-xs font-black uppercase tracking-widest text-amber-400">60SEC LIVE BILLBOARD</div><h2 className="mt-3 text-2xl font-black sm:text-3xl">Your brand could be on air next</h2><p className="mt-2 text-sm text-slate-300">House advertisements rotate automatically until a paid, approved booking takes over.</p></div>}
        </div>
      </section>
      <section className="max-w-5xl mx-auto space-y-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><div className="text-xs font-black uppercase tracking-widest text-slate-500">Live bidding · public access</div><h2 className="mt-1 text-2xl font-black">LIVE HOURLY AUCTIONS</h2></div><span className="text-xs text-slate-500">One successful payment = one 60-second slot</span></div>
        {auctions.length===0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No active auctions are currently published. This section updates when auctions open.</div> : <div className="grid md:grid-cols-2 gap-4">{auctions.map(auction=><article key={auction.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"><div className="flex justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-slate-500">Slot #{auction.slot_number}</div><div className="mt-1 text-sm text-slate-500">Closes {new Date(auction.ends_at).toLocaleTimeString('en-IN')}</div></div><span className="h-fit rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">{label(auction.status)}</span></div><div className="text-3xl font-black">{money(Number(auction.current_bid ?? auction.starting_bid),auction.currency)}</div>{auction.status==='ACTIVE' ? <div className="space-y-2"><select className="w-full rounded-lg border p-2.5" value={selectedAds[auction.id]||''} onChange={e=>setSelectedAds(s=>({...s,[auction.id]:e.target.value}))}><option value="">Choose approved ad</option>{approvedAds.map(ad=><option key={ad.id} value={ad.id}>{ad.brand_name} — {ad.title}</option>)}</select><input type="number" min={Number(auction.current_bid ?? auction.starting_bid-1)+1} step="1" value={bidAmounts[auction.id]||''} onChange={e=>setBidAmounts(s=>({...s,[auction.id]:e.target.value}))} placeholder="Enter your bid" className="w-full rounded-lg border p-2.5"/><button disabled={!!busy || !selectedAds[auction.id] || !bidAmounts[auction.id]} onClick={()=>placeBid(auction)} className="w-full rounded-xl bg-slate-950 py-3 font-black text-white disabled:opacity-40">Confirm Bid</button><p className="text-xs text-slate-500">Your bid is charged immediately through Cashfree. Successful payment secures one 60-second slot.</p></div> : auction.current_bidder_id===session?.user.id ? <button disabled={!!busy || !config.paymentsEnabled} onClick={()=>pay(auction)} className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white">Continue to payment</button> : <p className="text-sm text-slate-500">Hourly auction in progress. Place the next higher bid to secure a slot.</p>}</article>)}</div>}
      </section>
      <section id="how-it-works" className="border-y border-slate-200 py-10"><div className="max-w-5xl mx-auto"><h2 className="text-center text-3xl font-black">HOW 60SEC WORKS</h2><div className="mt-7 grid gap-4 sm:grid-cols-3">{[['01','Watch live','Ads and auction countdowns are public.'],['02','Confirm your bid','Sign in only when you confirm your bid.'],['03','Pay if you win','Every accepted higher bid pays immediately and secures the next slot.']].map(x=><div key={x[0]} className="rounded-2xl border bg-slate-50 p-5"><div className="font-mono font-black text-slate-300">{x[0]}</div><h3 className="mt-2 font-bold">{x[1]}</h3><p className="mt-1 text-sm text-slate-600">{x[2]}</p></div>)}</div></div></section>
      <section id="advertise" className="py-6 text-center"><h2 className="text-xl font-black">WANT YOUR BRAND ON THE BILLBOARD?</h2><p className="mt-2 text-sm text-slate-600">Sign up from the navbar to submit an advertisement for approval.</p></section>
      {authOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onClick={()=>setAuthOpen(false)}><form onSubmit={sendMagicLink} onClick={e=>e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">{authMode==='signup'?'Create your 60SEC account':'Sign in to confirm your bid'}</h2><p className="mt-1 text-sm text-slate-500">Your selected bid will be ready after authentication.</p></div><button type="button" onClick={()=>setAuthOpen(false)}>×</button></div><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className="w-full rounded-xl border px-3 py-3"/><button disabled={busy==='auth'} className="w-full rounded-xl bg-slate-950 py-3 font-bold text-white">{busy==='auth'?'Sending…':'Email me a secure link'}</button>{otpSent&&<p className="text-xs text-emerald-700">Check your email and open the link to continue.</p>}<p className="text-center text-xs text-slate-500">New to 60SEC? <button type="button" className="font-bold underline" onClick={()=>setAuthMode(authMode==='signup'?'signin':'signup')}>{authMode==='signup'?'Sign in':'Create an account'}</button></p></form></div>}
      </>
      {session && <>
        {!session.user.phone && <section className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3"><h2 className="font-bold">Verify your phone before payment</h2><p className="text-sm text-slate-600">Cashfree requires a customer phone number. Verify it with an SMS code; the server uses the verified Supabase phone claim.</p><div className="flex flex-wrap gap-2"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+919876543210" className="flex-1 min-w-56 border rounded-lg p-2"/><button disabled={busy==='phone'} onClick={sendPhoneCode} className="bg-slate-950 text-white rounded-lg px-4 py-2 disabled:opacity-50">{phoneOtpSent?'Resend code':'Send SMS code'}</button></div>{phoneOtpSent && <div className="flex gap-2"><input value={phoneCode} onChange={e=>setPhoneCode(e.target.value)} placeholder="SMS code" className="flex-1 border rounded-lg p-2"/><button disabled={busy==='phone'} onClick={verifyPhoneCode} className="bg-emerald-700 text-white rounded-lg px-4 py-2">Verify phone</button></div>}</section>}
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-lg mb-3">Open auctions</h2>{auctions.length===0?<p className="text-sm text-slate-500">No active or awaiting-payment auctions are currently in the database.</p>:<div className="space-y-4">{auctions.map(auction=><article key={auction.id} className="border rounded-xl p-4 space-y-3"><div className="flex justify-between gap-3"><div><div className="font-bold">{auction.id}</div><div className="text-xs text-slate-500">Hourly cycle #{auction.slot_number} · closes {new Date(auction.ends_at).toLocaleString()}</div></div><span className="text-xs font-bold rounded-full bg-slate-100 px-2 py-1 h-fit">{label(auction.status)}</span></div><div className="text-2xl font-black">{money(Number(auction.current_bid ?? auction.starting_bid),auction.currency)}</div>{auction.status==='ACTIVE'?<div className="space-y-2"><select className="w-full border rounded-lg p-2" value={selectedAds[auction.id]||''} onChange={e=>setSelectedAds(s=>({...s,[auction.id]:e.target.value}))}><option value="">Choose approved ad</option>{approvedAds.map(ad=><option key={ad.id} value={ad.id}>{ad.brand_name} — {ad.title}</option>)}</select><input type="number" min={Number(auction.current_bid ?? auction.starting_bid-1)+1} step="1" value={bidAmounts[auction.id]||''} onChange={e=>setBidAmounts(s=>({...s,[auction.id]:e.target.value}))} placeholder={`Minimum ${Number(auction.current_bid ?? auction.starting_bid-1)+1}`} className="w-full border rounded-lg p-2"/><button disabled={!!busy || approvedAds.length===0} onClick={()=>placeBid(auction)} className="w-full bg-slate-950 text-white rounded-lg py-2.5 font-bold disabled:opacity-40">{busy===auction.id?'Submitting…':'Place server-validated bid'}</button>{approvedAds.length===0&&<p className="text-xs text-amber-700">You have no approved active commercial ads. Submit an ad for review before bidding.</p>}</div>:auction.current_bidder_id===session.user.id?<button disabled={!!busy || !config.paymentsEnabled} onClick={()=>pay(auction)} className="w-full rounded-lg bg-emerald-700 text-white py-2.5 font-bold disabled:opacity-40">{config.paymentsEnabled?'Continue to Cashfree Checkout':'Winner payment pending — live payments disabled'}</button>:<p className="text-sm text-slate-500">Awaiting winner payment.</p>}</article>)}</div>}</section>
          <section className="bg-white border rounded-2xl p-5"><div className="flex justify-between items-center mb-3"><h2 className="font-bold text-lg">My advertisements</h2><button onClick={()=>setShowAdForm(v=>!v)} className="rounded-lg bg-slate-950 text-white px-3 py-2 text-xs font-bold">Submit ad</button></div>{showAdForm && <form onSubmit={submitAd} className="mb-4 rounded-xl border bg-slate-50 p-3 space-y-2"><input required value={adForm.brandName} onChange={e=>setAdForm(s=>({...s,brandName:e.target.value}))} placeholder="Brand name" className="w-full border rounded-lg p-2"/><input required value={adForm.title} onChange={e=>setAdForm(s=>({...s,title:e.target.value}))} placeholder="Ad title" className="w-full border rounded-lg p-2"/><input required type="url" value={adForm.mediaUrl} onChange={e=>setAdForm(s=>({...s,mediaUrl:e.target.value}))} placeholder="HTTPS image/video URL" className="w-full border rounded-lg p-2"/><select value={adForm.mediaType} onChange={e=>setAdForm(s=>({...s,mediaType:e.target.value}))} className="w-full border rounded-lg p-2"><option value="image/jpeg">JPEG image</option><option value="image/png">PNG image</option><option value="image/webp">WebP image</option><option value="video/mp4">MP4 video</option><option value="video/webm">WebM video</option></select><input required type="url" value={adForm.websiteUrl} onChange={e=>setAdForm(s=>({...s,websiteUrl:e.target.value}))} placeholder="HTTPS destination URL" className="w-full border rounded-lg p-2"/><button disabled={busy==='ad'} className="w-full rounded-lg bg-emerald-700 text-white py-2 font-bold">Submit for review</button></form>}{ads.filter(ad=>!ad.is_house_ad).length===0?<p className="text-sm text-slate-500">No advertisements are linked to this account yet.</p>:<div className="space-y-2">{ads.filter(ad=>!ad.is_house_ad).map(ad=><div key={ad.id} className="border rounded-xl p-3 flex items-center justify-between gap-3"><div><div className="font-semibold text-sm">{ad.brand_name || 'Untitled ad'}</div><code className="text-[10px] text-slate-400">{ad.id}</code></div><span className="text-xs">{label(ad.approval_status)} · {label(ad.ad_status)}</span></div>)}</div>}<p className="text-xs text-slate-500 mt-4">New ads enter PENDING/DRAFT and require administrator approval and activation before bidding.</p></section>
        </div>
        <section className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-lg mb-3">Reserved 60-second slots</h2>{slots.length===0?<p className="text-sm text-slate-500">No paid slots have been reserved yet.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="py-2">Slot</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>{slots.map(s=><tr key={s.id} className="border-b last:border-0"><td className="py-2">#{s.slot_number}</td><td>{new Date(s.starts_at).toLocaleString()}</td><td>{new Date(s.ends_at).toLocaleString()}</td><td>{label(s.status)}</td></tr>)}</tbody></table></div>}</section>
      </>}
      <footer className="text-xs text-slate-500">Production data is server-backed. Browser storage is not used as the auction, bid, payment or schedule authority. Payments remain subject to the server-side Cashfree safety gate.</footer>
    </section>
  </main>;
}
