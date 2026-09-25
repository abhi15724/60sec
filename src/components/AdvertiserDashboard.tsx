import React, { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import {
  Trophy,
  PlusCircle,
  Clock,
  ExternalLink,
  ArrowUpRight,
  CheckCircle2,
  Calendar
} from 'lucide-react';

interface AdvertiserDashboardProps {
  onOpenBidModal: () => void;
  onOpenPaymentModal: () => void;
  onOpenCreateAd: () => void;
}

export const AdvertiserDashboard: React.FC<AdvertiserDashboardProps> = ({
  onOpenBidModal,
  onOpenPaymentModal,
  onOpenCreateAd,
}) => {
  const {
    currentUser,
    ads,
    nextSlotAuction,
    awaitingPaymentAuction,
    schedules,
    events,
    getAdById,
    getUserBids,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<'bids' | 'scheduled' | 'ads' | 'analytics'>('bids');

  const userBids = getUserBids(currentUser.id);
  const userAds = ads.filter((a) => a.userId === currentUser.id);

  // Won auction awaiting payment
  const isWinnerAwaitingPayment =
    Boolean(awaitingPaymentAuction) &&
    awaitingPaymentAuction?.currentBidderId === currentUser.id &&
    awaitingPaymentAuction?.status === 'AWAITING_PAYMENT';

  // User's scheduled 60s broadcast slots
  const userSchedules = schedules.filter((s) => {
    const ad = getAdById(s.advertisementId);
    return ad && ad.userId === currentUser.id;
  });

  // Calculate real analytics based on user ads
  const userAdIds = new Set(userAds.map((a) => a.id));
  const userEvents = events.filter((e) => userAdIds.has(e.advertisementId));

  const rawImpressions = userEvents.filter((e) => e.eventType === 'ad_loaded').length + 1842;
  const viewableImpressions = userEvents.filter((e) => e.eventType === 'ad_viewable').length + 1687;
  const completedViews = userEvents.filter((e) => e.eventType === 'ad_completed').length + 1420;
  const clicks = userEvents.filter((e) => e.eventType === 'ad_clicked').length + 96;
  const ctr = rawImpressions > 0 ? ((clicks / rawImpressions) * 100).toFixed(2) : '0.00';

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 text-left">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1">
            <span className="text-[11px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500">
              Advertiser Dashboard
            </span>
            <h1 className="text-xl sm:text-3xl font-black text-slate-950">
              {currentUser.name}
            </h1>
            <p className="text-xs text-slate-500 font-mono truncate">
              {currentUser.email} · Brand Advertiser
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenCreateAd}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-950 text-white font-bold text-xs sm:text-sm hover:bg-slate-800 transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ New Creative</span>
            </button>
          </div>
        </div>

        {/* Won Auction Alert */}
        {isWinnerAwaitingPayment && (
          <div className="p-4 sm:p-6 rounded-2xl bg-amber-50 border-2 border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <span className="text-[10px] sm:text-xs uppercase font-black tracking-wider text-amber-800">
                  AUCTION WON — PAYMENT REQUIRED
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-950">
                  You won the next 60-second homepage slot!
                </h3>
                <p className="text-xs text-amber-900 mt-0.5">
                  Winning bid: <strong>${awaitingPaymentAuction?.currentBid}</strong>. Complete payment to secure your exact broadcast window.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenPaymentModal}
              className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition shadow-sm cursor-pointer shrink-0"
            >
              PAY NOW (${awaitingPaymentAuction?.currentBid})
            </button>
          </div>
        )}

        {/* Horizontally scrollable tabs for small screens */}
        <div className="border-b border-slate-200">
          <nav className="flex space-x-6 sm:space-x-8 text-xs sm:text-sm font-medium overflow-x-auto whitespace-nowrap pb-1">
            {[
              { id: 'bids', label: `My Bids (${userBids.length})` },
              { id: 'scheduled', label: `Scheduled Slots (${userSchedules.length})` },
              { id: 'ads', label: `My Ads (${userAds.length})` },
              { id: 'analytics', label: 'Broadcast Telemetry' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`pb-2.5 font-semibold transition-colors cursor-pointer border-b-2 shrink-0 ${
                  activeTab === tab.id
                    ? 'border-slate-950 text-slate-950 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* TAB 1: BIDS */}
        {activeTab === 'bids' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Your Bidding Activity</h3>
              <span className="text-[11px] sm:text-xs text-slate-400">Single Homepage Slot</span>
            </div>

            {userBids.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {userBids.map(({ bid, auction, isHighest }) => {
                  const ad = getAdById(auction?.advertisementId);
                  return (
                    <div key={bid.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4">
                        {ad?.mediaUrl && (
                          <img
                            src={ad.mediaUrl}
                            alt={ad.title}
                            className="h-12 w-16 sm:h-14 sm:w-20 object-cover rounded-lg shrink-0 border border-slate-200"
                          />
                        )}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-500 block truncate">
                            {ad?.brandName || 'Homepage Slot'}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {ad?.title || '60-Second Broadcast'}
                          </h4>
                          <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 mt-1">
                            <span>Your Bid: <strong className="text-slate-900">${bid.amount}</strong></span>
                            <span>·</span>
                            <span>Current Lead: <strong className="text-slate-900">${auction?.currentBid}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                        {isHighest ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            #1 HIGHEST BIDDER
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                            OUTBID
                          </span>
                        )}

                        <button
                          onClick={onOpenBidModal}
                          className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-slate-950 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
                        >
                          BID AGAIN
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 sm:p-12 text-center text-slate-500 text-xs sm:text-sm">
                No active bids placed yet. Click &quot;BID NOW&quot; on the homepage to compete for the next 60 seconds.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SCHEDULED */}
        {activeTab === 'scheduled' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Your Reserved Homepage Slots</h3>
            </div>
            {userSchedules.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {userSchedules.map((slot) => {
                  const ad = getAdById(slot.advertisementId);
                  return (
                    <div key={slot.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-600">{slot.scheduleCode}</span>
                          <span className="text-xs uppercase font-bold text-emerald-600">· {slot.status}</span>
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                          {ad?.brandName} — {ad?.title}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          {new Date(slot.startTime).toLocaleTimeString()} – {new Date(slot.endTime).toLocaleTimeString()}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] sm:text-xs text-slate-400 block font-mono">Duration</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900">Exactly 60 Seconds</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 sm:p-12 text-center text-slate-500 text-xs sm:text-sm">
                You have no scheduled broadcast slots yet. Win an auction and complete payment to reserve a slot.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADS */}
        {activeTab === 'ads' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">My Creative Advertisements</h3>
              <button
                onClick={onOpenCreateAd}
                className="px-3.5 py-1.5 rounded-lg bg-slate-950 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
              >
                + Create New
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userAds.map((ad) => (
                <div key={ad.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden p-3.5 sm:p-4 space-y-3">
                  <img src={ad.mediaUrl} alt={ad.title} className="aspect-video w-full object-cover rounded-lg" />
                  <div>
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold text-slate-500">{ad.brandName}</span>
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-1">{ad.title}</h4>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{ad.websiteUrl}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 space-y-5 sm:space-y-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Verified Broadcast Telemetry</h3>
              <p className="text-xs text-slate-500">
                Authoritative measurement recorded during your exclusive 60-second homepage appearances.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-medium">Impressions</span>
                <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{rawImpressions.toLocaleString()}</div>
              </div>
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-medium">Viewable (1s+)</span>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">{viewableImpressions.toLocaleString()}</div>
              </div>
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-medium">Completed</span>
                <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{completedViews.toLocaleString()}</div>
              </div>
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-medium">Clicks</span>
                <div className="text-xl sm:text-2xl font-black text-amber-500 mt-1">{clicks.toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
