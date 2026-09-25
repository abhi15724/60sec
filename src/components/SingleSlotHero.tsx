import React from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { Radio, ExternalLink, ArrowUpRight, RefreshCw, FastForward, Sparkles, CheckCircle2 } from 'lucide-react';
import { calculateMinimumNextBid } from '../core/auction.ts';

interface SingleSlotHeroProps {
  onBidNowClick: () => void;
}

export const SingleSlotHero: React.FC<SingleSlotHeroProps> = ({ onBidNowClick }) => {
  const {
    currentUser,
    currentLiveSchedule,
    liveRemainingSeconds,
    nextSlotAuction,
    auctionRemainingSeconds,
    auctionTransitionNotice,
    dismissTransitionNotice,
    closeActiveAuctionAndStartNext,
    getAdById,
    getAuctionBids,
    trackClickAndRedirect,
    simulateCompetingBid,
  } = useMarketplace();

  // Currently live advertisement
  const currentAd = currentLiveSchedule ? getAdById(currentLiveSchedule.advertisementId) : null;

  // Active bidders on the next slot auction
  const recentBids = nextSlotAuction ? getAuctionBids(nextSlotAuction.id) : [];
  const currentBid = nextSlotAuction ? (nextSlotAuction.currentBid || nextSlotAuction.startingBid) : 1.0;
  const minNextBid = nextSlotAuction ? calculateMinimumNextBid(nextSlotAuction.currentBid, nextSlotAuction.startingBid) : 2.0;

  // Format auction ends in MM:SS
  const formatAuctionCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className="bg-white py-6 sm:py-12 lg:py-16 border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 space-y-6 sm:space-y-10 lg:space-y-12 text-center">
        {/* HERO TITLE & POSITIONING */}
        <div className="space-y-2.5 sm:space-y-4">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Single Scarce Advertising Slot
          </div>

          <h1 className="text-2xl xs:text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 uppercase leading-tight sm:leading-none">
            THE NEXT 60 SECONDS
          </h1>

          <p className="text-sm sm:text-lg lg:text-xl text-slate-600 font-medium max-w-xl mx-auto px-1 sm:px-2">
            One homepage. One advertising slot. One winning brand.
          </p>
        </div>

        {/* CONTINUOUS AUCTION CYCLE TRANSITION BANNER */}
        {auctionTransitionNotice && (
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md text-left transition-all">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-black tracking-wider text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                    AUCTION TRANSITION COMPLETE
                  </span>
                  <span className="text-xs text-emerald-700 font-mono">
                    {new Date(auctionTransitionNotice.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-emerald-950">
                  {auctionTransitionNotice.winnerName ? (
                    <span>
                      Previous auction closed · Won by <strong>{auctionTransitionNotice.winnerName}</strong> for <strong>${auctionTransitionNotice.winningBid}</strong>.
                    </span>
                  ) : (
                    <span>Previous auction closed with no bids.</span>
                  )}
                  <span className="text-emerald-800 font-extrabold ml-1.5 block sm:inline">
                    Next 60s Slot Auction started from ${auctionTransitionNotice.nextStartingBid}!
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={dismissTransitionNotice}
              className="self-end sm:self-auto px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs transition cursor-pointer touch-manipulation"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. CURRENT ADVERTISEMENT (PROMINENT BILLBOARD) */}
        <div className="text-left space-y-2 sm:space-y-3">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping shrink-0"></span>
              <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-rose-600">
                CURRENT ADVERTISEMENT — BROADCASTING LIVE
              </span>
            </div>
            <div className="font-mono text-[10px] sm:text-xs text-slate-400">
              {currentLiveSchedule?.scheduleCode || 'SLOT-001'}
            </div>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl relative text-white">
            {currentAd ? (
              <div>
                {/* Large Creative Preview */}
                <div className="relative aspect-16/9 bg-black overflow-hidden flex items-center justify-center">
                  <img
                    src={currentAd.mediaUrl}
                    alt={currentAd.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30 pointer-events-none" />

                  {/* 60-Second Countdown Overlay */}
                  <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-slate-950/90 backdrop-blur-sm border border-rose-500/40 px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl flex items-center gap-1.5 sm:gap-3 shadow-lg font-mono">
                    <Radio className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-500 animate-pulse shrink-0" />
                    <div className="text-left">
                      <span className="text-[8px] sm:text-[10px] text-rose-400 uppercase font-black tracking-wider block leading-none">
                        60s Live Countdown
                      </span>
                      <span className="text-base sm:text-2xl font-black text-rose-400 leading-tight">
                        00:{String(liveRemainingSeconds).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  {/* Synchronized 60-second bottom progress line */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 sm:h-1.5 bg-slate-800">
                    <div
                      className="h-full bg-rose-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${((60 - liveRemainingSeconds) / 60) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Ad Meta & Website CTA */}
                <div className="p-3.5 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-6 bg-slate-950">
                  <div className="space-y-0.5 sm:space-y-1 min-w-0">
                    <div className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-amber-400">
                      {currentAd.brandName}
                    </div>
                    <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white tracking-tight line-clamp-2">
                      {currentAd.title}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400 font-mono truncate pt-0.5">
                      {currentAd.websiteUrl}
                    </p>
                  </div>

                  <button
                    onClick={() => trackClickAndRedirect(currentAd.id, currentAd.websiteUrl, currentLiveSchedule?.id)}
                    className="w-full sm:w-auto px-5 py-3 sm:px-8 sm:py-3.5 rounded-xl bg-white text-slate-950 font-black text-xs sm:text-base hover:bg-slate-100 active:scale-98 transition shadow-lg flex items-center justify-center gap-2 cursor-pointer shrink-0 touch-manipulation"
                  >
                    <span>VISIT WEBSITE</span>
                    <ExternalLink className="h-4 w-4 text-slate-700 shrink-0" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 sm:p-16 text-center text-slate-400 space-y-2">
                <Radio className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500 mx-auto animate-pulse" />
                <h3 className="text-sm sm:text-lg font-bold text-white">Homepage Standby Slate</h3>
                <p className="text-xs text-slate-400">Slot open for the next winning advertiser.</p>
              </div>
            )}
          </div>
        </div>

        {/* 2. NEXT SLOT AUCTION (IMMEDIATELY BELOW CURRENT ADVERTISEMENT) */}
        <div className="rounded-xl sm:rounded-2xl border-2 border-slate-900 bg-white p-4 sm:p-6 lg:p-8 shadow-xl text-left space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 sm:pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500">
                  Single Available Slot
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  AUCTION ACTIVE
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight mt-0.5">
                NEXT HOMEPAGE SLOT AUCTION
              </h2>
            </div>
            <div className="flex flex-col sm:items-end text-[10px] sm:text-xs font-mono text-slate-500">
              <span className="font-semibold text-slate-700">
                {nextSlotAuction?.id.startsWith('auc_slot_')
                  ? `AUCTION-SLOT-${nextSlotAuction.id.slice(-4)}`
                  : 'AUCTION-SLOT-002'}
              </span>
              <span>When this auction closes, the next auction starts automatically</span>
            </div>
          </div>

          {/* Key Bid Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 py-1">
            <div className="p-2.5 sm:p-0 rounded-xl bg-slate-50 sm:bg-transparent border border-slate-100 sm:border-0">
              <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider block">
                {nextSlotAuction?.currentBid ? 'Current Bid' : 'Starting Price'}
              </span>
              <div className="text-xl sm:text-3xl font-black text-slate-950 mt-0.5 sm:mt-1">
                ${currentBid}
              </div>
              <span className="text-[9px] sm:text-[11px] text-slate-500 mt-0.5 block">
                {nextSlotAuction?.currentBid
                  ? `Base: $${nextSlotAuction.startingBid}`
                  : `Starts from prev end ($${nextSlotAuction?.startingBid || 1})`}
              </span>
            </div>

            <div className="p-2.5 sm:p-0 rounded-xl bg-slate-50 sm:bg-transparent border border-slate-100 sm:border-0">
              <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider block">
                Active Bidders
              </span>
              <div className="text-xl sm:text-3xl font-black text-slate-800 mt-0.5 sm:mt-1">
                {Math.max(recentBids.length, 1)}
              </div>
              <span className="text-[9px] sm:text-[11px] text-slate-400 mt-0.5 block">
                Verified brands
              </span>
            </div>

            <div className="p-2.5 sm:p-0 rounded-xl bg-slate-50 sm:bg-transparent border border-slate-100 sm:border-0">
              <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider block">
                Auction Ends In
              </span>
              <div className="text-xl sm:text-3xl font-black font-mono text-rose-600 mt-0.5 sm:mt-1">
                {formatAuctionCountdown(auctionRemainingSeconds)}
              </div>
              <span className="text-[9px] sm:text-[11px] text-slate-400 mt-0.5 block">
                Server UTC cutoff
              </span>
            </div>

            <div className="p-2.5 sm:p-0 rounded-xl bg-slate-50 sm:bg-transparent border border-slate-100 sm:border-0">
              <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider block">
                Minimum Next Bid
              </span>
              <div className="text-xl sm:text-3xl font-black text-emerald-600 mt-0.5 sm:mt-1">
                ${minNextBid}
              </div>
              <span className="text-[9px] sm:text-[11px] text-slate-400 mt-0.5 block">
                {nextSlotAuction?.currentBid ? '+$1 min increment' : 'Initial bid meets base'}
              </span>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-1 sm:pt-2 space-y-2 sm:space-y-3">
            <button
              onClick={onBidNowClick}
              className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-slate-950 hover:bg-slate-800 active:scale-99 text-white font-black text-sm sm:text-lg transition shadow-lg flex items-center justify-center gap-2 cursor-pointer group touch-manipulation"
            >
              <span>BID NOW (${minNextBid})</span>
              <ArrowUpRight className="h-5 w-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>

            {/* Non-Admin (General Users & Brands) View: Clean status line */}
            {currentUser.role !== 'admin' && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span>Continuous 24/7 Homepage Slot Succession</span>
                </div>
                <span className="text-slate-400">
                  Next slot begins automatically at previous ending price
                </span>
              </div>
            )}

            {/* Admin-Only Operator Actions: Exclusively visible to 60SEC Admin */}
            {currentUser.role === 'admin' && (
              <div className="flex flex-col xs:flex-row items-center justify-between gap-2 pt-2.5 border-t border-amber-200 bg-amber-50/80 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 lg:-mx-8 lg:-mb-8 p-3 sm:p-4 rounded-b-xl sm:rounded-b-2xl">
                <div className="flex items-center gap-2 text-[11px] text-amber-900 font-mono text-center xs:text-left">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                    60SEC ADMIN
                  </span>
                  <span>Operator Test Controls</span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={simulateCompetingBid}
                    className="text-xs text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 flex items-center gap-1.5 cursor-pointer font-semibold transition py-1.5 px-2.5 rounded-lg touch-manipulation shadow-2xs"
                    title="Simulate competing brand outbid (Admin tool)"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Simulate Outbid</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeActiveAuctionAndStartNext}
                    className="text-xs text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-400 flex items-center gap-1.5 cursor-pointer font-bold transition py-1.5 px-3 rounded-lg touch-manipulation shadow-2xs"
                    title="Admin Action: Authoritatively close active auction and immediately start the next auction"
                  >
                    <FastForward className="h-3.5 w-3.5 text-amber-800 shrink-0" />
                    <span>Close Auction & Start Next</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
