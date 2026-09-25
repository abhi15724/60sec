import React from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { Bell, ArrowRight, X } from 'lucide-react';

interface OutbidNotificationToastProps {
  onBidAgainClick: () => void;
}

export const OutbidNotificationToast: React.FC<OutbidNotificationToastProps> = ({
  onBidAgainClick,
}) => {
  const { activeOutbidNotice, dismissOutbidNotice } = useMarketplace();

  if (!activeOutbidNotice) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-50 bg-slate-950 text-white rounded-2xl shadow-2xl border-2 border-rose-500 p-3.5 sm:p-5 animate-bounce-short">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 animate-pulse" />
          </div>
          <div className="space-y-0.5 sm:space-y-1 text-left min-w-0">
            <div className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-rose-400">
              YOU&apos;VE BEEN OUTBID
            </div>
            <div className="text-xs sm:text-sm text-slate-300 line-clamp-2">
              Another advertiser has taken the lead for the next 60-second homepage slot.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dismissOutbidNotice();
          }}
          aria-label="Dismiss outbid notification"
          className="h-8 w-8 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0 touch-manipulation"
        >
          <X className="h-4 w-4 pointer-events-none" />
        </button>
      </div>

      {/* Copy: Current Bid, Your Bid, Minimum Next Bid */}
      <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase block">Current Bid</span>
          <span className="font-bold text-amber-400 text-xs sm:text-sm mt-0.5 block">
            ${activeOutbidNotice.newHighestBidAmount}
          </span>
        </div>
        <div>
          <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase block">Your Bid</span>
          <span className="font-bold text-slate-300 text-xs sm:text-sm mt-0.5 block">
            ${activeOutbidNotice.previousBidAmount}
          </span>
        </div>
        <div>
          <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase block">Min Next Bid</span>
          <span className="font-bold text-emerald-400 text-xs sm:text-sm mt-0.5 block">
            ${activeOutbidNotice.minimumNextBid}
          </span>
        </div>
      </div>

      <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-slate-800/80 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            dismissOutbidNotice();
            onBidAgainClick();
          }}
          className="w-full py-2.5 sm:py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer uppercase tracking-wider touch-manipulation"
        >
          <span>BID AGAIN</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
