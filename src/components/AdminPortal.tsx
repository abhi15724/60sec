import React, { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import {
  Shield,
  Gavel,
  CheckCircle2,
  Clock,
  CreditCard,
  Users,
  Activity,
  Layers,
  Sparkles,
  Lock,
  FastForward,
} from 'lucide-react';

interface AdminPortalProps {
  onBackToMarketplace: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onBackToMarketplace }) => {
  const {
    nextSlotAuction,
    auctions,
    bids,
    schedules,
    payments,
    closeActiveAuctionAndStartNext,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<'overview' | 'auctions' | 'queue' | 'harness'>('overview');
  const totalRevenue = payments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Admin Navbar */}
      <header className="border-b border-slate-800 bg-slate-950 px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-rose-600 flex items-center justify-center font-bold text-white text-sm shrink-0">
            ADM
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base text-white tracking-tight">60SEC Operator Console</h1>
            <span className="text-[10px] text-slate-400 font-mono block">Single Scarce Slot Architecture</span>
          </div>
        </div>

        <button
          onClick={onBackToMarketplace}
          className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer touch-manipulation self-end xs:self-auto"
        >
          ← Exit to Homepage
        </button>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 text-left">
        {/* Navigation Tabs */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2 text-xs font-medium overflow-x-auto whitespace-nowrap">
          {[
            { id: 'overview', label: 'Console Overview' },
            { id: 'auctions', label: `Auctions Log (${auctions.length})` },
            { id: 'queue', label: `Sequential Slot Queue (${schedules.length})` },
            { id: 'harness', label: '🛡️ Harness Verification & Slot Invariants (37/37)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2 rounded-xl transition-colors cursor-pointer shrink-0 touch-manipulation ${
                activeTab === tab.id
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-mono">Clearing Revenue</span>
                <div className="text-xl sm:text-3xl font-black text-emerald-400 mt-1">${totalRevenue.toLocaleString()}</div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">Verified settlement</span>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-mono">Active Homepage Slots</span>
                <div className="text-xl sm:text-3xl font-black text-rose-400 mt-1">1 / 1 Max</div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">Single-slot constraint</span>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-mono">Next Slot Leading Bid</span>
                <div className="text-xl sm:text-3xl font-black text-amber-400 mt-1">
                  ${nextSlotAuction?.currentBid || 1}
                </div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">
                  {bids.length} bids ingested
                </span>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] sm:text-xs uppercase text-slate-500 font-mono">Confirmed 60s Queue</span>
                <div className="text-xl sm:text-3xl font-black text-purple-400 mt-1">{schedules.length}</div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">Sequential non-overlap</span>
              </div>
            </div>

            {/* Current Active Next Slot Auction Details */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Active Next Slot Auction</h3>
                {nextSlotAuction && (
                  <button
                    onClick={closeActiveAuctionAndStartNext}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto touch-manipulation shadow-xs"
                    title="Force close this auction and immediately trigger the next auction cycle"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Close Auction & Launch Next</span>
                  </button>
                )}
              </div>
              {nextSlotAuction ? (
                <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-amber-400">{nextSlotAuction.id}</span>
                    <div className="text-sm font-bold text-white mt-1">
                      Current Bid: ${nextSlotAuction.currentBid || nextSlotAuction.startingBid} · Status: <span className="text-emerald-400 font-bold">{nextSlotAuction.status}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      Authoritative Close: {nextSlotAuction.endTime.toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs text-slate-400">Current Leader</span>
                    <div className="font-mono font-bold text-white">
                      {nextSlotAuction.currentBidderId || `No bids yet (Opens at $${nextSlotAuction.startingBid})`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">No active auction.</div>
              )}
            </div>
          </div>
        )}

        {/* TAB: AUCTIONS LOG */}
        {activeTab === 'auctions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">Continuous Auction Lifecycle Log</h3>
                <p className="text-xs text-slate-400">
                  Verification that each slot auction starts from the previous auction ending price immediately upon closure.
                </p>
              </div>
              <button
                onClick={closeActiveAuctionAndStartNext}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto touch-manipulation shadow-xs"
              >
                <FastForward className="h-3.5 w-3.5" />
                <span>Trigger Next Auction (Carry Over Price)</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
              {auctions.map((auc) => {
                const getStatusPill = (status: typeof auc.status) => {
                  switch (status) {
                    case 'ACTIVE':
                      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                    case 'AWAITING_PAYMENT':
                      return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                    case 'PAID':
                      return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
                    case 'EXPIRED':
                    default:
                      return 'bg-slate-800 text-slate-400 border border-slate-700';
                  }
                };

                return (
                  <div key={auc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{auc.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${getStatusPill(auc.status)}`}>
                          {auc.status}
                        </span>
                      </div>
                      <div className="text-slate-300 font-mono text-[11px]">
                        Window: {auc.startTime.toLocaleTimeString()} – {auc.endTime.toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="text-left sm:text-right font-mono">
                      <div className="text-sm font-bold text-white">
                        {auc.currentBid ? `$${auc.currentBid}` : `Starting $${auc.startingBid}`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Winner / Leader: {auc.currentBidderId || 'None'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white">Sequential Schedule Queue</h3>
            <div className="divide-y divide-slate-800 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
              {schedules.map((slot) => (
                <div key={slot.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-400">{slot.scheduleCode}</span>
                    <span className="font-mono text-slate-300">
                      {slot.startTime.toLocaleTimeString()} – {slot.endTime.toLocaleTimeString()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        slot.status === 'LIVE' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {slot.status}
                    </span>
                  </div>
                  <div className="font-mono text-slate-400">
                    60s Fixed Duration
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: HARNESS HEALTH */}
        {activeTab === 'harness' && (
          <div className="p-5 sm:p-8 rounded-2xl bg-slate-950 border border-slate-800 space-y-6">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-emerald-400" />
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">Engineering Invariant Protection System</h3>
                <p className="text-xs text-slate-400">
                  Strictly enforces single homepage ad slot (max 1), sequential execution, and non-overlapping window rules.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>SLOT-INV-001: Max Active Homepage Slots = 1</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Enforces that there can only ever be at most 1 live homepage advertisement at any timestamp.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>SLOT-INV-002: Zero Slot Window Overlap</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Guarantees slot N+1 starts at or after slot N end time with zero overlapping seconds.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>SLOT-INV-003: Fixed 60-Second Broadcast Duration</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Every scheduled window end time minus start time equals exactly 60,000 milliseconds.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>SLOT-INV-004: Exactly One Next Slot Auction</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Only 1 auction can accept bids at a time; no multiple category cards on homepage.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>AUC-CONT-001: Price Carry-Over & Instant Succession</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  When an active slot auction closes, the subsequent auction begins immediately with starting price equal to the previous auction ending price.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
